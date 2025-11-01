// app/api/tarot/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SupabaseClient, createClient as createSupabaseServiceClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import OpenAI from "openai";

// --- constants ---
const SYSTEM_KEY = "tarot" as const;
const DEBUG_TAG = "[api/tarot]";
// balance view + usage ledger (allow override by ENV)
const BALANCE_VIEW = process.env.NEXT_PUBLIC_CREDITS_BALANCE_VIEW || "credits_balance_view";
const USAGE_TABLE  = process.env.NEXT_PUBLIC_CREDITS_USAGE_TABLE  || "credits_usage";

/**
 * Try to validate credit using balance VIEW (same source as UI).
 * NOTE: This helper is now **check-only** to avoid 402 due to RLS/ledger insert.
 * The caller can perform actual deduction later once flow is confirmed.
 */
async function tryDeductViaBalanceView(opts: {
  reader: SupabaseClient;      // supabase or service-role client for SELECT
  writer: SupabaseClient;      // kept for compatibility (not used in check-only)
  targetUserId: string;
  bucket: string;              // "tarot", "palm", etc.
  featureKey: string;
  cost: number;
  createdBy: string;           // who triggers spend
}): Promise<{ ok: boolean; remaining?: number; reason?: string; mode?: "check_only" | "view_not_found" }> {
  const { reader, targetUserId, bucket, cost } = opts;

  // First attempt: filter by user_id + bucket (if the column exists)
  let sel = await reader
    .from(BALANCE_VIEW)
    .select("balance")
    .eq("user_id", targetUserId as any)
    .eq("bucket", bucket as any)
    .maybeSingle();

  // If the view is missing entirely -> let caller fallback to table method
  if (sel?.error?.code === "42P01") {
    return { ok: false, reason: "view_not_found", mode: "view_not_found" };
  }

  // If the column "bucket" doesn't exist, retry by user_id only
  if (sel?.error?.code === "42703" /* undefined_column */) {
    sel = await reader
      .from(BALANCE_VIEW)
      .select("balance")
      .eq("user_id", targetUserId as any)
      .maybeSingle();
  }

  // If still error -> bubble up as a non-OK with reason
  if (sel.error) {
    return { ok: false, reason: sel.error.message };
  }

  // If no row matched with the given bucket, retry by user_id only (some setups keep single balance per user)
  if (!sel.data) {
    const retry = await reader
      .from(BALANCE_VIEW)
      .select("balance")
      .eq("user_id", targetUserId as any)
      .maybeSingle();
    if (!retry.error && retry.data) {
      sel = retry;
    }
  }

  const current = Number(sel.data?.balance ?? 0);
  if (!Number.isFinite(current) || current < cost) {
    return { ok: false, reason: "insufficient_view_balance" };
  }

  // CHECK-ONLY: Do not write to usage ledger here to avoid RLS-related 402.
  // Report remaining so UI can proceed.
  return { ok: true, remaining: current - cost, mode: "check_only" };
}
const getOpenAIKey = () =>
  process.env.OPENAI_API_KEY ||
  (process.env as any).OPENAI_APIKEY ||
  (process.env as any).OPENAI_KEY ||
  "";
const logError = (...args: any[]) => console.error(DEBUG_TAG, ...args);

// --- Types ---
type TarotMode = "threeCards" | "weighOptions" | "classic10";
type CardPick = { name: string; reversed: boolean };

const FULL_DECK: string[] = [
  "The Fool","The Magician","The High Priestess","The Empress","The Emperor",
  "The Hierophant","The Lovers","The Chariot","Strength","The Hermit",
  "Wheel of Fortune","Justice","The Hanged Man","Death","Temperance",
  "The Devil","The Tower","The Star","The Moon","The Sun","Judgement","The World",
];

const CELTIC_SLOTS = [
  { no: 1, label: "สถานการณ์ปัจจุบัน (Present)" },
  { no: 2, label: "อุปสรรค/สิ่งท้าทาย (Challenge)" },
  { no: 3, label: "รากฐาน (Foundation)" },
  { no: 4, label: "อดีต (Past)" },
  { no: 5, label: "ความหวัง/เป้าหมาย (Goal)" },
  { no: 6, label: "อนาคตอันใกล้ (Near Future)" },
  { no: 7, label: "ตัวตน (Self)" },
  { no: 8, label: "สิ่งแวดล้อม (External Influences)" },
  { no: 9, label: "ความหวังและความกลัว (Hopes and Fears)" },
  { no: 10, label: "ผลลัพธ์ (Outcome)" },
];

// --- Helpers ---
function pickCards(count: number): CardPick[] {
  const picks: CardPick[] = [];
  const used = new Set<number>();
  while (picks.length < count) {
    const i = Math.floor(Math.random() * FULL_DECK.length);
    if (used.has(i)) continue;
    used.add(i);
    picks.push({ name: FULL_DECK[i], reversed: Math.random() < 0.5 });
  }
  return picks;
}

// --- Prompt builders (fallback templates) ---
type UserBrief = { fullName: string; birthDate: string; birthTime?: string };
const face = (c: CardPick) => `${c.name}${c.reversed ? " (กลับหัว)" : ""}`;

function buildThreeCardsPrompt(user: UserBrief, question: string, cards: CardPick[]) {
  const [c1, c2, c3] = cards;
  return (
`วิเคราะห์ไพ่ยิปซีสำหรับ ${user.fullName}, เกิดวันที่ ${user.birthDate}${user.birthTime ? " เวลา " + user.birthTime : ""}
รูปแบบการดู: 1 เรื่อง 3 ใบ
คำถาม: “${question}”

กรุณาอธิบายความหมายของไพ่ที่เปิดได้ทีละใบและเชื่อมโยงเข้ากับคำถาม โดยใช้โครงนี้:
1) ไพ่ใบที่ 1: ${face(c1)} → ความหมายคือ… (เชื่อมโยงกับคำถามอย่างไร)
2) ไพ่ใบที่ 2: ${face(c2)} → ความหมายคือ…
3) ไพ่ใบที่ 3: ${face(c3)} → ความหมายคือ…

สรุปภาพรวม: [ข้อสรุปและคำแนะนำเชิงปฏิบัติที่ชัดเจน 3–5 ข้อ]`
  );
}

function buildWeighOptionsPrompt(user: UserBrief, pairs: { option: string; card: CardPick }[]) {
  const lines = pairs.map((p, i) => `- ตัวเลือกที่ ${i + 1}: ${p.option} → ไพ่: ${face(p.card)}`).join("\n");
  return (
`วิเคราะห์ไพ่ยิปซีสำหรับ ${user.fullName}, เกิดวันที่ ${user.birthDate}${user.birthTime ? " เวลา " + user.birthTime : ""}
รูปแบบการดู: ชั่งน้ำหนักตัวเลือก (เปิด 1 ใบต่อ 1 ตัวเลือก)
ตัวเลือกที่ต้องพิจารณา:
${lines}

กรุณาอธิบายความหมายไพ่ของแต่ละตัวเลือก (จุดแข็ง/จุดเสี่ยง/เงื่อนไขที่ต้องระวัง)
จากนั้นสรุปว่า “ควรเลือกตัวเลือกใด เพราะอะไร” โดยให้เหตุผลสั้น กระชับ อิงความหมายของไพ่
ปิดท้ายด้วยข้อแนะนำการตัดสินใจเชิงขั้นตอน (checklist 3 ข้อ)`
  );
}

function buildClassic10Prompt(user: UserBrief, slots: { pos: number; label: string; card: CardPick }[]) {
  const ordered = slots.sort((a, b) => a.pos - b.pos);
  const lines = ordered.map(s => `${s.pos}. ${s.label}: ${face(s.card)} → ความหมาย…`).join("\n");
  return (
`วิเคราะห์ไพ่ยิปซีสำหรับ ${user.fullName}, เกิดวันที่ ${user.birthDate}${user.birthTime ? " เวลา " + user.birthTime : ""}
รูปแบบการดู: คลาสสิก 10 ใบ (Celtic Cross)

โปรดอธิบายตำแหน่งละบรรทัด (สั้น กระชับ ชัดเจน):
${lines}

สรุปรวม: [ภาพรวมสถานการณ์ + คำแนะนำเชิงปฏิบัติ 3–5 ข้อ]`
  );
}

// --- New helpers ---
function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/{{\s*(\w+)\s*}}/g, (_, key) => vars[key] ?? "");
}

async function fetchPromptContentBySystem(
  supabase: any,
  system: string,
  subtype: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("prompts")
    .select("content")
    .eq("system", system)
    .eq("subtype", subtype)
    .maybeSingle();
  if (error || !data) return null;
  return data.content ?? null;
}

async function callOpenAIWithRetry(promptText: string) {
  const tried: Array<{ model: string; api: string; ok: boolean; error?: string; len?: number }> = [];
  if (!getOpenAIKey()) {
    return { text: "", tried, reason: "missing_api_key" as const };
  }

  const openai = new OpenAI({
    apiKey: getOpenAIKey(),
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });

  const SYSTEM_MSG =
    "คุณคือหมอดูไพ่ยิปซีภาษาไทย ให้คำอธิบายกระชับ ชัดเจน เป็นขั้นเป็นตอน และอิงตามไพ่ที่เปิดได้เท่านั้น";

  const models = ["gpt-4o-mini", "gpt-4o"];

  const normalize = (val: any) => {
    if (!val) return "";
    if (typeof val === "string") return val;
    if (Array.isArray(val)) {
      const first = val[0];
      if (first?.message?.content) {
        const c = first.message.content;
        if (typeof c === "string") return c;
        if (Array.isArray(c) && c[0]?.text) return c[0].text;
      }
    }
    // some SDKs expose .output_text() helper
    try {
      // @ts-ignore
      const ot = val.output_text?.();
      if (typeof ot === "string" && ot.trim()) return ot;
    } catch {}
    // Additional normalization for common Responses API shapes
    if (val?.output && Array.isArray(val.output) && val.output[0]?.content && Array.isArray(val.output[0].content)) {
      const first = val.output[0].content.find((c: any) => c?.text?.value) || val.output[0].content[0];
      const maybe = first?.text?.value || first?.text || "";
      if (typeof maybe === "string" && maybe.trim()) return maybe;
    }
    if (val?.choices && Array.isArray(val.choices) && val.choices[0]?.message?.content) {
      const c = val.choices[0].message.content;
      if (typeof c === "string" && c.trim()) return c;
      if (Array.isArray(c) && c[0]?.text) return c[0].text;
    }
    // fallback to JSON string
    return JSON.stringify(val);
  };

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      // 1) Try Chat Completions
      try {
        const completion = await openai.chat.completions.create({
          model,
          temperature: 0.7,
          max_tokens: 1200,
          messages: [
            { role: "system", content: SYSTEM_MSG },
            { role: "user", content: promptText },
          ],
        });
        const text =
          completion.choices?.[0]?.message?.content?.trim?.() ?? "";
        tried.push({ model, api: "chat.completions", ok: true, len: text.length });
        if (text) return { text, tried };
      } catch (e: any) {
        tried.push({
          model,
          api: "chat.completions",
          ok: false,
          error: String(e?.message ?? e),
        });
      }

      // 2) Fallback: Responses API (use simple string input for compatibility)
      try {
        const resp = await openai.responses.create({
          model,
          temperature: 0.7,
          max_output_tokens: 1200,
          input: `SYSTEM:\n${SYSTEM_MSG}\n\nUSER:\n${promptText}`,
        } as any);

        const text = normalize(resp).trim();
        tried.push({ model, api: "responses", ok: true, len: text.length });
        if (text) return { text, tried };
      } catch (e: any) {
        tried.push({
          model,
          api: "responses",
          ok: false,
          error: String(e?.message ?? e),
        });
      }

      // small backoff
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  return { text: "", tried, reason: "no_text" as const };
}

function buildLocalFallback(mode: TarotMode, payload: any) {
  const faceLocal = (c: CardPick) => `${c.name}${c.reversed ? " (กลับหัว)" : ""}`;
  if (mode === "threeCards") {
    const cards = (payload.cards as CardPick[]).map((c) => faceLocal(c)).join(", ");
    return `สรุปเบื้องต้นจากไพ่ 3 ใบ: ${cards}
- แนวโน้ม: เชื่อมโยงภาพรวมของทั้งสามใบกับคำถาม
- คำแนะนำ: ตั้งสติ วางแผนเป็นขั้นตอน และทบทวนสิ่งที่ควบคุมได้/ไม่ได้`;
  }
  if (mode === "weighOptions") {
    const pairs = (payload.pairs as { option: string; card: CardPick }[])
      .map((p) => `${p.option}: ${faceLocal(p.card)}`)
      .join(" | ");
    return `สรุปเบื้องต้นการชั่งน้ำหนักตัวเลือก: ${pairs}
- เปรียบเทียบจุดแข็ง/เงื่อนไขของแต่ละทางเลือก แล้วเลือกอันที่สอดคล้องเป้าหมายที่สุด`;
  }
  if (mode === "classic10") {
    const lines = (payload.slots as { pos: number; label: string; card: CardPick }[])
      .sort((a, b) => a.pos - b.pos)
      .map((s) => `${s.pos}. ${s.label}: ${faceLocal(s.card)}`)
      .join("\n");
    return `สรุปเบื้องต้น (Celtic Cross):
${lines}
- ภาพรวม: ประเมินปัจจุบัน-อดีต-อนาคตใกล้ ปัจจัยภายใน/ภายนอก แล้วจัดลำดับแผนการ`;
  }
  return "";
}

function looksLikePrompt(text: string) {
  const t = (text || "").toLowerCase().trim();
  if (!t) return false;

  // obvious templating placeholders
  if (/\{\{\s*[\w.]+\s*\}\}/.test(t)) return true;

  // Thai/EN cues that strongly indicate instruction templates, not analysis
  const cues = [
    "กรุณาอธิบาย",
    "โปรดอธิบาย",
    "กรุณาระบุ",
    "โปรดระบุ",
    "ใส่ชื่อ",
    "ใส่นามสกุล",
    "วันเกิดของคุณ",
    "เวลาเกิดของคุณ",
    "รูปแบบการดู",
    "สรุปภาพรวม",
    "ตัวเลือกที่ต้องพิจารณา",
    "ตำแหน่งละบรรทัด",
    "ให้เหตุผลสั้น",
    "เชื่อมโยงเข้ากับคำถาม",
    "ใช้โครงนี้",
    "เตรียมจิต",
    "checklist",
    "please explain",
    "please provide",
    "analyze",
    "use this structure"
  ];
  if (cues.some((h) => t.includes(h.toLowerCase()))) return true;

  // very short or obviously meta/instructional tone
  if (t.length < 40) return true;

  // heuristic: lots of colons or numbered headings without content
  const colonCount = (t.match(/:/g) || []).length;
  if (colonCount > 8 && t.split(/\s+/).length < 120) return true;

  return false;
}

// --- ID utilities ---
function isUUIDLike(id: string | null | undefined) {
  if (!id || typeof id !== 'string') return false;
  // fast heuristic for UUID v4-ish
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

// Prefer service-role for RLS-safe lookup (clients -> user_id)
async function resolveTargetUserId(
  serviceClient: SupabaseClient | null,
  sessionClient: any,
  id: string
): Promise<{ userId: string; mapped: boolean }> {
  // Prefer service-role for RLS-safe lookup (clients -> user_id)
  const client = serviceClient ?? sessionClient;
  try {
    const { data: c } = await client
      .from("clients")
      .select("user_id")
      .eq("id", id)
      .maybeSingle();
    if (c?.user_id) {
      return { userId: c.user_id as string, mapped: true };
    }
  } catch {}
  return { userId: id, mapped: false };
}

// --- Supabase client helper (Next 15-safe) ---
async function getSupabase(accessToken?: string) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options?: any) {
          cookieStore.set({ name, value, ...(options || {}) });
        },
        remove(name: string, options?: any) {
          cookieStore.set({ name, value: "", ...(options || {}), maxAge: 0 });
        },
      },
      headers: {
        "x-forwarded-host": headerStore.get("x-forwarded-host") ?? "",
        "x-forwarded-proto": headerStore.get("x-forwarded-proto") ?? "",
      },
      global: accessToken
        ? { headers: { Authorization: `Bearer ${accessToken}` } }
        : undefined,
      cookieOptions: {
        sameSite: "lax",
        secure: true,
      },
    }
  );
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const __debug: any = { step: "start" };
  try {
    // Try to read Bearer token from header first so we can attach it to the client
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const bearer = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
    const supabase = await getSupabase(bearer);

    // Service-role client (RLS bypass) used for id-mapping and credit ops when available
    const serviceClient = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createSupabaseServiceClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false } }
        )
      : null;
    __debug.serviceRole = !!serviceClient;

    // parse request body early so we can use target user
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    // auth ผู้เรียก (อ่านจาก session/cookie หรือ Authorization: Bearer)
    let { data: { user } } = await supabase.auth.getUser();
    __debug.hasBearer = !!bearer;
    __debug.hasUser = !!user;

    if (!user) {
      logError("unauthenticated request", { hasBearer: !!bearer });
      return NextResponse.json(
        { ok: false, error: "UNAUTHENTICATED" },
        { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
      );
    }

    // โหลดโปรไฟล์ผู้เรียกเพื่อดู role
    const { data: meProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    // รองรับหลาย alias ของ target header (กัน proxy เปลี่ยนชื่อ)
    const headerAliases = [
      "x-ddt-target-user",
      "X-DDT-Target-User",
      "x-ddt-targetUser",
      "x-ddt-targetuser",
      "x-target-user-id",
      "x-target-user",
      "x-ddt-target-client",
      "X-DDT-Target-Client",
      "x-target-client-id",
      "x-target-client"
    ];
    let targetHeader = "";
    for (const k of headerAliases) {
      const v = req.headers.get(k as any);
      if (v) { targetHeader = v; break; }
    }
    const isAdmin = meProfile?.role === "admin";
    __debug.isAdmin = isAdmin;
    const targetBody = body?.targetUserId || body?.target_user_id;
    const targetClientBody = body?.targetClientId || body?.target_client_id;
    let targetRaw = isAdmin && (targetHeader || targetBody || targetClientBody)
      ? (targetHeader || targetBody || targetClientBody)
      : user.id;

    // If admin passed a client id, map it to the actual user_id (use service-role if available)
    const { userId: targetUserId, mapped: mappedFromClient } =
      await resolveTargetUserId(serviceClient, supabase, targetRaw);
    __debug.targetRaw = targetRaw;
    __debug.targetUserId = targetUserId;
    __debug.mappedFromClient = mappedFromClient;

    // If admin is spending credit on behalf of another user, use service-role to bypass RLS on credits table
    const useServiceRole = isAdmin && targetUserId !== user.id && !!serviceClient;
    // client used for credit reads/writes (RLS-bypass when admin operates on others)
    const creditClient = (useServiceRole ? serviceClient! : supabase) as any;

    // Resolve identifiers used by 'credits' table (some envs store by client_id or email)
    let creditClientId: string | null = null;
    let creditEmail: string | null = null;
    try {
      const { data: cInfo } = await creditClient
        .from("clients")
        .select("id,email")
        .eq("user_id", targetUserId)
        .limit(1)
        .maybeSingle();
      creditClientId = cInfo?.id ?? null;
      creditEmail = cInfo?.email ?? user.email ?? null;
    } catch {
      creditClientId = null;
      creditEmail = user.email ?? null;
    }
    __debug.creditIdentifiers = { creditClientId, creditEmail };

    // ระบบตัดเครดิตก่อนดูไพ่
    const mode = (body?.mode ?? "") as TarotMode;
    if (!["threeCards", "weighOptions", "classic10"].includes(mode)) {
      return NextResponse.json({ ok: false, error: "INVALID_MODE" }, { status: 400 });
    }

    // กำหนด feature และค่าใช้จ่าย
    let featureKey: "tarot_threeCards" | "tarot_weighOptions" | "tarot_classic10";
    let cost = 1;
    if (mode === "threeCards") {
      featureKey = "tarot_threeCards";
      cost = 1;
    } else if (mode === "weighOptions") {
      featureKey = "tarot_weighOptions";
      cost = 1;
    } else {
      featureKey = "tarot_classic10";
      cost = 5;
    }


    // ----- Credit deduction (bucket-aware with proper fallbacks) -----
    // First, prefer using the same source of truth as UI (balance view + usage ledger)
    const primaryBucket =
      (featureKey.split("_")[0] === "tarot") ? "tarot" :
      (featureKey.split("_")[0] === "palm")  ? "palm"  :
      (featureKey.split("_")[0] === "natal") ? "natal" :
      featureKey.split("_")[0];

    // choose writer: if admin spending for others and service-role available, write with service-role
    const writerClient = (isAdmin && targetUserId !== user.id && !!serviceClient) ? serviceClient : supabase;

    const viaView = await tryDeductViaBalanceView({
      reader: serviceClient ?? supabase,
      writer: writerClient,
      targetUserId,
      bucket: primaryBucket,
      featureKey,
      cost,
      createdBy: user.id,
    });

    // track which path we used for debug
    let spentVia: "view-check" | "view+usage" | "table" = viaView.ok
      ? (viaView.mode === "check_only" ? "view-check" : "view+usage")
      : "table";

    if (!viaView.ok) {
    type NullableBucket = string | null;

    const buildPriority = (fk: string): NullableBucket[] => {
      const family = fk.split("_")[0];
      const arr = [fk, family, "tarot", "any", "*", null] as NullableBucket[];
      // de-duplicate while preserving order
      const seen = new Set<string>();
      return arr.filter((v) => {
        const key = v === null ? "__NULL__" : String(v);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const bucketToParam = (b: NullableBucket) =>
      b === null || b === "any" || b === "*" ? null : b;

    const numVal = (row: any) =>
      Number(
        row?.balance ??
        row?.carry_balance ??
        row?.credit ??
        row?.credits ??
        row?.amount ??
        row?.remaining ??
        0
      );

    const getRowFeature = (row: any): string | null =>
      (row?.feature_key ?? row?.feature ?? null);

    let paidFrom: NullableBucket = null;
    let lastBalanceSeen: number | null = null;
    let creditWhere:
      | { kind: "user_id" | "client_id" | "email"; value: string }
      | null = null;

    // 1) Read all credit rows for the target by user_id -> client_id -> email
    let rows: any[] = [];
    {
      const byUser = await creditClient
        .from("credits")
        .select("feature_key,feature,balance,carry_balance,credit,credits,amount,remaining")
        .eq("user_id", targetUserId);
      if (!byUser.error && byUser.data && byUser.data.length) {
        rows = byUser.data;
        creditWhere = { kind: "user_id", value: targetUserId };
      } else if (creditClientId) {
        const byClient = await creditClient
          .from("credits")
          .select("feature_key,feature,balance,carry_balance,credit,credits,amount,remaining")
          .eq("client_id", creditClientId);
        if (!byClient.error && byClient.data && byClient.data.length) {
          rows = byClient.data;
          creditWhere = { kind: "client_id", value: creditClientId };
        }
      }
      if (rows.length === 0 && creditEmail) {
        const byEmail = await creditClient
          .from("credits")
          .select("feature_key,feature,balance,carry_balance,credit,credits,amount,remaining")
          .eq("email", creditEmail);
        if (!byEmail.error && byEmail.data && byEmail.data.length) {
          rows = byEmail.data;
          creditWhere = { kind: "email", value: creditEmail };
        }
      }
    }

    // 2) Choose the first bucket with enough balance
    const priority = buildPriority(featureKey);
    const pick: NullableBucket =
      priority.find((b) => {
        const matchKey = (fk: any) => (b === null ? fk == null : fk === b);
        const row = rows.find((r) => matchKey(getRowFeature(r)));
        return row && numVal(row) >= cost;
      }) ?? null;

    if (pick !== null) {
      // 3) Try RPC first (translate "any/*/null" into NULL)
      const rpcBucket = bucketToParam(pick);
      const { data: ok, error: rpcErr } = await creditClient.rpc("sp_use_credit", {
        p_user_id: targetUserId,
        p_feature: rpcBucket,
        p_cost: cost,
        p_reading: null,
      });

      if (!rpcErr && ok) {
        paidFrom = pick;
      } else {
        // 4) Manual update on the specific row we picked
        const { data: found } = await creditClient
          .from("credits")
          .select("id,balance,carry_balance,credit,credits,amount,remaining,feature_key,feature")
          .eq(creditWhere?.kind ?? "user_id", creditWhere?.value ?? targetUserId)
          // match by either column name
          [pick === null ? "is" : "eq"]("feature_key", pick === null ? null : pick)
          .or(pick === null ? "feature.is.null" : `feature.eq.${pick}`)
          .maybeSingle();

        const current = numVal(found);
        lastBalanceSeen = current;

        if (Number.isFinite(current) && current >= cost) {
          const newVal = Math.max(0, current - cost);
          const targetCol =
            "balance" in (found ?? {}) ? "balance"
            : "credit" in (found ?? {}) ? "credit"
            : "credits" in (found ?? {}) ? "credits"
            : "amount" in (found ?? {}) ? "amount"
            : "remaining" in (found ?? {}) ? "remaining"
            : "carry_balance";
          const upd = creditClient
            .from("credits")
            .update({ [targetCol]: newVal })
            .eq(creditWhere?.kind ?? "user_id", creditWhere?.value ?? targetUserId);
          (pick === null ? (upd as any).is("feature_key", null) : upd.eq("feature_key", pick));
          const { error: updErr } = await upd;
          if (!updErr) paidFrom = pick;
        }
      }
    } else {
      // Could not find any bucket with sufficient balance; remember the latest seen
      const { data: r } = await creditClient
        .from("credits")
        .select("balance,carry_balance,credit")
        .eq(creditWhere?.kind ?? "user_id", creditWhere?.value ?? targetUserId)
        .maybeSingle();
      lastBalanceSeen = numVal(r);
    }

    if (!paidFrom) {
      // Soft fallback: if total balance across rows is enough, pick the max-balance row
      const total = rows.reduce((s, r) => s + (Number.isFinite(numVal(r)) ? numVal(r) : 0), 0);
      if (total >= cost && rows.length > 0) {
        const richest = rows.reduce((a, b) => (numVal(a) >= numVal(b) ? a : b));
        const richestKey = getRowFeature(richest);
        const richestVal = numVal(richest);
        lastBalanceSeen = richestVal;

        // try deduct from the richest row
        const upd2 = creditClient
          .from("credits")
          .update({
            [ ("balance" in richest) ? "balance"
              : ("credit" in richest) ? "credit"
              : ("credits" in richest) ? "credits"
              : ("amount" in richest) ? "amount"
              : ("remaining" in richest) ? "remaining"
              : "carry_balance"
            ]: Math.max(0, richestVal - cost)
          })
          .eq(creditWhere?.kind ?? "user_id", creditWhere?.value ?? targetUserId);

        richestKey === null ? (upd2 as any).is("feature_key", null) : upd2.eq("feature_key", richestKey);
        const { error: upd2Err } = await upd2;
        if (!upd2Err) {
          paidFrom = richestKey ?? null;
        }
      }

      if (!paidFrom) {
        return NextResponse.json(
          {
            ok: false,
            error: "เครดิตไม่พอ กรุณาเติมเครดิต หรือรอรีเซ็ตตามแพ็กเกจ",
            debug: {
              targetUserId,
              featureKey,
              cost,
              triedPriority: priority,
              rows,
              total,
              lastBalanceSeen,
              creditWhere,
            },
          },
          { status: 402 }
        );
      }
    }
    } // <-- end if (!viaView.ok)

    // โหลดโปรไฟล์ของผู้ที่ถูกดูดวง (อาจเป็นตัวเองหรือคนที่แอดมินเลือก)
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, birth_date, birth_time")
      .eq("user_id", targetUserId)
      .maybeSingle();

    const userBrief: UserBrief = {
      fullName: profile?.full_name ?? "ไม่ระบุชื่อ",
      birthDate: profile?.birth_date ?? "ไม่ระบุวันเกิด",
      birthTime: profile?.birth_time ?? undefined,
    };

    let topic: string | null = null;
    let payload: any = { submode: mode };
    let prompt = "";
    let titleText = ""; // ensure non-null title for DB

    if (mode === "threeCards") {
      const q = (body?.question ?? "").trim();
      if (!q) return NextResponse.json({ ok: false, error: "QUESTION_REQUIRED" }, { status: 400 });
      const cards = pickCards(3);
      topic = q;
      payload = { ...payload, question: q, cards };
      titleText = `ถามเรื่องเดียว 3 ใบ`;
    }

    if (mode === "weighOptions") {
      const options = Array.isArray(body?.options) ? body.options.map((s: any) => String(s).trim()).filter(Boolean) : [];
      if (options.length < 2) {
        return NextResponse.json({ ok: false, error: "AT_LEAST_TWO_OPTIONS" }, { status: 400 });
      }
      const _opts = options.slice(0, 3);
      const cards = pickCards(_opts.length);
      const pairs = _opts.map((option: string, i: number) => ({ option, card: cards[i] }));
      payload = { ...payload, options: _opts, pairs };
      titleText = `ชั่งน้ำหนักตัวเลือก`;
    }

    if (mode === "classic10") {
      const cards = pickCards(10);
      const slots = CELTIC_SLOTS.map((s, i) => ({ pos: s.no, label: s.label, card: cards[i] }));
      payload = { ...payload, slots };
      topic = null;
      titleText = `แบบคลาสสิก 10 ใบ`;
    }

    // ----- build prompt: prefer DB template (admin-editable), fallback to static builders
    const subtype = mode as string;
    const dbContent = await fetchPromptContentBySystem(supabase, SYSTEM_KEY, subtype);

    const cardsText = (() => {
      if (mode === "threeCards") {
        return (payload.cards as CardPick[]).map(c => face(c)).join(", ");
      }
      if (mode === "weighOptions") {
        return (payload.pairs as { option: string; card: CardPick }[])
          .map(p => `${p.option}: ${face(p.card)}`)
          .join(" | ");
      }
      if (mode === "classic10") {
        return (payload.slots as { pos: number; label: string; card: CardPick }[])
          .map(s => `${s.pos}.${s.label}: ${face(s.card)}`)
          .join(" | ");
      }
      return "";
    })();

    const vars = {
      full_name: userBrief.fullName,
      dob: userBrief.birthDate,
      birth_time: userBrief.birthTime ?? "",
      question: topic ?? "",
      options: (payload.options?.join(", ") || ""),
      cards: cardsText,
      slots_text: (payload.slots
        ? (payload.slots as { pos: number; label: string; card: CardPick }[])
            .map((s) => `${s.pos}. ${s.label}: ${s.card.name}${s.card.reversed ? " (กลับหัว)" : ""}`)
            .join("\n")
        : ""),
    };

    // If DB content exists but is effectively empty after templating, ignore it
    // and fall back to local builders.
    const renderedFromDB = (() => {
      if (!dbContent) return "";
      let t = dbContent;
      if (t.includes("{{slots_text}}") && vars.slots_text) {
        t = t.replace("{{slots_text}}", vars.slots_text);
      }
      t = renderTemplate(t, vars).trim();
      return t;
    })();

    if (renderedFromDB) {
      prompt = renderedFromDB;
    } else {
      if (mode === "threeCards") {
        prompt = buildThreeCardsPrompt(userBrief, topic ?? "", payload.cards);
      } else if (mode === "weighOptions") {
        prompt = buildWeighOptionsPrompt(userBrief, payload.pairs);
      } else if (mode === "classic10") {
        prompt = buildClassic10Prompt(userBrief, payload.slots);
      }
    }
    __debug.promptLen = (prompt || "").length;
    __debug.hasPrompt = !!prompt;

    /* --- Generate analysis from prompt (robust with retry + fallback) --- */
    let analysis = "";
    try {
      const result = await callOpenAIWithRetry(prompt);
      __debug.openai = { called: true, tried: result.tried, reason: result.reason };
      analysis = result.text?.trim() || "";
      let usedFallback = false;

      // If the model echoed the template or produced unusable text, fall back.
      if (!analysis || analysis.length < 80 || looksLikePrompt(analysis)) {
        if (looksLikePrompt(analysis)) {
          __debug.analysisWasPromptLike = true;
        }
        analysis = buildLocalFallback(mode, payload);
        usedFallback = true;
        __debug.openaiFallbackUsed = true;
      }

      // sanity: never store the prompt itself by mistake
      if (analysis === prompt || looksLikePrompt(analysis)) {
        analysis = buildLocalFallback(mode, payload);
        usedFallback = true;
        __debug.openaiFallbackUsed = true;
      }

      __debug.analysisLen = analysis.length;
      __debug.analysisPreview = (analysis || "").slice(0, 160);
    } catch (err: any) {
      logError("OpenAI error", err?.message ?? err);
      __debug.openaiError = String(err?.message ?? err);
      analysis = buildLocalFallback(mode, payload);
    }

    // ผูก prompt และผลวิเคราะห์ไว้ใน payload
    payload = { ...payload, prompt_used: prompt, analysis };

    // เนื้อหาที่จะเก็บลงคอลัมน์ content (ให้ UI อ่านได้ทันที)
    const contentText = analysis && analysis.trim().length > 0
      ? analysis.trim()
      : "ขออภัย ระบบยังไม่สามารถสร้างคำทำนายได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง";

    // บันทึกลง Supabase (ใช้ RLS + cookies auth)
    // พยายามหา client เดิมของผู้ถูกอ่าน (ถ้าไม่มีจะไม่ส่ง client_id เพื่อหลีกเลี่ยง FK ผิดพลาด)
    let clientId: string | null = null;
    try {
      const { data: clientRow } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", targetUserId)
        .limit(1)
        .maybeSingle();
      clientId = clientRow?.id ?? null;
    } catch {
      clientId = null;
    }
    __debug.hasClientId = !!clientId;

    const insertPayload: any = {
      user_id: targetUserId,       // subject (เจ้าของดวง)
      created_by: user.id,         // คนกดเปิดไพ่
      type: "tarot",
      mode,                        // threeCards | weighOptions | classic10
      topic: topic ?? null,        // หัวข้อถาม
      title: (titleText || topic || ""),
      payload,
      content: contentText,
      // analysis property removed
    };
    if (clientId) {
      insertPayload.client_id = clientId;
    }

    // minimal debug footprint
    const _debugInsert = { mode, hasClientId: !!clientId, hasPrompt: !!prompt, topicLen: (topic ?? "").length };

    const { data, error } = await supabase
      .from("readings")
      .insert(insertPayload)
      .select("id, created_at, type, mode, topic, title, payload, content")
      .single();

    if (error) {
      logError("Supabase insert error", { error, _debugInsert });
      return NextResponse.json(
        { ok: false, error: error.message, details: (error as any)?.details ?? null, hint: (error as any)?.hint ?? null, debug: __debug },
        { status: 500 }
      );
    }

    if (isAdmin) __debug.prompt_used = !!prompt;
    // minimal trace end
    console.log("[api/tarot] done", {
      step: __debug.step,
      hasBearer: __debug.hasBearer,
      hasUser: __debug.hasUser,
      isAdmin: __debug.isAdmin,
      targetRaw: __debug.targetRaw,
      promptLen: __debug.promptLen,
      hasPrompt: __debug.hasPrompt,
      openai: { called: !!__debug.openai, tried: __debug.openai?.tried, reason: __debug.openai?.reason },
      analysisLen: __debug.analysisLen,
      hasClientId: __debug.hasClientId,
      prompt_used: !!payload?.prompt_used,
      fallbackUsed: __debug.openaiFallbackUsed === true,
    });
    __debug.promptPreview = (prompt || '').slice(0, 160);
    return NextResponse.json(
      {
        ok: true,
        reading: data,
        content: contentText,
        analysis: contentText,
        // Always include minimal debug to diagnose client-side quickly
        debug: {
          hasUser: __debug.hasUser,
          isAdmin: __debug.isAdmin,
          promptLen: __debug.promptLen,
          analysisLen: __debug.analysisLen,
          promptPreview: __debug.promptPreview,
          openai: __debug.openai,
          fallbackUsed: __debug.openaiFallbackUsed === true,
          contentPreview: (contentText || "").slice(0, 120),
          spentVia,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    logError("Unhandled error", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "UNKNOWN", debug: __debug }, { status: 500 });
  }
}
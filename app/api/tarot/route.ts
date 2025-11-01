// app/api/tarot/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import OpenAI from "openai";

// --- constants ---
const SYSTEM_KEY = "tarot" as const;
const DEBUG_TAG = "[api/tarot]";
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
      "x-target-user-id",
      "x-target-user",
    ];
    let targetHeader = "";
    for (const k of headerAliases) {
      const v = req.headers.get(k as any);
      if (v) { targetHeader = v; break; }
    }
    const isAdmin = meProfile?.role === "admin";
    __debug.isAdmin = isAdmin;
    const targetBody = body?.targetUserId || body?.target_user_id;
    const targetUserId = isAdmin && (targetHeader || targetBody)
      ? (targetHeader || targetBody)
      : user.id;
    __debug.targetUserId = targetUserId;

    // ระบบตัดเครดิตก่อนดูไพ่
    const mode = (body?.mode ?? "") as TarotMode;
    if (!["threeCards", "weighOptions", "classic10"].includes(mode)) {
      return NextResponse.json({ ok: false, error: "INVALID_MODE" }, { status: 400 });
    }
    let featureKey = "";
    let cost = 1;
    if (mode === "threeCards") {
      featureKey = "tarot_threeCards";
      cost = 1;
    } else if (mode === "weighOptions") {
      featureKey = "tarot_weighOptions";
      cost = 1;
    } else if (mode === "classic10") {
      featureKey = "tarot_classic10";
      cost = 5;
    }
    // เรียก RPC ที่ Supabase
    const { data: creditResult, error: creditError } = await supabase.rpc("sp_use_credit", {
      p_user_id: targetUserId,
      p_feature: featureKey,
      p_cost: cost,
      p_reading: null,
    });
    if (creditError || !creditResult) {
      // ตรวจซ้ำ: ถ้า RPC ล้มเหลว ให้เช็คยอดเครดิตตรง ๆ แล้วลองตัดเครดิตแบบ fallback
      const { data: creditRow, error: balErr } = await supabase
        .from("credits")
        .select("balance, carry_balance, credit")
        .eq("user_id", targetUserId)
        .maybeSingle();
      const currentBalance = Number(
        creditRow?.balance ?? creditRow?.carry_balance ?? creditRow?.credit ?? 0
      );
      // ถ้ายอดน้อยกว่าค่าใช้จ่ายจริง ค่อยตอบ 402
      if (!Number.isFinite(currentBalance) || currentBalance < cost) {
        return NextResponse.json(
          { ok: false, error: "เครดิตไม่พอ กรุณาเติมเครดิต หรือรอรีเซ็ตตามแพ็กเกจ" },
          { status: 402 }
        );
      }
      // มีเครดิตพอ → พยายามตัดเครดิตด้วยการอัปเดตตารางโดยตรง (กันกรณี RPC พัง)
      const preferCols = ["balance", "credit", "carry_balance"];
      let chosenCol: string | null = null;
      for (const c of preferCols) {
        if (creditRow && Object.prototype.hasOwnProperty.call(creditRow, c)) {
          chosenCol = c;
          break;
        }
      }
      if (chosenCol) {
        const newVal = Math.max(0, currentBalance - cost);
        const { error: updErr } = await supabase
          .from("credits")
          .update({ [chosenCol]: newVal })
          .eq("user_id", targetUserId);
        if (updErr) {
          return NextResponse.json(
            {
              ok: false,
              error: "CREDIT_RPC_FAILED",
              details: creditError?.message ?? updErr?.message ?? null,
              debug: {
                targetUserId,
                featureKey,
                cost,
                currentBalance,
                chosenCol,
                balErr: balErr?.message ?? null
              }
            },
            { status: 500 }
          );
        }
        // อัปเดตสำเร็จ → ดำเนินต่อไปเหมือนหักเครดิตผ่าน RPC ได้
      } else {
        return NextResponse.json(
          {
            ok: false,
            error: "CREDIT_RPC_FAILED",
            details: creditError?.message ?? null,
            debug: {
              targetUserId,
              featureKey,
              cost,
              currentBalance,
              chosenCol,
              balErr: balErr?.message ?? null
            }
          },
          { status: 500 }
        );
      }
    }

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
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    logError("Unhandled error", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "UNKNOWN", debug: __debug }, { status: 500 });
  }
}
// app/api/tarot/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import OpenAI from "openai";

// --- constants ---
const SYSTEM_KEY = "tarot" as const;

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

// --- Supabase client helper (Next 15-safe) ---
async function getSupabase() {
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
    }
  );
}


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase();

    // auth ผู้เรียก (อ่านจาก cookie ก่อน, ถ้าไม่พบลองอ่านจาก Authorization: Bearer <token>)
    let {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
      const m = authHeader?.match(/^Bearer\s+(.+)$/i);
      if (m?.[1]) {
        try {
          const byToken = await supabase.auth.getUser(m[1]);
          user = byToken.data.user ?? null;
        } catch {
          // ignore
        }
      }
    }

    if (!user) {
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

    // รองรับแอดมินทำรายการแทนลูกดวงผ่าน header x-ddt-target-user
    const targetHeader = req.headers.get("x-ddt-target-user");
    const isAdmin = meProfile?.role === "admin";
    const targetUserId = isAdmin && targetHeader ? targetHeader : user.id;

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

    const body = await req.json().catch(() => ({}));
    const mode = (body?.mode ?? "") as TarotMode;
    if (!["threeCards", "weighOptions", "classic10"].includes(mode)) {
      return NextResponse.json({ ok: false, error: "INVALID_MODE" }, { status: 400 });
    }

    let topic: string | null = null;
    let payload: any = { submode: mode };
    let prompt = "";

    if (mode === "threeCards") {
      const q = (body?.question ?? "").trim();
      if (!q) return NextResponse.json({ ok: false, error: "QUESTION_REQUIRED" }, { status: 400 });
      const cards = pickCards(3);
      topic = q;
      payload = { ...payload, question: q, cards };
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
    }

    if (mode === "classic10") {
      const cards = pickCards(10);
      const slots = CELTIC_SLOTS.map((s, i) => ({ pos: s.no, label: s.label, card: cards[i] }));
      payload = { ...payload, slots };
      topic = null;
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

    if (dbContent) {
      let t = dbContent;
      if (t.includes("{{slots_text}}") && vars.slots_text) {
        t = t.replace("{{slots_text}}", vars.slots_text);
      }
      prompt = renderTemplate(t, vars);
    } else {
      if (mode === "threeCards") {
        prompt = buildThreeCardsPrompt(userBrief, topic ?? "", payload.cards);
      } else if (mode === "weighOptions") {
        prompt = buildWeighOptionsPrompt(userBrief, payload.pairs);
      } else if (mode === "classic10") {
        prompt = buildClassic10Prompt(userBrief, payload.slots);
      }
    }

    // --- Generate analysis from prompt (optional) ---
    let analysis = "";
    try {
      if (process.env.OPENAI_API_KEY) {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.7,
          max_tokens: 900,
          messages: [
            {
              role: "system",
              content:
                "คุณคือหมอดูไพ่ยิปซีภาษาไทย ให้คำอธิบายกระชับ ชัดเจน เป็นขั้นเป็นตอน และอิงตามไพ่ที่เปิดได้เท่านั้น",
            },
            { role: "user", content: prompt },
          ],
        });
        analysis = completion.choices?.[0]?.message?.content?.trim() ?? "";
      }
    } catch {
      analysis = "";
    }

    // ผูก prompt และผลวิเคราะห์ไว้ใน payload
    payload = { ...payload, prompt_used: prompt, analysis };

    // บันทึกลง Supabase (ใช้ RLS + cookies auth)
    const { data, error } = await supabase
      .from("readings")
      .insert({
        user_id: targetUserId,
        type: "tarot",
        title: topic ?? null,
        payload,
      })
      .select("id, created_at, title, payload")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, reading: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "UNKNOWN" }, { status: 500 });
  }
}
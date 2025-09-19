// app/api/tarot/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

// --- Prompt builders ---
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

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // Use Bearer token from Authorization header for RLS-authenticated requests
    const authHeader = req.headers.get("authorization") ?? "";
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: authHeader ? { Authorization: authHeader } : {},
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    // ดึงโปรไฟล์เพื่อประกอบ prompt (ถ้าไม่มีให้ใส่ค่าเริ่มต้น)
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, birth_date, birth_time")
      .eq("user_id", user.id)
      .single();

    const userBrief: UserBrief = {
      fullName: profile?.full_name ?? "ไม่ระบุชื่อ",
      birthDate: profile?.birth_date ?? "ไม่ระบุวันเกิด",
      birthTime: profile?.birth_time ?? undefined,
    };

    const body = await req.json().catch(() => ({}));
    const mode: TarotMode = body?.mode;
    if (!["threeCards", "weighOptions", "classic10"].includes(mode)) {
      return NextResponse.json({ ok: false, error: "INVALID_MODE" }, { status: 400 });
    }

    let topic: string | null = null;
    let payload: any = { submode: mode };
    let prompt: string = "";

    if (mode === "threeCards") {
      const q = (body?.question ?? "").trim();
      if (!q) return NextResponse.json({ ok: false, error: "QUESTION_REQUIRED" }, { status: 400 });
      const cards = pickCards(3);
      topic = q;
      payload = { ...payload, question: q, cards };
      prompt = buildThreeCardsPrompt(userBrief, q, cards);
    }

    if (mode === "weighOptions") {
      const options = Array.isArray(body?.options) ? body.options.map((s: any) => String(s).trim()).filter(Boolean) : [];
      if (options.length < 2) {
        return NextResponse.json({ ok: false, error: "AT_LEAST_TWO_OPTIONS" }, { status: 400 });
      }
      const _opts = options.slice(0, 3);
      const cards = pickCards(Math.max(2, _opts.length)); // 1 ใบ/ตัวเลือก (อย่างน้อย 2)
      const pairs = _opts.map((option: string, i: number) => ({ option, card: cards[i] }));
      payload = { ...payload, options: _opts, pairs };
      prompt = buildWeighOptionsPrompt(userBrief, pairs);
    }

    if (mode === "classic10") {
      const cards = pickCards(10);
      const slots = CELTIC_SLOTS.map((s, i) => ({ pos: s.no, label: s.label, card: cards[i] }));
      payload = { ...payload, slots };
      topic = null;
      prompt = buildClassic10Prompt(userBrief, slots);
    }

    // บันทึกลง Supabase (ใช้ RLS + cookies auth)
    const { data, error } = await supabase
      .from("readings")
      .insert({
        user_id: user.id,
        mode: "tarot",
        topic,
        payload: { ...payload, prompt }, // JSON - include prompt for admin editing
      })
      .select("id, created_at, topic, payload")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, reading: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "UNKNOWN" }, { status: 500 });
  }
}
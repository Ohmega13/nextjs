// app/api/tarot/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

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

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: () => cookieStore }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const mode: TarotMode = body?.mode;
    if (!["threeCards", "weighOptions", "classic10"].includes(mode)) {
      return NextResponse.json({ ok: false, error: "INVALID_MODE" }, { status: 400 });
    }

    let topic: string | null = null;
    let payload: any = { submode: mode };

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
      const cards = pickCards(Math.max(2, _opts.length)); // 1 ใบ/ตัวเลือก (อย่างน้อย 2)
      const pairs = _opts.map((option: string, i: number) => ({ option, card: cards[i] }));
      payload = { ...payload, options: _opts, pairs };
    }

    if (mode === "classic10") {
      const cards = pickCards(10);
      const slots = CELTIC_SLOTS.map((s, i) => ({ pos: s.no, label: s.label, card: cards[i] }));
      payload = { ...payload, slots };
      topic = null;
    }

    // บันทึกลง Supabase (ใช้ RLS + cookies auth)
    const { data, error } = await supabase
      .from("readings")
      .insert({
        user_id: user.id,
        mode: "tarot",
        topic,
        payload, // JSON
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
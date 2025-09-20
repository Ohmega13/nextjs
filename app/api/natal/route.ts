import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

type BodyProfile = {
  full_name?: string;
  dob?: string;
  birth_time?: string;
  birth_place?: string;
};

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || undefined;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: authHeader ? { Authorization: authHeader } : {} } }
  );

  const body = await req.json().catch(() => ({}));
  const action: "init-baseline" | "ask-followup" = body?.action;
  const system: "thai" | "western" = body?.system ?? "thai";
  const question: string | undefined = body?.question?.trim();
  const incomingProfile: BodyProfile | undefined = body?.profile;
  const targetUserIdFromBody: string | undefined = body?.targetUserId;

  // --- auth ---
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  // --- load caller profile to check role/admin & fallback profile fields ---
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("first_name,last_name,dob,birth_time,birth_place,role")
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = callerProfile?.role === "admin";

  // resolve target user (admin can act on behalf of someone else)
  const targetUserId = (isAdmin && targetUserIdFromBody) ? targetUserIdFromBody : user.id;

  // If acting on behalf, optionally fetch that user's profile for fallback fields
  const { data: targetProfileRow } = await supabase
    .from("profiles")
    .select("first_name,last_name,dob,birth_time,birth_place")
    .eq("user_id", targetUserId)
    .maybeSingle();

  // --- compute profile used for prompts (client overrides > target profile > caller profile) ---
  const fullName =
    (incomingProfile?.full_name?.trim()) ||
    `${(targetProfileRow?.first_name ?? "")} ${(targetProfileRow?.last_name ?? "")}`.trim() ||
    `${(callerProfile?.first_name ?? "")} ${(callerProfile?.last_name ?? "")}`.trim() ||
    "-";

  const dob = incomingProfile?.dob ?? targetProfileRow?.dob ?? callerProfile?.dob ?? "";
  const birthTime = incomingProfile?.birth_time ?? targetProfileRow?.birth_time ?? callerProfile?.birth_time ?? "";
  const birthPlace = incomingProfile?.birth_place ?? targetProfileRow?.birth_place ?? callerProfile?.birth_place ?? "";

  // --- LLM helper ---
  async function runLLM(prompt: string) {
    if (!process.env.OPENAI_API_KEY) return "";
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const out = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 900,
      messages: [
        { role: "system", content: "คุณคือนักพยากรณ์พื้นดวง (โหราศาสตร์) ภาษาไทย ตอบเป็นมิตร กระชับ ชัดเจน" },
        { role: "user", content: prompt },
      ],
    });
    return out.choices?.[0]?.message?.content?.trim() ?? "";
  }

  // --- prompt builders ---
  function buildPromptBaseline() {
    return [
      `วิเคราะห์ "พื้นดวง ${system === "thai" ? "โหราศาสตร์ไทย" : "โหราศาสตร์ตะวันตก"}" ของผู้ใช้ต่อไปนี้`,
      `ชื่อ: ${fullName || "-"}`,
      `วัน/เดือน/ปีเกิด: ${dob || "-"}`,
      `เวลาเกิด: ${birthTime || "-"}`,
      `สถานที่เกิด: ${birthPlace || "-"}`,
      "",
      "ขอผลลัพธ์เป็นหัวข้อย่อย เช่น จุดเด่น/จุดที่ควรระวัง, งาน, การเงิน, ความรัก, สุขภาพ, คำแนะนำรวม",
    ].join("\n");
  }

  function buildPromptFollowup(q: string, baselineSummary: string) {
    return [
      `อ้างอิงพื้นดวงของ "${fullName || "-"}" ด้านล่างนี้:`,
      "",
      baselineSummary || "(ยังไม่มีสรุปพื้นดวง)",
      "",
      `กรุณาตอบคำถามเพิ่มเติม: "${q}"`,
      "ขอคำตอบชัดเจน กระชับ เป็นข้อ ๆ พร้อมคำแนะนำที่ปฏิบัติได้จริง",
    ].join("\n");
  }

  // --- actions ---
  if (action === "init-baseline") {
    // minimal validation (วันเกิด & สถานที่เกิดควรมี)
    if (!dob || !birthPlace) {
      return NextResponse.json(
        { ok: false, error: "PROFILE_INCOMPLETE", need: { dob: !dob, birth_place: !birthPlace } },
        { status: 400 }
      );
    }

    const prompt = buildPromptBaseline();
    const analysis = await runLLM(prompt);
    const payload = {
      kind: "baseline",
      system,
      prompt,
      analysis,
      profile: { full_name: fullName, dob, birth_time: birthTime, birth_place: birthPlace },
    };

    const { data, error } = await supabase
      .from("readings")
      .insert({
        user_id: targetUserId,
        mode: "natal",
        topic: "พื้นดวง",
        payload,
      })
      .select("id,created_at,topic,payload")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, baseline: data });
  }

  if (action === "ask-followup") {
    if (!question) {
      return NextResponse.json({ ok: false, error: "QUESTION_REQUIRED" }, { status: 400 });
    }

    // fetch the latest baseline/reading for this user as context
    const { data: last } = await supabase
      .from("readings")
      .select("id,payload")
      .eq("user_id", targetUserId)
      .eq("mode", "natal")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const baselineSummary = last?.payload?.analysis ?? "";
    const prompt = buildPromptFollowup(question, baselineSummary);
    const analysis = await runLLM(prompt);

    const payload = {
      kind: "question",
      system,
      question,
      prompt,
      analysis,
      baseline_id: last?.id ?? null,
      profile: { full_name: fullName, dob, birth_time: birthTime, birth_place: birthPlace },
    };

    const { data, error } = await supabase
      .from("readings")
      .insert({
        user_id: targetUserId,
        mode: "natal",
        topic: question,
        payload,
      })
      .select("id,created_at,topic,payload")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, reading: data });
  }

  return NextResponse.json({ ok: false, error: "UNSUPPORTED_ACTION" }, { status: 400 });
}
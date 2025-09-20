import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

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

  // auth
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  // โหลดโปรไฟล์ (ใช้ประกอบ prompt)
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name,last_name,dob,birth_time,birth_place")
    .eq("user_id", user.id)
    .maybeSingle();

  // Helper: เรียก OpenAI
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

  // Helper: สร้างข้อความ prompt
  function buildPromptBaseline() {
    const fullName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "-";
    const dob = profile?.dob ?? "-";
    const btime = profile?.birth_time ?? "-";
    const bplace = profile?.birth_place ?? "-";
    return [
      `วิเคราะห์ "พื้นดวง ${system === "thai" ? "โหราศาสตร์ไทย" : "โหราศาสตร์ตะวันตก"}" ของ`,
      `ชื่อ: ${fullName}`,
      `วัน/เดือน/ปีเกิด: ${dob}`,
      `เวลาเกิด: ${btime}`,
      `สถานที่เกิด: ${bplace}`,
      "",
      "ขอผลลัพธ์เป็นหัวข้อย่อย เช่น จุดเด่น/จุดที่ควรระวัง, งาน, การเงิน, ความรัก, สุขภาพ, คำแนะนำรวม",
    ].join("\n");
  }

  function buildPromptFollowup(q: string, baselineSummary: string) {
    const fullName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "-";
    return [
      `อ้างอิงพื้นดวงของ ${fullName} ด้านล่างนี้:`,
      "",
      baselineSummary || "(ยังไม่มีสรุปพื้นดวง)",
      "",
      `กรุณาตอบคำถามเพิ่มเติม: "${q}"`,
      "ขอคำตอบชัดเจน กระชับ เป็นข้อ ๆ พร้อมคำแนะนำที่ปฏิบัติได้จริง",
    ].join("\n");
  }

  if (action === "init-baseline") {
    // กันซ้ำ: ถ้ามีพื้นดวงแล้ว จะสร้างใหม่ก็ได้ หรือจะคืนอันเดิม (เลือกแนวทาง)
    // ที่นี่จะ 'สร้างใหม่ทุกครั้ง' เพื่อความง่าย
    const prompt = buildPromptBaseline();
    const analysis = await runLLM(prompt);
    const payload = {
      kind: "baseline",
      system,
      prompt,
      analysis,
    };

    const { data, error } = await supabase
      .from("readings")
      .insert({
        user_id: user.id,
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

    // ดึงพื้นดวงล่าสุด (สรุป) มาใช้เป็น context
    const { data: last } = await supabase
      .from("readings")
      .select("id,payload")
      .eq("user_id", user.id)
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
    };

    const { data, error } = await supabase
      .from("readings")
      .insert({
        user_id: user.id,
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
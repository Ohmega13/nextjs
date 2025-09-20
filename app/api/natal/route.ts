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
      max_tokens: 1600,
      messages: [
        { role: "system", content: "คุณคือนักพยากรณ์พื้นดวง (โหราศาสตร์) ภาษาไทย ตอบเป็นมิตร กระชับ ชัดเจน" },
        { role: "user", content: prompt },
      ],
    });
    return out.choices?.[0]?.message?.content?.trim() ?? "";
  }

  // --- prompt builders ---
  function buildPromptBaseline() {
    if (system === "thai") {
      return [
        `วิเคราะห์พื้นดวงตามหลักโหราศาสตร์ไทย โดยใช้ข้อมูลต่อไปนี้`,
        `– ชื่อ-นามสกุล: ${fullName || "-"}`,
        `– วันเดือนปีเกิด: ${dob || "-"}`,
        `– เวลาเกิด: ${birthTime || "-"}`,
        `– สถานที่เกิด: ${birthPlace || "-"}`,
        ``,
        `ช่วยวิเคราะห์อย่างละเอียดตามหลักโหราศาสตร์ไทยในหัวข้อต่อไปนี้:`,
        `1. ลัคนาและข้อมูลพื้นฐาน`,
        `– ราศีลัคนา, ธาตุประจำลัคนา, ดาวเกษตร, ดาวเจ้าเรือนลัคนา ฯลฯ`,
        `2. บุคลิกภาพและจุดแข็ง`,
        `– วิเคราะห์บุคลิกพื้นฐาน จุดเด่นที่น่าจับตา หรือสิ่งที่เป็นเอกลักษณ์`,
        `3. การงานและการเงิน`,
        `– วิเคราะห์จากดาวในภพกัมมะ, ลาภะ, ศุภะ ฯลฯ`,
        `– อาชีพที่เหมาะสม, ช่วงรุ่ง/ร่วง, การบริหารเงิน`,
        `4. ความรักและความสัมพันธ์`,
        `– วิเคราะห์ภพปัตนิ, ปุตตะ และดาวศุกร์/ดาวอังคาร/พระเกตุ`,
        `– ความสัมพันธ์กับคู่รัก ครอบครัว มิตรสหาย`,
        `5. สุขภาพและจิตใจ`,
        `– วิเคราะห์จากภพวินาศ, ดาวบาปเคราะห์, สุภะจร`,
        `6. โชคชะตาโดยรวมในชีวิต`,
        `– ดวงดีหรือมีเคราะห์อย่างไร?`,
        `– ใช้ดาวจรหรือมหาทักษา/ตรีวัย/จักรฤกษ์/ศิวะจักร`,
        `7. แนวโน้มระยะยาว/รอบชีวิต`,
        `– ช่วงรุ่ง ช่วงเคราะห์ จุดเปลี่ยนในแต่ละช่วงวัย`,
        `8. พื้นดวงโดยรวม แบบช่วงชีวิต ตั้งแต่เกิดจนถึงอายุ 80 ปี`,
        `– สรุปภาพรวมเป็นช่วงวัย เช่น 0–12, 13–30, 31–45, 46–60, 61–80`,
        `– เหตุการณ์สำคัญ แนวโน้ม สิ่งที่ควรระวังในแต่ละช่วง`,
        `9. วิเคราะห์เรื่องตัวเลข`,
        `– เลขมงคล / เลขไม่เหมาะ / เลขประจำตัว`,
        `– เหมาะใช้เป็นเบอร์โทร, เลขทะเบียนรถ, บ้าน, รหัส ฯลฯ`,
        ``,
        `**ใช้ภาษาที่เป็นกันเองแต่ให้ความลึกทางโหราศาสตร์ไทย เพื่อให้เจ้าชะตาเข้าใจและนำไปใช้ได้จริง**`,
      ].join("\n");
    }
    // Western
    return [
      `วิเคราะห์พื้นดวงตามหลักโหราศาสตร์ตะวันตก (Western Astrology) โดยใช้ข้อมูลต่อไปนี้:`,
      `– ชื่อ-นามสกุล: ${fullName || "-"}`,
      `– วันเดือนปีเกิด: ${dob || "-"}`,
      `– เวลาเกิด: ${birthTime || "-"}`,
      `– สถานที่เกิด: ${birthPlace || "-"}`,
      ``,
      `ช่วยวิเคราะห์อย่างละเอียดตามหลักโหราศาสตร์ตะวันตก (Western Astrology) ในหัวข้อต่อไปนี้:`,
      `1. ลัคนา (Ascendant) และบุคลิกภาพภายนอก`,
      `– วิเคราะห์ราศีลัคนา และผลต่อภาพลักษณ์ภายนอก การเข้าสังคม`,
      `2. ดวงอาทิตย์ ดวงจันทร์ และลัคนา`,
      `– Sun (ตัวตน), Moon (อารมณ์), Rising (พฤติกรรมที่ผู้อื่นมองเห็น)`,
      `– วิเคราะห์การผสมผสานของทั้งสาม`,
      `3. จุดแข็งและความท้าทาย`,
      `– บทบาทดาวเด่นและแง่มุมต่าง ๆ (Aspects)`,
      `– ความสามารถ และปมท้าทายจากดาวที่สัมพันธ์กัน`,
      `4. การงานและการเงิน`,
      `– วิเคราะห์จากดาวใน House 2, 6, 10 + Mercury, Jupiter, Saturn`,
      `– อาชีพที่เหมาะสม, พฤติกรรมการใช้เงิน, แนวโน้มความมั่นคง`,
      `5. ความรักและความสัมพันธ์`,
      `– วิเคราะห์ House 5 และ 7 + Venus, Mars`,
      `– รูปแบบความสัมพันธ์ คู่ครอง ความเข้ากันทางอารมณ์และเพศ`,
      `6. สุขภาพและจิตใจ`,
      `– House 6, 12 + Moon, Neptune, Chiron`,
      `– จุดแข็งและจุดอ่อนไหวของสุขภาพและจิตใจ`,
      `7. เส้นทางชีวิตและบทเรียนทางวิญญาณ`,
      `– วิเคราะห์ North Node, Pluto, Uranus และ House 12`,
      `– เป้าหมายชีวิต / คาร์ม่า / ดวงชะตาทางจิตวิญญาณ`,
      `8. แนวโน้มชีวิตระยะยาว (0–80 ปี)`,
      `– วิเคราะห์วงรอบใหญ่ เช่น Saturn Return (29–30, 58–60), Uranus Opposition (42), Solar Return`,
      `– จุดเปลี่ยนสำคัญของชีวิต`,
      `9. วิเคราะห์เลขนำโชค (Numerology)`,
      `– คำนวณจากวันเกิด`,
      `– แนะนำเลขที่ดีสำหรับใช้ในชีวิตประจำวัน เช่น เบอร์โทร เลขทะเบียนบ้าน`,
      ``,
      `**ใช้ภาษาทันสมัย เข้าใจง่าย เหมือนผู้เชี่ยวชาญวิเคราะห์ให้ลูกค้าระดับ premium ที่ต้องการรู้จักตัวเองอย่างลึกซึ้ง**`,
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

  // --- helpers for follow-up merging ---
  function truncate(str: string, max = 1200) {
    if (!str) return "";
    return str.length > max ? str.slice(0, max) + "…" : str;
  }
  async function selectLatestBaselineFor(systemKey: "thai" | "western", uid: string) {
    const { data, error } = await supabase
      .from("readings")
      .select("id,payload,created_at")
      .eq("user_id", uid)
      .eq("mode", "natal")
      .filter("payload->>system", "eq", systemKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data || null;
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
  
    // fetch both baselines (thai & western) for this user
    const [thaiBase, westernBase] = await Promise.all([
      selectLatestBaselineFor("thai", targetUserId),
      selectLatestBaselineFor("western", targetUserId),
    ]);
  
    if (!thaiBase && !westernBase) {
      return NextResponse.json({ ok: false, error: "NEED_BASELINE" }, { status: 400 });
    }
  
    let prompt: string;
    if (thaiBase && westernBase) {
      const thaiSummary = truncate(thaiBase?.payload?.analysis ?? "");
      const westSummary = truncate(westernBase?.payload?.analysis ?? "");
      prompt = [
        `มีพื้นดวง 2 ระบบของ "${fullName || "-"}" คือ โหราศาสตร์ไทย และโหราศาสตร์ตะวันตก`,
        ``,
        `[สรุปย่อพื้นดวงไทย]`,
        thaiSummary || "(ไม่มีสรุป)",
        ``,
        `[สรุปย่อพื้นดวงตะวันตก]`,
        westSummary || "(ไม่มีสรุป)",
        ``,
        `คำถาม: "${question}"`,
        `โปรดวิเคราะห์โดย:`,
        `1) สรุปภาพรวมที่ทั้งสองระบบเห็นพ้อง`,
        `2) ชี้ประเด็นที่ต่างกันของทั้งสองระบบ (ถ้ามี)`,
        `3) ให้คำแนะนำสุดท้ายที่ผสานสองมุมมอง เพื่อการตัดสินใจ/ลงมือทำได้จริง`,
      ].join("\n");
    } else {
      const base = thaiBase || westernBase;
      const baseLabel = thaiBase ? "โหราศาสตร์ไทย" : "โหราศาสตร์ตะวันตก";
      const baseSummary = truncate(base?.payload?.analysis ?? "");
      prompt = [
        `อ้างอิงพื้นดวงแบบ ${baseLabel} ของ "${fullName || "-"}"`,
        baseSummary || "(ไม่มีสรุป)",
        ``,
        `คำถาม: "${question}"`,
        `โปรดวิเคราะห์อย่างเป็นขั้นตอน พร้อมข้อแนะนำปฏิบัติได้จริง`,
      ].join("\n");
    }
  
    const analysis = await runLLM(prompt);
    const payload = {
      kind: "question",
      system, // system ที่ user เลือก ณ ตอนถาม (เก็บไว้เป็นเมทาดาต้า)
      question,
      prompt,
      analysis,
      sources: {
        thai_id: thaiBase?.id ?? null,
        western_id: westernBase?.id ?? null,
      },
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
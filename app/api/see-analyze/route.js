import OpenAI from "openai";

export async function POST(req) {
  try {
    const body = await req.json();
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const method = body?.reading?.method || "Tarot";

    // สร้างคำสั่งระบบรวม (ให้ตอบ JSON เดียวกัน แต่บาง field จะเลือกใส่ตามศาสตร์)
    const system = `คุณชื่อ "ซี" นักพยากรณ์ ให้คำแนะนำเข้าใจง่าย ใช้ภาษาสุภาพและกระชับ
ตอบกลับเป็น JSON เท่านั้น โดยยึด schema:
{
  "summary": string,            // สรุปกว้าง ๆ 4–6 บรรทัด
  "advices": string[],          // คำแนะนำปฏิบัติได้ 3–6 ข้อ
  "per_card": [                 // เฉพาะไพ่ยิปซี
    { "name": string, "meaning": string }
  ],
  "astrology": {                // เฉพาะพื้นดวง
    "system": "thai" | "western",
    "natal_summary": string,
    "life_periods": [ { "from": number, "to": number, "theme": string, "notes": string } ],
    "lucky_numbers": string[],
    "avoid_numbers": string[],
    "phone_tip": { "should_include": string[], "should_avoid": string[] },
    "remedies": string[]
  },
  "palm": {                     // เฉพาะลายมือ
    "note": string
  },
  "sections": {                 // ใช้ได้ทุกศาสตร์สำหรับหัวข้อย่อยเพิ่มเติม
    "personality"?: string[],
    "career"?: string[],
    "finance"?: string[],
    "love"?: string[],
    "health"?: string[],
    "future"?: string[]
  }
}`;

    // user prompt ที่เปลี่ยนตาม method
    const baseInfo = `
ลูกดวง: ${body?.basic?.name || "-"}${body?.basic?.nickname ? ` (${body?.basic?.nickname})` : ""}
เกิด: ${body?.basic?.birthDate || "-"} ${body?.basic?.birthTime || ""} • ${body?.basic?.birthPlace || ""} • ${body?.basic?.timezone || ""}`.trim();

    let user = "";
    if(method==="Tarot"){
      const cardsText = (body?.reading?.result||[]).map((c,i)=>`${i+1}. ${c.name}${c.reversed?" (กลับหัว)":""}`).join("\n")||"-";
      const isWeigh = /ชั่งน้ำหนัก|weigh/i.test(body?.reading?.mode||"");
      user = `
${baseInfo}

หัวข้อ: ${body?.topic?.focus || "-"} • ${body?.topic?.details || "-"}
ศาสตร์: Tarot • รูปแบบ: ${body?.reading?.mode || "-"} • สำรับ: ${body?.reading?.deck || "-"}

ไพ่ที่เปิดได้:
${cardsText}

งานที่ต้องทำ:
1) "summary" 4–6 บรรทัด ตอบให้สอดคล้องกับคำถาม
2) "advices" 3–6 ข้อ เป็น bullet ปฏิบัติได้
3) "per_card" อธิบายความหมายรายใบ (1–2 ประโยค)
${isWeigh ? `4) ถ้าเป็นชั่งน้ำหนัก A vs B ให้สรุปข้อดี/เสี่ยงของแต่ละทางเลือกโดยรวมใน summary และ advices` : ""}
`.trim();
    } else if (method==="Astrology"){
      const sys = body?.reading?.system === "western" ? "western" : "thai";
      user = `
${baseInfo}

ศาสตร์: Astrology (${sys})
งานที่ต้องทำ:
- "summary" 4–6 บรรทัด สำหรับภาพรวมพื้นดวงและประเด็นสำคัญ
- "astrology": 
  * "system": "${sys}"
  * "natal_summary": สรุปพื้นดวง (ดาวเด่น/เรือนเด่น/องค์ประกอบ)
  * "life_periods": ไทม์ไลน์ช่วงชีวิตตั้งแต่อายุ 0–80 ปี (ช่วงละ 5–10 ปีได้), ใส่ "theme" และ "notes" ย่อ
  * "lucky_numbers" และ "avoid_numbers" (อย่างน้อย 3 หมายเลข)
  * "phone_tip": ตัวเลขควรมี/ควรเลี่ยงในเบอร์โทร
  * "remedies": วิธีเสริมดวงเฉพาะบุคคล
- "advices": ข้อแนะนำเชิงปฏิบัติ
`.trim();
    } else if (method==="Palmistry"){
      user = `
${baseInfo}

ศาสตร์: Palmistry (ดูลายมือซ้าย=พื้นดวง, ขวา=ทางที่สร้าง)
ภาพรวมการอ่าน (อย่าคาดเดาภาพ ใช้เป็นโครงวิเคราะห์): 
1) พื้นดวงและบุคลิกภาพ: เส้นชีวิต/สมอง/หัวใจ + รูปมือ/นิ้ว + ผิวมือ
2) การงานและความสามารถ: เส้นสมอง/โชคลาภ + จุด/เกาะ + ปลายนิ้ว/โคนนิ้ว
3) การเงินและทรัพย์สิน: เส้นโชค/เงิน + จุดตัด/ขาด + เนินดาวพฤหัส/เสาร์
4) ความรักและความสัมพันธ์: เส้นหัวใจ + เส้นแต่งงาน/ความสัมพันธ์ + จุด/รอยตัด
5) สุขภาพและพลังชีวิต: เส้นชีวิต + เส้นพิเศษ (สุขภาพ/ดวงจันทร์)
6) การเปลี่ยนแปลงและอนาคต: ซ้าย=กรรมเก่า, ขวา=กรรมปัจจุบัน, การเปลี่ยนแปลงเส้นเมื่อเวลาผ่านไป

งานที่ต้องทำ:
- "summary" สรุป 4–6 บรรทัด
- "advices" 3–6 ข้อ
- "sections": เติมหัวข้อย่อยตาม 1–6 โดยให้เป็น bullet ย่อย 2–4 ข้อต่อหัวข้อ
`.trim();
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      response_format: { type: "json_object" }
    });

    const text = completion.choices[0]?.message?.content ?? "{}";
    const data = JSON.parse(text);

    return new Response(JSON.stringify({ ok: true, result: data }), { status: 200 });
  } catch (err) {
    console.error("see-analyze error:", err);
    return new Response(JSON.stringify({ ok: false, error: "see-analyze failed" }), { status: 500 });
  }
}
// app/api/natal/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase server client for Route Handlers (Next.js 15).
 * ใช้รูปแบบ cookies adapter ใหม่ (get / set / remove) ให้ตรง type ของ Next 15
 */
async function getSupabaseServer() {
  const cookieStore = await cookies();
  const headerStore = headers();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // คืนค่าเป็น string (หรือ undefined) ให้ตรงกับที่ @supabase/ssr คาดหวัง
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        // set แบบ object form ของ Next 15
        set(name: string, value: string, options?: any) {
          cookieStore.set({ name, value, ...(options || {}) });
        },
        // หลีกเลี่ยง delete() เพราะชน type; ใช้ set + maxAge: 0 แทน
        remove(name: string, options?: any) {
          cookieStore.set({ name, value: "", ...(options || {}), maxAge: 0 });
        },
      },
      headers: {
        "x-forwarded-host": headerStore.get("x-forwarded-host") ?? "",
      },
    }
  );
}

// --- Fallback prompt texts (กรณียังไม่มีใน DB) ---
const FALLBACK_THAI = `
วิเคราะห์พื้นดวงตามหลักโหราศาสตร์ไทย โดยใช้ข้อมูลต่อไปนี้
– ชื่อ-นามสกุล: [ชื่อ-นามสกุล]
– วันเดือนปีเกิด: [วัน/เดือน/ปีเกิด]
– เวลาเกิด: [เวลาเกิด]
– สถานที่เกิด: [จังหวัด/ประเทศ]

ช่วยวิเคราะห์อย่างละเอียดตามหลักโหราศาสตร์ไทยในหัวข้อต่อไปนี้:
1) ลัคนาและข้อมูลพื้นฐาน
2) บุคลิกภาพและจุดแข็ง
3) การงานและการเงิน
4) ความรักและความสัมพันธ์
5) สุขภาพและจิตใจ
6) โชคชะตาโดยรวมในชีวิต
7) แนวโน้มระยะยาว/รอบชีวิต
8) พื้นดวงแบบช่วงชีวิต 0–80 ปี
9) วิเคราะห์เรื่องตัวเลข
**ใช้ภาษาที่เป็นกันเองแต่ให้ความลึกทางโหราศาสตร์ไทย**`.trim();

const FALLBACK_WESTERN = `
วิเคราะห์พื้นดวงตามหลักโหราศาสตร์ตะวันตก (Western Astrology) โดยใช้ข้อมูลต่อไปนี้:
– ชื่อ-นามสกุล: [ชื่อ-นามสกุล]
– วันเดือนปีเกิด: [วัน/เดือน/ปีเกิด]
– เวลาเกิด: [เวลาเกิด]
– สถานที่เกิด: [จังหวัด/ประเทศ]

ประเด็นที่ต้องวิเคราะห์:
1) Ascendant & บุคลิกภาพภายนอก
2) Sun / Moon / Rising
3) จุดแข็งและความท้าทาย (Aspects)
4) การงานและการเงิน (House 2/6/10 + Mercury/Jupiter/Saturn)
5) ความรักและความสัมพันธ์ (House 5/7 + Venus/Mars)
6) สุขภาพและจิตใจ (House 6/12 + Moon/Neptune/Chiron)
7) เส้นทางชีวิตและบทเรียนทางวิญญาณ (North Node/Pluto/Uranus/House 12)
8) แนวโน้มระยะยาว (0–80 ปี)
9) Numerology (เลขนำโชค)
**ใช้ภาษาทันสมัย เข้าใจง่าย แบบผู้เชี่ยวชาญระดับ premium**`.trim();

/** renderer รองรับทั้งวงเล็บเหลี่ยม และ moustache {{var}} */
function renderTemplate(tpl: string, vars: Record<string, string | undefined>) {
  let out = tpl;
  // square-bracket placeholders
  out = out.replace(/\[ชื่อ-นามสกุล\]/g, vars.full_name ?? "");
  out = out.replace(/\[วัน\/เดือน\/ปีเกิด\]/g, vars.dob ?? "");
  out = out.replace(/\[เวลาเกิด\]/g, vars.birth_time ?? "");
  out = out.replace(/\[จังหวัด\/ประเทศ\]/g, vars.birth_place ?? "");
  // moustache placeholders
  out = out.replace(/\{\{\s*full_name\s*\}\}/g, vars.full_name ?? "");
  out = out.replace(/\{\{\s*dob\s*\}\}/g, vars.dob ?? "");
  out = out.replace(/\{\{\s*birth_time\s*\}\}/g, vars.birth_time ?? "");
  out = out.replace(/\{\{\s*birth_place\s*\}\}/g, vars.birth_place ?? "");
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServer();

    // Require login
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const body = await req.json();
    const system: "thai" | "western" = body?.system === "western" ? "western" : "thai";
    const full_name = body?.full_name ?? body?.fullName ?? "";
    const dob = body?.dob ?? "";
    const birth_time = body?.birth_time ?? body?.birthTime ?? "";
    const birth_place = body?.birth_place ?? body?.birthPlace ?? "";

    // ดึง prompt ล่าสุดจากตาราง prompts (system='natal', subtype='thai'|'western')
    const { data: row, error: dbErr } = await supabase
      .from("prompts")
      .select("id, content, updated_at")
      .eq("system", "natal")
      .eq("subtype", system)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dbErr) console.error("DB error:", dbErr);

    const basePrompt = row?.content ?? (system === "thai" ? FALLBACK_THAI : FALLBACK_WESTERN);
    const rendered = renderTemplate(basePrompt, { full_name, dob, birth_time, birth_place });

    // ส่งออก prompt ที่ render แล้ว (ฝั่ง client หรือ service อื่นค่อยยิง LLM)
    return NextResponse.json({
      ok: true,
      reading: {
        system: "natal",
        subtype: system,
        prompt_id: row?.id ?? null,
        prompt: basePrompt,
        rendered_prompt: rendered,
      },
    });
  } catch (err: any) {
    console.error("natal route error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "internal_error" }, { status: 500 });
  }
}
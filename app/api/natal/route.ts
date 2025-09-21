// app/api/natal/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Create a Supabase server client that works in Route Handlers (Next.js 15).
 * IMPORTANT: Use the new cookies.getAll / cookies.setAll adapter shape to avoid
 * build-time type errors with @supabase/ssr.
 */
function getSupabaseServer() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set({ name, value, ...options });
          });
        },
      },
    }
  );
}

// --- Fallback prompt texts in case the DB has no prompt rows yet ---
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

/** Simple template renderer for both square-bracket and moustache styles */
function renderTemplate(tpl: string, vars: Record<string, string | undefined>) {
  let out = tpl;
  // square brackets (Thai copy)
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
    const supabase = getSupabaseServer();

    // Require login (same behavior as other secure API routes)
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const system: "thai" | "western" =
      body?.system === "western" ? "western" : "thai";
    const full_name = body?.full_name ?? body?.fullName ?? "";
    const dob = body?.dob ?? "";
    const birth_time = body?.birth_time ?? body?.birthTime ?? "";
    const birth_place = body?.birth_place ?? body?.birthPlace ?? "";

    // Pull latest prompt from DB (system='natal', subtype='thai'|'western')
    const { data: row, error: dbErr } = await supabase
      .from("prompts")
      .select("id, content, updated_at")
      .eq("system", "natal")
      .eq("subtype", system)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dbErr) {
      console.error("DB error:", dbErr);
    }

    const basePrompt =
      row?.content ?? (system === "thai" ? FALLBACK_THAI : FALLBACK_WESTERN);

    const rendered = renderTemplate(basePrompt, {
      full_name,
      dob,
      birth_time,
      birth_place,
    });

    // Return the rendered prompt. (The actual LLM call can be done client-side or another service.)
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
    return NextResponse.json(
      { ok: false, error: err?.message || "internal_error" },
      { status: 500 }
    );
  }
}
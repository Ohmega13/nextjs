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
      cookieOptions: {
        sameSite: "lax",
        secure: true,
      },
    }
  );
}

// --- Fallback prompt texts (กรณียังไม่มีใน DB) ---
const FALLBACK_THAI = `...`.trim();
const FALLBACK_WESTERN = `...`.trim();

/** renderer รองรับทั้งวงเล็บเหลี่ยม และ moustache {{var}} */
function renderTemplate(tpl: string, vars: Record<string, string | undefined>) {
  let out = tpl;
  out = out.replace(/\[ชื่อ-นามสกุล\]/g, vars.full_name ?? "");
  out = out.replace(/\[วัน\/เดือน\/ปีเกิด\]/g, vars.dob ?? "");
  out = out.replace(/\[เวลาเกิด\]/g, vars.birth_time ?? "");
  out = out.replace(/\[จังหวัด\/ประเทศ\]/g, vars.birth_place ?? "");
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

    // Deduct credits by calling RPC sp_use_credit
    const { data: creditData, error: creditError } = await supabase.rpc('sp_use_credit', {
      p_user: user.id,
      p_feature: 'natal_reading',
      p_cost: 10,
      p_reading: null,
    });

    if (creditError || creditData == null) {
      return NextResponse.json({ ok: false, error: "เครดิตไม่พอ กรุณาเติมเครดิต" }, { status: 402 });
    }

    const body = await req.json();
    const system: "thai" | "western" = body?.system === "western" ? "western" : "thai";
    const full_name = body?.full_name ?? body?.fullName ?? "";
    const dob = body?.dob ?? "";
    const birth_time = body?.birth_time ?? body?.birthTime ?? "";
    const birth_place = body?.birth_place ?? body?.birthPlace ?? "";

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
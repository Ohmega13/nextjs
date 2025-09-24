// app/api/admin/prompts/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

/**
 * Supabase client for Next.js 15 Route Handlers
 * - ต้อง await cookies()/headers()
 * - adapter ของ cookies ต้องเป็นแบบ object form ของ Next 15
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
          // ใช้ set + maxAge:0 แทน delete เพื่อไม่ชน type
          cookieStore.set({ name, value: "", ...(options || {}), maxAge: 0 });
        },
      },
      headers: {
        // เผื่อ Vercel/Proxy ต้องอ้าง host เดิม
        "x-forwarded-host": headerStore.get("x-forwarded-host") ?? "",
      },
    }
  );
}

// ให้แน่ใจว่า route นี้ไม่โดน cache
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function assertAdmin() {
  const supabase = await getSupabaseServer();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return { ok: false as const, res: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return { ok: false as const, res: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  }

  return { ok: true as const, supabase };
}

// GET /api/admin/prompts?system=tarot|natal|palm
export async function GET(req: Request) {
  try {
    const admin = await assertAdmin();
    if (!admin.ok) return admin.res;

    const url = new URL(req.url);
    const system = url.searchParams.get("system") || undefined;

    const query = admin.supabase!.from("prompts").select("*").order("updated_at", { ascending: false });
    if (system) query.eq("system", system);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "fetch failed" }, { status: 500 });
  }
}

// POST /api/admin/prompts
export async function POST(req: Request) {
  try {
    const admin = await assertAdmin();
    if (!admin.ok) return admin.res;

    const body = await req.json().catch(() => ({}));
    const { key, title, system, subtype = null, content } = body ?? {};

    const { error } = await admin.supabase!
      .from("prompts")
      .insert({ key, title, system, subtype, content });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "create failed" }, { status: 500 });
  }
}
// app/api/admin/prompts/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getSupabaseServer() {
  // Next.js 15: cookies(), headers() เป็น async
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
          cookieStore.set({ name, value, ...(options ?? {}) });
        },
        remove(name: string, options?: any) {
          // ใช้ set + maxAge:0 แทน delete() ให้ตรง type และปลอดภัยบน Next 15
          cookieStore.set({ name, value: "", ...(options ?? {}), maxAge: 0 });
        },
      },
      headers: {
        "x-forwarded-host": headerStore.get("x-forwarded-host") ?? "",
        "x-forwarded-proto": headerStore.get("x-forwarded-proto") ?? "",
      },
    }
  );
}

async function assertAdmin(supabase: Awaited<ReturnType<typeof getSupabaseServer>>) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false as const,
      res: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  // ถ้าในตาราง profiles ยังไม่มีแถวของผู้ใช้ ให้ลองเช็คผ่านฟังก์ชัน is_admin(uid) ที่ฝั่ง DB
  if (profile?.role !== "admin") {
    try {
      const { data: isAdminRpc } = await supabase.rpc("is_admin", { uid: user.id as string });
      if (!isAdminRpc) {
        return {
          ok: false as const,
          res: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
        };
      }
    } catch {
      return {
        ok: false as const,
        res: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
      };
    }
  }

  return { ok: true as const };
}

// GET /api/admin/prompts
export async function GET(req: Request) {
  try {
    const supabase = await getSupabaseServer();
    const admin = await assertAdmin(supabase);
    if (!admin.ok) return admin.res;

    const { searchParams } = new URL(req.url);
    const system = searchParams.get("system");

    let query = supabase.from("prompts").select("*");
    if (system) query = query.eq("system", system);

    const { data, error } = await query.order("updated_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({ ok: true, items: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "fetch failed" }, { status: 500 });
  }
}

// POST /api/admin/prompts
export async function POST(req: Request) {
  try {
    const supabase = await getSupabaseServer();
    const admin = await assertAdmin(supabase);
    if (!admin.ok) return admin.res;

    const body = await req.json();
    const { key, title, system, subtype = null, content } = body ?? {};

    const insert = { key, title, system, subtype, content };
    const { data, error } = await supabase
      .from("prompts")
      .insert(insert)
      .select("id, updated_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, id: data.id, updated_at: data.updated_at });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "create failed" }, { status: 500 });
  }
}
// app/api/admin/prompts/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

function getSupabaseServer() {
  const cookieStore = cookies();
  const headerStore = headers();

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
        remove(name: string) {
          cookieStore.delete(name);
        },
      },
      headers: {
        "x-forwarded-host": headerStore.get("x-forwarded-host") ?? "",
      },
    }
  );
}

async function assertAdmin(supabase: ReturnType<typeof getSupabaseServer>) {
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

  if (profile?.role !== "admin") {
    return {
      ok: false as const,
      res: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const };
}

// GET /api/admin/prompts
export async function GET(_req: Request) {
  try {
    const supabase = getSupabaseServer();
    const admin = await assertAdmin(supabase);
    if (!admin.ok) return admin.res;

    const { data, error } = await supabase.from("prompts").select("*");

    if (error) throw error;

    return NextResponse.json({ ok: true, items: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "fetch failed" }, { status: 500 });
  }
}

// POST /api/admin/prompts
export async function POST(req: Request) {
  try {
    const supabase = getSupabaseServer();
    const admin = await assertAdmin(supabase);
    if (!admin.ok) return admin.res;

    const body = await req.json();
    const { key, title, system, subtype = null, content } = body ?? {};

    const insert = { key, title, system, subtype, content };

    const { error } = await supabase.from("prompts").insert(insert);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "create failed" }, { status: 500 });
  }
}
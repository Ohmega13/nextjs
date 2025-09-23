// app/api/admin/prompts/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

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
        remove(name: string) {
          cookieStore.delete(name);
        },
      },
      headers: { "x-forwarded-host": headerStore.get("x-forwarded-host") ?? "" },
    }
  );
}

// GET /api/admin/prompts?system=tarot|natal|palm
export async function GET(req: Request) {
  try {
    const supabase = await getSupabaseServer();

    // auth & role
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile?.role !== "admin") {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const system = url.searchParams.get("system") as "tarot" | "natal" | "palm" | null;

    let query = supabase.from("prompts").select("*").order("updated_at", { ascending: false });
    if (system) query = query.eq("system", system);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "fetch failed" },
      { status: 500 }
    );
  }
}

// POST /api/admin/prompts
export async function POST(req: Request) {
  try {
    const supabase = await getSupabaseServer();
    const body = await req.json();

    // auth & role
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile?.role !== "admin") {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const { key, title, system, subtype = null, content } = body || {};
    if (!key || !title || !system || !content) {
      return NextResponse.json(
        { ok: false, error: "missing fields: key, title, system, content" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("prompts")
      .insert([{ key, title, system, subtype, content }]);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "create failed" },
      { status: 500 }
    );
  }
}
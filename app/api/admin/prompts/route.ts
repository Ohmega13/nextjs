// app/api/admin/prompts/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
          cookieStore.set({ name, value, ...(options ?? {}) });
        },
        remove(name: string, options?: any) {
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

// GET /api/admin/prompts?system=tarot|natal|palm (optional)
export async function GET(req: Request) {
  try {
    const supabase = await getSupabaseServer();

    const { searchParams } = new URL(req.url);
    const system = searchParams.get("system");

    let query = supabase.from("prompts").select("*");
    if (system) query = query.eq("system", system);

    const { data, error, status } = await query.order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: status || 500 }
      );
    }

    return NextResponse.json({ ok: true, items: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "fetch failed" }, { status: 500 });
  }
}

// POST /api/admin/prompts
export async function POST(req: Request) {
  try {
    const supabase = await getSupabaseServer();

    const body = await req.json();
    const { key, title, system, subtype = null, content } = body ?? {};

    const { data, error, status } = await supabase
      .from("prompts")
      .insert({ key, title, system, subtype, content })
      .select("id, updated_at")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: status || 500 }
      );
    }

    return NextResponse.json(
      { ok: true, id: data.id, updated_at: data.updated_at },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "create failed" }, { status: 500 });
  }
}
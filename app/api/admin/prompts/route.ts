import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---------- Supabase client (cookies/headers are synchronous in Next 15) ----------
async function getSupabase() {
  const cookieStore = cookies(); // Next 15: synchronous
  const h = headers();

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
      headers: { "x-forwarded-host": h.get("x-forwarded-host") ?? "" },
    }
  );
}

// ---------- Guard: must be logged-in admin ----------
async function assertAdmin() {
  const supabase = await getSupabase();
  const {
    data: { user },
    error: uerr,
  } = await supabase.auth.getUser();
  if (uerr) throw new Response(uerr.message, { status: 400 });
  if (!user) throw new Response("UNAUTHENTICATED", { status: 401 });

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Response(error.message, { status: 400 });
  if (profile?.role !== "admin") throw new Response("FORBIDDEN", { status: 403 });

  return { supabase, user };
}

// ---------- GET /api/admin/prompts  (list; ?system=tarot|natal|palm) ----------
export async function GET(req: NextRequest) {
  try {
    const guard = await assertAdmin();
    const { supabase } = guard;

    const { searchParams } = new URL(req.url);
    const system = searchParams.get("system");

    let q = supabase.from("prompts").select("*").order("updated_at", { ascending: false });
    if (system) q = q.eq("system", system);

    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, items: data });
  } catch (e: any) {
    if (e instanceof Response) return e;
    console.error("[admin/prompts GET]", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "ERR_GET" }, { status: 500 });
  }
}

// ---------- POST /api/admin/prompts  (create) ----------
export async function POST(req: NextRequest) {
  try {
    const guard = await assertAdmin();
    const { supabase, user } = guard;

    const body = await req.json().catch(() => ({}));
    const { key, title, system, subtype, content } = body as {
      key?: string;
      title?: string;
      system?: "tarot" | "natal" | "palm";
      subtype?: string | null;
      content?: string;
    };

    if (!key || !title || !system || !content) {
      return NextResponse.json(
        { ok: false, error: "missing fields: key,title,system,content" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("prompts")
      .insert({
        key,
        title,
        system,
        subtype: subtype ?? null,
        content,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, item: data });
  } catch (e: any) {
    if (e instanceof Response) return e;
    console.error("[admin/prompts POST]", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "ERR_POST" }, { status: 500 });
  }
}
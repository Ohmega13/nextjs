import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// ---------- Supabase client (await cookies + get/set/remove) ----------
async function getSupabase() {
  const cookieStore = await cookies(); // ensure concrete cookie store (not a Promise type)
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

  return supabase;
}

// ---------- GET /api/admin/prompts ----------
export async function GET() {
  try {
    const supabase = await assertAdmin();

    const { data, error } = await supabase.from("prompts").select("*");
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, items: data });
  } catch (e: any) {
    if (e instanceof Response) return e;
    console.error("[admin/prompts GET]", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "ERR_GET" }, { status: 500 });
  }
}

// ---------- POST /api/admin/prompts ----------
export async function POST(req: Request) {
  try {
    const supabase = await assertAdmin();
    const body = await req.json();

    const { data, error } = await supabase
      .from("prompts")
      .insert({
        content: String(body.content || ""),
        subtype: body.subtype ?? null,
        system: body.system ?? null,
      })
      .select("*")
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, item: data });
  } catch (e: any) {
    if (e instanceof Response) return e;
    console.error("[admin/prompts POST]", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "ERR_POST" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
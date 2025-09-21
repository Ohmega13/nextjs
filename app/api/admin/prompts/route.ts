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

// ---------- GET /api/admin/prompts/[id] ----------
export async function GET(
  _req: Request,
  ctx: { params: { id: string } }
) {
  try {
    const supabase = await assertAdmin();
    const { id } = ctx.params;

    const { data, error } = await supabase
      .from("prompts")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, item: data });
  } catch (e: any) {
    if (e instanceof Response) return e;
    console.error("[admin/prompts/:id GET]", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "ERR_GET" }, { status: 500 });
  }
}

// ---------- PUT /api/admin/prompts/[id] ----------
export async function PUT(
  req: Request,
  ctx: { params: { id: string } }
) {
  try {
    const supabase = await assertAdmin();
    const { id } = ctx.params;
    const body = await req.json();

    // Whitelist fields to update
    const update: Record<string, any> = {};
    if (body.key !== undefined) update.key = String(body.key);
    if (body.title !== undefined) update.title = String(body.title);
    if (body.system !== undefined) update.system = body.system; // "tarot" | "natal" | "palm"
    if (body.subtype !== undefined) update.subtype = body.subtype ?? null;
    if (body.content !== undefined) update.content = String(body.content);

    const { data, error } = await supabase
      .from("prompts")
      .update(update)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, item: data });
  } catch (e: any) {
    if (e instanceof Response) return e;
    console.error("[admin/prompts/:id PUT]", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "ERR_PUT" }, { status: 500 });
  }
}

// ---------- DELETE /api/admin/prompts/[id] ----------
export async function DELETE(
  _req: Request,
  ctx: { params: { id: string } }
) {
  try {
    const supabase = await assertAdmin();
    const { id } = ctx.params;

    const { error } = await supabase.from("prompts").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    console.error("[admin/prompts/:id DELETE]", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "ERR_DELETE" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
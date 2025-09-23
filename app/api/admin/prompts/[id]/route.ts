import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

// Build a Supabase server client using Next 15 cookie/header adapters
async function getSupabase() {
  const cookieStore = await cookies(); // Next 15 returns a Promise
  const h = await headers();

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
        "x-forwarded-host": h.get("x-forwarded-host") ?? "",
      },
    }
  );
}

async function requireAdmin() {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, isAdmin: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  return { supabase, isAdmin: profile?.role === "admin" };
}

// PUT /api/admin/prompts/[id]
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // Next 15: params is a Promise
) {
  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await ctx.params; // await the params
  const body = await req.json();

  // Whitelist fields to update
  const allowed: any = {};
  if (typeof body.key === "string") allowed.key = body.key;
  if (typeof body.title === "string") allowed.title = body.title;
  if (typeof body.system === "string") allowed.system = body.system; // "tarot" | "natal" | "palm"
  if (typeof body.subtype === "string" || body.subtype === null) allowed.subtype = body.subtype;
  if (typeof body.content === "string") allowed.content = body.content;

  const { data, error } = await supabase
    .from("prompts")
    .update({ ...allowed, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, item: data });
}

// DELETE /api/admin/prompts/[id]
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // Next 15: params is a Promise
) {
  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await ctx.params; // await the params

  const { error } = await supabase.from("prompts").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
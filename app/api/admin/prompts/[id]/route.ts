import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

// สร้าง Supabase client ที่รองรับ Next 15 (cookies() เป็น async)
async function getSupabase() {
  const c = await cookies();
  const h = headers();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return c.get(name)?.value;
        },
        set(name: string, value: string, opts?: any) {
          c.set({ name, value, ...opts });
        },
        remove(name: string, opts?: any) {
          c.set({ name, value: "", ...opts, maxAge: 0 });
        },
      },
      headers: { "x-forwarded-host": h.get("x-forwarded-host") ?? "" },
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

// ✅ NOTE: context ต้องเป็น Promise ของ params ใน Next 15
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json();
  const { key, title, system, subtype, content } = body as {
    key: string; title: string; system: "tarot" | "natal" | "palm";
    subtype: string | null; content: string;
  };

  const { error } = await supabase
    .from("prompts")
    .update({ key, title, system, subtype, content })
    .eq("id", id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  const { error } = await supabase.from("prompts").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
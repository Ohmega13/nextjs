import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

// --- Supabase client (รองรับ Next 15: cookies/headers เป็น async) ---
async function getSupabase() {
  const cookieStore = await cookies();
  const hdrs = await headers(); // ✅ ต้อง await

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, opts?: any) {
          cookieStore.set({ name, value, ...opts });
        },
        remove(name: string, opts?: any) {
          cookieStore.set({ name, value: "", ...opts, maxAge: 0 });
        },
      },
      // ไม่ใส่ก็ได้ แต่ถ้าจะส่งต่อ header ก็ต้อง await แล้วค่อย get
      headers: { "x-forwarded-host": hdrs.get("x-forwarded-host") ?? "" },
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

// ✅ Next 15: context.params เป็น Promise ต้อง await
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json();
  const { key, title, system, subtype, content } = body as {
    key: string;
    title: string;
    system: "tarot" | "natal" | "palm";
    subtype: string | null;
    content: string;
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
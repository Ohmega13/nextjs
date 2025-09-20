import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// --- Supabase client (รองรับ Next 15: cookies เป็น async) ---
async function getSupabase() {
  const cookieStore = await cookies();

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

async function getIdFromCtx(ctx: any): Promise<string> {
  const p = ctx?.params;
  const resolved = p && typeof p.then === "function" ? await p : p;
  return resolved?.id as string;
}

export async function PUT(req: NextRequest, ctx: any) {
  const id = await getIdFromCtx(ctx);

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

export async function DELETE(_req: NextRequest, ctx: any) {
  const id = await getIdFromCtx(ctx);

  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  const { error } = await supabase.from("prompts").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
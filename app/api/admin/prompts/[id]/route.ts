import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// --- Supabase client (Next 15 cookie adapter: getAll/setAll) ---
function getSupabase() {
  const cookieStore = cookies(); // do not await

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
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
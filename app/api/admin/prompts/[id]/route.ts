import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Build a Supabase server client using Next 15 cookie adapter (getAll/setAll)
function getSupabase() {
  const cookieStore = cookies(); // NOTE: DO NOT await
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

async function requireAdmin() {
  const supabase = getSupabase();
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
  { params }: { params: { id: string } }
) {
  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const id = params.id;
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

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/prompts/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const id = params.id;
  const { error } = await supabase.from("prompts").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
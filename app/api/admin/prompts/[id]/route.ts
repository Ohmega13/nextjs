// app/api/admin/prompts/[id]/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

// Next.js 15: cookies() / headers() are async in route handlers.
// So we await them here and wire into Supabase SSR client.
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
          // Next 15 supports object form for set
          cookieStore.set({ name, value, ...(options || {}) });
        },
        remove(name: string) {
          // delete() signature only takes the cookie name
          cookieStore.delete(name);
        },
      },
      headers: {
        // Pass through forwarded host if present (use empty string otherwise)
        "x-forwarded-host": headerStore.get("x-forwarded-host") ?? "",
      },
    }
  );
}

// PUT /api/admin/prompts/[id]
export async function PUT(req: Request, context: { params: { id: string } }) {
  const supabase = await getSupabaseServer();

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    return NextResponse.json({ ok: false, error: authErr.message }, { status: 401 });
  }
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const id = context?.params?.id as string;
  const body = await req.json();

  const { data, error } = await supabase
    .from("prompts")
    .update({
      key: body.key,
      title: body.title,
      system: body.system,
      subtype: body.subtype ?? null,
      content: body.content,
    })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, item: data });
}

// DELETE /api/admin/prompts/[id]
export async function DELETE(_req: Request, context: { params: { id: string } }) {
  const supabase = await getSupabaseServer();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const id = context?.params?.id as string;
  const { error } = await supabase.from("prompts").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
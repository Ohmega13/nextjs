import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";

async function getSupabase() {
  const cookieStore = cookies();
  const hdrs = headers();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set(name, value, opts) { cookieStore.set({ name, value, ...opts }); },
        remove(name, opts) { cookieStore.set({ name, value: "", ...opts, maxAge: 0 }); },
      },
      headers: { "x-forwarded-host": hdrs.get("x-forwarded-host") ?? "" },
    }
  );
}

async function assertAdmin(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 as const, error: "UNAUTHENTICATED" };
  const { data } = await supabase.rpc("is_admin", { uid: user.id });
  if (!data) return { ok: false as const, status: 403 as const, error: "FORBIDDEN" };
  return { ok: true as const, user };
}

export async function PUT(req: NextRequest, context: { params: { id: string } }) {
  const supabase = await getSupabase();

  const guard = await assertAdmin(supabase);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });

  const { id } = context.params;
  const body = await req.json();

  const { data, error } = await supabase
    .from("prompts")
    .update({
      key: body.key,
      title: body.title,
      system: body.system,
      subtype: body.subtype ?? null,
      content: body.content,
      updated_by: guard.user.id,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(_req: NextRequest, context: { params: { id: string } }) {
  const supabase = await getSupabase();

  const guard = await assertAdmin(supabase);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });

  const { id } = context.params;

  const { error } = await supabase.from("prompts").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
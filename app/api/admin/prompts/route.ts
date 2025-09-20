import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

async function getSupabase() {
  const c = cookies();
  const h = headers();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => c.get(n)?.value,
        set(n, v, o) { c.set({ name: n, value: v, ...o }); },
        remove(n, o) { c.set({ name: n, value: "", ...o, maxAge: 0 }); },
      },
      headers: { "x-forwarded-host": h.get("x-forwarded-host") ?? "" },
    }
  );
}

export async function PUT(req: Request, context: { params: any }) {
  const { id } = context.params;

  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json();

  const { data, error } = await supabase
    .from("prompts")
    .update({
      key: body.key,
      title: body.title,
      system: body.system,
      subtype: body.subtype,
      content: body.content,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(req: Request, context: { params: any }) {
  const { id } = context.params;

  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { error } = await supabase.from("prompts").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
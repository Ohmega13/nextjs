import { NextRequest, NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";

async function getClients() {
  const cookieStore = await cookies();
  const hdrs = await headers();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set(name, value, opts) {
          cookieStore.set({ name, value, ...opts });
        },
        remove(name, opts) {
          cookieStore.set({ name, value: "", ...opts, maxAge: 0 });
        },
      },
      headers: { "x-forwarded-host": hdrs.get("x-forwarded-host") ?? "" },
    }
  );
  return supabase;
}

async function assertAdmin(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.rpc("is_admin", { uid: user.id });
  return !!data;
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await getClients();
  if (!(await assertAdmin(supabase))) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }
  const body = await req.json();
  const { data, error } = await supabase
    .from("prompts")
    .update({
      key: body.key,
      title: body.title,
      system: body.system,
      subtype: body.subtype ?? null,
      content: body.content,
      updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    })
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await getClients();
  if (!(await assertAdmin(supabase))) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }
  const { error } = await supabase.from("prompts").delete().eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
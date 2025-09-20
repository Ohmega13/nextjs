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

export async function GET(req: NextRequest) {
  const supabase = await getClients();
  const search = new URL(req.url).searchParams;
  const system = search.get("system") ?? undefined;

  const { data, error } = await supabase
    .from("prompts")
    .select("*")
    .order("updated_at", { ascending: false })
    .maybeSingle();

  // ถ้ามี filter system ให้ดึงทั้งหมดไม่ใช้ maybeSingle
  const query = supabase.from("prompts").select("*").order("updated_at", { ascending: false });
  const q2 = system ? query.eq("system", system) : query;
  const { data: list, error: err2 } = await q2;

  if (err2) return NextResponse.json({ ok: false, error: err2.message }, { status: 400 });
  return NextResponse.json({ ok: true, items: list });
}

export async function POST(req: NextRequest) {
  const supabase = await getClients();
  if (!(await assertAdmin(supabase))) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }
  const body = await req.json();
  const row = {
    key: body.key,
    title: body.title,
    system: body.system,
    subtype: body.subtype ?? null,
    content: body.content,
    updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
  };

  const { data, error } = await supabase
    .from("prompts")
    .insert(row)
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, item: data });
}
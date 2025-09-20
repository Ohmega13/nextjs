// app/api/admin/prompts/route.ts
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
}

async function assertAdmin(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "UNAUTHENTICATED" };
  const { data } = await supabase.rpc("is_admin", { uid: user.id });
  if (!data) return { ok: false as const, status: 403, error: "FORBIDDEN" };
  return { ok: true as const, user };
}

export async function GET(req: Request) {
  const supabase = await getSupabase();
  const guard = await assertAdmin(supabase);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const { searchParams } = new URL(req.url);
  const system = searchParams.get("system");

  let query = supabase.from("prompts").select("*").order("updated_at", { ascending: false });
  if (system) query = query.eq("system", system);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, items: data });
}

export async function POST(req: Request) {
  const supabase = await getSupabase();
  const guard = await assertAdmin(supabase);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const body = await req.json();

  const { data, error } = await supabase
    .from("prompts")
    .insert({
      key: body.key,
      title: body.title,
      system: body.system,
      subtype: body.subtype ?? null,
      content: body.content,
      updated_by: guard.user.id,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, item: data });
}
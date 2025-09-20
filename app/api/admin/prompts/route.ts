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

async function assertUser(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 as const, error: "UNAUTHENTICATED" };
  return { ok: true as const, user };
}

async function assertAdmin(supabase: any) {
  const u = await assertUser(supabase);
  if (!u.ok) return u;
  const { data } = await supabase.rpc("is_admin", { uid: u.user.id });
  if (!data) return { ok: false as const, status: 403 as const, error: "FORBIDDEN" };
  return { ok: true as const, user: u.user };
}

/** GET /api/admin/prompts?system=tarot|natal|palm */
export async function GET(req: NextRequest) {
  const supabase = await getSupabase();

  // ต้องล็อกอินก่อน (ให้สอดคล้องกับ RLS: select for authenticated)
  const guard = await assertUser(supabase);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const { searchParams } = new URL(req.url);
  const system = searchParams.get("system") as "tarot" | "natal" | "palm" | null;

  let q = supabase.from("prompts").select("*").order("updated_at", { ascending: false });
  if (system) q = q.eq("system", system);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, items: data ?? [] });
}

/** POST /api/admin/prompts  (admin only) */
export async function POST(req: NextRequest) {
  const supabase = await getSupabase();

  // ต้องเป็นแอดมิน
  const guard = await assertAdmin(supabase);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const body = await req.json();
  const { key, title, system, subtype, content } = body ?? {};

  if (!key || !title || !system || !content) {
    return NextResponse.json(
      { ok: false, error: "MISSING_FIELDS" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("prompts")
    .insert({
      key,
      title,
      system,
      subtype: subtype ?? null,
      content,
      updated_by: guard.user.id,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, item: data });
}
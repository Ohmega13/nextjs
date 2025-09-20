import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
        set(name: string, value: string, options?: any) {
          cookieStore.set({ name, value, ...(options || {}) });
        },
        remove(name: string, options?: any) {
          cookieStore.set({ name, value: "", ...(options || {}), maxAge: 0 });
        },
      },
    }
  );
}

async function assertAdmin() {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Response("UNAUTHENTICATED", { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    throw new Response("FORBIDDEN", { status: 403 });
  }
  return supabase;
}

// GET /api/admin/prompts?system=tarot|natal|palm
export async function GET(req: NextRequest) {
  try {
    const supabase = await assertAdmin();
    const { searchParams } = new URL(req.url);
    const system = searchParams.get("system") as "tarot" | "natal" | "palm" | null;

    let q = supabase.from("prompts").select("*").order("updated_at", { ascending: false });
    if (system) q = q.eq("system", system);

    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, items: data });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return NextResponse.json({ ok: false, error: e?.message ?? "ERR_GET" }, { status: 500 });
  }
}

// POST create
export async function POST(req: NextRequest) {
  try {
    const supabase = await assertAdmin();
    const body = await req.json();

    const { data, error } = await supabase
      .from("prompts")
      .insert({
        key: body.key,
        title: body.title,
        system: body.system,                  // "tarot" | "natal" | "palm"
        subtype: body.subtype ?? null,        // e.g. "threeCards" | "weighOptions" | "classic10" | "thai" | "western"
        content: body.content,
      })
      .select("*")
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, item: data });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return NextResponse.json({ ok: false, error: e?.message ?? "ERR_POST" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
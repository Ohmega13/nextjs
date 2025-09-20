import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Next 15: cookies() เป็น async
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
          // ใน Route Handler มีสิทธิ์ set cookie ได้
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

// UPDATE one
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await assertAdmin();
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
      .eq("id", params.id)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, item: data });
  } catch (e: any) {
    if (e instanceof Response) return e; // ส่ง status จาก assertAdmin
    return NextResponse.json({ ok: false, error: e?.message ?? "ERR_PUT" }, { status: 500 });
  }
}

// DELETE one
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await assertAdmin();

    const { error } = await supabase
      .from("prompts")
      .delete()
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return NextResponse.json({ ok: false, error: e?.message ?? "ERR_DELETE" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
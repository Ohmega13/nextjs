import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Create a Supabase server client using Next 15 cookie adapter.
 * NOTE: cookies() in Next 15 is synchronous (do NOT await).
 */
function getSupabase() {
  const cookieStore = cookies(); // no await in Next 15
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

/** Guard: must be logged-in admin */
async function assertAdmin() {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Response("UNAUTHENTICATED", { status: 401 });

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new Response(error.message, { status: 400 });
  if (profile?.role !== "admin") throw new Response("FORBIDDEN", { status: 403 });
  return supabase;
}

type Row = {
  id: string;
  system: "tarot" | "natal" | "palm";
  subtype: string | null;
  content: string;
  updated_at: string;
  // table does NOT have key/title, so we synthesize them for the UI
};

function synthesizeKey(r: Pick<Row, "system" | "subtype">) {
  return `${r.system}_${r.subtype || "default"}`;
}
function synthesizeTitle(r: Pick<Row, "system" | "subtype">) {
  const map: Record<string, string> = {
    tarot_threeCards: "ไพ่ยิปซี: ถามเรื่องเดียว 3 ใบ",
    tarot_weighOptions: "ไพ่ยิปซี: เปรียบเทียบ/ชั่งน้ำหนัก",
    tarot_classic10: "ไพ่ยิปซี: แบบคลาสสิก 10 ใบ",
    natal_thai: "พื้นดวง: โหราศาสตร์ไทย",
    natal_western: "พื้นดวง: โหราศาสตร์ตะวันตก",
    palm_default: "ดูลายมือ",
  };
  return map[synthesizeKey(r)] || `${r.system}${r.subtype ? ` / ${r.subtype}` : ""}`;
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

    // Synthesize key/title for frontend compatibility
    const items = (data || []).map((r: Row) => ({
      ...r,
      key: synthesizeKey(r),
      title: synthesizeTitle(r),
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return NextResponse.json({ ok: false, error: e?.message ?? "ERR_GET" }, { status: 500 });
  }
}

// POST create (table has no key/title columns; accept and ignore them)
export async function POST(req: NextRequest) {
  try {
    const supabase = await assertAdmin();
    const body = await req.json();

    const payload = {
      system: body.system as Row["system"],            // "tarot" | "natal" | "palm"
      subtype: (body.subtype ?? null) as string | null, // e.g. "threeCards" | "weighOptions" | "classic10" | "thai" | "western"
      content: String(body.content || ""),
    };

    const { data, error } = await supabase
      .from("prompts")
      .insert(payload)
      .select("*")
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    // Return synthesized key/title for UI
    const item = {
      ...(data as Row),
      key: synthesizeKey(data as Row),
      title: synthesizeTitle(data as Row),
    };

    return NextResponse.json({ ok: true, item });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return NextResponse.json({ ok: false, error: e?.message ?? "ERR_POST" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
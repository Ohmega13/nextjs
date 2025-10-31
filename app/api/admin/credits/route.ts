// app/api/admin/credits/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Build Supabase server client bound to user's cookies (for auth). */
async function getSupabaseServer() {
  const cookieStore = await cookies();
  const headerStore = await headers();

  // Forwarded headers help Supabase Auth detect host/proto behind Vercel proxy
  const mergedHeaders: Record<string, string> = {};
  const xfHost = headerStore.get("x-forwarded-host");
  const xfProto = headerStore.get("x-forwarded-proto");
  if (xfHost) mergedHeaders["x-forwarded-host"] = xfHost;
  if (xfProto) mergedHeaders["x-forwarded-proto"] = xfProto;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options?: any) {
          cookieStore.set({ name, value, ...(options ?? {}) });
        },
        remove(name: string, options?: any) {
          cookieStore.set({ name, value: "", ...(options ?? {}), maxAge: 0 });
        },
      },
      headers: mergedHeaders,
    }
  );
}

/** Service-role client (bypass RLS) for server-side queries & RPC. */
function getSupabaseService() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false }, global: { headers: { "X-Client-Info": "admin-api" } } }
  );
}

/** Assert current cookie-authenticated user is admin. */
/** Try header-based admin (for server-to-server or fallback when cookies missing). */
async function tryHeaderAdmin() {
  const headerStore = await headers();
  const authz = headerStore.get("authorization") || headerStore.get("Authorization") || undefined;
  if (!authz) return false;
  try {
    await assertAdmin(authz);
    return true;
  } catch {
    return false;
  }
}

async function assertAdminCookie() {
  // Shortcut: allow header-based admin if provided
  if (await tryHeaderAdmin()) {
    return { ok: true as const };
  }

  const supabase = await getSupabaseServer();

  // 1) Must have a logged-in user
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { ok: false as const, res: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }

  // 2) Prefer RPC is_admin(uid)
  try {
    const { data: isAdminRpc, error: rpcErr } = await supabase.rpc("is_admin", { uid: user.id });
    if (!rpcErr && isAdminRpc) return { ok: true as const };
  } catch {
    // ignore and fallback to profile check
  }

  // 3) Fallback: profiles.role === 'admin'
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profErr || profile?.role !== "admin") {
    return { ok: false as const, res: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  }

  return { ok: true as const };
}

/** Consolidated balance resolver with graceful fallbacks. */
async function resolveBalance(userId: string) {
  const svc = getSupabaseService();

  // 1) Fast path via view
  const v1 = await svc
    .from("v_admin_members")
    .select("carry_balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (!v1.error && typeof v1.data?.carry_balance === "number") {
    return Number(v1.data.carry_balance);
  }

  // 2) RPC
  const v2 = await svc.rpc("fn_credit_balance", { p_user: userId });
  if (!v2.error && typeof v2.data === "number") {
    return Number(v2.data);
  }

  // 3) Fallback table
  const v3 = await svc
    .from("credit_accounts")
    .select("carry_balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (!v3.error && typeof v3.data?.carry_balance === "number") {
    return Number(v3.data.carry_balance);
  }

  return 0;
}

/** GET /api/admin/credits
 *  - ?user_id=... : return one item
 *  - (no query)   : list all from view
 */
export async function GET(req: Request) {
  try {
    const admin = await assertAdminCookie();
    if (!admin.ok) return admin.res;

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");
    const svc = getSupabaseService();

    if (userId) {
      const [{ data: profile }, { data: account }] = await Promise.all([
        svc.from("profiles")
          .select("user_id, email, display_name, role, status")
          .eq("user_id", userId)
          .maybeSingle(),
        svc.from("credit_accounts")
          .select("user_id, daily_quota, monthly_quota, carry_balance, next_reset_at, plan, updated_at")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      const balance = await resolveBalance(userId);
      return NextResponse.json({
        user_id: userId,
        carry_balance: balance,
      });
    }

    const { data, error } = await svc
      .from("v_admin_members")
      .select("user_id, email, display_name, role, status, carry_balance")
      .order("display_name", { ascending: true });

    if (error) throw error;

    const items = (data ?? []).map((r: any) => ({
      user_id: r.user_id,
      profile: {
        user_id: r.user_id,
        email: r.email ?? null,
        display_name: r.display_name ?? null,
        role: r.role ?? null,
        status: r.status ?? null,
      },
      account: null,
      balance: Number(r.carry_balance ?? 0),
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    console.error("GET /api/admin/credits error:", e?.message || e, e?.stack);
    return NextResponse.json({ ok: false, error: e?.message ?? "INTERNAL" }, { status: 500 });
  }
}

/** POST /api/admin/credits — top-up or deduct balance
 * body: { user_id: string, amount: number, note?: string }
 */
export async function POST(req: Request) {
  try {
    const admin = await assertAdminCookie();
    if (!admin.ok) return admin.res;

    const body = await req.json().catch(() => ({}));
    const user_id = body?.user_id as string | undefined;
    const amount = Number(body?.amount);
    const note = (body?.note as string | undefined) ?? null;

    if (!user_id || !Number.isFinite(amount) || Math.trunc(amount) !== amount || amount === 0) {
      return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    }

    const svc = getSupabaseService();
    const { data, error } = await svc.rpc("sp_admin_topup", {
      p_user: user_id,
      p_amount: amount,
      p_note: note,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: "rpc_failed", meta: error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, result: data ?? true });
  } catch (e: any) {
    console.error("POST /api/admin/credits error:", e?.message || e, e?.stack);
    return NextResponse.json({ ok: false, error: e?.message ?? "INTERNAL" }, { status: 500 });
  }
}

/** PATCH /api/admin/credits — update quota/plan
 * body: { user_id: string, daily_quota?: number, monthly_quota?: number }
 */
export async function PATCH(req: Request) {
  try {
    const admin = await assertAdminCookie();
    if (!admin.ok) return admin.res;

    const body = await req.json().catch(() => ({}));
    const user_id = body?.user_id as string | undefined;
    const daily_quota =
      typeof body?.daily_quota === "number" ? (body.daily_quota as number) : undefined;
    const monthly_quota =
      typeof body?.monthly_quota === "number" ? (body.monthly_quota as number) : undefined;

    if (!user_id) {
      return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    }
    if (daily_quota === undefined && monthly_quota === undefined) {
      return NextResponse.json({ ok: false, error: "nothing_to_update" }, { status: 400 });
    }

    const payload: Record<string, any> = { user_id };
    if (daily_quota !== undefined) payload.daily_quota = daily_quota;
    if (monthly_quota !== undefined) payload.monthly_quota = monthly_quota;

    const svc = getSupabaseService();
    const { data, error } = await svc
      .from("credit_accounts")
      .upsert(payload, { onConflict: "user_id" })
      .select("user_id, daily_quota, monthly_quota, carry_balance, next_reset_at, plan, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: "failed_to_update_credit_account" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, account: data });
  } catch (e: any) {
    console.error("PATCH /api/admin/credits error:", e?.message || e, e?.stack);
    return NextResponse.json({ ok: false, error: e?.message ?? "INTERNAL" }, { status: 500 });
  }
}
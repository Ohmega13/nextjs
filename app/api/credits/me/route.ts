import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getTargetUserIdFromReq(req: NextRequest, fallback: string | null) {
  // 1) query string first
  const url = new URL(req.url);
  const qp =
    url.searchParams.get("user_id") ||
    url.searchParams.get("uid") ||
    url.searchParams.get("userid");
  if (qp) return qp;

  // 2) custom headers
  const h = req.headers;
  const hTarget =
    h.get("x-ddt-target-user") ||
    h.get("X-DDT-Target-User") ||
    h.get("x-target-user") ||
    h.get("x-user-id");
  if (hTarget) return hTarget;

  // 3) cookies on the request object
  const c1 = req.cookies.get("ddt_uid")?.value;
  const c2 = req.cookies.get("sb-user-id")?.value;
  if (c1) return c1;
  if (c2) return c2;

  // 4) fallback from caller (e.g., session user)
  return fallback;
}

function makeSupabase() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const SUPABASE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookieStore: any = cookies() as any;

  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options?: any) {
        cookieStore?.set?.({ name, value, ...(options ?? {}) });
      },
      remove(name: string, options?: any) {
        cookieStore?.set?.({
          name,
          value: "",
          ...(options ?? {}),
          expires: new Date(0),
        });
      },
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const supabase = makeSupabase();

    // 1) Try to read current session user (best-effort)
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    // 2) Resolve target user from query/header/session (no 401 here)
    const targetUserId =
      getTargetUserIdFromReq(req, user?.id ?? null);

    // If we truly cannot identify a user, return 200 with zero balance
    if (!targetUserId) {
      return NextResponse.json(
        {
          ok: true,
          data: {
            user_id: null,
            bucket: "tarot",
            balance: 0,
            carry_balance: 0,
            credit: 0,
            credits: 0,
            amount: 0,
            remaining: 0,
            remaining_total: 0,
            plan: "prepaid",
            source: "no_session",
            note: "no user context; returning 0 instead of 401",
          },
        },
        {
          status: 200,
          headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
        }
      );
    }

    // 3) Primary source: credit_accounts
    const acct = await supabase
      .from("credit_accounts")
      .select("carry_balance, plan, updated_at")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (!acct.error && acct.data) {
      const bal = Number(acct.data.carry_balance ?? 0);
      const safe = Number.isFinite(bal) ? Math.max(0, bal) : 0;
      return NextResponse.json(
        {
          ok: true,
          data: {
            user_id: targetUserId,
            bucket: "tarot",
            balance: safe,
            carry_balance: safe,
            credit: safe,
            credits: safe,
            amount: safe,
            remaining: safe,
            remaining_total: safe,
            plan: acct.data.plan ?? "prepaid",
            updated_at: acct.data.updated_at ?? null,
            source: "credit_accounts",
          },
        },
        {
          status: 200,
          headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
        }
      );
    }

    // 4) Fallback: credits (legacy buckets)
    let legacyBalance = 0;
    try {
      const buckets = ["tarot_3", "tarot_weight", "tarot_10", "tarot", "global"];
      const legacy = await supabase
        .from("credits")
        .select("remaining_total, remaining, bucket, created_at")
        .eq("user_id", targetUserId)
        .in("bucket", buckets as any)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!legacy.error && legacy.data?.length) {
        const row = legacy.data[0];
        const val = Number(row.remaining_total ?? row.remaining ?? 0);
        legacyBalance = Number.isFinite(val) ? Math.max(0, val) : 0;
      }
    } catch (e) {
      console.warn("Legacy credit fallback error", e);
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          user_id: targetUserId,
          bucket: "tarot",
          balance: legacyBalance,
          carry_balance: legacyBalance,
          credit: legacyBalance,
          credits: legacyBalance,
          amount: legacyBalance,
          remaining: legacyBalance,
          remaining_total: legacyBalance,
          plan: "prepaid",
          source: "credits_fallback",
        },
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
      }
    );
  } catch (e: any) {
    console.error("GET /api/credits/me error:", e);
    // never break the UI with 5xx; return zero with ok:false for visibility
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "internal_error",
        data: {
          user_id: null,
          bucket: "tarot",
          balance: 0,
          carry_balance: 0,
          credit: 0,
          credits: 0,
          amount: 0,
          remaining: 0,
          remaining_total: 0,
          plan: "prepaid",
          source: "error_fallback",
        },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}
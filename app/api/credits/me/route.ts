import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Resolve target user id from (in order):
 * 1) query string
 * 2) custom headers
 * 3) cookies on the request
 * 4) caller-provided fallback (e.g., session)
 */
function getTargetUserIdFromReq(req: NextRequest, fallback: string | null) {
  const url = new URL(req.url);
  const qp =
    url.searchParams.get("user_id") ||
    url.searchParams.get("uid") ||
    url.searchParams.get("userid");
  if (qp) return qp;

  const h = req.headers;
  const hTarget =
    h.get("x-ddt-target-user") ||
    h.get("X-DDT-Target-User") ||
    h.get("x-target-user") ||
    h.get("x-user-id");
  if (hTarget) return hTarget;

  // NextRequest already carries cookies()
  const c1 = req.cookies.get("ddt_uid")?.value;
  const c2 = req.cookies.get("sb-user-id")?.value;
  if (c1) return c1;
  if (c2) return c2;

  return fallback;
}

/**
 * Create a Supabase admin client for server (no cookies needed).
 */
function makeSupabase() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const SUPABASE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase env missing");
  }

  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * Normalize a balance value to a safe non-negative integer.
 */
function toSafeBalance(v: unknown): number {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

/**
 * Respond with both a flat payload (backward compatibility for the UI)
 * and a nested `data` object (for future-proofing).
 */
function respond200(payload: {
  user_id: string | null;
  balance: number;
  plan: string;
  source: string;
  updated_at?: string | null;
}) {
  const common = {
    ok: true,
    user_id: payload.user_id,
    bucket: "tarot",
    balance: payload.balance,
    carry_balance: payload.balance,
    credit: payload.balance,
    credits: payload.balance,
    amount: payload.balance,
    remaining: payload.balance,
    remaining_total: payload.balance,
    plan: payload.plan,
    source: payload.source,
    updated_at: payload.updated_at ?? null,
  };

  return NextResponse.json(
    {
      ...common,
      data: { ...common },
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    }
  );
}

export async function GET(req: NextRequest) {
  try {
    const supabase = makeSupabase();

    // 1) Try reading session user (best effort)
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // 2) Allow query/header to override
    const targetUserId = getTargetUserIdFromReq(req, user?.id ?? null);

    // If unidentified, do not break the UI: return zero balance
    if (!targetUserId) {
      return respond200({
        user_id: null,
        balance: 0,
        plan: "prepaid",
        source: "no_session",
      });
    }

    // 3) Primary source — credit_accounts
    const acct = await supabase
      .from("credit_accounts")
      .select("carry_balance, plan, updated_at")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (!acct.error && acct.data) {
      const safe = toSafeBalance(acct.data.carry_balance);
      return respond200({
        user_id: targetUserId,
        balance: safe,
        plan: acct.data.plan ?? "prepaid",
        source: "credit_accounts",
        updated_at: acct.data.updated_at ?? null,
      });
    }

    // 4) Fallback — legacy `credits` table
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
        legacyBalance = toSafeBalance(row.remaining_total ?? row.remaining ?? 0);
      }
    } catch {
      // swallow; we still respond with zeros
    }

    return respond200({
      user_id: targetUserId,
      balance: legacyBalance,
      plan: "prepaid",
      source: "credits_fallback",
    });
  } catch (e: any) {
    // Never return 5xx to avoid breaking the UI number
    const msg = e?.message ?? String(e);
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        // flat zeros
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
        // nested
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
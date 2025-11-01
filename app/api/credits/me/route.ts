// app/api/credits/me/route.ts
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getTargetUserIdFromReq(req: Request, fallback?: string | null) {
  const url = new URL(req.url);
  const qp = url.searchParams.get("user_id");
  const h = req.headers;
  const h1 = h.get("x-ddt-target-user");
  const h2 = h.get("X-DDT-Target-User");
  const h3 = h.get("x-ddt-targetuser");
  const h4 = h.get("x-ddt-target-user-id");
  return qp ?? h1 ?? h2 ?? h3 ?? h4 ?? fallback ?? null;
}

// Create a Supabase client with cookie + headers
async function getSupabase() {
  const cookieStore = cookies();
  const headerStore = headers();

  const mergedHeaders: Record<string, string> = {};
  const xfHost = headerStore.get("x-forwarded-host");
  const xfProto = headerStore.get("x-forwarded-proto");
  if (xfHost) mergedHeaders["x-forwarded-host"] = xfHost;
  if (xfProto) mergedHeaders["x-forwarded-proto"] = xfProto;

  const authz = headerStore.get("authorization") || headerStore.get("Authorization");
  if (authz) mergedHeaders["authorization"] = authz;

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
      cookieOptions: { sameSite: "lax", secure: true },
    }
  );
}

export async function GET(req: Request) {
  try {
    const supabase = await getSupabase();

    // 1) Identify user
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr && !user) {
      return NextResponse.json(
        { ok: false, error: "no_session" },
        { status: 401 }
      );
    }

    // 2) Determine target user (admin can query other users)
    const targetUserId = getTargetUserIdFromReq(req, user?.id ?? null);
    if (!targetUserId) {
      return NextResponse.json(
        { ok: false, error: "no_user" },
        { status: 401 }
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
      return NextResponse.json(
        {
          ok: true,
          user_id: targetUserId,
          balance: Number.isFinite(bal) ? bal : 0,
          remaining_total: Number.isFinite(bal) ? bal : 0,
          source: "credit_accounts",
          updated_at: acct.data.updated_at ?? null,
          plan: acct.data.plan ?? "prepaid",
        },
        { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // 4) Fallback: credits (legacy)
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
        legacyBalance = Number.isFinite(val) ? val : 0;
      }
    } catch (e) {
      console.warn("Legacy credit fallback error", e);
    }

    return NextResponse.json(
      {
        ok: true,
        user_id: targetUserId,
        balance: legacyBalance,
        source: "credits_fallback",
      },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e: any) {
    console.error("GET /api/credits/me error:", e);
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 }
    );
  }
}
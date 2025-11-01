// app/api/credits/me/route.ts
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getServerSupabase() {
  return (async () => {
    const cookieStore = await cookies();
    const headerStore = await headers();

    // Propagate proxy headers so Supabase Auth can resolve host/proto correctly
    const mergedHeaders: Record<string, string> = {};
    const xfHost = headerStore.get("x-forwarded-host");
    const xfProto = headerStore.get("x-forwarded-proto");
    if (xfHost) mergedHeaders["x-forwarded-host"] = xfHost;
    if (xfProto) mergedHeaders["x-forwarded-proto"] = xfProto;

    // Forward Authorization header (if any) so Supabase can resolve session from Bearer token as well
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
        cookieOptions: {
          sameSite: "lax",
          secure: true,
        },
      }
    );
  })();
}

export async function GET() {
  try {
    const supabase = await getServerSupabase();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      // Graceful fallback: not signed in on this host -> don't break UI
      return Response.json(
        {
          ok: true,
          balance: 0,
          note: "no_session",
        },
        {
          status: 200,
          headers: { "Cache-Control": "no-store, max-age=0" },
        }
      );
    }

    // 1) Primary source: Postgres function (RPC)
    const { data: rpcBalance, error: rpcErr } = await supabase.rpc("fn_credit_balance", {
      p_user: user.id,
    });

    // 2) Fallback: read from accounts table (carry_balance|balance)
    let fallbackBalance = 0;
    if (rpcErr || typeof rpcBalance !== "number") {
      const { data: acct, error: acctErr } = await supabase
        .from("credit_accounts")
        .select("carry_balance, balance")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!acctErr) {
        const v =
          (acct as any)?.carry_balance ??
          (acct as any)?.balance ??
          0;
        fallbackBalance = Number.isFinite(Number(v)) ? Number(v) : 0;
      } else {
        console.error("⚠️ accounts fallback error:", acctErr);
      }
    }

    const finalBalance =
      typeof rpcBalance === "number" ? rpcBalance : fallbackBalance;

    return Response.json(
      {
        ok: true,
        // primary
        balance: finalBalance,
        // aliases for older clients/components
        carry_balance: finalBalance,
        credit: finalBalance,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  } catch (e: any) {
    console.error("GET /api/credits/me error:", e?.message || e);
    return Response.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
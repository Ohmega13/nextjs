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
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("fn_credit_balance", {
      p_user: user.id,
    });

    if (error) {
      console.error("❌ credit_balance error:", error);
      return Response.json(
        { ok: false, error: "failed to fetch credit balance" },
        { status: 500 }
      );
    }

    return Response.json({
      ok: true,
      balance: typeof data === "number" ? data : 0,
    });
  } catch (e: any) {
    console.error("GET /api/credits/me error:", e?.message || e);
    return Response.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
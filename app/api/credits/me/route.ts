// app/api/credits/me/route.ts
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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
    balance: data ?? 0,
  });
}
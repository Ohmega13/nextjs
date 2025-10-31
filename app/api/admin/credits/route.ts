// app/api/admin/credits/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Create Supabase server client (Next.js 15-safe) */
async function getSupabaseServer(req?: Request) {
  const cookieStore = await cookies();
  const headerStore = await headers();

  // ดึง Authorization header จาก req (ถ้ามี) หรือจาก framework headers
  const authHeaderFromReq = req?.headers.get("authorization") ?? undefined;
  const authHeader =
    authHeaderFromReq ??
    headerStore.get("authorization") ??
    undefined;

  // เตรียม headers สำหรับ Supabase (อย่าใส่ค่าว่าง)
  const mergedHeaders: Record<string, string> = {};
  const xfHost = headerStore.get("x-forwarded-host");
  const xfProto = headerStore.get("x-forwarded-proto");
  if (xfHost) mergedHeaders["x-forwarded-host"] = xfHost;
  if (xfProto) mergedHeaders["x-forwarded-proto"] = xfProto;
  if (authHeader) mergedHeaders["authorization"] = authHeader;

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
      // ใส่ global.headers เฉพาะตอนมี Authorization เท่านั้น
      ...(authHeader
        ? { global: { headers: { Authorization: authHeader } } }
        : {}),
    }
  );
}

/** Service-role client for server-side admin queries (bypass RLS). */
function getSupabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSupabaseAdminClient(url, serviceKey, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "admin-api" } },
  });
}

/** ตรวจสิทธิ์ admin: rpc('is_admin') ก่อน แล้วค่อย fallback profiles.role */
async function assertAdmin(supabase: Awaited<ReturnType<typeof getSupabaseServer>>) {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        ok: false as const,
        res: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
      };
    }

    // 1) ลองด้วย RPC
    try {
      const { data: isAdminRpc, error: rpcErr } = await supabase.rpc("is_admin", {
        uid: user.id as string,
      });
      if (rpcErr) {
        // ถ้า RPC พัง ค่อย fallback profiles.role
        console.warn("rpc is_admin error -> fallback to profiles.role:", rpcErr.message);
      } else if (isAdminRpc) {
        return { ok: true as const };
      }
    } catch (e) {
      console.warn("rpc is_admin exception -> fallback:", e);
    }

    // 2) fallback: profiles.role = admin
    const { data: profile, error: profError } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profError || profile?.role !== "admin") {
      return {
        ok: false as const,
        res: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
      };
    }

    return { ok: true as const };
  } catch (e) {
    console.error("assertAdmin unexpected error:", e);
    return {
      ok: false as const,
      res: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    };
  }
}

/** GET /api/admin/credits
 *  - ?user_id=... : รายละเอียดเครดิตผู้ใช้นั้น
 *  - (ไม่มี)      : ลิสต์บัญชีเครดิต + โปรไฟล์ + ยอด balance (limit 100)
 */
export async function GET(req: Request) {
  try {
    const supabase = await getSupabaseServer(req);
    const admin = await assertAdmin(supabase);
    if (!admin.ok) return admin.res;

    const svc = getSupabaseService();

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");

    // --- โหมดดูของผู้ใช้คนเดียว ---
    if (userId) {
      // balance (อาจไม่มีฟังก์ชัน -> คืน null)
      let balance: number | null = null;
      try {
        const { data: balData, error: balErr } = await svc.rpc("fn_credit_balance", {
          p_user: userId,
        });
        if (balErr) {
          console.warn("fn_credit_balance error:", balErr.message);
        } else if (typeof balData === "number") {
          balance = balData;
        }
      } catch (e) {
        console.warn("fn_credit_balance exception:", e);
      }

      // credit_accounts
      let account:
        | {
            user_id: string;
            daily_quota: number | null;
            monthly_quota: number | null;
            carry_balance: number | null;
            next_reset_at: string | null;
            plan: string | null;
            updated_at: string | null;
          }
        | null = null;
      try {
        const { data: acc, error: accErr } = await svc
          .from("credit_accounts")
          .select(
            "user_id, daily_quota, monthly_quota, carry_balance, next_reset_at, plan, updated_at"
          )
          .eq("user_id", userId)
          .maybeSingle();
        if (accErr) {
          console.warn("fetch credit_accounts error:", accErr.message);
        } else {
          account = acc ?? null;
        }
      } catch (e) {
        console.warn("fetch credit_accounts exception:", e);
      }

      // profile
      let profile:
        | {
            user_id: string;
            email: string | null;
            display_name: string | null;
            role: string | null;
            status: string | null;
          }
        | null = null;
      try {
        const { data: prof, error: profErr } = await svc
          .from("profiles")
          .select("user_id, email, display_name, role, status")
          .eq("user_id", userId)
          .maybeSingle();
        if (profErr) {
          console.warn("fetch profile error:", profErr.message);
        } else {
          profile = prof ?? null;
        }
      } catch (e) {
        console.warn("fetch profile exception:", e);
      }

      const safeBalance = Number.isFinite(balance as any)
        ? Number(balance)
        : Number(account?.carry_balance ?? 0) || 0;

      return NextResponse.json({
        ok: true,
        item: {
          user_id: userId,
          profile,
          account,
          balance: safeBalance,
        },
      });
    }

    // --- โหมดลิสต์รวม (limit 200: โปรไฟล์ก่อน แล้วค่อยผูกเครดิต) ---
    // 1) ดึงโปรไฟล์ก่อน (รองรับกรณีที่ยังไม่มี row ใน credit_accounts)
    let profiles:
      | { user_id: string; email: string | null; display_name: string | null; role: string | null; status: string | null }[]
      | [] = [];
    try {
      const { data: profRows, error: profErr } = await svc
        .from("profiles")
        .select("user_id, email, display_name, role, status")
        .limit(200);
      if (profErr) {
        console.warn("profiles list error:", profErr.message);
      } else {
        profiles = profRows ?? [];
      }
    } catch (e) {
      console.warn("profiles list exception:", e);
    }

    const userIds = profiles.map((p) => p.user_id);

    // 2) ดึงบัญชีเครดิตเฉพาะที่มี (left join แบบ manual)
    let accounts:
      | { user_id: string; daily_quota: number | null; monthly_quota: number | null; carry_balance: number | null; next_reset_at: string | null; plan: string | null; updated_at: string | null }[]
      | [] = [];
    if (userIds.length > 0) {
      try {
        const { data: rows, error: listErr } = await svc
          .from("credit_accounts")
          .select(
            "user_id, daily_quota, monthly_quota, carry_balance, next_reset_at, plan, updated_at"
          )
          .in("user_id", userIds);
        if (listErr) {
          console.warn("credit_accounts list error:", listErr.message);
        } else {
          accounts = rows ?? [];
        }
      } catch (e) {
        console.warn("credit_accounts list exception:", e);
      }
    } else {
      accounts = [];
    }

    const accountMap: Record<string, {
      user_id: string;
      daily_quota: number | null;
      monthly_quota: number | null;
      carry_balance: number | null;
      next_reset_at: string | null;
      plan: string | null;
      updated_at: string | null;
    }> = {};
    for (const a of accounts as any[]) {
      if (a && a.user_id) accountMap[a.user_id] = a;
    }

    // 3) ลองดึง balance จาก RPC สำหรับ user ที่มีบัญชีเครดิต
    const balanceMap: Record<string, number> = {};
    await Promise.all(
      Object.keys(accountMap).map(async (uid) => {
        try {
          const { data: bal, error: balErr } = await svc.rpc("fn_credit_balance", { p_user: uid });
          if (!balErr && typeof bal === "number") {
            balanceMap[uid] = bal;
          }
        } catch {/* ignore */}
      })
    );

    const items = (profiles as Array<{ user_id: string; email: string | null; display_name: string | null; role: string | null; status: string | null }>).map((p) => {
      const acc = accountMap[p.user_id] ?? null;
      const balance = balanceMap[p.user_id] ?? (acc?.carry_balance ?? 0);
      return {
        user_id: p.user_id,
        profile: p,
        account: acc,
        balance,
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    console.error("GET /api/admin/credits unexpected error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "fetch_failed" },
      { status: 500 }
    );
  }
}

/** POST /api/admin/credits
 * เติม/หักเครดิตแบบ manual
 * body: { user_id: string, amount: number, note?: string }
 * เรียก rpc('sp_admin_topup') (ถ้าไม่มีให้สร้างตามสเปก)
 */
export async function POST(req: Request) {
  try {
    const supabase = await getSupabaseServer(req);
    const admin = await assertAdmin(supabase);
    if (!admin.ok) return admin.res;

    const svc = getSupabaseService();

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // ignore
    }

    const user_id = body?.user_id as string | undefined;
    const amountRaw = body?.amount;
    const note = (body?.note as string | undefined) ?? null;

    const amount = Number(amountRaw);
    if (!user_id || !Number.isFinite(amount) || Math.trunc(amount) !== amount || amount === 0) {
      return NextResponse.json(
        { ok: false, error: "invalid_payload: require { user_id, amount:int!=0 }" },
        { status: 400 }
      );
    }

    try {
      const { data, error } = await svc.rpc("sp_admin_topup", {
        p_user: user_id,
        p_amount: amount,
        p_note: note,
      });
      if (error) {
        // Normalize Supabase/Postgres error for easier debugging on client
        const anyErr = error as any;
        const msg = anyErr?.message ?? "";
        const normalized = {
          message: msg || "sp_admin_topup failed",
          name: anyErr?.name ?? null,
          code: anyErr?.code ?? null,
          details: anyErr?.details ?? null,
          hint: anyErr?.hint ?? null,
          status: (anyErr?.status ?? anyErr?.statusCode) ?? null,
          // Supabase JS sometimes nest Postgres error under "cause"/"originalError"
          cause: anyErr?.cause ?? null,
          original: anyErr?.original ?? anyErr?.originalError ?? null,
        };

        // Map authorization-ish errors to 403 for clearer UI handling
        const lower = (msg || "").toLowerCase();
        if (lower.includes("forbidden") || lower.includes("not allowed") || lower.includes("permission")) {
          return NextResponse.json(
            { ok: false, error: "forbidden", meta: normalized },
            { status: 403 }
          );
        }

        // When function not found / argument mismatch, keep 500 but tell client exactly which RPC
        if (lower.includes("function") && (lower.includes("does not exist") || lower.includes("not exist"))) {
          return NextResponse.json(
            {
              ok: false,
              error: "rpc_missing",
              meta: normalized,
              hint: "ตรวจสอบว่าสร้างฟังก์ชัน sp_admin_topup(p_user uuid, p_amount integer, p_note text) แล้วหรือยัง และสิทธิ์ GRANT execute.",
            },
            { status: 500 }
          );
        }

        // Default: return rich error meta for investigation on client side
        return NextResponse.json(
          {
            ok: false,
            error: "rpc_failed",
            meta: normalized,
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, result: data ?? true });
    } catch (e: any) {
      console.error("sp_admin_topup exception:", e);
      const normalized = {
        message: e?.message ?? String(e),
        name: e?.name ?? null,
        code: e?.code ?? null,
        details: e?.details ?? null,
        hint: e?.hint ?? null,
        stack: e?.stack ?? null,
      };
      return NextResponse.json(
        {
          ok: false,
          error: "rpc_exception",
          meta: normalized,
          hint:
            "เกิด exception ขณะเรียก sp_admin_topup — ตรวจชื่อ/สัญญา parameter และสิทธิ์ของ SECURITY DEFINER/GRANT execute",
        },
        { status: 500 }
      );
    }
  } catch (e: any) {
    console.error("POST /api/admin/credits unexpected error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "topup_failed" }, { status: 500 });
  }
}

/** PATCH /api/admin/credits
 * ตั้งค่า quota/แผนเครดิตของผู้ใช้
 * body: { user_id: string, daily_quota?: number, monthly_quota?: number }
 * upsert -> credit_accounts (on conflict user_id)
 */
export async function PATCH(req: Request) {
  try {
    const supabase = await getSupabaseServer(req);
    const admin = await assertAdmin(supabase);
    if (!admin.ok) return admin.res;

    const svc = getSupabaseService();

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // ignore
    }

    const user_id = body?.user_id as string | undefined;
    const daily_quota =
      typeof body?.daily_quota === "number" ? (body.daily_quota as number) : undefined;
    const monthly_quota =
      typeof body?.monthly_quota === "number" ? (body.monthly_quota as number) : undefined;

    if (!user_id) {
      return NextResponse.json(
        { ok: false, error: "invalid_payload: require { user_id }" },
        { status: 400 }
      );
    }
    if (daily_quota === undefined && monthly_quota === undefined) {
      return NextResponse.json(
        { ok: false, error: "nothing_to_update: include daily_quota or monthly_quota" },
        { status: 400 }
      );
    }

    const payload: Record<string, any> = { user_id };
    if (daily_quota !== undefined) payload.daily_quota = daily_quota;
    if (monthly_quota !== undefined) payload.monthly_quota = monthly_quota;

    try {
      const { data, error } = await svc
        .from("credit_accounts")
        .upsert(payload, { onConflict: "user_id" })
        .select("user_id, daily_quota, monthly_quota, carry_balance, next_reset_at, plan, updated_at")
        .single();

      if (error) {
        console.error("upsert credit_accounts error:", error);
        return NextResponse.json(
          { ok: false, error: "failed_to_update_credit_account" },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, account: data });
    } catch (e) {
      console.error("upsert credit_accounts exception:", e);
      return NextResponse.json(
        { ok: false, error: "failed_to_update_credit_account" },
        { status: 500 }
      );
    }
  } catch (e: any) {
    console.error("PATCH /api/admin/credits unexpected error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "patch_failed" }, { status: 500 });
  }
}
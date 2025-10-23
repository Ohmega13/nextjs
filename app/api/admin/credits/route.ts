// app/api/admin/credits/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

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

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");

    // --- โหมดดูของผู้ใช้คนเดียว ---
    if (userId) {
      // balance (อาจไม่มีฟังก์ชัน -> คืน null)
      let balance: number | null = null;
      try {
        const { data: balData, error: balErr } = await supabase.rpc("fn_credit_balance", {
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
            last_daily_reset_at: string | null;
            last_monthly_reset_at: string | null;
            updated_at: string | null;
          }
        | null = null;
      try {
        const { data: acc, error: accErr } = await supabase
          .from("credit_accounts")
          .select(
            "user_id, daily_quota, monthly_quota, carry_balance, last_daily_reset_at, last_monthly_reset_at, updated_at"
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
        const { data: prof, error: profErr } = await supabase
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

      return NextResponse.json({
        ok: true,
        item: {
          user_id: userId,
          profile,
          account,
          balance,
        },
      });
    }

    // --- โหมดลิสต์รวม (limit 100) ---
    let accounts:
      | {
          user_id: string;
          daily_quota: number | null;
          monthly_quota: number | null;
          carry_balance: number | null;
          last_daily_reset_at: string | null;
          last_monthly_reset_at: string | null;
          updated_at: string | null;
        }[]
      | [] = [];
    try {
      const { data: rows, error: listErr } = await supabase
        .from("credit_accounts")
        .select(
          "user_id, daily_quota, monthly_quota, carry_balance, last_daily_reset_at, last_monthly_reset_at, updated_at"
        )
        .order("updated_at", { ascending: false })
        .limit(100);

      if (listErr) {
        console.error("credit_accounts list error:", listErr.message);
        return NextResponse.json(
          { ok: false, error: "failed_to_fetch_credit_accounts" },
          { status: 500 }
        );
      }
      accounts = rows ?? [];
    } catch (e) {
      console.error("credit_accounts list exception:", e);
      return NextResponse.json(
        { ok: false, error: "failed_to_fetch_credit_accounts" },
        { status: 500 }
      );
    }

    const userIds = accounts.map((a) => a.user_id);
    let profiles:
      | {
          user_id: string;
          email: string | null;
          display_name: string | null;
          role: string | null;
          status: string | null;
        }[]
      | [] = [];
    try {
      const { data: profRows, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, email, display_name, role, status")
        .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
      if (profErr) {
        console.warn("profiles list error:", profErr.message);
      } else {
        profiles = profRows ?? [];
      }
    } catch (e) {
      console.warn("profiles list exception:", e);
    }

    // ดึง balance แบบทีละคน (ถ้าฟังก์ชันไม่มี จะได้ null)
    const balanceMap: Record<string, number> = {};
    await Promise.all(
      accounts.map(async (a) => {
        try {
          const { data: bal, error: balErr } = await supabase.rpc("fn_credit_balance", {
            p_user: a.user_id,
          });
          if (!balErr && typeof bal === "number") {
            balanceMap[a.user_id] = bal;
          }
        } catch {
          // เงียบ ๆ
        }
      })
    );

    const items = accounts.map((a) => ({
      user_id: a.user_id,
      profile: profiles.find((p) => p.user_id === a.user_id) ?? null,
      account: a,
      balance: balanceMap[a.user_id] ?? null,
    }));

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
      const { data, error } = await supabase.rpc("sp_admin_topup", {
        p_user: user_id,
        p_amount: amount,
        p_note: note,
      });
      if (error) {
        // ถ้า policy หรือ RPC เช็คสิทธิ์โป้ง -> แปลงเป็น 403
        const msg = (error as any)?.message ?? "";
        if (msg.toLowerCase().includes("forbidden") || msg.toLowerCase().includes("not allowed")) {
          return NextResponse.json(
            { ok: false, error: "forbidden", message: msg },
            { status: 403 }
          );
        }
        console.error("sp_admin_topup error:", error);
        return NextResponse.json(
          { ok: false, error: "rpc_failed", message: msg || "sp_admin_topup failed" },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, result: data ?? true });
    } catch (e: any) {
      console.error("sp_admin_topup exception:", e);
      return NextResponse.json(
        {
          ok: false,
          error: "rpc_missing_or_failed",
          message:
            "ไม่พบหรือเรียกใช้ sp_admin_topup ไม่ได้ กรุณาสร้างฟังก์ชัน (p_user uuid, p_amount int, p_note text)",
          details: e?.message ?? String(e),
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
      const { data, error } = await supabase
        .from("credit_accounts")
        .upsert(payload, { onConflict: "user_id" })
        .select("user_id, daily_quota, monthly_quota, updated_at")
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
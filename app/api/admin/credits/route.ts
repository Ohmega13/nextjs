// app/api/admin/credits/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Supabase client (Next 15-safe) */
async function getSupabaseServer() {
  const cookieStore = await cookies();
  const headerStore = await headers();

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
      headers: {
        "x-forwarded-host": headerStore.get("x-forwarded-host") ?? "",
        "x-forwarded-proto": headerStore.get("x-forwarded-proto") ?? "",
      },
    }
  );
}

/** ตรวจสิทธิ์แอดมินจาก profiles.role หรือ rpc('is_admin') */
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

    const { data: profile, error: profError } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profError) {
      console.error("Error fetching profile for admin check:", profError);
      return {
        ok: false as const,
        res: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
      };
    }

    if (profile?.role !== "admin") {
      try {
        const { data: isAdminRpc, error: rpcError } = await supabase.rpc("is_admin", { uid: user.id as string });
        if (rpcError) {
          console.error("RPC is_admin error:", rpcError);
          return {
            ok: false as const,
            res: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
          };
        }
        if (!isAdminRpc) {
          return {
            ok: false as const,
            res: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
          };
        }
      } catch (rpcEx) {
        console.error("RPC is_admin exception:", rpcEx);
        return {
          ok: false as const,
          res: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
        };
      }
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
 * - ?user_id=...  -> รายละเอียดเครดิตของผู้ใช้คนนั้น
 * - (ไม่มี)       -> รายการเครดิตของผู้ใช้จำนวนหนึ่ง (รวมโปรไฟล์)
 */
export async function GET(req: Request) {
  try {
    const supabase = await getSupabaseServer();
    const admin = await assertAdmin(supabase);
    if (!admin.ok) return admin.res;

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");

    // ถ้ามี user_id: คืนรายละเอียดเฉพาะคนนั้น
    if (userId) {
      let balance: number | null = null;
      try {
        const { data: balRpc, error: rpcErr } = await supabase.rpc("fn_credit_balance", { p_user: userId });
        if (rpcErr) {
          console.error("RPC fn_credit_balance error:", rpcErr);
        } else if (typeof balRpc === "number") {
          balance = balRpc;
        }
      } catch (e) {
        console.error("RPC fn_credit_balance exception:", e);
      }

      let account = null;
      try {
        const { data: accountData, error: accErr } = await supabase
          .from("credit_accounts")
          .select("user_id, daily_quota, monthly_quota, carry_balance, last_daily_reset_at, last_monthly_reset_at, updated_at")
          .eq("user_id", userId)
          .maybeSingle();
        if (accErr) {
          console.error("Error fetching credit_accounts:", accErr);
        } else {
          account = accountData;
        }
      } catch (e) {
        console.error("Exception fetching credit_accounts:", e);
      }

      let prof = null;
      try {
        const { data: profData, error: profErr } = await supabase
          .from("profiles")
          .select("user_id, email, display_name, role, status")
          .eq("user_id", userId)
          .maybeSingle();
        if (profErr) {
          console.error("Error fetching profile:", profErr);
        } else {
          prof = profData;
        }
      } catch (e) {
        console.error("Exception fetching profile:", e);
      }

      return NextResponse.json({
        ok: true,
        item: {
          user_id: userId,
          profile: prof ?? null,
          account: account ?? null,
          balance, // อาจเป็น null ถ้าไม่มีฟังก์ชัน
        },
      });
    }

    // ไม่ระบุ user_id: ลิสต์รวม (จำกัด 100)
    let accounts: {
      user_id: string;
      daily_quota: number | null;
      monthly_quota: number | null;
      carry_balance: number | null;
      last_daily_reset_at: string | null;
      last_monthly_reset_at: string | null;
      updated_at: string | null;
    }[] = [];
    try {
      const { data: accountsData, error: accErr } = await supabase
        .from("credit_accounts")
        .select(
          "user_id, daily_quota, monthly_quota, carry_balance, last_daily_reset_at, last_monthly_reset_at, updated_at"
        )
        .order("updated_at", { ascending: false })
        .limit(100);
      if (accErr) {
        console.error("Error fetching credit_accounts list:", accErr);
        return NextResponse.json(
          { ok: false, error: "Failed to fetch credit accounts" },
          { status: 500 }
        );
      }
      accounts = (accountsData ?? []) as typeof accounts;
    } catch (e) {
      console.error("Exception fetching credit_accounts list:", e);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch credit accounts" },
        { status: 500 }
      );
    }

    const userIds = accounts.map((a) => a.user_id);
    let profiles: {
      user_id: string;
      email: string;
      display_name: string | null;
      role: string | null;
      status: string | null;
    }[] = [];
    try {
      const { data: profilesData, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, email, display_name, role, status")
        .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
      if (profErr) {
        console.error("Error fetching profiles list:", profErr);
      } else {
        profiles = profilesData ?? [];
      }
    } catch (e) {
      console.error("Exception fetching profiles list:", e);
    }

    // ลองยิงฟังก์ชัน balance แบบ batch (ถ้าไม่มีให้ข้าม)
    const balanceMap: Record<string, number> = {};
    try {
      await Promise.all(
        accounts.map(async (a) => {
          try {
            const { data: bal, error: rpcErr } = await supabase.rpc("fn_credit_balance", { p_user: a.user_id });
            if (rpcErr) {
              console.error(`RPC fn_credit_balance error for user ${a.user_id}:`, rpcErr);
            } else if (typeof bal === "number") {
              balanceMap[a.user_id] = bal;
            }
          } catch (e) {
            console.error(`RPC fn_credit_balance exception for user ${a.user_id}:`, e);
          }
        })
      );
    } catch (e) {
      console.error("Exception during batch balance fetch:", e);
    }

    const rows = accounts.map((a) => ({
      user_id: a.user_id,
      profile: profiles.find((p) => p.user_id === a.user_id) ?? null,
      account: a,
      balance: balanceMap[a.user_id] ?? null,
    }));

    return NextResponse.json({ ok: true, items: rows });
  } catch (e: any) {
    console.error("GET /api/admin/credits unexpected error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "fetch failed" }, { status: 500 });
  }
}

/** POST /api/admin/credits
 * เติม/หักเครดิตแบบ manual
 * body: { user_id: string, amount: number, note?: string }
 * พยายามเรียก rpc('sp_admin_topup') ถ้าไม่มี จะแจ้งให้สร้างฟังก์ชัน
 */
export async function POST(req: Request) {
  try {
    const supabase = await getSupabaseServer();
    const admin = await assertAdmin(supabase);
    if (!admin.ok) return admin.res;

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // ignore
    }
    const user_id = body?.user_id as string | undefined;
    const amount = Number(body?.amount);
    const note = (body?.note as string | undefined) ?? null;

    if (!user_id || !Number.isFinite(amount)) {
      return NextResponse.json(
        { ok: false, error: "invalid_payload: require { user_id, amount }" },
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
        console.error("RPC sp_admin_topup error:", error);
        throw error;
      }
      return NextResponse.json({ ok: true, result: data ?? true });
    } catch (err: any) {
      console.error("RPC sp_admin_topup failed:", err);
      return NextResponse.json(
        {
          ok: false,
          error: "rpc_missing_or_failed",
          message:
            "ไม่พบฟังก์ชัน sp_admin_topup หรือเรียกใช้ไม่ได้ กรุณาสร้างฟังก์ชันนี้ใน Supabase ตามสเปค (p_user uuid, p_amount int, p_note text)",
          details: err?.message ?? String(err),
        },
        { status: 500 }
      );
    }
  } catch (e: any) {
    console.error("POST /api/admin/credits unexpected error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "topup failed" }, { status: 500 });
  }
}

/** PATCH /api/admin/credits
 * ตั้งค่า quota/แผนเครดิตของผู้ใช้
 * body: { user_id: string, daily_quota?: number, monthly_quota?: number }
 * บันทึกที่ตาราง credit_accounts (upsert on conflict user_id)
 */
export async function PATCH(req: Request) {
  try {
    const supabase = await getSupabaseServer();
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

    const payload: any = { user_id };
    if (daily_quota !== undefined) payload.daily_quota = daily_quota;
    if (monthly_quota !== undefined) payload.monthly_quota = monthly_quota;

    try {
      const { data, error } = await supabase
        .from("credit_accounts")
        .upsert(payload, { onConflict: "user_id" })
        .select("user_id, daily_quota, monthly_quota, updated_at")
        .single();

      if (error) {
        console.error("Error upserting credit_accounts:", error);
        throw error;
      }

      return NextResponse.json({ ok: true, account: data });
    } catch (e) {
      console.error("Exception upserting credit_accounts:", e);
      return NextResponse.json({ ok: false, error: "Failed to update credit account" }, { status: 500 });
    }
  } catch (e: any) {
    console.error("PATCH /api/admin/credits unexpected error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "patch failed" }, { status: 500 });
  }
}
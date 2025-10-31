/**
 * app/api/admin/credits/route.ts
 * Admin-only credits API (header-based auth).
 * - Auth: Authorization header validated via assertAdmin()
 * - Data: Uses supaAdmin (service role) to query views/tables and call RPCs
 */
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { supaAdmin, assertAdmin } from '@/lib/supabaseAdmin';

/** Ensure requester is admin by Authorization header. */
async function ensureAdmin(req: Request) {
  const authz = req.headers.get('authorization') || undefined;
  if (!authz) {
    const err: any = new Error('NO_AUTH');
    err.status = 401;
    throw err;
  }
  await assertAdmin(authz); // throws on invalid
}

/** Safe helper to read single value of carry_balance for a user. */
async function getBalanceForUser(userId: string): Promise<number> {
  // 1) Prefer view (fast & denormalized)
  try {
    const { data, error } = await supaAdmin
      .from('v_admin_members')
      .select('carry_balance')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && typeof data?.carry_balance === 'number') {
      return Number(data.carry_balance);
    }
    if (error) console.warn('v_admin_members balance error:', error.message);
  } catch (e) {
    console.warn('v_admin_members balance exception:', e);
  }

  // 2) Fallback to RPC fn_credit_balance
  try {
    const { data, error } = await supaAdmin.rpc('fn_credit_balance', { p_user: userId });
    if (!error && typeof data === 'number') return Number(data);
    if (error) console.warn('fn_credit_balance error:', error.message);
  } catch (e) {
    console.warn('fn_credit_balance exception:', e);
  }

  // 3) Last resort: credit_accounts.carry_balance
  try {
    const { data, error } = await supaAdmin
      .from('credit_accounts')
      .select('carry_balance')
      .eq('user_id', userId)
      .maybeSingle();
    if (!error && typeof data?.carry_balance === 'number') return Number(data.carry_balance);
    if (error) console.warn('credit_accounts fallback error:', error.message);
  } catch (e) {
    console.warn('credit_accounts fallback exception:', e);
  }

  return 0;
}

/** GET /api/admin/credits
 *  - ?user_id=... : รายละเอียดเครดิตของ user นั้น
 *  - (ไม่มี)      : รายการสรุปรวมจาก view
 */
export async function GET(req: Request) {
  try {
    await ensureAdmin(req);

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');

    if (userId) {
      // ดึงโปรไฟล์ (เผื่อ UI ใช้)
      let profile:
        | { user_id: string; email: string | null; display_name: string | null; role: string | null; status: string | null }
        | null = null;
      try {
        const { data, error } = await supaAdmin
          .from('profiles')
          .select('user_id, email, display_name, role, status')
          .eq('user_id', userId)
          .maybeSingle();
        if (!error) profile = data ?? null;
      } catch (e) {
        console.warn('profiles single exception:', e);
      }

      // ดึงข้อมูลบัญชีเครดิต (optional)
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
        const { data, error } = await supaAdmin
          .from('credit_accounts')
          .select('user_id, daily_quota, monthly_quota, carry_balance, next_reset_at, plan, updated_at')
          .eq('user_id', userId)
          .maybeSingle();
        if (!error) account = data ?? null;
      } catch (e) {
        console.warn('credit_accounts single exception:', e);
      }

      const balance = await getBalanceForUser(userId);

      return NextResponse.json({
        ok: true,
        item: { user_id: userId, profile, account, balance },
      });
    }

    // รวมทั้งหมดจาก view เดียว
    const { data: rows, error } = await supaAdmin
      .from('v_admin_members')
      .select('user_id, email, display_name, role, status, carry_balance')
      .order('display_name', { ascending: true });

    if (error) throw error;

    const items =
      rows?.map((r: any) => ({
        user_id: r.user_id,
        profile: {
          user_id: r.user_id,
          email: r.email ?? null,
          display_name: r.display_name ?? null,
          role: r.role ?? null,
          status: r.status ?? null,
        },
        account: null, // ถ้าต้องการ quota/plan ค่อยยิงรายคน
        balance: Number(r.carry_balance ?? 0),
      })) ?? [];

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    console.error('/api/admin/credits GET error:', e?.message || e, e?.stack);
    const code =
      e?.status ??
      (e?.message === 'NO_AUTH' || e?.message === 'BAD_AUTH'
        ? 401
        : e?.message === 'FORBIDDEN'
        ? 403
        : 500);
    return NextResponse.json({ ok: false, error: e?.message ?? 'INTERNAL' }, { status: code });
  }
}

/** POST /api/admin/credits
 * เติม/หักเครดิต (manual top-up)
 * body: { user_id: string, amount: number, note?: string }
 * ใช้ RPC sp_admin_topup(p_user uuid, p_amount integer, p_note text)
 */
export async function POST(req: Request) {
  try {
    await ensureAdmin(req);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // ignore
    }

    const user_id = body?.user_id as string | undefined;
    const amount = Number(body?.amount);
    const note = (body?.note as string | undefined) ?? null;

    if (!user_id || !Number.isFinite(amount) || Math.trunc(amount) !== amount || amount === 0) {
      return NextResponse.json(
        { ok: false, error: 'invalid_payload: require { user_id, amount:int!=0 }' },
        { status: 400 },
      );
    }

    const { data, error } = await supaAdmin.rpc('sp_admin_topup', {
      p_user: user_id,
      p_amount: amount,
      p_note: note,
    });

    if (error) {
      const msg = (error as any)?.message?.toLowerCase?.() ?? '';
      if (msg.includes('forbidden') || msg.includes('permission')) {
        return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
      }
      return NextResponse.json({ ok: false, error: 'rpc_failed', meta: error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, result: data ?? true });
  } catch (e: any) {
    console.error('/api/admin/credits POST error:', e?.message || e, e?.stack);
    const code = e?.status ?? 500;
    return NextResponse.json({ ok: false, error: e?.message ?? 'INTERNAL' }, { status: code });
  }
}

/** PATCH /api/admin/credits
 * ตั้ง quota/แผนเครดิต
 * body: { user_id: string, daily_quota?: number, monthly_quota?: number }
 */
export async function PATCH(req: Request) {
  try {
    await ensureAdmin(req);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // ignore
    }

    const user_id = body?.user_id as string | undefined;
    const daily_quota =
      typeof body?.daily_quota === 'number' ? (body.daily_quota as number) : undefined;
    const monthly_quota =
      typeof body?.monthly_quota === 'number' ? (body.monthly_quota as number) : undefined;

    if (!user_id) {
      return NextResponse.json({ ok: false, error: 'invalid_payload: require { user_id }' }, { status: 400 });
    }
    if (daily_quota === undefined && monthly_quota === undefined) {
      return NextResponse.json(
        { ok: false, error: 'nothing_to_update: include daily_quota or monthly_quota' },
        { status: 400 },
      );
    }

    const payload: Record<string, any> = { user_id };
    if (daily_quota !== undefined) payload.daily_quota = daily_quota;
    if (monthly_quota !== undefined) payload.monthly_quota = monthly_quota;

    const { data, error } = await supaAdmin
      .from('credit_accounts')
      .upsert(payload, { onConflict: 'user_id' })
      .select('user_id, daily_quota, monthly_quota, carry_balance, next_reset_at, plan, updated_at')
      .single();

    if (error) {
      console.error('upsert credit_accounts error:', error);
      return NextResponse.json({ ok: false, error: 'failed_to_update_credit_account' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, account: data });
  } catch (e: any) {
    console.error('/api/admin/credits PATCH error:', e?.message || e, e?.stack);
    const code = e?.status ?? 500;
    return NextResponse.json({ ok: false, error: e?.message ?? 'INTERNAL' }, { status: code });
  }
}
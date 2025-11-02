export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { assertAdmin, supaAdmin } from '@/lib/supabaseAdmin';

/**
 * Ensure requester is an admin.
 * - Uses Authorization header validated by assertAdmin()
 * - Returns 401/403 instead of throwing generic errors
 */
async function ensureAdmin(req: Request) {
  const authz = req.headers.get('authorization') || undefined;
  if (!authz) {
    const err: any = new Error('NO_AUTH');
    err.status = 401;
    throw err;
  }
  try {
    await assertAdmin(authz);
  } catch (e: any) {
    // Normalize all auth failures to 401/403 so the UI doesn't see 500
    const err: any = new Error(e?.message === 'FORBIDDEN' ? 'FORBIDDEN' : 'BAD_AUTH');
    err.status = e?.message === 'FORBIDDEN' ? 403 : 401;
    throw err;
  }
}

function corsHeaders() {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  };
}

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { headers: corsHeaders() });
}

export async function GET(req: Request) {
  try {
    await ensureAdmin(req);

    // Use canonical admin view so UI matches Supabase exactly
    const { data: vrows, error: vErr } = await supaAdmin
      .from('v_admin_members')
      .select(`
        user_id,
        email,
        display_name,
        role,
        status,
        created_at,
        credits_remaining,
        tarot,
        natal,
        palm
      `)
      .order('created_at', { ascending: false });

    if (vErr) {
      // Surface the underlying DB error in logs and return a typed message
      console.error('/api/admin/members supabase error:', vErr);
      const err: any = new Error('DB_ERROR');
      err.status = 500;
      throw err;
    }

    // Normalize for the admin UI (ensure primitives / fallbacks)
    const rows = (vrows ?? []).map((r: any) => ({
      user_id: r.user_id,
      email: r.email ?? '-',
      display_name: r.display_name ?? '',
      role: r.role ?? 'member',
      status: r.status ?? 'inactive',
      // carry_balance in UI = credits_remaining from view
      carry_balance: Number(r.credits_remaining ?? 0),
      tarot: !!r.tarot,
      natal: !!r.natal,
      palm: !!r.palm,
    }));

    return NextResponse.json(
      { ok: true, rows },
      { headers: corsHeaders() }
    );
  } catch (e: any) {
    console.error('/api/admin/members error:', e?.message || e, e?.stack);
    const code =
      e?.status ??
      (e?.message === 'NO_AUTH' || e?.message === 'BAD_AUTH'
        ? 401
        : e?.message === 'FORBIDDEN'
        ? 403
        : 500);
    return NextResponse.json({ ok: false, error: e?.message ?? 'INTERNAL' }, { status: code, headers: corsHeaders() });
  }
}
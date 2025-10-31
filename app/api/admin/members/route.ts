export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { assertAdmin, supaAdmin } from '@/lib/supabaseAdmin';

/**
 * Ensure requester is an admin.
 * - Uses Authorization header validated by assertAdmin()
 * - Throws NO_AUTH when header/token is missing or invalid
 */
async function ensureAdmin(req: Request) {
  const authz = req.headers.get('authorization') || undefined;
  if (!authz) {
    const err: any = new Error('NO_AUTH');
    err.status = 401;
    throw err;
  }
  await assertAdmin(authz);
}

export async function GET(req: Request) {
  try {
    await ensureAdmin(req);

    const { data, error } = await supaAdmin
      .from('v_admin_members')
      .select(
        'user_id, email, display_name, role, status, tarot, natal, palm, carry_balance'
      )
      .order('display_name', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ rows: data ?? [] });
  } catch (e: any) {
    console.error('/api/admin/members error:', e?.message || e, e?.stack);
    const code =
      e?.status ??
      (e?.message === 'NO_AUTH' || e?.message === 'BAD_AUTH'
        ? 401
        : e?.message === 'FORBIDDEN'
        ? 403
        : 500);
    return NextResponse.json({ error: e?.message ?? 'INTERNAL' }, { status: code });
  }
}
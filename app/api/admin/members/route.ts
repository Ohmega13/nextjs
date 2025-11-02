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

    // Query canonical members directly from profiles + joined credit_accounts
    const { data, error } = await supaAdmin
      .from('profiles')
      .select(`
        user_id,
        email,
        display_name,
        role,
        status,
        permissions,
        credit_accounts(balance)
      `)
      .order('display_name', { ascending: true });

    if (error) throw error;

    // Normalize to the shape the admin UI expects
    const rows = (data ?? []).map((row: any) => {
      const perms = row?.permissions ?? {};
      const toBool = (v: any) =>
        typeof v === 'boolean' ? v : (typeof v === 'string' ? v.toLowerCase() === 'true' : !!v);
      const balance =
        (Array.isArray(row?.credit_accounts) && row.credit_accounts[0]?.balance) ?? 0;

      return {
        user_id: row.user_id,
        email: row.email ?? '-',
        display_name: row.display_name ?? '',
        role: row.role ?? 'member',
        status: row.status ?? 'inactive',
        tarot: toBool(perms?.tarot),
        natal: toBool(perms?.natal),
        palm: toBool(perms?.palm),
        carry_balance: balance,
      };
    }).sort((a: any, b: any) => (a.display_name || '').localeCompare(b.display_name || ''));

    return NextResponse.json({ rows });
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
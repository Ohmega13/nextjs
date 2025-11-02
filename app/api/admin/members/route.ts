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

    // 1) Pull canonical user rows from profiles + joined credit_accounts
    const { data: profileRows, error: profileErr } = await supaAdmin
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

    if (profileErr) throw profileErr;

    // Collect user_ids for a single batched permissions query
    const userIds = (profileRows ?? []).map((r: any) => r.user_id).filter(Boolean);

    // 2) Pull row‑level overrides from permissions table (if present)
    //    Expected schema: permissions(user_id uuid, feature text, allowed boolean)
    let permsByUser: Record<string, Record<string, boolean>> = {};
    if (userIds.length) {
      const { data: permRows, error: permErr } = await supaAdmin
        .from('permissions')
        .select('user_id, feature, allowed')
        .in('user_id', userIds);

      if (permErr?.code !== 'PGRST116') { // ignore "relation not found" cases
        if (permErr) throw permErr;
      }

      for (const p of permRows ?? []) {
        if (!permsByUser[p.user_id]) permsByUser[p.user_id] = {};
        // normalize feature keys to lower-case simple names
        const key = String(p.feature || '').toLowerCase();
        if (key) permsByUser[p.user_id][key] = !!p.allowed;
      }
    }

    const toBool = (v: any) =>
      typeof v === 'boolean'
        ? v
        : typeof v === 'string'
        ? v.toLowerCase() === 'true'
        : !!v;

    // 3) Normalize for the admin UI
    const rows = (profileRows ?? [])
      .map((row: any) => {
        // base permissions from profiles.permissions JSONB
        const basePerms = (row?.permissions && typeof row.permissions === 'object')
          ? row.permissions
          : {};

        // overlay any rows from the permissions table
        const overlay = permsByUser[row.user_id] || {};
        const mergedPerms = {
          tarot: overlay.tarot ?? toBool((basePerms as any).tarot),
          natal: overlay.natal ?? toBool((basePerms as any).natal),
          palm:  overlay.palm  ?? toBool((basePerms as any).palm),
        };

        const balance =
          (Array.isArray(row?.credit_accounts) && row.credit_accounts[0]?.balance) ?? 0;

        return {
          user_id: row.user_id,
          email: row.email ?? '-',
          display_name: row.display_name ?? '',
          role: row.role ?? 'member',
          status: row.status ?? 'inactive',
          tarot: !!mergedPerms.tarot,
          natal: !!mergedPerms.natal,
          palm:  !!mergedPerms.palm,
          carry_balance: balance,
        };
      })
      .sort((a: any, b: any) => (a.display_name || '').localeCompare(b.display_name || ''));

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
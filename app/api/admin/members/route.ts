export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { assertAdmin, supaAdmin } from '@/lib/supabaseAdmin';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Ensure requester is an admin.
 * - First, try NextAuth session (cookie-based) with user.role === 'admin'
 * - Fallback: Authorization header checked by assertAdmin()
 * - Otherwise, throw NO_AUTH
 */
async function ensureAdmin(req: Request) {
  // 1) Try NextAuth session (works when calling from a logged-in browser page)
  try {
    const session = await getServerSession(authOptions as any);
    const isAdmin =
      (session as any)?.user?.role === 'admin' || (session as any)?.user?.isAdmin === true;
    if (session && isAdmin) return;
  } catch (_e) {
    // ignore and fallback to Authorization header
  }

  // 2) Fallback: Authorization header (works for server-to-server or tools like Postman)
  const authz = req.headers.get('authorization') || undefined;
  if (authz) {
    await assertAdmin(authz);
    return;
  }

  // 3) No valid auth found
  const err: any = new Error('NO_AUTH');
  err.status = 401;
  throw err;
}

export async function GET(req: Request) {
  try {
    await ensureAdmin(req);

    // อ่านจาก view เดียวที่รวมข้อมูลแล้ว
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
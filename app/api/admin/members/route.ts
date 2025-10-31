export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { assertAdmin, supaAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: Request) {
  try {
    const authz = req.headers.get('authorization') || undefined;
    await assertAdmin(authz); // ตรวจสิทธิ์เฉพาะแอดมิน

    // อ่านจาก view เดียวที่รวมข้อมูลแล้ว
    const { data, error } = await supaAdmin
      .from('v_admin_members')
      .select('user_id, email, display_name, role, status, tarot, natal, palm, carry_balance')
      .order('display_name', { ascending: true, nullsFirst: true });

    if (error) throw error;

    return NextResponse.json({ rows: data ?? [] });
  } catch (e: any) {
    console.error('/api/admin/members error:', e?.message || e);
    const code =
      e?.message === 'NO_AUTH' || e?.message === 'BAD_AUTH' ? 401 :
      e?.message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: e?.message ?? 'INTERNAL' }, { status: code });
  }
}
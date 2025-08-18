export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { assertAdmin, supaAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: Request) {
  try {
    const authz = req.headers.get('authorization') || undefined;
    await assertAdmin(authz); // ถ้าไม่ใช่แอดมินจะ throw

    // 1) ดึง users ทั้งหมดจาก auth (แบ่งหน้า)
    let page = 1;
    const allUsers: Array<{ id: string; email: string | null; user_metadata?: any }> = [];
    for (let i = 0; i < 10; i++) {
      const res = await supaAdmin.auth.admin.listUsers({ page, perPage: 100 });
      if (res.error) throw res.error;
      allUsers.push(...res.data.users.map(u => ({ id: u.id, email: u.email ?? null, user_metadata: u.user_metadata })));
      if (res.data.users.length < 100) break;
      page++;
    }

    // 2) ดึง profiles ที่มีอยู่จริงทั้งหมดครั้งเดียว
    const { data: profData, error: profErr } = await supaAdmin
      .from('profiles')
      .select('user_id, role, status, display_name, permissions');
    if (profErr) throw profErr;

    const profMap = new Map(
      (profData ?? []).map(p => [p.user_id, p as {
        user_id: string;
        role: string | null;
        status: string | null;
        display_name: string | null;
        permissions?: Record<string, boolean> | null;
      }])
    );

    // 3) รวมข้อมูล: ถ้าไม่มีโปรไฟล์ ให้ใส่ค่า default เพื่อให้ admin เห็นและจัดสิทธิ์ได้
    const rows = allUsers.map(u => {
      const p = profMap.get(u.id);
      return {
        user_id: u.id,
        email: u.email ?? '',
        role: p?.role ?? 'member',
        status: p?.status ?? 'active',
        display_name: p?.display_name ?? (u.user_metadata?.full_name || u.user_metadata?.name || u.email || null),
        permissions: p?.permissions ?? {}
      };
    });

    // จัดเรียงให้อ่านง่าย
    rows.sort((a, b) => (a.email || '').localeCompare(b.email || ''));

    return NextResponse.json({ rows });
  } catch (e: any) {
    console.error('/api/admin/members error:', e?.message || e);
    const code =
      e?.message === 'NO_AUTH' || e?.message === 'BAD_AUTH' ? 401 :
      e?.message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: e?.message ?? 'INTERNAL' }, { status: code });
  }
}
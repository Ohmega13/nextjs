// app/api/admin/members/permissions/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { assertAdmin, supaAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: Request) {
  try {
    const authz = req.headers.get('authorization') || undefined;
    await assertAdmin(authz); // ถ้าไม่ใช่ admin จะ throw

    const { user_id, key, value } = await req.json();

    if (!user_id || !key || typeof value !== 'boolean') {
      return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
    }

    // 1) พยายามใช้ RPC ก่อน (เร็วและ atomic)
    const rpcRes = await supaAdmin.rpc('update_permission', {
      uid: user_id,
      perm_key: key,
      perm_value: value,
    });

    if (rpcRes.error && rpcRes.error.code !== '42883') {
      // มีฟังก์ชันแต่ error อื่น
      throw rpcRes.error;
    }

    if (!rpcRes.error) {
      return NextResponse.json({ ok: true });
    }

    // 2) Fallback: ถ้าไม่มีฟังก์ชัน (code 42883) ให้ทำแบบดึง-รวม-อัปเดต
    const { data: row, error: selErr } = await supaAdmin
      .from('profiles')
      .select('permissions')
      .eq('user_id', user_id)
      .single();

    if (selErr) throw selErr;

    const current = (row?.permissions ?? {}) as Record<string, boolean>;
    const next = { ...current, [key]: value };

    const { error: updErr } = await supaAdmin
      .from('profiles')
      .update({ permissions: next })
      .eq('user_id', user_id);

    if (updErr) throw updErr;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('/api/admin/members/permissions error:', e?.message || e);
    const code =
      e?.message === 'NO_AUTH' || e?.message === 'BAD_AUTH' ? 401 :
      e?.message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: e?.message ?? 'INTERNAL' }, { status: code });
  }
}
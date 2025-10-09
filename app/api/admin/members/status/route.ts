// app/api/admin/members/status/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { assertAdmin, supaAdmin } from '@/lib/supabaseAdmin';

const ALLOWED = new Set(['pending', 'active', 'suspended'] as const);
type Status = 'pending' | 'active' | 'suspended';

export async function POST(req: Request) {
  try {
    const authz = req.headers.get('authorization') || undefined;
    await assertAdmin(authz); // ไม่ใช่แอดมินจะ throw

    const { user_id, status } = (await req.json()) as {
      user_id?: string;
      status?: Status;
    };

    if (!user_id || !status || !ALLOWED.has(status)) {
      return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
    }

    const { error } = await supaAdmin
      .from('profiles')
      .update({ status })
      .eq('user_id', user_id);

    if (error) {
      console.error('update status error:', error);
      return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message ?? 'INTERNAL';
    const code =
      msg === 'NO_AUTH' || msg === 'BAD_AUTH' ? 401 :
      msg === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}
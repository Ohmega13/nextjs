import { NextResponse } from 'next/server';
import { assertAdmin, supaAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: Request) {
  try {
    const authz = req.headers.get('authorization') || undefined;
    await assertAdmin(authz);

    const { user_id, key, value } = await req.json() as {
      user_id: string; key: string; value: boolean;
    };
    if (!user_id || !key || typeof value !== 'boolean') {
      return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
    }

    const { error } = await supaAdmin
      .from('profiles')
      .update({
        permissions: (supaAdmin as any).rpc
          ? undefined
          : undefined
      })
      .eq('user_id', user_id);

    // ใช้ raw SQL เพื่อ merge jsonb ให้ชัวร์
    if (!error) {
      const { error: updErr } = await supaAdmin.rpc('exec_sql', {
        q: `
          update public.profiles
          set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object($$${key}$$, ${value})
          where user_id = $$${user_id}$$::uuid;
        `
      } as any);
      if (updErr) throw updErr;
    } else {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('/api/admin/members/permissions error:', e?.message || e);
    const code =
      e?.message === 'NO_AUTH' || e?.message === 'BAD_AUTH' ? 401 :
      e?.message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: e?.message ?? 'INTERNAL' }, { status: code });
  }
}
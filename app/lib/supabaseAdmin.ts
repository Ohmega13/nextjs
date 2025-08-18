// lib/supabaseAdmin.ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supaAdmin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

/**
 * ตรวจว่า JWT (จาก Header Authorization) เป็นผู้ใช้ที่ role = 'admin'
 * คืน { supa: supaAdmin, user }
 */
export async function assertAdmin(authz?: string) {
  const token = authz?.startsWith('Bearer ') ? authz.slice(7) : undefined;
  if (!token) throw new Error('NO_AUTH');

  const { data: { user }, error } = await supaAdmin.auth.getUser(token);
  if (error || !user) throw new Error('BAD_AUTH');

  const { data: prof, error: pErr } = await supaAdmin
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (pErr) throw pErr;
  if (prof?.role !== 'admin') throw new Error('FORBIDDEN');

  return { supa: supaAdmin, user };
}
// app/lib/clients.ts
export type ClientRow = {
  id: string;               // ใช้ user_id เป็น id
  full_name: string;
  dob_date: string | null;
  dob_time: string | null;
  birth_place: string | null;
  email: string | null;
  phone: string | null;
};

import { supabase } from '@/lib/supabaseClient';

export async function loadClients(userId: string, role: string): Promise<ClientRow[]> {
  try {
    // ฟิลด์ที่เรามีจริงใน profile_details: user_id, first_name, last_name, dob, birth_time, birth_place
    const base = supabase
      .from('profile_details')
      .select('user_id, first_name, last_name, dob, birth_time, birth_place');

    const { data, error } =
      role === 'admin'
        ? await base.order('dob', { ascending: false })              // แอดมินเห็นทุกคน
        : await base.eq('user_id', userId).order('dob', { ascending: false }); // เมมเบอร์เห็นของตัวเอง

    if (error) {
      console.error('loadClients error:', error);
      return [];
    }

    return (data ?? []).map((r: any) => ({
      id: r.user_id, // ใช้ user_id เป็นตัวเลือก client
      full_name: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || '(ไม่ระบุชื่อ)',
      dob_date: r.dob ?? null,
      dob_time: r.birth_time ?? null,
      birth_place: r.birth_place ?? null,
      email: null,
      phone: null,
    }));
  } catch (err) {
    console.error('loadClients error:', err);
    return [];
  }
}
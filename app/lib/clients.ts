// app/lib/clients.ts
export type ClientRow = {
  id: string;                 // ใช้ user_id เป็น id
  full_name: string;          // รวม first_name + last_name
  dob_date: string | null;    // มาจาก dob (date)
  dob_time: string | null;    // birth_time
  birth_place: string | null; // birth_place
  contact: string | null;     // contact (ยังไม่มีใน profile_details -> คืนค่า null)
};

import { supabase } from '@/lib/supabaseClient';

// หมายเหตุ: ตาราง profile_details ไม่มีคอลัมน์ contact
// ถ้าต้องการ shape เดิม ให้คืนค่า NULL::text เป็น contact ชั่วคราว
const baseSelect =
  `user_id as id,
   (coalesce(first_name,'') || case
       when last_name is null or last_name = '' then ''
       else ' ' || last_name
    end) as full_name,
   dob as dob_date,
   birth_time as dob_time,
   birth_place,
   NULL::text as contact`;

export async function loadClients(userId: string, role: string): Promise<ClientRow[]> {
  try {
    // แอดมินเห็นทั้งหมด
    if (role === 'admin') {
      const { data, error } = await supabase
        .from('profile_details')
        .select(baseSelect)
        .returns<ClientRow[]>()
        .order('dob', { ascending: false }); // จะเปลี่ยนเป็น created_at ก็ได้ถ้ามี
      if (error) {
        console.error('loadClients(admin) error:', error);
        return [];
      }
      return data ?? [];
    }

    // สมาชิก เห็นเฉพาะของตนเอง
    const { data, error } = await supabase
      .from('profile_details')
      .select(baseSelect)
      .returns<ClientRow[]>()
      .eq('user_id', userId)
      .order('dob', { ascending: false });
    if (error) {
      console.error('loadClients(member) error:', error);
      return [];
    }
    return data ?? [];
  } catch (e) {
    console.error('loadClients exception:', e);
    return [];
  }
}
export type ClientRow = {
  id: string;
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
    if (role === 'admin') {
      const { data, error } = await supabase
        .from('clients')
        .select('id, full_name, dob_date, dob_time, birth_place, email, phone')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('loadClients error:', error);
        return [];
      }
      return (data ?? []) as ClientRow[];
    }

    const { data, error } = await supabase
      .from('clients')
      .select('id, full_name, dob_date, dob_time, birth_place, email, phone')
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('loadClients error:', error);
      return [];
    }
    return (data ?? []) as ClientRow[];
  } catch (error) {
    console.error('loadClients error:', error);
    return [];
  }
}
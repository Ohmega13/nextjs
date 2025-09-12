'use client';

import { supabase } from '@/lib/supabaseClient';
type ProfileDetail = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  dob: string | null;
  birth_time: string | null;
  birth_place: string | null;
};

export async function fetchClientOptions() {
  const { data, error } = await supabase
    .from('profile_details')
    .select('user_id, first_name, last_name, phone, dob, birth_time, birth_place')
    .order('dob', { ascending: false });

  if (error) {
    console.error('Error fetching profile_details:', error);
    return [];
  }

  const options =
    data?.map((d: ProfileDetail) => ({
      id: d.user_id,
      label: [d.first_name ?? '', d.last_name ?? ''].filter(Boolean).join(' ') || d.phone || '—',
      raw: d,
    })) ?? [];

  return options;
}
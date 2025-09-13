// app/lib/profile.ts
import { supabase } from '@/lib/supabaseClient';

export type ProfileRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  dob: string | null;         // ISO date
  birth_time: string | null;
  birth_place: string | null;
  phone: string | null;
};

export async function getCurrentUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('ยังไม่ล็อกอิน');
  return user.id;
}

export async function getMyProfileDetails() {
  const uid = await getCurrentUserId();
  return getProfileDetailsByUserId(uid);
}

export async function getProfileDetailsByUserId(userId: string) {
  const { data, error } = await supabase
    .from('profile_details')
    .select('user_id, first_name, last_name, dob, birth_time, birth_place, phone')
    .eq('user_id', userId)
    .maybeSingle<ProfileRow>();

  if (error) throw error;
  return data || null;
}

export async function getPalmSignedUrls(userId: string) {
  const bucket = supabase.storage.from('palm_images');
  const leftPath = `${userId}/left.jpg`;
  const rightPath = `${userId}/right.jpg`;

  const [left, right] = await Promise.all([
    bucket.createSignedUrl(leftPath, 60 * 10),   // 10 นาที
    bucket.createSignedUrl(rightPath, 60 * 10),
  ]);

  return {
    leftUrl: left.data?.signedUrl ?? null,
    rightUrl: right.data?.signedUrl ?? null,
  };
}
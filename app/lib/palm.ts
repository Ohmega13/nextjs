import { supabase } from '@/lib/supabaseClient';

export async function uploadPalmImage(userId: string, file: File) {
  const filePath = `${userId}/${Date.now()}_${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from('palm_images')
    .upload(filePath, file);
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('palm_images_meta')
    .insert([{ user_id: userId, path: filePath }])
    .select()
    .single();
  if (error) throw error;

  return data;
}
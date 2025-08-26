import { supabase } from '@/lib/supabaseClient';

export async function loadHistory(userId: string, role: string) {
  if (role === 'admin') {
    const { data, error } = await supabase
      .from('readings')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  const { data, error } = await supabase
    .from('readings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
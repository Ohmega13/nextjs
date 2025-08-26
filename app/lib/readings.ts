import { supabase } from '@/lib/supabaseClient';

export type ReadingMode = 'tarot' | 'natal' | 'palm';

/**
 * Insert a reading row for the current user.
 * `meta.topic` maps to the `topic` column, and `meta.clientId` maps to `client_id`.
 */
export async function saveReading(
  userId: string,
  mode: ReadingMode,
  payload: any,
  meta?: { topic?: string; clientId?: string | null }
) {
  const row = {
    user_id: userId,
    client_id: meta?.clientId ?? null,
    mode,
    topic: meta?.topic ?? null,
    payload,
  } as const;

  const { data, error } = await supabase
    .from('readings')
    .insert(row)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Load readings. Admin sees everything, member only sees own rows.
 */
export async function loadHistory(userId: string, role: 'admin' | 'member') {
  let query = supabase
    .from('readings')
    .select('*')
    .order('created_at', { ascending: false });

  if (role !== 'admin') {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
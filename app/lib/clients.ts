// app/lib/clients.ts
export type ClientRow = {
  id: string;
  full_name: string;
  dob_date: string | null;
  dob_time: string | null;
  birth_place: string | null;
  contact: string | null;
};

import { supabase } from '@/lib/supabaseClient';

// NOTE: use raw column names in ORDER BY to avoid alias issues
const baseSelect = `
  user_id as id,
  (coalesce(first_name,'') || case
     when last_name is null or last_name = '' then ''
     else ' ' || last_name
  end) as full_name,
  dob as dob_date,
  birth_time as dob_time,
  birth_place,
  contact
`;

/**
 * Load client choices from profile_details
 * - admin  -> see all rows
 * - others -> only own rows
 */
export async function loadClients(userId: string, role: string): Promise<ClientRow[]> {
  try {
    const normalizedRole = (role || '').toLowerCase();

    // Guard: if not admin and no user id, nothing to load
    if (normalizedRole !== 'admin' && !userId) return [];

    // Build base query
    let query = supabase
      .from('profile_details')
      .select(baseSelect) as any;

    if (normalizedRole !== 'admin') {
      // member/other: only own rows
      query = query.eq('user_id', userId);
    }

    // Prefer recent birthdays first, stable secondary sort by full_name
    const { data, error } = await query
      .order('dob', { ascending: false, nullsFirst: false })
      .order('first_name', { ascending: true })
      .limit(500);

    if (error) {
      console.error('loadClients error:', error);
      return [];
    }

    return (data ?? []) as ClientRow[];
  } catch (e) {
    console.error('loadClients exception:', e);
    return [];
  }
}

/**
 * Load the current user's own profile_details as a single ClientRow.
 * Used for member flow on the reading page (no client selector).
 */
export async function loadSelfProfile(userId: string): Promise<ClientRow | null> {
  try {
    if (!userId) return null;

    const { data, error } = await (supabase
      .from('profile_details')
      .select(baseSelect) as any)
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('loadSelfProfile error:', error);
      return null;
    }
    return (data as ClientRow) ?? null;
  } catch (e) {
    console.error('loadSelfProfile exception:', e);
    return null;
  }
}
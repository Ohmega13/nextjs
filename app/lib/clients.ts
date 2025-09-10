// app/lib/clients.ts
export type ClientRow = {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  dob: string | null;
  birth_time: string | null;
  birth_place: string | null;
  contact: string | null;
  nickname: string | null;
  full_name: string;
};

import { supabase } from '@/lib/supabaseClient';

// Use raw column names in ORDER BY to avoid alias issues
const baseSelect = `
  user_id as id,
  user_id,
  first_name,
  last_name,
  dob,
  birth_time,
  birth_place,
  phone as contact,
  NULL::text as nickname,
  (
    COALESCE(first_name, '') ||
    CASE
      WHEN COALESCE(first_name, '') = '' OR COALESCE(last_name, '') = '' THEN ''
      ELSE ' '
    END ||
    COALESCE(last_name, '')
  ) as full_name
`;

/**
 * Helper: get current authed user and role from `profiles`.
 */
export async function getUserAndRole() {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user || null;
  let role: string | null = null;
  if (user) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();
    role = (prof as any)?.role ?? null;
  }
  return { user, role };
}

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

    // Prefer recent birthdays first, stable secondary sort by first_name
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
 * Load a single client/profile_details row by user_id.
 */
export async function loadClientById(targetUserId: string): Promise<ClientRow | null> {
  try {
    if (!targetUserId) return null;
    const { data, error } = await (supabase
      .from('profile_details')
      .select(baseSelect) as any)
      .eq('user_id', targetUserId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('loadClientById error:', error);
      return null;
    }
    return (data as ClientRow) ?? null;
  } catch (e) {
    console.error('loadClientById exception:', e);
    return null;
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
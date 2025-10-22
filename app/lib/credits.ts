export async function useCredit(supabase, userId: string, feature: string, cost: number, readingId?: string) {
  const { data, error } = await supabase.rpc('sp_use_credit', {
    p_user: userId,
    p_feature: feature,
    p_cost: cost,
    p_reading: readingId ?? null,
  });
  if (error || !data) throw new Error('INSUFFICIENT_CREDITS');
  return true;
}
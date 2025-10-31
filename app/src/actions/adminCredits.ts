'use server';

/**
 * Server-side helpers to load credit balances for the Admin UI.
 * เรียก API ฝั่งเซิร์ฟเวอร์ครั้งเดียวแล้วคืนเป็น object (serialize ได้) แทนการยิงต่อแถว
 */

const BASE =
  process.env.NEXT_PUBLIC_BASE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

type CreditListJson = {
  ok?: boolean;
  items?: Array<{
    user_id: string;
    carry_balance?: number | null;
    balance?: number | null;
  }>;
};

type CreditOneJson = {
  user_id: string;
  carry_balance?: number | null;
  balance?: number | null;
};

function pickBalance(v: any): number {
  const n = Number(v?.carry_balance ?? v?.balance ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** ดึงเครดิตทั้งหมดครั้งเดียว คืนเป็น map แบบ object: { [user_id]: balance } */
export async function loadAllCredits(): Promise<Record<string, number>> {
  const url = `${BASE}/api/admin/credits`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`loadAllCredits failed: ${res.status}`);

  const json = (await res.json()) as CreditListJson;

  const map: Record<string, number> = {};
  for (const row of json?.items ?? []) {
    map[row.user_id] = pickBalance(row);
  }
  return map;
}

/** ดึงเครดิตรายคน */
export async function loadCreditByUser(userId: string): Promise<number> {
  const url = `${BASE}/api/admin/credits?user_id=${encodeURIComponent(userId)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`loadCreditByUser(${userId}) failed: ${res.status}`);

  const json = (await res.json()) as CreditOneJson;
  return pickBalance(json);
}
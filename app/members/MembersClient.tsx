'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import MembersTable, { Row as MembersRow } from './members-table';

/**
 * Coerce various truthy/falsy representations from Supabase into boolean
 */
function coerceBool(v: any): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === 't' || s === '1' || s === 'yes' || s === 'y') return true;
    if (s === 'false' || s === 'f' || s === '0' || s === 'no' || s === 'n') return false;
  }
  return !!v;
}

/**
 * Try to extract a permission from multiple possible column names
 * (tarot, can_tarot, allow_tarot, is_tarot_enabled, etc.)
 */
function pickPerm(src: any, base: 'tarot' | 'natal' | 'palm'): boolean | undefined {
  if (!src || typeof src !== 'object') return undefined;
  const keys = [
    base,
    `can_${base}`,
    `allow_${base}`,
    `is_${base}_enabled`,
    `${base}_enabled`,
    `${base}_allow`,
    `${base}_allowed`,
  ];
  for (const k of keys) {
    if (k in src) return coerceBool(src[k]);
  }
  return undefined;
}

/**
 * Extract array of rows from various payload shapes
 * - [], {rows: []}, {data: []}, {items: []}, {result: {rows: []}}
 */
function extractRows(payload: any): any[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.items)) return payload.items;
  if (payload.result && Array.isArray(payload.result.rows)) return payload.result.rows;
  return [];
}

export default function MembersClient() {
  const [rows, setRows] = useState<MembersRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    setErr(null);

    // ใช้ Bearer token สำหรับ endpoint admin
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? '';

    const res = await fetch('/api/admin/members', {
      method: 'GET',
      cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!res.ok) {
      setErr(`โหลดข้อมูลสมาชิก/เครดิตล้มเหลว (${res.status})`);
      setRows([]);
      setLoading(false);
      return;
    }

    const data = await res.json();
    // รองรับได้หลายรูปแบบ: [], {rows: []}, {data: []}, {items: []}, {result:{rows:[]}}
    const list: any[] = extractRows(data);

    const mappedRows: MembersRow[] = list.map((item: any) => {
      // รองรับทั้งโครงจาก view v_admin_members และโครงเก่าที่แนบซ้อน profile/account
      const p = item.profile ?? {};
      const a = item.account ?? {};
      const permsObj = item.permissions ?? item.perms ?? item.permission ?? {};

      const user_id: string = item.user_id ?? p.user_id ?? a.user_id ?? '';
      const email: string = item.email ?? p.email ?? '-';
      const display_name: string | null = item.display_name ?? p.display_name ?? null;
      const role: 'admin' | 'member' = (item.role ?? p.role ?? 'member') as any;
      const status: 'pending' | 'active' | 'suspended' = (item.status ?? p.status ?? 'active') as any;
      const plan: string = item.plan ?? a.plan ?? 'prepaid';

      const tarotFlag = item.tarot !== undefined ? coerceBool(item.tarot) : (pickPerm(permsObj, 'tarot') ?? coerceBool(permsObj?.tarot));
      const natalFlag = item.natal !== undefined ? coerceBool(item.natal) : (pickPerm(permsObj, 'natal') ?? coerceBool(permsObj?.natal));
      const palmFlag  = item.palm  !== undefined ? coerceBool(item.palm)  : (pickPerm(permsObj, 'palm')  ?? coerceBool(permsObj?.palm));

      // เครดิตจากคอลัมน์รวมใน view (credits_remaining) หรือชื่อเก่า ๆ
      const credit_balance =
        Number(
          item.credits_remaining ??
          item.credit_balance ??
          item.balance ??
          a.carry_balance ?? a.balance ?? a.credit_balance ??
          0
        ) || 0;

      return {
        user_id,
        email,
        display_name,
        role,
        status,
        tarot: tarotFlag,
        natal: natalFlag,
        palm: palmFlag,
        credit_balance,
        balance: credit_balance,
        carry_balance: credit_balance,
        plan,
      };
    });

    setRows(mappedRows);
    setLoading(false);
  };

  useEffect(() => {
    let ignore = false;

    fetchRows();

    // subscribe เมื่อ auth state เปลี่ยน
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      if (!ignore) fetchRows();
    });

    return () => {
      ignore = true;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const toggle = async (r: MembersRow, key: 'tarot' | 'natal' | 'palm', next: boolean) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    // optimistic update (update ทั้ง permissions และ flatten field เผื่อ table อ่านตรง)
    setRows(prev =>
      prev.map(x =>
        x.user_id === r.user_id
          ? { ...x, [key]: next as any }
          : x
      )
    );

    const res = await fetch('/api/admin/members/permissions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: r.user_id, key, value: next }),
    });

    if (!res.ok) {
      // rollback ถ้า error
      setRows(prev =>
        prev.map(x =>
          x.user_id === r.user_id
            ? { ...x, [key]: !next as any }
            : x
        )
      );
      alert('บันทึกสิทธิ์ไม่สำเร็จ');
    }
  };

  const topup = async (r: MembersRow, amount: number, note?: string) => {
    if (!Number.isFinite(amount) || amount === 0) return;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      alert('กรุณาเข้าสู่ระบบก่อน');
      return;
    }
    const res = await fetch('/api/admin/credits', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: r.user_id,
        amount,
        note: note ?? 'admin topup',
      }),
    });
    if (!res.ok) {
      let msg = 'เติมเครดิตไม่สำเร็จ';
      try {
        const errBody = await res.json();
        const { message, error, details, hint, code, status, meta } = errBody || {};
        const m =
          message ||
          error ||
          meta?.message ||
          meta?.error ||
          (typeof errBody === 'string' ? errBody : null);
        const extra = [code || status, details, hint].filter(Boolean).join(' | ');
        msg = [m || msg, extra].filter(Boolean).join('\n');
        console.error('admin topup failed', res.status, errBody);
      } catch {
        const errTxt = await res.text().catch(() => '');
        if (errTxt) msg = `เติมเครดิตไม่สำเร็จ\n${errTxt}`;
        console.error('admin topup failed (text)', res.status, errTxt);
      }
      alert(msg);
      return;
    }
    await fetchRows();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">สมาชิก / สิทธิ์การใช้งาน</h1>

      {loading && <div>กำลังโหลดสมาชิก…</div>}
      {err && (
        <div className="text-red-600">
          {err}{' '}
          <button onClick={fetchRows} className="ml-2 underline text-indigo-600">
            ลองใหม่
          </button>
        </div>
      )}

      {!loading && !err && (
        <MembersTable rows={rows} toggle={toggle} topup={topup} />
      )}

      <p className="text-xs text-slate-500">
        * หน้านี้เข้าถึงได้เฉพาะแอดมิน ระบบตรวจสอบสิทธิ์ทำใน API ฝั่งเซิร์ฟเวอร์
      </p>
    </div>
  );
}
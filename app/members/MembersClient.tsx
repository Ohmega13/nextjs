'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import MembersTable from './members-table';

type Row = {
  user_id: string;
  email: string;
  role: string;
  status: string;
  display_name: string | null;
  permissions: {
    tarot?: boolean;
    natal?: boolean;
    palm?: boolean;
    [k: string]: any;
  };
  credit_balance?: number;
  balance?: number;
  carry_balance?: number;
  plan?: string;
};

export default function MembersClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    setErr(null);

    // ใช้ Bearer token สำหรับ endpoint admin เพื่อเลี่ยง 401
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? '';

    const res = await fetch('/api/admin/credits', {
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

    const mappedRows: Row[] = (data.items || data.data || []).map((item: any) => {
      const p = item.profile ?? {};
      const a = item.account ?? {};
      const perms = item.permissions ?? {};

      const user_id = item.user_id ?? p.user_id ?? a.user_id ?? '';
      const email = p.email ?? item.email ?? '-';
      const display_name = p.display_name ?? item.display_name ?? null;
      const role = p.role ?? item.role ?? 'member';
      const status = p.status ?? item.status ?? 'active';
      const plan = a.plan ?? item.plan ?? 'prepaid';

      const credit_balance =
        Number(
          a.carry_balance ?? a.balance ?? item.carry_balance ?? item.balance ?? 0
        ) || 0;

      return {
        user_id,
        email,
        display_name,
        role,
        status,
        permissions: perms,
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
      sub.subscription.unsubscribe();
    };
  }, []);

  const toggle = async (r: Row, key: 'tarot' | 'natal' | 'palm', next: boolean) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    // optimistic update
    setRows(prev =>
      prev.map(x =>
        x.user_id === r.user_id
          ? { ...x, permissions: { ...x.permissions, [key]: next } }
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
            ? { ...x, permissions: { ...x.permissions, [key]: !next } }
            : x
        )
      );
      alert('บันทึกสิทธิ์ไม่สำเร็จ');
    }
  };

  const topup = async (r: Row, amount: number, note?: string) => {
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
        // รองรับรูปแบบ error จาก API ที่เพิ่มไว้
        const {
          message,
          error,
          details,
          hint,
          code,
          status,
          meta,
        } = errBody || {};
        const m =
          message ||
          error ||
          meta?.message ||
          meta?.error ||
          (typeof errBody === 'string' ? errBody : null);
        const extra =
          [code || status, details, hint]
            .filter(Boolean)
            .join(' | ');
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
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
};

export default function MembersClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    setErr(null);

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setErr('กรุณาเข้าสู่ระบบก่อน');
      setRows([]);
      setLoading(false);
      return;
    }

    const res = await fetch('/api/admin/members', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (!res.ok) {
      setErr(`โหลดข้อมูลล้มเหลว (${res.status})`);
      setRows([]);
      setLoading(false);
      return;
    }

    const data = (await res.json()) as { rows: Row[] };
    setRows(data.rows || []);
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
        <MembersTable rows={rows} toggle={toggle} />
      )}

      <p className="text-xs text-slate-500">
        * หน้านี้เข้าถึงได้เฉพาะแอดมิน ระบบตรวจสอบสิทธิ์ทำใน API ฝั่งเซิร์ฟเวอร์
      </p>
    </div>
  );
}
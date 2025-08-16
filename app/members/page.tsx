// app/members/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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

export default function MembersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    setErr(null);
    const session = (await supabase.auth.getSession()).data.session;
    const token = session?.access_token;
    if (!token) {
      setErr("กรุณาเข้าสู่ระบบก่อน");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/admin/members", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      setErr(`โหลดข้อมูลล้มเหลว (${res.status})`);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setRows(data.rows as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
  }, []);

  const toggle = async (r: Row, key: "tarot" | "natal" | "palm", next: boolean) => {
    const session = (await supabase.auth.getSession()).data.session;
    const token = session?.access_token;
    if (!token) return;

    // optimistic update
    setRows((prev) =>
      prev.map((x) =>
        x.user_id === r.user_id ? { ...x, permissions: { ...x.permissions, [key]: next } } : x
      )
    );

    const res = await fetch("/api/admin/members/permissions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: r.user_id, key, value: next }),
    });
    if (!res.ok) {
      // rollback
      setRows((prev) =>
        prev.map((x) =>
          x.user_id === r.user_id ? { ...x, permissions: { ...x.permissions, [key]: !next } } : x
        )
      );
      alert("บันทึกสิทธิ์ไม่สำเร็จ");
    }
  };

  if (loading) return <div>กำลังโหลดสมาชิก…</div>;
  if (err) return <div className="text-red-600">{err}</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">สมาชิก / สิทธิ์การใช้งาน</h1>

      <div className="rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left">อีเมล</th>
              <th className="px-3 py-2">ชื่อแสดง</th>
              <th className="px-3 py-2">บทบาท</th>
              <th className="px-3 py-2">สถานะ</th>
              <th className="px-3 py-2">Tarot</th>
              <th className="px-3 py-2">พื้นดวง</th>
              <th className="px-3 py-2">ลายมือ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} className="border-t">
                <td className="px-3 py-2">{r.email}</td>
                <td className="px-3 py-2">{r.display_name ?? "-"}</td>
                <td className="px-3 py-2">{r.role}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={!!r.permissions?.tarot}
                    onChange={(e) => toggle(r, "tarot", e.target.checked)}
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={!!r.permissions?.natal}
                    onChange={(e) => toggle(r, "natal", e.target.checked)}
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={!!r.permissions?.palm}
                    onChange={(e) => toggle(r, "palm", e.target.checked)}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
                  ยังไม่มีสมาชิก
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        * หน้านี้เข้าถึงได้เฉพาะแอดมิน ระบบตรวจสอบสิทธิ์ด้วย Service Role API ฝั่งเซิร์ฟเวอร์
      </p>
    </div>
  );
}
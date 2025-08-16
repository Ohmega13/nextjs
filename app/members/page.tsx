// app/members/page.tsx
"use client";

export const dynamic = "force-dynamic"; // กัน Next.js export หน้านี้ทิ้งตอน build

import { useEffect, useState } from "react";
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

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setErr("กรุณาเข้าสู่ระบบก่อน");
      setRows([]);
      setLoading(false);
      return;
    }

    const res = await fetch("/api/admin/members", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
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

    // ถ้าสถานะ auth เปลี่ยน ให้รีเฟรชรายการ
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      if (!ignore) fetchRows();
    });

    return () => {
      ignore = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const toggle = async (
    r: Row,
    key: "tarot" | "natal" | "palm",
    next: boolean
  ) => {
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

    const res = await fetch("/api/admin/members/permissions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
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
      alert("บันทึกสิทธิ์ไม่สำเร็จ");
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">สมาชิก / สิทธิ์การใช้งาน</h1>

      {loading && <div>กำลังโหลดสมาชิก…</div>}
      {err && (
        <div className="text-red-600">
          {err}{" "}
          <button
            onClick={fetchRows}
            className="ml-2 underline text-indigo-600"
          >
            ลองใหม่
          </button>
        </div>
      )}

      {!loading && !err && (
        <div className="rounded-xl border overflow-x-auto">
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
              {rows.map(r => (
                <tr key={r.user_id} className="border-t">
                  <td className="px-3 py-2">{r.email}</td>
                  <td className="px-3 py-2">{r.display_name ?? "-"}</td>
                  <td className="px-3 py-2">{r.role}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!r.permissions?.tarot}
                      onChange={e => toggle(r, "tarot", e.target.checked)}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!r.permissions?.natal}
                      onChange={e => toggle(r, "natal", e.target.checked)}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!r.permissions?.palm}
                      onChange={e => toggle(r, "palm", e.target.checked)}
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
      )}

      <p className="text-xs text-slate-500">
        * หน้านี้เข้าถึงได้เฉพาะแอดมิน ระบบตรวจสอบสิทธิ์ทำใน API ฝั่งเซิร์ฟเวอร์
      </p>
    </div>
  );
}
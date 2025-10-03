"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PermissionGate from "@/components/PermissionGate"; // ถ้าอยากครอบสิทธิ์แบบเดียวกับหน้าอื่น

type Row = {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  message: string;
  created_at: string;
};

export default function AdminFeedbackPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      const { data, error } = await supabase
        .from("feedback")
        .select("id, user_id, name, email, message, created_at")
        .order("created_at", { ascending: false });
      if (error) setErr(error.message);
      setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Feedback จากสมาชิก</h1>

      {err && <div className="p-3 rounded border border-red-300 bg-red-50 text-red-700">{err}</div>}
      {loading ? (
        <div className="text-sm text-slate-500">กำลังโหลด…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-slate-500">ยังไม่มีข้อความ</div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded border p-3">
              <div className="text-xs text-slate-500">
                {new Date(r.created_at).toLocaleString()} {r.user_id ? `(uid: ${r.user_id})` : ""}
              </div>
              <div className="font-medium mt-1">{r.name} • {r.email}</div>
              <div className="whitespace-pre-wrap text-sm mt-1">{r.message}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
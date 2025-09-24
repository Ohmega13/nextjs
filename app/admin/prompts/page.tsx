"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type PromptRow = {
  id: string;
  key: string | null;
  system: string | null;
  subtype: string | null;
  title: string | null;
  content: string | null;
  updated_at: string | null;
};

const SYSTEMS = [
  { value: "tarot", label: "tarot" },
  { value: "natal", label: "natal" },
  { value: "palm", label: "palm" },
];

export default function AdminPromptsPage() {
  const [system, setSystem] = useState<string>("tarot");
  const [items, setItems] = useState<PromptRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // สร้าง Supabase client ฝั่ง browser เพื่อดึง access_token ของ user ที่ล็อกอินอยู่
  const supabase = useMemo(() => {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: true, autoRefreshToken: true } }
    );
  }, []);

  async function fetchData(selSystem: string) {
    setLoading(true);
    setErrorMsg(null);
    try {
      // ดึง access_token ปัจจุบัน
      const { data: sessionData, error } = await supabase.auth.getSession();
      if (error) throw error;

      const token = sessionData.session?.access_token ?? "";

      const res = await fetch(`/api/admin/prompts?system=${encodeURIComponent(selSystem)}`, {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        // สำคัญ: ให้แน่ใจว่าส่งคุกกี้ไปด้วย
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`fetch failed: ${res.status} ${t || res.statusText}`);
      }

      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "fetch failed");
      setItems(json.items || []);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message || "โหลดข้อมูลไม่สำเร็จ");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData(system);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [system]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-6">จัดการพรอมป์ (Admin)</h1>

      <div className="flex gap-3 items-center mb-6">
        <select
          value={system}
          onChange={(e) => setSystem(e.target.value)}
          className="border rounded px-3 py-2"
        >
          {SYSTEMS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <button
          onClick={() => {
            // ไปหน้า create (ถ้ามี) หรือจะเปิด modal ก็ได้
            window.location.href = `/admin/prompts/new?system=${encodeURIComponent(system)}`;
          }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded"
        >
          สร้างพรอมป์ใหม่
        </button>
      </div>

      {loading && <p>กำลังโหลด…</p>}
      {errorMsg && (
        <p className="text-red-600 mb-4">
          {errorMsg}
        </p>
      )}

      {(!loading && items.length === 0) && (
        <p className="text-gray-500">ไม่พบพรอมป์</p>
      )}

      <div className="space-y-4">
        {items.map((it) => (
          <div key={it.id} className="border rounded p-4">
            <div className="flex justify-between items-start gap-3">
              <div>
                <div className="font-semibold">{it.title || "(ไม่มีชื่อ)"}</div>
                <div className="text-sm text-gray-500">
                  system: {it.system || "-"} | subtype: {it.subtype || "-"} | key: {it.key || "-"}
                </div>
                <div className="text-xs text-gray-400">
                  updated: {it.updated_at ? new Date(it.updated_at).toLocaleString() : "-"}
                </div>
              </div>
              <div className="flex gap-2">
                <a
                  href={`/admin/prompts/${it.id}`}
                  className="px-3 py-1.5 rounded border hover:bg-gray-50"
                >
                  แก้ไข
                </a>
              </div>
            </div>
            {it.content && (
              <pre className="mt-3 whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded">
                {it.content}
              </pre>
            )}
          </div>
        ))}
      </div>

      <p className="mt-8 text-xs text-gray-400">
        ตัวแปรที่ใช้บ่อย: {{}}full_name}}, {{}}dob}}, {{}}birth_time}}, {{}}birth_place}}, {{}}question}}, {{}}options}}, {{}}cards}}
      </p>
    </div>
  );
}
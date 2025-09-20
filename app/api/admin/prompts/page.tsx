"use client";
import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type PromptRow = {
  id: string;
  key: string;
  title: string;
  system: "tarot" | "natal" | "palm";
  subtype: string | null;
  content: string;
  updated_at: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminPromptsPage() {
  const [items, setItems] = useState<PromptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [filterSystem, setFilterSystem] = useState<"" | "tarot" | "natal" | "palm">("");

  async function fetchData() {
    setLoading(true);
    try {
      const qs = filterSystem ? `?system=${filterSystem}` : "";
      const res = await fetch(`/api/admin/prompts${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "fetch fail");
      setItems(json.items as PromptRow[]);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [filterSystem]);

  async function handleSave(row: PromptRow) {
    setSavingId(row.id);
    try {
      const res = await fetch(`/api/admin/prompts/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "save error");
    } catch (e) {
      alert(`บันทึกไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setSavingId(null);
      fetchData();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("ลบพรอมป์นี้ถาวร?")) return;
    const res = await fetch(`/api/admin/prompts/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.ok) return alert(`ลบไม่สำเร็จ: ${json.error}`);
    fetchData();
  }

  async function handleCreate() {
    setCreating(true);
    const key = prompt("ตั้ง key (เช่น tarot_threeCards):");
    if (!key) { setCreating(false); return; }
    const title = prompt("ตั้งชื่อแสดงผล:");
    const system = (prompt("ระบบ (tarot | natal | palm):") || "").trim() as any;
    const subtype = prompt("โหมดย่อย (เช่น threeCards | weighOptions | classic10 | thai | western) — เว้นว่างได้:");
    const content = prompt("วางเนื้อพรอมป์เบื้องต้น:") || "";
    try {
      const res = await fetch("/api/admin/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, title, system, subtype: subtype || null, content }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "create error");
      fetchData();
    } catch (e) {
      alert(`สร้างไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">จัดการพรอมป์ (Admin)</h1>

      <div className="flex items-center gap-3">
        <select
          value={filterSystem}
          onChange={(e) => setFilterSystem(e.target.value as any)}
          className="border rounded-md px-3 py-2"
        >
          <option value="">ทั้งหมด</option>
          <option value="tarot">tarot</option>
          <option value="natal">natal</option>
          <option value="palm">palm</option>
        </select>

        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-4 py-2 rounded-md bg-indigo-600 text-white disabled:opacity-50"
        >
          {creating ? "กำลังสร้าง..." : "สร้างพรอมป์ใหม่"}
        </button>
      </div>

      {loading ? (
        <p>กำลังโหลด...</p>
      ) : (
        <div className="space-y-4">
          {items.map((it) => (
            <div key={it.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs px-2 py-1 rounded-full bg-slate-100 border">
                  {it.system}{it.subtype ? `/${it.subtype}` : ""}
                </span>
                <input
                  className="border rounded-md px-2 py-1 min-w-[220px]"
                  value={it.key}
                  onChange={(e) => setItems(prev => prev.map(x => x.id === it.id ? { ...x, key: e.target.value } : x))}
                />
                <input
                  className="border rounded-md px-2 py-1 min-w-[220px]"
                  value={it.title}
                  onChange={(e) => setItems(prev => prev.map(x => x.id === it.id ? { ...x, title: e.target.value } : x))}
                />
              </div>

              <textarea
                className="mt-3 w-full min-h-[200px] border rounded-md p-3 font-mono text-sm"
                value={it.content}
                onChange={(e) => setItems(prev => prev.map(x => x.id === it.id ? { ...x, content: e.target.value } : x))}
              />

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => handleSave(it)}
                  disabled={savingId === it.id}
                  className="px-3 py-2 rounded-md bg-emerald-600 text-white disabled:opacity-50"
                >
                  {savingId === it.id ? "กำลังบันทึก..." : "บันทึก"}
                </button>
                <button
                  onClick={() => handleDelete(it.id)}
                  className="px-3 py-2 rounded-md border hover:bg-slate-50"
                >
                  ลบ
                </button>
                <span className="ml-auto text-xs text-slate-500">
                  อัปเดตล่าสุด: {new Date(it.updated_at).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="text-slate-500">ไม่มีพรอมป์</p>}
        </div>
      )}

      <p className="text-xs text-slate-500">
        ตัวแปรที่ใช้บ่อย: {"{{full_name}} {{dob}} {{birth_time}} {{birth_place}} {{question}} {{options}} {{cards}} ฯลฯ"}
        (จะมาเชื่อมตอนเรียกใช้ใน API ของแต่ละโหมด)
      </p>
    </div>
  );
}
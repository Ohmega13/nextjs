"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// ===== What's New (admin-editable) ===========================
type SiteSetting = {
  key: string;
  value: any;
  updated_at: string;
  updated_by?: string | null;
};

function AdminEditableWhatsNew() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [role, setRole] = useState<"admin" | "member">("member");
  const isAdmin = role === "admin";

  const [setting, setSetting] = useState<SiteSetting | null>(null);
  const [editMode, setEditMode] = useState(false);

  // form states
  const [title, setTitle] = useState("");
  const [body, setBody]   = useState("");

  // โหลดสิทธิ์ + ข้อมูลประกาศ
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // role
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const r = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
          setRole((r.data?.role as any) === "admin" ? "admin" : "member");
        }

        // settings
        const { data, error } = await supabase
          .from("site_settings")
          .select("key, value, updated_at, updated_by")
          .eq("key", "whats_new")
          .maybeSingle();

        if (error && (error as any).code !== "PGRST116") throw error; // ignore not-found
        if (data) {
          setSetting(data as SiteSetting);
          setTitle((data as any)?.value?.title ?? "");
          setBody((data as any)?.value?.body ?? "");
        } else {
          // ค่าเริ่มถ้ายังไม่มี
          setSetting({
            key: "whats_new",
            value: { title: "ยินดีต้อนรับสู่ Destiny Decode Tarot ✨", body: "" },
            updated_at: new Date().toISOString(),
            updated_by: null,
          });
          setTitle("ยินดีต้อนรับสู่ Destiny Decode Tarot ✨");
          setBody("");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updatedAtText = useMemo(() => {
    if (!setting?.updated_at) return "";
    try {
      const d = new Date(setting.updated_at);
      return d.toLocaleString();
    } catch {
      return setting.updated_at;
    }
  }, [setting]);

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        key: "whats_new",
        value: { title: title.trim(), body: body.trim() },
      };

      const { data, error } = await supabase
        .from("site_settings")
        .upsert(payload, { onConflict: "key" })
        .select("key,value,updated_at,updated_by")
        .maybeSingle();

      if (error) throw error;

      setSetting(data as SiteSetting);
      setEditMode(false);
      alert("บันทึกประกาศสำเร็จ");
    } catch (e: any) {
      alert(`บันทึกล้มเหลว: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-500">
        กำลังโหลดประกาศ…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-indigo-50/40 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-8 items-center justify-center rounded bg-indigo-600 text-[10px] font-semibold text-white">
            NEW
          </span>
          <div className="font-semibold">What’s new</div>
        </div>

        {isAdmin && !editMode && (
          <button
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-white"
            onClick={() => setEditMode(true)}
          >
            แก้ไข
          </button>
        )}
      </div>

      {!editMode ? (
        <div className="mt-3 text-sm">
          <div className="font-medium">{setting?.value?.title || "-"}</div>
          {setting?.value?.body ? (
            <div className="mt-1 whitespace-pre-wrap text-slate-700">
              {setting.value.body}
            </div>
          ) : null}
          <div className="mt-2 text-xs text-slate-500">
            อัปเดตล่าสุด: {updatedAtText || "-"}
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              หัวข้อ
            </label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="หัวข้อประกาศ"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              รายละเอียด (รองรับขึ้นบรรทัดใหม่)
            </label>
            <textarea
              className="h-28 w-full rounded-md border px-3 py-2"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="รายละเอียดประกาศ…"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              className="rounded-md border px-3 py-1.5 text-sm"
              disabled={saving}
              onClick={() => {
                setTitle(setting?.value?.title ?? "");
                setBody(setting?.value?.body ?? "");
                setEditMode(false);
              }}
            >
              ยกเลิก
            </button>
            <button
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white disabled:opacity-50"
              disabled={saving || !title.trim()}
              onClick={handleSave}
            >
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
// ============================================================

export default function ReadingHome() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">เลือกประเภทการดูดวง</h1>
        <p className="text-slate-500">เลือกแบบที่ต้องการ แล้วเริ่มดูดวงได้เลย</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Tarot */}
        <Link
          href="/reading/tarot"
          className="group rounded-2xl border bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md"
        >
          <div className="mb-2 text-lg font-semibold">ไพ่ยิปซี (Tarot)</div>
          <p className="text-sm text-slate-600">
            ตั้งคำถาม เลือกกระบวนท่า แล้วให้ไพ่เป็นคนบอกใบ้เส้นทาง
          </p>
          <div className="mt-4 inline-flex items-center gap-2 text-indigo-600">
            ไปหน้า Tarot →
          </div>
        </Link>

        {/* Natal */}
        <Link
          href="/reading/natal"
          className="group rounded-2xl border bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md"
        >
          <div className="mb-2 text-lg font-semibold">ดวงกำเนิด (Natal)</div>
          <p className="text-sm text-slate-600">
            วิเคราะห์พื้นดวงจาก วัน/เวลา/สถานที่เกิด
          </p>
          <div className="mt-4 inline-flex items-center gap-2 text-indigo-600">
            ไปหน้า Natal →
          </div>
        </Link>

        {/* Palm */}
        <Link
          href="/reading/palm"
          className="group rounded-2xl border bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md"
        >
          <div className="mb-2 text-lg font-semibold">ลายมือ (Palm)</div>
          <p className="text-sm text-slate-600">
            อัปโหลดรูปลายมือซ้าย/ขวา เพื่อดูแนวโน้มชีวิต
          </p>
          <div className="mt-4 inline-flex items-center gap-2 text-indigo-600">
            ไปหน้า Palm →
          </div>
        </Link>
      </div>

      <div className="mt-6">
        <AdminEditableWhatsNew />
      </div>
    </div>
  );
}
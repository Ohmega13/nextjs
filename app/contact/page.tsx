"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type FormState = {
  name: string;
  email: string;
  message: string;
};

export default function ContactPage() {
  const [form, setForm] = useState<FormState>({ name: "", email: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ถ้าเป็นสมาชิก ลองเติมชื่อ/อีเมลให้อัตโนมัติ
  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const email = user.email || "";
        // ลองอ่านชื่อจาก profiles หรือ profile_details ถ้ามี
        let name = "";
        const prof = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("user_id", user.id)
          .maybeSingle();

        if (prof.data) {
          const { first_name, last_name } = prof.data as any;
          name = `${first_name ?? ""} ${last_name ?? ""}`.trim();
        }

        setForm((f) => ({
          ...f,
          email: email || f.email,
          name: name || f.name,
        }));
      } catch {
        // ignore
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      // ตรวจสอบข้อมูลขั้นต่ำ
      if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
        setError("กรุณากรอก ชื่อ อีเมล และข้อความ");
        setSubmitting(false);
        return;
      }

      // แนบ user_id ถ้ามี
      let user_id: string | null = null;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        user_id = user?.id ?? null;
      } catch {
        // ignore
      }

      const payload = {
        user_id,
        name: form.name.trim(),
        email: form.email.trim(),
        message: form.message.trim(),
      };

      const { error } = await supabase.from("feedback").insert(payload);
      if (error) throw error;

      setSent(true);
      setForm({ name: "", email: "", message: "" });
    } catch (err: any) {
      setError(err?.message ?? "ส่งข้อความไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">ติดต่อเรา</h1>

      {sent ? (
        <div className="rounded-md border border-green-300 bg-green-50 p-4 text-green-800">
          ขอบคุณสำหรับความคิดเห็น ทีมงานได้รับข้อความของคุณแล้ว
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">ชื่อ-นามสกุล</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">อีเมล</label>
            <input
              type="email"
              className="w-full border rounded px-3 py-2"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">ข้อความ</label>
            <textarea
              className="w-full border rounded px-3 py-2 h-32"
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-50"
          >
            {submitting ? "กำลังส่ง..." : "ส่งข้อความ"}
          </button>
        </form>
      )}

      {!sent && (
        <p className="mt-6 text-xs text-gray-500">
          ข้อความนี้จะถูกบันทึกไว้เพื่อให้ผู้ดูแลระบบติดต่อกลับหรือปรับปรุงระบบต่อไป
        </p>
      )}
    </div>
  );
}
// app/signup/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient"; // <-- ใช้ supabase (relative)

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPass] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [agree, setAgree] = useState(false);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);

    if (!agree) {
      setErr("กรุณายอมรับข้อกำหนดก่อนสมัครใช้งาน");
      return;
    }

    setLoading(true);
    try {
      // สมัคร
      const { error: signErr } = await supabase.auth.signUp({ email, password });
      if (signErr) throw signErr;

      // บันทึกสถานะยอมรับข้อกำหนดลงใน user_metadata (หากมี session)
      try {
        const { data: sess } = await supabase.auth.getSession();
        if (sess?.session) {
          await supabase.auth.updateUser({
            data: {
              termsAccepted: true,
              termsAcceptedAt: new Date().toISOString(),
              displayName: displayName?.trim() || null,
            },
          });
        }
      } catch {
        // เงียบไว้: ถ้าไม่มี session (เช่นตั้งค่าให้ยืนยันอีเมลก่อน) จะอัปเดตไม่ได้
      }

      // ข้อความแจ้งสำเร็จ
      setMsg(
        "สมัครสำเร็จ! กรุณาเข้าสู่ระบบ และแจ้งแอดมินให้ Activate บัญชี"
      );
      setEmail("");
      setPass("");
      setDisplayName("");
      setAgree(false);
    } catch (e: any) {
      setErr(e?.message || "สมัครสมาชิกไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <Link href="/" className="font-semibold text-lg tracking-wide">
            Destiny Decode <span className="text-indigo-600">Tarot</span>
          </Link>
          <nav className="hidden md:flex gap-6 text-sm">
            <Link href="/login" className="hover:text-indigo-600">
              เข้าสู่ระบบ
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">สมัครสมาชิก</h1>
          <p className="mt-2 text-sm text-slate-600">กรอกอีเมลและรหัสผ่านเพื่อสมัคร</p>

          <form onSubmit={onSignup} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                ชื่อที่แสดง (ไม่บังคับ)
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 w-full rounded-lg border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="ชื่อผู้ใช้"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">อีเมล</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">รหัสผ่าน</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPass(e.target.value)}
                className="mt-1 w-full rounded-lg border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="••••••••"
              />
            </div>

            {/* ข้อกำหนดและการยินยอม */}
            <div className="flex items-start gap-3 bg-slate-50 border rounded-lg p-3 text-sm">
              <input
                id="terms"
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
              />
              <label htmlFor="terms" className="leading-6">
                ข้าพเจ้ารับทราบและยอมรับข้อกำหนดดังต่อไปนี้:
                <ul className="list-disc ml-5 mt-2 space-y-1">
                  <li>
                    การดูดวงในระบบนี้มีวัตถุประสงค์เพื่อใช้เป็น{" "}
                    <b>แนวทางประกอบการตัดสินใจ</b> เท่านั้น
                    มิใช่การรับรองหรือยืนยันว่าผลการทำนายจะเกิดขึ้นจริง
                  </li>
                  <li>
                    ระบบอยู่ในช่วง <b>ทดสอบการใช้งาน (Beta)</b> อาจมีข้อผิดพลาด
                    ความล่าช้า หรือความไม่สมบูรณ์ของข้อมูลได้
                  </li>
                  <li>
                    หากพบปัญหา ข้อผิดพลาด หรือมีข้อเสนอแนะ
                    กรุณาติดต่อผู้ดูแลระบบเพื่อดำเนินการแก้ไข
                  </li>
                </ul>
              </label>
            </div>

            {err && <div className="text-sm text-red-600">{err}</div>}
            {msg && <div className="text-sm text-emerald-600">{msg}</div>}

            <button
              type="submit"
              disabled={loading || !email || !password || !agree}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-white font-medium hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? "กำลังสมัคร..." : "สมัครสมาชิก"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            มีบัญชีแล้ว?{" "}
            <Link className="text-indigo-600 underline" href="/login">
              เข้าสู่ระบบ
            </Link>
          </p>
        </div>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between text-sm text-slate-500">
          <span>© 2025 Destiny Decode Tarot</span>
          <span>ข้อมูลถูกจัดเก็บอย่างปลอดภัยด้วย Supabase</span>
        </div>
      </footer>
    </div>
  );
}
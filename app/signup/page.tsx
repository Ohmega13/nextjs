"use client";
import { useState } from "react";
import { sb } from "../lib/supabaseClient";

export default function SignupPage() {
  const supabase = sb();
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [displayName,setDisplayName] = useState("");
  const [loading,setLoading] = useState(false);
  const [msg,setMsg] = useState<string|null>(null);

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      // หมายเหตุ: ด้วย RLS ปัจจุบัน member ยัง insert profiles ไม่ได้
      // แสดงข้อความให้รอแอดมิน Activate และ (ถ้าต้องการ) ให้แอดมินตั้งชื่อในภายหลัง
      setMsg("สมัครสำเร็จแล้ว! กรุณาเข้าสู่ระบบ และแจ้งแอดมินให้ Activate บัญชีของคุณ");
    } catch (err: any) {
      setMsg(err.message || "สมัครสมาชิกไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center bg-slate-50">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">สมัครสมาชิก</h1>
        <p className="text-sm text-slate-600 mt-1">กรอกอีเมลและรหัสผ่าน</p>

        <form onSubmit={onSignup} className="grid gap-3 mt-5">
          <label className="grid gap-1 text-sm">
            <span>ชื่อที่แสดง (ไม่บังคับ)</span>
            <input
              value={displayName}
              onChange={(e)=>setDisplayName(e.target.value)}
              className="px-3 py-2 rounded-lg border"
              placeholder="เช่น โอห์ม"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>อีเมล</span>
            <input
              type="email"
              value={email}
              onChange={(e)=>setEmail(e.target.value)}
              className="px-3 py-2 rounded-lg border"
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>รหัสผ่าน</span>
            <input
              type="password"
              value={password}
              onChange={(e)=>setPassword(e.target.value)}
              className="px-3 py-2 rounded-lg border"
              required
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-white font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? "กำลังสมัคร..." : "สมัครสมาชิก"}
          </button>
        </form>

        {msg && <div className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">{msg}</div>}

        <div className="mt-4 text-sm text-slate-600">
          มีบัญชีแล้ว? <a className="text-indigo-600 underline" href="/login">เข้าสู่ระบบ</a>
        </div>
      </div>
    </main>
  );
}
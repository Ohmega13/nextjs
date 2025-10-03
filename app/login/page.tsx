"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  // อ่าน returnTo จาก query string หลัง mount
  const [returnTo, setReturnTo] = useState("/reading");
  useEffect(() => {
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search);
      const rt = q.get("returnTo");
      if (rt && typeof rt === "string") setReturnTo(rt);
    }
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // ฟัง event กันเหนียว: ถ้า sign-in สำเร็จที่ไหนสักที่ให้เด้งเลย
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        router.replace(returnTo);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router, returnTo]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setErr(null); setMsg(null);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      setErr(error.message || "เข้าสู่ระบบไม่สำเร็จ");
      return;
    }

    if (!data?.session) {
      setErr("เข้าสู่ระบบแล้ว แต่ไม่พบ session (ตรวจ ENV Supabase บน Vercel)");
      return;
    }

    setMsg("เข้าสู่ระบบสำเร็จ กำลังพาไปหน้าแรก…");

    // นำทางทันที + กันเหนียว
    router.replace(returnTo);
    setTimeout(() => {
      if (typeof window !== "undefined" && window.location.pathname === "/login") {
        window.location.href = returnTo;
      }
    }, 500);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-12 bg-gray-50">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow">
        <h1 className="mb-2 text-center text-2xl font-bold">เข้าสู่ระบบ</h1>
        <p className="mb-6 text-center text-sm text-slate-600">
          สำหรับผู้ดูแลระบบและลูกดวงที่ได้รับสิทธิ์
        </p>

        <form onSubmit={signIn} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">อีเมล</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="you@example.com"
              autoComplete="email"
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
              autoComplete="current-password"
            />
          </div>

          {err && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
          {msg && <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-white font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          ยังไม่มีบัญชี? <a className="text-indigo-600 hover:underline" href="/signup">สมัครสมาชิก</a>
        </p>
      </div>
    </div>
  );
}
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div className="mx-auto max-w-md px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-center">เข้าสู่ระบบ</h1>
          <p className="mt-2 text-sm text-slate-600 text-center">
            สำหรับผู้ดูแลระบบและลูกดวงที่ได้รับสิทธิ์
          </p>

          {/* ครอบ useSearchParams ด้วย Suspense */}
          <div className="mt-6">
            <Suspense fallback={<div className="text-sm text-slate-500">กำลังโหลด…</div>}>
              <LoginInner />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams?.get("returnTo") || "/reading";

  const [email, setEmail] = useState("");
  const [password, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ฟังอีเวนต์จาก Supabase เผื่อกรณีที่ auth สำเร็จจากที่อื่น/ดีเลย์
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
    setLoading(true);
    setErr(null);
    setMsg(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    // เด้งทันทีหลังสำเร็จ (ไม่ต้องรออีเวนต์)
    setMsg("เข้าสู่ระบบสำเร็จ กำลังพาไปหน้าแรก…");
    router.replace(returnTo);

    // กันเหนียว ถ้ายังไม่เด้ง ให้ลองอีกทีหลัง 700ms
    setTimeout(() => router.replace(returnTo), 700);
  };

  return (
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

      {err && <div className="text-sm text-red-600">{err}</div>}
      {msg && <div className="text-sm text-emerald-600">{msg}</div>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-white font-medium hover:bg-indigo-700 disabled:opacity-60"
      >
        {loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}
'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams?.get('returnTo') || '/reading';

  const [email, setEmail] = useState('');
  const [password, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ถ้ามี session อยู่แล้ว ให้เด้งออกจากหน้า login ทันที
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.replace(returnTo);
    })();
  }, [router, returnTo]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setErr(null); setMsg(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email, password,
    });

    console.log('[signInWithPassword] data:', data, 'error:', error); // ช่วยดีบัก

    setLoading(false);

    if (error) {
      // error ทั่วไปที่เจอบ่อย
      if (error.message.toLowerCase().includes('email not confirmed')) {
        setErr('ยังไม่ได้ยืนยันอีเมล กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ');
      } else {
        setErr(error.message || 'เข้าสู่ระบบไม่สำเร็จ');
      }
      return;
    }

    if (!data?.session) {
      setErr('เข้าสู่ระบบแล้ว แต่ไม่ได้รับ session (ตรวจค่า ENV ของ Supabase อีกครั้ง)');
      return;
    }

    setMsg('เข้าสู่ระบบสำเร็จ กำลังพาไปหน้าแรก…');
    router.replace(returnTo);
  };

  const signInWithMagicLink = async () => {
    setLoading(true); setErr(null); setMsg(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    setMsg('ส่งลิงก์เข้าสู่ระบบไปที่อีเมลแล้ว กรุณาตรวจสอบกล่องจดหมาย');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <Link href="/" className="font-semibold text-lg tracking-wide">
            Destiny Decode <span className="text-indigo-600">Tarot</span>
          </Link>
          <nav className="hidden md:flex gap-6 text-sm">
            <Link href="/login" className="text-indigo-600 font-medium">เข้าสู่ระบบ</Link>
            <Link href="/signup" className="hover:text-indigo-600">สมัครสมาชิก</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">เข้าสู่ระบบ</h1>
          <p className="mt-2 text-sm text-slate-600">สำหรับผู้ดูแลระบบและลูกดวงที่ได้รับสิทธิ์ใช้งาน</p>

          <form onSubmit={signIn} className="mt-6 space-y-4">
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

            {err && <div className="text-sm rounded-md bg-red-50 border border-red-200 p-3 text-red-700">{err}</div>}
            {msg && <div className="text-sm rounded-md bg-emerald-50 border border-emerald-200 p-3 text-emerald-700">{msg}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-white font-medium hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          <div className="mt-4">
            <button
              onClick={signInWithMagicLink}
              disabled={!email || loading}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-60"
            >
              ส่งลิงก์เข้าระบบทางอีเมล (ไม่ใช้รหัสผ่าน)
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            ยังไม่มีบัญชี? <Link href="/signup" className="text-indigo-600 hover:underline">สมัครสมาชิก</Link>
          </p>
        </div>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between text-sm text-slate-500">
          <span>© 2025 Destiny Decode Tarot</span>
          <span>ข้อมูลเก็บในอุปกรณ์ของคุณ</span>
        </div>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-600">กำลังโหลด…</div>}>
      <LoginInner />
    </Suspense>
  );
}
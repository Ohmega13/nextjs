// app/login/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/reading';

  const [email, setEmail]   = useState('');
  const [password, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ถ้ามี session อยู่แล้ว ไม่ต้องอยู่หน้า login
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/reading');
    });
  }, [router]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setErr(null); setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    setMsg('เข้าสู่ระบบสำเร็จ กำลังพาไปหน้าใช้งาน…');
    router.replace(returnTo);
  };

  const signInWithMagicLink = async () => {
    setLoading(true); setErr(null); setMsg(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined }
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

      {/* ... ส่วนฟอร์มเดิมคงไว้ ... */}
      {/* เปลี่ยนเฉพาะโค้ดตามด้านบนพอ */}
    </div>
  );
}
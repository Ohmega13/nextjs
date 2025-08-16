// components/TopNav.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type U = {
  email?: string | null;
  user_metadata?: { full_name?: string };
};

export default function TopNav() {
  const router = useRouter();
  const [user, setUser] = useState<U | null>(null);
  const [loading, setLoading] = useState(true);

  // โหลด session ตอนเริ่ม และฟังการเปลี่ยนแปลง
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user as U | null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user as U | null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const displayName =
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'ผู้ใช้';

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <header className="border-b border-slate-200 bg-white/70 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
        <Link href="/" className="font-semibold text-lg tracking-wide">
          Destiny Decode <span className="text-indigo-600">Tarot</span>
        </Link>

        {/* ขวา: เมนูตามสถานะ */}
        <nav className="flex items-center gap-4 text-sm">
          {loading ? (
            <span className="text-slate-500">กำลังตรวจสอบ…</span>
          ) : user ? (
            <>
              <span className="hidden sm:inline text-slate-700">
                สวัสดี, <b>{displayName}</b>
              </span>
              <button
                onClick={signOut}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-indigo-600">
                เข้าสู่ระบบ
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-700"
              >
                สมัครสมาชิก
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
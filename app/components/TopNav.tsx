// app/components/TopNav.tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter, usePathname } from 'next/navigation';

export default function TopNav() {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    const seed = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (ignore) return;
      if (user) {
        setUserEmail(user.email ?? null);
        // ดึงชื่อจาก user_metadata ถ้ามี
        const meta: any = user.user_metadata || {};
        setDisplayName(meta.full_name || meta.name || user.email || null);
      } else {
        setUserEmail(null);
        setDisplayName(null);
      }
      setLoading(false);
    };

    seed();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      setUserEmail(u?.email ?? null);
      const meta: any = u?.user_metadata || {};
      setDisplayName(meta?.full_name || meta?.name || u?.email || null);
      setLoading(false);
    });

    return () => {
      sub.subscription.unsubscribe();
      ignore = true;
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login?returnTo=' + encodeURIComponent(pathname || '/'));
  };

  const commonLinks = (
    <>
      <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/clients">ลงทะเบียนลูกดวง</Link>
      <span className="text-slate-300 px-1">|</span>
      <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/reading">เริ่มดูดวง</Link>
      <span className="text-slate-300 px-1">|</span>
      <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/history">ประวัติ</Link>
      <span className="text-slate-300 px-1">|</span>
      <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/clients-manage">ประวัติลูกดวง</Link>
      <span className="text-slate-300 px-1">|</span>
      <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/backup">Backup</Link>
    </>
  );

  return (
    <nav className="flex items-center gap-1 text-sm">
      {commonLinks}
      <span className="text-slate-300 px-1">|</span>

      {loading ? (
        <span className="px-3 py-2 text-slate-400">กำลังตรวจสอบ…</span>
      ) : userEmail ? (
        <>
          <span className="px-3 py-2 text-slate-600">
            สวัสดี, <span className="font-medium">{displayName ?? userEmail}</span>
          </span>
          <button
            onClick={signOut}
            className="px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-600"
          >
            Logout
          </button>
        </>
      ) : (
        <>
          <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/login">เข้าสู่ระบบ</Link>
          <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/signup">สมัครสมาชิก</Link>
        </>
      )}
    </nav>
  );
}
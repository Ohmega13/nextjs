'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter, usePathname } from 'next/navigation';

type ProfileRow = {
  user_id: string;
  role: string | null;
  display_name: string | null;
  permissions?: Record<string, boolean> | null;
};

export default function TopNav() {
  const router = useRouter();
  const pathname = usePathname();

  // โหมดมินิมอลเฉพาะหน้า login
  const isLoginPage = pathname === '/login';

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    const seed = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (ignore) return;

      if (user) {
        setUserEmail(user.email ?? null);
        const meta: any = user.user_metadata || {};
        setDisplayName(meta.full_name || meta.name || user.email || null);

        const { data: prof } = await supabase
          .from('profiles')
          .select('user_id, role, display_name, permissions')
          .eq('user_id', user.id)
          .maybeSingle();

        setRole((prof as ProfileRow | null)?.role ?? null);
      } else {
        setUserEmail(null);
        setDisplayName(null);
        setRole(null);
      }
      setLoading(false);
    };

    seed();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user || null;
      setUserEmail(u?.email ?? null);
      const meta: any = u?.user_metadata || {};
      setDisplayName(meta?.full_name || meta?.name || u?.email || null);

      if (u) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('user_id, role, display_name, permissions')
          .eq('user_id', u.id)
          .maybeSingle();

        setRole((prof as ProfileRow | null)?.role ?? null);
      } else {
        setRole(null);
      }

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

  // เมนูสำหรับหน้าปกติ
  const normalLinks = (
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

      {role === 'admin' && (
        <>
          <span className="text-slate-300 px-1">|</span>
          <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50 font-medium text-indigo-700" href="/members">
            สมาชิก
          </Link>
        </>
      )}
    </>
  );

  // เมนูสำหรับหน้า login (มินิมอล)
  const loginLinks = (
    <>
      <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/login">เข้าสู่ระบบ</Link>
      <span className="text-slate-300 px-1">|</span>
      <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/signup">สมัครสมาชิก</Link>
      <span className="text-slate-300 px-1">|</span>
      <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/about">เกี่ยวกับเรา</Link>
      <span className="text-slate-300 px-1">|</span>
      <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/contact">ติดต่อเรา</Link>
    </>
  );

  // ถ้าเป็นหน้า login ให้แสดงเฉพาะเมนู และตัดส่วน user info ออก
  if (isLoginPage) {
    return (
      <nav className="flex items-center gap-1 text-sm">
        {loginLinks}
      </nav>
    );
  }

  // หน้าปกติ
  return (
    <nav className="flex items-center gap-1 text-sm">
      {normalLinks}
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
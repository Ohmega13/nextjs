// app/components/TopNav.tsx
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
} | null;

export default function TopNav() {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  // helper: โหลด role/display_name จากตาราง profiles
  const fetchProfile = async (uid: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, role, display_name, permissions')
      .eq('user_id', uid)
      .maybeSingle();

    if (error) {
      // ถ้า policy ยังไม่พร้อม/โปรไฟล์ยังไม่ถูก seed ก็ไม่ทำให้ UI พัง
      return null as ProfileRow;
    }
    return (data ?? null) as ProfileRow;
  };

  useEffect(() => {
    let cancelled = false;

    const seed = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;

        if (user) {
          setUserEmail(user.email ?? null);
          const meta: any = user.user_metadata || {};
          setDisplayName(meta.full_name || meta.name || user.email || null);

          const prof = await fetchProfile(user.id);
          setRole(prof?.role ?? null);
        } else {
          setUserEmail(null);
          setDisplayName(null);
          setRole(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    seed();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      setUserEmail(u?.email ?? null);

      const meta: any = u?.user_metadata || {};
      setDisplayName(u ? (meta.full_name || meta.name || u.email || null) : null);

      if (u) {
        const prof = await fetchProfile(u.id);
        setRole(prof?.role ?? null);
      } else {
        setRole(null);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
      // ป้องกันกรณี object ไม่มี subscription
      sub?.subscription?.unsubscribe?.();
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

      {/* ลิงก์ “สมาชิก” เฉพาะแอดมิน */}
      {role === 'admin' && (
        <>
          <span className="text-slate-300 px-1">|</span>
          <Link
            className="px-3 py-2 rounded-xl hover:bg-indigo-50 font-medium text-indigo-700"
            href="/members"
          >
            สมาชิก
          </Link>
        </>
      )}
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
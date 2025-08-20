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
};

export default function TopNav() {
  const router = useRouter();
  const pathname = usePathname();

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

  return (
    <nav className="w-full">
      <div className="mx-auto max-w-6xl flex items-center gap-3 py-3">
        {/* ซ้าย: โลโก้ + ชื่อแอป */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white text-sm font-bold">
            DD
          </span>
          <span className="hidden sm:inline text-slate-800 font-semibold">
            Destiny Decode <span className="text-indigo-600">Tarot</span>
          </span>
        </Link>

        {/* ตัวคั่นดันของไปชิดขวา */}
        <div className="flex-1" />

        {/* ขวา: สวัสดี + เมนู/ปุ่มต่างๆ */}
        <div className="flex items-center gap-3">
          {loading ? (
            <span className="px-3 py-2 text-slate-400">กำลังตรวจสอบ…</span>
          ) : userEmail ? (
            <>
              <span className="text-slate-600 hidden sm:inline">
                สวัสดี, <span className="font-medium">{displayName ?? userEmail}</span>
              </span>
              {/* ปุ่มเมนู (ใช้ id เดิมได้ ถ้ามีโค้ดเปิดเมนูอยู่แล้ว) */}
              <button
                id="topnav-menu"
                className="rounded-xl border px-3 py-2 hover:bg-slate-50"
              >
                เมนู
              </button>
              <button
                onClick={signOut}
                className="hidden lg:inline px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-600"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/login">
                เข้าสู่ระบบ
              </Link>
              <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/signup">
                สมัครสมาชิก
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
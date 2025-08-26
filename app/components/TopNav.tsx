'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
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

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);

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

  // ปิดเมนูเมื่อเส้นทางเปลี่ยน
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // ปิดเมนูเมื่อคลิกข้างนอกหรือกด ESC
  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(t) && menuBtnRef.current && !menuBtnRef.current.contains(t)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login?returnTo=' + encodeURIComponent(pathname || '/'));
  };

  return (
    <nav className="w-full sticky top-0 z-40 bg-white/70 backdrop-blur border-b">
      <div className="mx-auto max-w-6xl px-3 sm:px-4 lg:px-6 h-14 flex items-center justify-between">
        {/* ซ้าย: โลโก้ + ชื่อแอป */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white text-sm font-bold">
            DD
          </span>
          <span className="hidden sm:inline text-slate-800 font-semibold">
            Destiny Decode <span className="text-indigo-600">Tarot</span>
          </span>
        </Link>

        {/* ขวา: สวัสดี + เมนู/ปุ่มต่างๆ */}
        <div className="flex items-center gap-3 ml-auto">
          {loading ? (
            <span className="px-3 py-2 text-slate-400">กำลังตรวจสอบ…</span>
          ) : userEmail ? (
            <>
              <span className="text-slate-600 hidden sm:inline">
                สวัสดี, <span className="font-medium">{displayName ?? userEmail}</span>
              </span>
              <button
                id="topnav-menu"
                ref={menuBtnRef}
                onClick={() => setMenuOpen(v => !v)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-slate-50 active:scale-[.99] sm:hidden"
              >
                <span className="i-ph-list text-base" aria-hidden />
                เมนู
              </button>
              <div className="hidden sm:flex items-center gap-1 text-sm">
                <Link href="/" className="px-3 py-2 rounded-xl hover:bg-indigo-50">หน้าแรก</Link>
                <span className="text-slate-300 px-1">|</span>
                <Link href="/start" className="px-3 py-2 rounded-xl hover:bg-indigo-50">เริ่มดูดวง</Link>
                <span className="text-slate-300 px-1">|</span>
                <Link href="/history" className="px-3 py-2 rounded-xl hover:bg-indigo-50">ประวัติการดูดวง</Link>
                <span className="text-slate-300 px-1">|</span>
                <Link href="/profile" className="px-3 py-2 rounded-xl hover:bg-indigo-50">Profile</Link>
                <span className="text-slate-300 px-1">|</span>
                <Link href="/backup" className="px-3 py-2 rounded-xl hover:bg-indigo-50">สำรอง/กู้คืนข้อมูล</Link>
                {role === 'admin' && (
                  <>
                    <span className="text-slate-300 px-1">|</span>
                    <Link href="/admin/members" className="px-3 py-2 rounded-xl hover:bg-indigo-50">สมาชิก (แอดมิน)</Link>
                    <span className="text-slate-300 px-1">|</span>
                    <Link href="/clients/register" className="px-3 py-2 rounded-xl hover:bg-indigo-50">ลงทะเบียนลูกดวง</Link>
                  </>
                )}
                <span className="text-slate-300 px-1">|</span>
                <button onClick={signOut} className="px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-600">Logout</button>
              </div>

              {menuOpen && (
                <div ref={menuRef} className="absolute right-0 top-12 w-64 rounded-xl border bg-white shadow-lg p-1 sm:hidden">
                  <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">หน้าแรก</Link>
                  <Link href="/start" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">เริ่มดูดวง</Link>
                  <Link href="/history" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">ประวัติการดูดวง</Link>
                  <Link href="/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">Profile</Link>
                  <Link href="/backup" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">สำรอง/กู้คืนข้อมูล</Link>
                  {role === 'admin' && (
                    <>
                      <div className="my-1 h-px bg-slate-100" />
                      <Link href="/admin/members" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">สมาชิก (แอดมิน)</Link>
                      <Link href="/clients/register" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">ลงทะเบียนลูกดวง</Link>
                    </>
                  )}
                  <div className="my-1 h-px bg-slate-100" />
                  <button onClick={signOut} className="w-full text-left flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">Logout</button>
                </div>
              )}
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
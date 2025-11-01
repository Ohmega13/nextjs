'use client';

import Image from 'next/image';
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
  const [credits, setCredits] = useState<number | null>(null);

  const loadCredits = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setCredits(null);
        return;
      }
      const res = await fetch('/api/credits/me', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        credentials: 'include',
      });
      if (!res.ok) {
        setCredits(null);
        return;
      }
      const json = await res.json();
      // รองรับหลายคีย์: balance | carry_balance | credit | credits.balance
      const num = Number(
        json?.balance ??
        json?.carry_balance ??
        json?.credit ??
        json?.credits?.balance ??
        0
      );
      setCredits(Number.isFinite(num) ? num : 0);
    } catch {
      setCredits(null);
    }
  };

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

        await loadCredits();
      } else {
        setUserEmail(null);
        setDisplayName(null);
        setRole(null);
        setCredits(null);
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
        await loadCredits();
      } else {
        setRole(null);
        setCredits(null);
      }

      setLoading(false);
    });

    return () => {
      sub.subscription.unsubscribe();
      ignore = true;
    };
  }, []);

  // ฟัง event credits:refresh เพื่อรีโหลดเครดิตอัตโนมัติ
  useEffect(() => {
    const onRefresh = () => {
      loadCredits();
    };
    window.addEventListener('credits:refresh', onRefresh);
    return () => window.removeEventListener('credits:refresh', onRefresh);
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
    setCredits(null);
    router.replace('/login?returnTo=' + encodeURIComponent(pathname || '/'));
  };

  return (
    <nav className="w-full sticky top-0 z-40 bg-white/70 backdrop-blur border-b">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between pt-[env(safe-area-inset-top)]">
        {/* ซ้าย: โลโก้ + ชื่อแอป */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image
            src="/logo.png"
            alt="Destiny Decode Tarot"
            width={32}
            height={32}
            className="rounded-full"
          />
          <span className="hidden lg:inline text-slate-800 font-semibold">
            Destiny Decode <span className="text-indigo-600">Tarot</span>
          </span>
        </Link>

        {/* ขวา: สวัสดี + เมนู/ปุ่มต่างๆ */}
        <div className="ml-auto relative flex items-center gap-2">
          {loading ? (
            <span className="px-2 text-slate-400 text-sm">กำลังตรวจสอบ…</span>
          ) : userEmail ? (
            <>
              {/* โชว์บนมือถือด้วย + truncate กันล้น */}
              <span className="text-slate-600 text-xs sm:text-sm max-w-[50vw] md:max-w-[300px] truncate text-right">
                สวัสดี, <span className="font-medium">{displayName ?? userEmail}</span>
              </span>
              <span
                className="hidden sm:inline-flex items-center rounded-full border px-2 py-1 text-xs text-slate-700 bg-white"
                title="เครดิตคงเหลือ"
              >
                เครดิต: {credits ?? '—'}
              </span>

              <button
                id="topnav-menu"
                ref={menuBtnRef}
                onClick={() => setMenuOpen(v => !v)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="เมนู"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border text-slate-700 hover:bg-slate-50 active:scale-[.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {/* Hamburger icon */}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
                  <path d="M3.75 6.75h16.5a.75.75 0 0 0 0-1.5H3.75a.75.75 0 0 0 0 1.5Zm16.5 5.25H3.75a.75.75 0 0 0 0 1.5h16.5a.75.75 0 0 0 0-1.5Zm0 6H3.75a.75.75 0 0 0 0 1.5h16.5a.75.75 0 0 0 0-1.5Z" />
                </svg>
              </button>

              {menuOpen && (
                <div
                  ref={menuRef}
                  className="absolute right-0 top-12 w-64 rounded-xl border bg-white shadow-lg p-1 z-50"
                  role="menu"
                  aria-labelledby="topnav-menu"
                >
                  <div className="flex items-center justify-between px-3 py-2 text-sm text-slate-600">
                    <span>เครดิตคงเหลือ</span>
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-white">{credits ?? '—'}</span>
                  </div>
                  <div className="my-1 h-px bg-slate-100" />
                  <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">หน้าแรก</Link>
                  <Link href="/reading" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">เริ่มดูดวง</Link>
                  <Link href="/history" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">ประวัติการดูดวง</Link>
                  <Link href="/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">Profile</Link>
                  <Link href="/backup" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">สำรอง/กู้คืนข้อมูล</Link>
                  <Link href="/contact" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">ติดต่อเรา</Link>
                  {role === 'admin' && (
                    <>
                      <div className="my-1 h-px bg-slate-100" />
                      <Link href="/admin/members" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">สมาชิก (แอดมิน)</Link>
                      <Link href="/clients" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">ลงทะเบียนลูกดวง</Link>
                      <Link href="/admin/prompts" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">จัดการพรอมป์ (แอดมิน)</Link>
                      <Link href="/admin/feedback" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">Feedback (แอดมิน)</Link>
                    </>
                  )}
                  <div className="my-1 h-px bg-slate-100" />
                  <button onClick={signOut} className="w-full text-left flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">
                    Logout
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/contact">ติดต่อเรา</Link>
              <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/login">เข้าสู่ระบบ</Link>
              <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/signup">สมัครสมาชิก</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
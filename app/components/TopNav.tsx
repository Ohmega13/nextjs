// app/components/TopNav.tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

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
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  // ปิดเมนูทุกครั้งที่เปลี่ยนเส้นทาง
  useEffect(() => {
    if (menuOpen) setMenuOpen(false);
  }, [pathname]);

  // load user + role
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
    setMenuOpen(false);
    router.replace('/login?returnTo=' + encodeURIComponent(pathname || '/'));
  };

  // menus
  const commonAuthedLinks = [
    { href: '/', label: 'Home' },
    { href: '/reading', label: 'เริ่มดูดวง' },
    { href: '/history', label: 'ประวัติ' },
    { href: '/profile', label: 'Profile' },
  ];

  const adminExtra = [
    { href: '/clients', label: 'ลงทะเบียนลูกดวง' },
    { href: '/clients-manage', label: 'ประวัติลูกดวง' },
    { href: '/backup', label: 'Backup' },
    { href: '/members', label: 'สมาชิก' },
  ];

  const publicLinks = [
    { href: '/login', label: 'เข้าสู่ระบบ' },
    { href: '/signup', label: 'สมัครสมาชิก' },
    { href: '/about', label: 'เกี่ยวกับเรา' },
    { href: '/contact', label: 'ติดต่อเรา' },
  ];

  const MenuButton = (
    <button
      className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 hover:bg-slate-50"
      onClick={() => setMenuOpen(v => !v)}
      aria-expanded={menuOpen}
      aria-label="เปิดเมนู"
      aria-controls="topnav-menu"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      เมนู
    </button>
  );

  return (
    <header className="relative z-20">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* ซ้าย: โลโก้เท่านั้น */}
        <Link href="/" className="flex items-center" aria-label="Go to Home">
          <div className="h-8 w-8 rounded-full bg-indigo-600 text-white grid place-items-center font-bold">
            DD
          </div>
        </Link>

        <div className="flex items-center gap-3">

          {/* สถานะผู้ใช้ */}
          {loading ? (
            <span className="text-sm text-slate-500">กำลังตรวจสอบ…</span>
          ) : userEmail ? (
            <span className="hidden text-sm text-slate-600 sm:block">
              สวัสดี, <span className="font-medium">{displayName ?? userEmail}</span>
            </span>
          ) : null}

          {MenuButton}
        </div>
      </div>

      {/* เมนูเด้งลง */}
      {menuOpen && (
        <div id="topnav-menu" className="absolute left-0 right-0 top-full border-t bg-white shadow-lg">
          <nav className="mx-auto grid max-w-6xl gap-1 px-4 py-3 sm:grid-cols-2 md:grid-cols-3">
            {userEmail ? (
              <>
                {commonAuthedLinks.map(i => (
                  <Link
                    key={i.href}
                    href={i.href}
                    className="rounded-lg px-3 py-2 hover:bg-indigo-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    {i.label}
                  </Link>
                ))}

                {role === 'admin' &&
                  adminExtra.map(i => (
                    <Link
                      key={i.href}
                      href={i.href}
                      className="rounded-lg px-3 py-2 hover:bg-indigo-50"
                      onClick={() => setMenuOpen(false)}
                    >
                      {i.label}
                    </Link>
                  ))}

                <button
                  onClick={signOut}
                  className="rounded-lg px-3 py-2 text-left text-rose-600 hover:bg-rose-50"
                >
                  Logout
                </button>
              </>
            ) : (
              publicLinks.map(i => (
                <Link
                  key={i.href}
                  href={i.href}
                  className="rounded-lg px-3 py-2 hover:bg-indigo-50"
                  onClick={() => setMenuOpen(false)}
                >
                  {i.label}
                </Link>
              ))
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
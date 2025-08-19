// app/components/TopNav.tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter, usePathname } from 'next/navigation';

type ProfileRow = {
  user_id: string;
  role: 'admin' | 'member' | null;
  display_name: string | null;
  permissions?: Record<string, boolean> | null;
};

export default function TopNav() {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [role, setRole] = useState<'admin' | 'member' | null>(null);

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (ignore) return;

        if (user) {
          setUserEmail(user.email ?? null);
          const meta: any = user.user_metadata || {};
          setDisplayName(meta.full_name || meta.name || user.email || null);

          const { data: prof, error: profErr } = await supabase
            .from('profiles')
            .select('user_id, role, display_name, permissions')
            .eq('user_id', user.id)
            .maybeSingle();

          if (!profErr) {
            setRole((prof as ProfileRow | null)?.role ?? 'member'); // default เป็น member ถ้าไม่มีค่า
          } else {
            setRole('member');
          }
        } else {
          setUserEmail(null);
          setDisplayName(null);
          setRole(null);
        }
      } catch (e) {
        // เงียบไว้ใน nav ไม่ต้อง throw
        setRole(null);
      } finally {
        setLoading(false);
      }
    };

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      try {
        const u = session?.user || null;
        setUserEmail(u?.email ?? null);
        const meta: any = u?.user_metadata || {};
        setDisplayName(meta?.full_name || meta?.name || u?.email || null);

        if (u) {
          const { data: prof, error: profErr } = await supabase
            .from('profiles')
            .select('user_id, role, display_name, permissions')
            .eq('user_id', u.id)
            .maybeSingle();

          if (!profErr) {
            setRole((prof as ProfileRow | null)?.role ?? 'member');
          } else {
            setRole('member');
          }
        } else {
          setRole(null);
        }
      } finally {
        setLoading(false);
      }
    });

    return () => {
      // กันกรณี sub ไม่มีค่าในบาง runtime
      sub?.subscription?.unsubscribe();
      ignore = true;
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login?returnTo=' + encodeURIComponent(pathname || '/'));
  };

  // ====== เมนูตามบทบาท ======
  const PublicLinks = (
    <>
      <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/login">เข้าสู่ระบบ</Link>
      <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/signup">สมัครสมาชิก</Link>
      <span className="text-slate-300 px-1">|</span>
      <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/about">เกี่ยวกับเรา</Link>
      <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/contact">ติดต่อเรา</Link>
    </>
  );

  const MemberLinks = (
    <>
      <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/reading">เริ่มดูดวง</Link>
      <span className="text-slate-300 px-1">|</span>
      <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/history">ประวัติ</Link>
      <span className="text-slate-300 px-1">|</span>
      <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/profile">Profile</Link>
      <button onClick={signOut} className="px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-600">
        Logout
      </button>
    </>
  );

  const AdminLinks = (
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
      <span className="text-slate-300 px-1">|</span>
      <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50 font-medium text-indigo-700" href="/members">
        สมาชิก
      </Link>
      <span className="text-slate-300 px-1">|</span>
      <span className="px-3 py-2 text-slate-600">
        สวัสดี, <span className="font-medium">{displayName ?? userEmail}</span>
      </span>
      <button onClick={signOut} className="px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-600">
        Logout
      </button>
    </>
  );

  // เลือกเมนูที่จะแสดง
  let Links: JSX.Element = PublicLinks;
  if (!loading) {
    if (role === 'admin') Links = AdminLinks;
    else if (role === 'member') Links = MemberLinks;
  }

  return (
    <nav className="flex items-center gap-1 text-sm">
      {loading ? <span className="px-3 py-2 text-slate-400">กำลังตรวจสอบ…</span> : Links}
    </nav>
  );
}
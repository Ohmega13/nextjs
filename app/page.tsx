'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Dashboard from './components/Dashboard';

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    let ignore = false;

    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (ignore) return;
      if (session) {
        setIsAuthed(true);
      } else {
        router.replace('/login');
      }
      setChecking(false);
    };

    check();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      if (ignore) return;
      if (sess) {
        setIsAuthed(true);
      } else {
        setIsAuthed(false);
        router.replace('/login');
      }
    });

    return () => {
      ignore = true;
      sub?.subscription?.unsubscribe();
    };
  }, [router]);

  if (checking) {
    return <div className="p-6 text-slate-500">กำลังตรวจสอบสถานะเข้าสู่ระบบ…</div>;
  }

  if (!isAuthed) return null; // กำลัง redirect ไป /login

  return <Dashboard />;
}
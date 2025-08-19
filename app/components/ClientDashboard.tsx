'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function ClientDashboard() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function boot() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (ignore) return;

      if (!user) {
        router.replace('/login?returnTo=/');
      } else {
        setReady(true);
      }
    }

    boot();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) router.replace('/login?returnTo=/');
      else setReady(true);
    });

    return () => {
      sub.subscription.unsubscribe();
      ignore = true;
    };
  }, [router]);

  if (!ready) {
    return <div className="p-6 text-slate-600">กำลังตรวจสอบสิทธิ์…</div>;
  }

  const menus = [
    {
      href: '/reading',
      title: 'เริ่มดูดวง',
      desc: 'สุ่มไพ่/เริ่มอ่านทันที',
      emoji: '🔮',
    },
    {
      href: '/history',
      title: 'ประวัติการดูดวง',
      desc: 'ดูบันทึกย้อนหลัง',
      emoji: '📜',
    },
    {
      href: '/clients',
      title: 'ลงทะเบียนลูกดวง',
      desc: 'บันทึกลูกดวงใหม่',
      emoji: '📝',
    },
    {
      href: '/clients-manage',
      title: 'ประวัติลูกดวง',
      desc: 'ดู/แก้ไขข้อมูล',
      emoji: '👤',
    },
    {
      href: '/backup',
      title: 'สำรอง/กู้คืนข้อมูล',
      desc: 'ส่งออก/นำเข้า',
      emoji: '💾',
    },
  ] as const;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold tracking-tight">
            ศูนย์ควบคุมการดูดวง <span className="text-indigo-600">Destiny Decode</span>
          </h1>
          <p className="mt-2 text-slate-600">เลือกเมนูเพื่อเริ่มใช้งาน</p>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {menus.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="text-3xl">{m.emoji}</div>
              <h3 className="mt-3 font-semibold text-slate-900 group-hover:text-indigo-600">
                {m.title}
              </h3>
              <p className="mt-1 text-sm text-slate-600">{m.desc}</p>
              <div className="mt-4 text-sm font-medium text-indigo-600">
                ไปที่หน้า {m.title} →
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
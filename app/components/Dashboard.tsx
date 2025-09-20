// app/components/Dashboard.tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type ProfileRow = {
  user_id: string;
  role: 'admin' | 'member' | null;
  display_name: string | null;
  permissions?: Record<string, boolean> | null;
};

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [role, setRole] = useState<ProfileRow['role']>(null);
  const [perms, setPerms] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let ignore = false;

    const seed = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const meta: any = user.user_metadata || {};
      if (!ignore) {
        setDisplayName(meta.full_name || meta.name || user.email || null);
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('user_id, role, display_name, permissions')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!ignore) {
        const p = (prof as ProfileRow | null) || null;
        setRole((p?.role as any) ?? null);
        setPerms((p?.permissions as any) ?? {});
        setLoading(false);
      }
    };

    seed();

    return () => { ignore = true; };
  }, []);

  if (loading) {
    return <div className="p-6 text-slate-500">กำลังโหลดแดชบอร์ด…</div>;
  }

  // เมนูพื้นฐานทุกคนที่ล็อกอินเห็น
  const commonCards = [
    // เปิดเมนู “เริ่มดูดวง” ต่อเมื่อมีสิทธิ์ tarot
    ...(perms?.tarot ? [{
      href: '/reading',
      title: 'เริ่มดูดวง',
      desc: 'สุ่มไพ่/บันทึกผล',
      emoji: '🔮',
    }] : []),
    {
      href: '/history',
      title: 'ประวัติการดูดวงของฉัน',
      desc: 'ดูประวัติย้อนหลัง (เฉพาะของฉัน)',
      emoji: '📜',
    },
    {
      href: '/clients-manage',
      title: 'ประวัติลูกดวง (ส่วนฉัน)',
      desc: 'ถ้าจัดเก็บไว้ในเครื่อง',
      emoji: '👤',
    },
  ];

  // เมนูแอดมินเพิ่ม
  const adminCards = role === 'admin'
    ? [
        {
          href: '/clients',
          title: 'ลงทะเบียนลูกดวง',
          desc: 'บันทึกข้อมูลลูกดวงใหม่',
          emoji: '📝',
        },
        {
          href: '/members',
          title: 'สมาชิก',
          desc: 'อนุญาตสิทธิ์/แพ็กเกจ',
          emoji: '👥',
        },
        {
          href: '/backup',
          title: 'สำรอง/กู้คืนข้อมูล',
          desc: 'ส่งออก/นำเข้า',
          emoji: '💾',
        },
        {
          href: '/admin/prompts',
          title: 'จัดการพรอมป์',
          desc: 'แก้ไข/อัปเดตข้อความพรอมป์ที่ใช้วิเคราะห์',
          emoji: '⚙️',
        },
      ]
    : [];

  const cards = [...commonCards, ...adminCards];

  return (
    <div className="min-h-[60vh] bg-gradient-to-b from-slate-50 to-white text-slate-900 rounded-2xl">
      {/* Hero */}
      <section className="px-4 pt-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 md:p-10 shadow-sm">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            สวัสดี {displayName ?? ''} 👋
          </h1>
          <p className="mt-2 text-slate-600">
            {role === 'admin'
              ? 'แดชบอร์ดสำหรับผู้ดูแลระบบ — จัดการสมาชิก ลูกดวง และข้อมูล'
              : 'แดชบอร์ดของคุณ — เริ่มดูดวงและดูประวัติของคุณ'}
          </p>
        </div>
      </section>

      {/* Cards */}
      <section className="px-4 py-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="text-3xl">{m.emoji}</div>
            <h3 className="mt-3 font-semibold text-slate-900 group-hover:text-indigo-600">
              {m.title}
            </h3>
            <p className="mt-1 text-sm text-slate-600">{m.desc}</p>
            <div className="mt-4 text-sm font-medium text-indigo-600">
              ไปที่ {m.title} →
            </div>
          </Link>
        ))}
        {cards.length === 0 && (
          <div className="col-span-full text-sm text-slate-500">
            ยังไม่มีสิทธิ์ใช้งานเมนูใด กรุณาติดต่อแอดมิน
          </div>
        )}
      </section>
    </div>
  );
}
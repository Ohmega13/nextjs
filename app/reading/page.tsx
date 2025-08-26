'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Perms = { tarot?: boolean; natal?: boolean; palm?: boolean };

export default function ReadingHome() {
  const [loading, setLoading] = useState(true);
  const [perms, setPerms] = useState<Perms>({});

  useEffect(() => {
    let ignore = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || ignore) { setLoading(false); return; }

      const { data } = await supabase
        .from('profiles')
        .select('permissions')
        .eq('user_id', user.id)
        .maybeSingle();

      setPerms((data?.permissions as Perms) || {});
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s?.user) setPerms({});
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const cards = [
    { key: 'tarot', title: 'ไพ่ยิปซี (Tarot)', desc: 'สุ่มไพ่/อ่านไพ่', href: '/reading/tarot', emoji: '🔮' },
    { key: 'natal', title: 'พื้นดวง (Natal)', desc: 'รายละเอียดพื้นดวง', href: '/reading/natal', emoji: '🌌' },
    { key: 'palm',  title: 'ลายมือ (Palm)',  desc: 'วิเคราะห์เส้นลายมือ', href: '/reading/palm',  emoji: '✋' },
  ] as const;

  if (loading) return <div className="p-6 text-slate-600">กำลังโหลดสิทธิ์…</div>;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <h1 className="text-xl font-semibold">เลือกประเภทการดูดวง</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(c => {
          const allowed = !!(perms as any)[c.key];
          return (
            <div key={c.key} className="rounded-xl border p-5 flex flex-col h-full">
              <div className="text-3xl">{c.emoji}</div>
              <h3 className="mt-2 font-semibold text-center sm:text-left">{c.title}</h3>
              <p className="text-sm text-slate-600 text-center sm:text-left">{c.desc}</p>

              {allowed ? (
                <Link
                  href={c.href}
                  className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-white w-full sm:w-auto text-center"
                >
                  เริ่มดูดวง
                </Link>
              ) : (
                <button
                  className="mt-4 inline-block rounded-lg bg-slate-200 px-4 py-2 text-slate-500 cursor-not-allowed w-full sm:w-auto text-center"
                  onClick={() => alert('ขออภัย คุณยังไม่มีสิทธิ์ใช้งานประเภทนี้ กรุณาติดต่อแอดมิน')}
                >
                  ยังไม่มีสิทธิ์
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
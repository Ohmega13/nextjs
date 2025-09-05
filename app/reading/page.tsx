'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// สิทธิ์ที่รองรับในระบบ
type Perms = { tarot?: boolean; natal?: boolean; palm?: boolean };

export default function ReadingHome() {
  const [loading, setLoading] = useState(true);
  const [perms, setPerms] = useState<Perms>({});
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  // โหลดสิทธิ์จากตาราง profiles ตามผู้ใช้ปัจจุบัน
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!user) {
          if (!cancelled) {
            setIsAuthed(false);
            setPerms({});
          }
          return;
        }

        if (!cancelled) setIsAuthed(true);
        const { data, error: qErr } = await supabase
          .from('profiles')
          .select('permissions')
          .eq('user_id', user.id as string)
          .maybeSingle();
        if (qErr) throw qErr;

        if (!cancelled) setPerms((data?.permissions as Perms) || {});
      } catch (e) {
        console.error('Load perms error:', e);
        if (!cancelled) {
          setIsAuthed(false);
          setPerms({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    // รีโหลดเมื่อ auth เปลี่ยน
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      cancelled = true;
      // guard เผื่อ runtime เก่าที่ไม่มี subscription
      try { sub?.subscription?.unsubscribe(); } catch {}
    };
  }, []);

  const cards = [
    { key: 'tarot', title: 'ไพ่ยิปซี (Tarot)', desc: 'สุ่มไพ่/อ่านไพ่', href: '/reading/tarot', emoji: '🔮' },
    { key: 'natal', title: 'พื้นดวง (Natal)', desc: 'รายละเอียดพื้นดวง', href: '/reading/natal', emoji: '🌌' },
    { key: 'palm',  title: 'ลายมือ (Palm)',  desc: 'วิเคราะห์เส้นลายมือ', href: '/reading/palm',  emoji: '✋' },
  ] as const;

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-slate-200 rounded" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-xl border p-5">
                <div className="h-5 w-10 bg-slate-200 rounded" />
                <div className="mt-3 h-4 w-2/3 bg-slate-200 rounded" />
                <div className="mt-2 h-4 w-1/2 bg-slate-200 rounded" />
                <div className="mt-4 h-9 w-28 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ถ้ายังไม่ล็อกอิน ชวนไปล็อกอินก่อน
  if (isAuthed === false) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <h1 className="text-xl font-semibold">เลือกประเภทการดูดวง</h1>
        <div className="rounded-xl border p-5">
          <p className="text-slate-600 text-sm">กรุณาเข้าสู่ระบบเพื่อใช้งานฟีเจอร์นี้</p>
          <div className="mt-3 flex gap-2">
            <Link href="/login" className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-white">เข้าสู่ระบบ</Link>
            <Link href="/signup" className="inline-block rounded-lg border px-4 py-2">สมัครสมาชิก</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <h1 className="text-xl font-semibold">เลือกประเภทการดูดวง</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const allowed = !!(perms as any)[c.key];
          return (
            <div key={c.key} className="rounded-xl border p-5 flex flex-col h-full">
              <div className="text-3xl" aria-hidden="true">{c.emoji}</div>
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
                  type="button"
                  aria-disabled
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
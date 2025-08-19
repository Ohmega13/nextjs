'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

type Props = {
  /** ต้องการ role เฉพาะ เช่น 'admin' (เว้นว่างถ้าไม่ต้องตรวจ role) */
  requireRole?: 'admin';
  /** ต้องการ permission เฉพาะ เช่น ['tarot'] หรือ ['natal'] เป็นต้น */
  requirePerms?: string[];
  /** children: คอนเทนต์ของหน้าที่จะโชว์เมื่อผ่านสิทธิ์ */
  children: React.ReactNode;
  /** เมื่อไม่มีสิทธิ์ให้ redirect ไปไหน (เว้นว่างถ้าไม่อยากพาไปไหน) */
  redirectTo?: string;
};

type ProfileRow = {
  user_id: string;
  role: string | null;
  permissions: Record<string, boolean> | null;
};

export default function PermissionGate({
  requireRole,
  requirePerms = [],
  children,
  redirectTo = '/'
}: Props) {
  const router = useRouter();

  const [pending, setPending] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      setPending(true);
      // ต้องล็อกอินก่อน
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!alive) return;

      if (!user) {
        setAllowed(false);
        setShowModal(true);
        setPending(false);
        return;
      }

      // โหลดโปรไฟล์เพื่อดู role/permissions
      const { data: prof } = await supabase
        .from('profiles')
        .select('user_id, role, permissions')
        .eq('user_id', user.id)
        .maybeSingle();

      const role = (prof as ProfileRow | null)?.role ?? null;
      const perms = (prof as ProfileRow | null)?.permissions ?? {};

      // แอดมินผ่านทุกเงื่อนไข
      if (role === 'admin') {
        setAllowed(true);
        setPending(false);
        return;
      }

      // ต้องเป็น role เฉพาะ?
      if (requireRole && role !== requireRole) {
        setAllowed(false);
        setShowModal(true);
        setPending(false);
        return;
      }

      // ต้องมี perms เฉพาะ?
      const okPerms = requirePerms.every((k) => !!(perms && perms[k]));
      if (!okPerms) {
        setAllowed(false);
        setShowModal(true);
        setPending(false);
        return;
      }

      setAllowed(true);
      setPending(false);
    };

    run();
    const { data: sub } = supabase.auth.onAuthStateChange(() => run());

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [requireRole, requirePerms.join(',')]);

  if (pending) {
    return <div className="text-slate-500 text-sm">กำลังตรวจสอบสิทธิ์…</div>;
  }

  if (!allowed) {
    return (
      <>
        {/* หน้าจอว่าง + โมดัลแจ้งเตือน */}
        <div className="p-6 text-slate-500 text-sm">ไม่มีสิทธิ์ใช้งานเนื้อหานี้</div>

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* backdrop */}
            <div className="absolute inset-0 bg-black/30" onClick={() => setShowModal(false)} />

            {/* modal */}
            <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-lg border">
              <div className="p-6">
                <h2 className="text-lg font-semibold text-slate-900">
                  ขออภัย คุณไม่มีแพ็กเกจการใช้งาน
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  กรุณาติดต่อผู้ดูแลระบบ (Admin) เพื่อเปิดสิทธิ์การใช้งานในหน้านี้
                </p>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                    onClick={() => setShowModal(false)}
                  >
                    ปิด
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                    onClick={() => router.replace(redirectTo)}
                  >
                    กลับหน้าแรก
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return <>{children}</>;
}
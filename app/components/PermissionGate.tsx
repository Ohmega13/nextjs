// app/components/PermissionGate.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Props = {
  /** รายการสิทธิ์ที่จำเป็น ต้องเป็น true ครบทุกตัวถึงจะผ่าน */
  requirePerms?: string[];
  children: ReactNode;
};

type ProfileRow = {
  user_id: string;
  role: string | null;
  display_name: string | null;
  permissions?: Record<string, boolean> | null;
};

export default function PermissionGate({ requirePerms = [], children }: Props) {
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const alerted = useRef(false);

  // โหลดสิทธิ์ของผู้ใช้ปัจจุบัน
  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (ignore) return;

        if (!user) {
          setIsLoggedIn(false);
          setPerms({});
          setLoading(false);
          return;
        }

        setIsLoggedIn(true);

        // ดึง permissions จากตาราง profiles
        const { data: prof } = await supabase
          .from('profiles')
          .select('user_id, role, display_name, permissions')
          .eq('user_id', user.id)
          .maybeSingle();

        const p = ((prof as ProfileRow | null)?.permissions ?? {}) as Record<string, boolean>;
        setPerms(p);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      // ถ้าเปลี่ยนสถานะ login/logout ให้รีโหลดสิทธิ์ใหม่
      alerted.current = false; // รีเซ็ตไม่ให้ alert ค้างจากรอบก่อน
      load();
    });

    return () => {
      ignore = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // คำนวณว่ามีสิทธิ์ครบไหม
  const hasPermission = useMemo(() => {
    if (requirePerms.length === 0) return true;
    return requirePerms.every((k) => perms?.[k] === true);
  }, [requirePerms, perms]);

  // เตือน popup ครั้งเดียวถ้าไม่มีสิทธิ์ (ผูกกับ reqKey เพื่อให้ deps คงที่)
  const reqKey = useMemo(() => requirePerms.join('|'), [requirePerms]);
  useEffect(() => {
    if (!loading && isLoggedIn && !hasPermission && !alerted.current) {
      alerted.current = true;
      alert('ขออภัย คุณไม่มีแพ็คเกจการใช้งานสำหรับหน้านี้ กรุณาติดต่อ Admin');
    }
    // ใส่ reqKey เพื่อตัด warning exhaustive-deps (ไม่โยน array ตรง ๆ)
  }, [loading, isLoggedIn, hasPermission, reqKey]);

  // สถานะกำลังโหลด
  if (loading) {
    return (
      <div className="rounded-xl border p-4 text-sm text-slate-600">
        กำลังตรวจสอบสิทธิ์การใช้งาน…
      </div>
    );
  }

  // ยังไม่ล็อกอิน
  if (!isLoggedIn) {
    return (
      <div className="rounded-xl border p-4 text-sm">
        โปรดเข้าสู่ระบบเพื่อใช้งานหน้านี้
      </div>
    );
  }

  // ล็อกอินแล้ว แต่ไม่มีสิทธิ์
  if (!hasPermission) {
    return (
      <div className="rounded-xl border p-4 text-sm text-rose-600">
        คุณไม่มีสิทธิ์ใช้งานหน้านี้ กรุณาติดต่อผู้ดูแลระบบ
      </div>
    );
  }

  // ผ่านทุกอย่าง แสดงเนื้อหาได้
  return <>{children}</>;
}
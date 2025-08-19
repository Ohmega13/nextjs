'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Profile = {
  user_id: string;
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;      // YYYY-MM-DD
  birth_time?: string | null;      // HH:mm
  birth_place?: string | null;
  email?: string | null;
};

export default function ClientInfoCard({
  forUserId,              // ถ้ามี -> ใช้โปรไฟล์ของ user นี้
  fallbackToCurrent = true, // true: ถ้าไม่ส่ง forUserId จะใช้ user ปัจจุบัน
  showFields = ['first_name','last_name','birth_date','birth_time','birth_place'] as const,
}: {
  forUserId?: string | null;
  fallbackToCurrent?: boolean;
  showFields?: readonly ('first_name'|'last_name'|'birth_date'|'birth_time'|'birth_place')[];
}) {
  const [p, setP] = useState<Profile | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      let uid = forUserId ?? null;
      if (!uid && fallbackToCurrent) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id ?? null;
      }
      if (!uid) { setP(null); return; }

      const { data } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, birth_date, birth_time, birth_place, email')
        .eq('user_id', uid)
        .maybeSingle();

      if (!ignore) setP((data as any) ?? null);
    })();
    return () => { /* noop */ };
  }, [forUserId, fallbackToCurrent]);

  return (
    <div className="rounded-xl border p-4 bg-slate-50">
      <div className="font-medium mb-2">ข้อมูลลูกดวง</div>
      {!p ? (
        <div className="text-sm text-slate-500">ยังไม่มีข้อมูล</div>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {showFields.includes('first_name') && (
            <>
              <dt className="text-slate-500">ชื่อ</dt>
              <dd>{p.first_name ?? '-'}</dd>
            </>
          )}
          {showFields.includes('last_name') && (
            <>
              <dt className="text-slate-500">นามสกุล</dt>
              <dd>{p.last_name ?? '-'}</dd>
            </>
          )}
          {showFields.includes('birth_date') && (
            <>
              <dt className="text-slate-500">วันเกิด</dt>
              <dd>{p.birth_date ?? '-'}</dd>
            </>
          )}
          {showFields.includes('birth_time') && (
            <>
              <dt className="text-slate-500">เวลาเกิด</dt>
              <dd>{p.birth_time ?? '-'}</dd>
            </>
          )}
          {showFields.includes('birth_place') && (
            <>
              <dt className="text-slate-500">สถานที่เกิด</dt>
              <dd>{p.birth_place ?? '-'}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}
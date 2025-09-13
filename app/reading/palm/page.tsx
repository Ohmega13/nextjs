'use client';

import { useEffect, useState } from 'react';
import PermissionGate from '@/components/PermissionGate';
import { supabase } from '@/lib/supabaseClient';
import { getProfileDetailsByUserId, getPalmSignedUrls, type ProfileRow } from '@/lib/profile';
import ClientSelector from '@/components/ClientSelector';

export default function PalmPage() {
  const [role, setRole] = useState<'admin'|'member'>('member');
  const [clientId, setClientId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [leftUrl, setLeftUrl] = useState<string | null>(null);
  const [rightUrl, setRightUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const prof = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
      setRole((prof.data?.role as any) || 'member');
    })();
  }, []);

  // โหลดประวัติ + ภาพมือ
  useEffect(() => {
    (async () => {
      const targetUserId =
        role === 'admin' ? clientId : await (async () => {
          const { data: { user } } = await supabase.auth.getUser();
          return user?.id ?? null;
        })();

      if (!targetUserId) {
        setProfile(null);
        setLeftUrl(null);
        setRightUrl(null);
        return;
      }

      const p = await getProfileDetailsByUserId(targetUserId);
      setProfile(p);

      const { leftUrl: L, rightUrl: R } = await getPalmSignedUrls(targetUserId);
      setLeftUrl(L);
      setRightUrl(R);
    })();
  }, [role, clientId]);

  return (
    <PermissionGate requirePerms={['palm']}>
      <div className="max-w-5xl mx-auto p-4 space-y-6">
        <h1 className="text-xl font-semibold">ลายมือ</h1>

        {role === 'admin' && (
          <div className="rounded-xl border p-4 space-y-3">
            <div className="text-sm text-slate-600">เลือกลูกดวง</div>
            <ClientSelector value={clientId} onChange={(id) => setClientId(id)} />
          </div>
        )}

        <div className="rounded-xl border p-4">
          <div className="font-medium mb-2">ข้อมูลลูกดวง</div>
          {profile ? (
            <div className="text-sm space-y-1">
              <div>ชื่อ-นามสกุล: {profile.first_name ?? '-'} {profile.last_name ?? ''}</div>
              <div>วัน/เดือน/ปี เกิด: {profile.dob ?? '-'}</div>
              <div>เวลาเกิด: {profile.birth_time ?? '-'}</div>
              <div>สถานที่เกิด: {profile.birth_place ?? '-'}</div>
            </div>
          ) : <div className="text-sm text-slate-500">ยังไม่มีข้อมูล</div>}
        </div>

        <div className="rounded-xl border p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="mb-2 text-sm font-medium">มือซ้าย</div>
            {leftUrl ? (
              // ใช้ <img> ง่าย ๆ (หรือ next/image ถ้าพร้อม)
              <img src={leftUrl} alt="Left palm" className="rounded-lg border" />
            ) : (
              <div className="text-sm text-slate-500">ยังไม่มีรูปมือซ้าย</div>
            )}
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">มือขวา</div>
            {rightUrl ? (
              <img src={rightUrl} alt="Right palm" className="rounded-lg border" />
            ) : (
              <div className="text-sm text-slate-500">ยังไม่มีรูปมือขวา</div>
            )}
          </div>
        </div>

        {/* … ปุ่มเริ่มดูดวง / คำทำนาย … ตามของเดิม */}
      </div>
    </PermissionGate>
  );
}
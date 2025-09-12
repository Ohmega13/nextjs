'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';

type PalmSide = 'left' | 'right';

type PalmImageRow = {
  id: string;
  user_id: string;
  side: PalmSide;
  path: string;     // เส้นทางไฟล์ใน storage เช่น palm/{user_id}/left_123.jpg
  created_at: string;
};

type ProfileDetails = {
  user_id: string;
  first_name?: string | null;
  last_name?: string | null;
  dob?: string | null;          // 'YYYY-MM-DD'
  birth_time?: string | null;   // 'HH:MM'
  birth_place?: string | null;
  phone?: string | null;
};

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);

  // auth
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  // profiles.display_name
  const [displayName, setDisplayName] = useState<string>('');
  const [savingDisplay, setSavingDisplay] = useState(false);

  // profile_details (ถ้ามีตาราง)
  const [details, setDetails] = useState<ProfileDetails | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);

  // palm images
  const [palm, setPalm] = useState<Record<PalmSide, PalmImageRow | null>>({
    left: null,
    right: null,
  });
  const [viewingSide, setViewingSide] = useState<PalmSide | null>(null);
  const [uploading, setUploading] = useState<Record<PalmSide, boolean>>({ left: false, right: false });
  const [deleting, setDeleting] = useState<Record<PalmSide, boolean>>({ left: false, right: false });

  // โหลดข้อมูลเบื้องต้น
  useEffect(() => {
    (async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
          setLoading(false);
          return;
        }
        setUserId(user.id);
        setEmail(user.email ?? null);

        // profiles
        const { data: prof } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('user_id', user.id)
          .maybeSingle();

        setDisplayName((prof?.display_name as string) ?? '');

        // profile_details (ถ้ามี)
        const { data: det, error: detErr } = await supabase
          .from('profile_details')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!detErr && det) {
          setDetails(det as ProfileDetails);
        } else {
          setDetails({
            user_id: user.id,
            first_name: null,
            last_name: null,
            dob: null,
            birth_time: null,
            birth_place: null,
            phone: null,
          });
        }

        // palm images (ล่าสุดของแต่ละฝั่ง)
        const { data: palms } = await supabase
          .from('palm_images')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        const latest: Record<PalmSide, PalmImageRow | null> = { left: null, right: null };
        (palms ?? []).forEach((row: any) => {
          const s = row.side as PalmSide;
          if (!latest[s]) latest[s] = row as PalmImageRow;
        });
        setPalm(latest);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function saveDisplayName() {
    if (!userId) return;
    setSavingDisplay(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({ user_id: userId, display_name: displayName }, { onConflict: 'user_id' });
      if (error) throw error;
      alert('บันทึกชื่อที่แสดงเรียบร้อยแล้ว');
    } catch (e: any) {
      alert(`บันทึกชื่อที่แสดงไม่สำเร็จ: ${e?.message ?? e}`);
    } finally {
      setSavingDisplay(false);
    }
  }

  async function saveDetails() {
    if (!userId || !details) return;
    setSavingDetails(true);
    try {
      const payload = { ...details, user_id: userId };
      const { error } = await supabase
        .from('profile_details')
        .upsert(payload, { onConflict: 'user_id' });
      if (error) throw error;
      alert('บันทึกข้อมูลบัญชีเรียบร้อยแล้ว');
    } catch (e: any) {
      alert(
        'ยังไม่มีตาราง profile_details ในฐานข้อมูล\n' +
        'ให้รัน SQL ที่ผมแนบให้ด้านล่างก่อน แล้วค่อยลองกดบันทึกอีกครั้ง.'
      );
    } finally {
      setSavingDetails(false);
    }
  }

  // signed URL สำหรับดูรูป (memoized เพื่อลด warning dependency)
  const getSignedUrl = useCallback(async (row: PalmImageRow | null) => {
    if (!row) return null;
    const { data } = await supabase.storage
      .from('palm_images')
      .createSignedUrl(row.path, 60 * 10); // 10 นาที
    return data?.signedUrl ?? null;
  }, []);

  async function onUpload(side: PalmSide, file: File | null) {
    if (!userId || !file) return;
    setUploading(s => ({ ...s, [side]: true }));
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${userId}/${side}_${Date.now()}.${ext}`;
      // อัปโหลดไฟล์
      const { error: upErr } = await supabase.storage.from('palm_images').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'image/jpeg',
      });
      if (upErr) throw upErr;

      // จดเมตาลง palm_images
      const { data: ins, error: insErr } = await supabase
        .from('palm_images')
        .insert({ user_id: userId, side, path })
        .select()
        .single();

      if (insErr) throw insErr;
      setPalm(prev => ({ ...prev, [side]: ins as PalmImageRow }));
    } catch (e: any) {
      alert(`อัปโหลดไม่สำเร็จ: ${e?.message ?? e}`);
    } finally {
      setUploading(s => ({ ...s, [side]: false }));
    }
  }

  async function onDelete(side: PalmSide) {
    if (!userId) return;
    const row = palm[side];
    if (!row) return;
    if (!confirm('ลบรูปฝั่งนี้?')) return;

    setDeleting(s => ({ ...s, [side]: true }));
    try {
      // ลบไฟล์ใน storage
      await supabase.storage.from('palm_images').remove([row.path]);
      // ลบเรคคอร์ดเมตา
      await supabase.from('palm_images').delete().eq('id', row.id);
      setPalm(prev => ({ ...prev, [side]: null }));
    } catch (e: any) {
      alert(`ลบไม่สำเร็จ: ${e?.message ?? e}`);
    } finally {
      setDeleting(s => ({ ...s, [side]: false }));
    }
  }

  async function onChangePassword() {
    const newPass = prompt('กรอกรหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)');
    if (!newPass) return;
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;
      alert('เปลี่ยนรหัสผ่านเรียบร้อย');
    } catch (e: any) {
      alert(`เปลี่ยนรหัสผ่านไม่สำเร็จ: ${e?.message ?? e}`);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-6 space-y-6">
      <h1 className="text-xl font-semibold">โปรไฟล์</h1>

      {loading ? (
        <div>กำลังโหลดข้อมูล…</div>
      ) : !userId ? (
        <div className="text-rose-600">กรุณาเข้าสู่ระบบก่อน</div>
      ) : (
        <>
          {/* ข้อมูลบัญชี */}
          <section className="rounded-xl border p-4 space-y-3">
            <h2 className="font-medium">ข้อมูลบัญชี</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-slate-600">อีเมล</label>
                <input className="mt-1 w-full rounded-lg border-slate-300" value={email ?? ''} disabled />
              </div>
              <div>
                <label className="text-sm text-slate-600">ชื่อที่แสดง</label>
                <div className="mt-1 flex gap-2">
                  <input
                    className="w-full rounded-lg border-slate-300"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="เช่น โอห์ม"
                  />
                  <button
                    onClick={saveDisplayName}
                    disabled={savingDisplay}
                    className="shrink-0 rounded-lg bg-indigo-600 text-white px-4 py-2 disabled:opacity-60"
                  >
                    บันทึก
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* รายละเอียดส่วนตัว */}
          <section className="rounded-xl border p-4 space-y-3">
            <h2 className="font-medium">รายละเอียดส่วนตัว</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-slate-600">ชื่อ</label>
                <input
                  className="mt-1 w-full rounded-lg border-slate-300"
                  value={details?.first_name ?? ''}
                  onChange={(e) => setDetails(d => ({ ...(d as ProfileDetails), first_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm text-slate-600">นามสกุล</label>
                <input
                  className="mt-1 w-full rounded-lg border-slate-300"
                  value={details?.last_name ?? ''}
                  onChange={(e) => setDetails(d => ({ ...(d as ProfileDetails), last_name: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm text-slate-600">วัน/เดือน/ปี เกิด</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border-slate-300"
                  value={details?.dob ?? ''}
                  onChange={(e) => setDetails(d => ({ ...(d as ProfileDetails), dob: e.target.value || null }))}
                />
              </div>
              <div>
                <label className="text-sm text-slate-600">เวลาเกิด</label>
                <input
                  type="time"
                  className="mt-1 w-full rounded-lg border-slate-300"
                  value={details?.birth_time ?? ''}
                  onChange={(e) => setDetails(d => ({ ...(d as ProfileDetails), birth_time: e.target.value || null }))}
                />
              </div>

              <div>
                <label className="text-sm text-slate-600">สถานที่เกิด</label>
                <input
                  className="mt-1 w-full rounded-lg border-slate-300"
                  value={details?.birth_place ?? ''}
                  onChange={(e) => setDetails(d => ({ ...(d as ProfileDetails), birth_place: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm text-slate-600">เบอร์โทรศัพท์</label>
                <input
                  className="mt-1 w-full rounded-lg border-slate-300"
                  value={details?.phone ?? ''}
                  onChange={(e) => setDetails(d => ({ ...(d as ProfileDetails), phone: e.target.value }))}
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={saveDetails}
                disabled={savingDetails}
                className="rounded-lg bg-indigo-600 text-white px-4 py-2 disabled:opacity-60"
              >
                บันทึกรายละเอียดส่วนตัว
              </button>
            </div>
          </section>

          {/* รูปลายมือ */}
          <section className="rounded-xl border p-4 space-y-3">
            <h2 className="font-medium">รูปลายมือ</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(['left', 'right'] as PalmSide[]).map((side) => {
                const row = palm[side];
                return (
                  <div key={side} className="rounded-lg border p-3">
                    <div className="font-medium mb-2">{side === 'left' ? 'มือซ้าย' : 'มือขวา'}</div>

                    <div className="flex items-center gap-3">
                      {row ? (
                        <Thumb row={row} side={side} onView={() => setViewingSide(side)} getSignedUrl={getSignedUrl} />
                      ) : (
                        <div className="w-24 h-24 rounded bg-slate-100 flex items-center justify-center text-slate-400 text-sm">ไม่มีรูป</div>
                      )}

                      <div className="ml-auto flex gap-2">
                        <label className="rounded-lg border px-3 py-2 cursor-pointer">
                          {uploading[side] ? 'กำลังอัปโหลด…' : 'อัปโหลด/แทนที่'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => onUpload(side, e.target.files?.[0] ?? null)}
                            disabled={uploading[side]}
                          />
                        </label>
                        {row && (
                          <>
                            <button
                              onClick={() => setViewingSide(side)}
                              className="rounded-lg border px-3 py-2"
                            >
                              ดูรูป
                            </button>
                            <button
                              onClick={() => onDelete(side)}
                              disabled={deleting[side]}
                              className="rounded-lg border px-3 py-2 text-rose-600 disabled:opacity-60"
                            >
                              ลบ
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal ดูรูป */}
            {viewingSide && (
              <PalmModal
                row={palm[viewingSide]}
                onClose={() => setViewingSide(null)}
                getSignedUrl={getSignedUrl}
              />
            )}
          </section>

          {/* เปลี่ยนรหัสผ่าน */}
          <section className="rounded-xl border p-4 space-y-3">
            <h2 className="font-medium">เปลี่ยนรหัสผ่าน</h2>
            <button onClick={onChangePassword} className="rounded-lg border px-4 py-2">
              เปลี่ยนรหัสผ่าน
            </button>
          </section>
        </>
      )}
    </div>
  );
}

function Thumb({
  row,
  side,
  onView,
  getSignedUrl,
}: {
  row: PalmImageRow;
  side: PalmSide;
  onView: () => void;
  getSignedUrl: (row: PalmImageRow | null) => Promise<string | null>;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const u = await getSignedUrl(row);
      setThumbUrl(u);
    })();
  }, [row?.id, row?.path, getSignedUrl]);

  return (
    <button onClick={onView} className="rounded overflow-hidden border w-[96px] h-[96px] flex items-center justify-center bg-slate-100">
      {thumbUrl ? (
        <Image src={thumbUrl} alt={`${side} hand`} width={96} height={96} className="object-cover" />
      ) : (
        <span className="text-xs text-slate-500">กำลังโหลด…</span>
      )}
    </button>
  );
}

function PalmModal({
  row,
  onClose,
  getSignedUrl,
}: {
  row: PalmImageRow | null;
  onClose: () => void;
  getSignedUrl: (row: PalmImageRow | null) => Promise<string | null>;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const u = await getSignedUrl(row);
      setUrl(u);
    })();
  }, [row?.id, row?.path, getSignedUrl]);

  if (!row) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 p-4" onClick={onClose}>
      <div className="mx-auto max-w-3xl bg-white rounded-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3 border-b">
          <div className="font-medium">ดูรูปมือ</div>
          <button onClick={onClose} className="rounded-lg border px-3 py-1.5">ปิด</button>
        </div>
        <div className="p-3 flex items-center justify-center">
          {url ? (
            // ใช้ img ธรรมดาเพื่อให้ขยายเต็มพื้นที่ได้ง่าย
            // (ถ้าอยากใช้ next/image ก็ได้ แต่ต้องกำหนดขนาด)
            <img src={url} alt="palm" className="max-h-[70vh] w-auto" />
          ) : (
            <div className="text-slate-500">กำลังโหลดรูป…</div>
          )}
        </div>
      </div>
    </div>
  );
}
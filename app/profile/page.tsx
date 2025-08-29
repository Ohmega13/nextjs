'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type ProfileRow = {
  user_id: string;
  email: string | null;
  role: 'admin' | 'member' | null;
  display_name: string | null;
  permissions?: Record<string, boolean> | null;
};

export default function ProfilePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPass, setChangingPass] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>('');
  const [role, setRole] = useState<'admin' | 'member' | ''>('');
  const [displayName, setDisplayName] = useState<string>('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function seed() {
      setLoading(true);
      setErr(null);
      setMsg(null);

      // ต้องมี session ก่อน
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        router.replace('/login?returnTo=' + encodeURIComponent('/profile'));
        return;
      }
      if (ignore) return;

      setUserId(user.id);
      setEmail(user.email ?? '');

      // โหลดจากตาราง profiles
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('user_id, email, role, display_name, permissions')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profErr) {
        setErr(profErr.message);
        setLoading(false);
        return;
      }

      // ถ้าไม่มีแถว profile ให้สร้าง default (กันหน้าใหม่ ๆ)
      if (!prof) {
        const defaultRow: Omit<ProfileRow, 'permissions'> = {
          user_id: user.id,
          email: user.email ?? null,
          role: 'member',
          display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || null,
        };

        const { error: insErr } = await supabase
          .from('profiles')
          .insert(defaultRow);

        if (insErr) {
          setErr(insErr.message);
          setLoading(false);
          return;
        }

        setRole('member');
        setDisplayName(defaultRow.display_name ?? '');
      } else {
        setRole((prof.role as 'admin' | 'member') ?? 'member');
        setDisplayName(prof.display_name ?? '');
      }

      setLoading(false);
    }

    seed();
    return () => { ignore = true; };
  }, [router]);

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;

    setSaving(true);
    setErr(null);
    setMsg(null);

    try {
      // อัปเดตตาราง profiles
      const { error: upErr } = await supabase
        .from('profiles')
        .update({
          display_name: displayName || null,
          // role ไม่ให้แก้จากหน้า user ทั่วไป (admin เท่านั้น) — เราเลยไม่อัปเดต role ที่นี่
        })
        .eq('user_id', userId);

      if (upErr) throw upErr;

      // อัปเดต user metadata ให้สอดคล้อง (optional but nice)
      const { error: metaErr } = await supabase.auth.updateUser({
        data: {
          full_name: displayName || null,
          name: displayName || null,
        },
      });
      if (metaErr) throw metaErr;

      setMsg('บันทึกโปรไฟล์เรียบร้อย ✨');
    } catch (e: any) {
      setErr(e.message || 'บันทึกล้มเหลว');
    } finally {
      setSaving(false);
    }
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    if (newPassword.length < 6) {
      setErr('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErr('รหัสผ่านยืนยันไม่ตรงกัน');
      return;
    }

    setChangingPass(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setMsg('เปลี่ยนรหัสผ่านสำเร็จ ✔');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      setErr(e.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
    } finally {
      setChangingPass(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="text-xl font-semibold mb-4">Profile</h1>

      {loading ? (
        <div className="rounded-xl border p-4 animate-pulse text-slate-400">
          กำลังโหลดโปรไฟล์…
        </div>
      ) : (
        <>
          {(err || msg) && (
            <div className={`mb-4 rounded-xl border p-3 text-sm ${err ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {err || msg}
            </div>
          )}

          {/* ข้อมูลบัญชี */}
          <div className="rounded-xl border p-4 mb-6">
            <div className="text-sm text-slate-500 mb-3">ข้อมูลบัญชี</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-500 mb-1">อีเมล</label>
                <input
                  className="w-full rounded-lg border bg-slate-50 px-3 py-2"
                  value={email}
                  disabled
                />
              </div>
              <div>
                <label className="block text-sm text-slate-500 mb-1">สิทธิ์ใช้งาน</label>
                <input
                  className="w-full rounded-lg border bg-slate-50 px-3 py-2"
                  value={role || ''}
                  disabled
                />
              </div>
            </div>
          </div>

          {/* แก้ไขโปรไฟล์ */}
          <form onSubmit={onSaveProfile} className="rounded-xl border p-4 mb-6">
            <div className="text-sm text-slate-500 mb-3">แก้ไขโปรไฟล์</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm text-slate-500 mb-1">ชื่อที่แสดง</label>
                <input
                  className="w-full rounded-lg border px-3 py-2"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="เช่น โอห์ม"
                />
              </div>
            </div>

            <div className="mt-4">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl border px-4 py-2 hover:bg-slate-50 disabled:opacity-50"
              >
                {saving ? 'กำลังบันทึก…' : 'บันทึก'}
              </button>
            </div>
          </form>

          {/* เปลี่ยนรหัสผ่าน */}
          <form onSubmit={onChangePassword} className="rounded-xl border p-4">
            <div className="text-sm text-slate-500 mb-3">เปลี่ยนรหัสผ่าน</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-500 mb-1">รหัสผ่านใหม่</label>
                <input
                  type="password"
                  className="w-full rounded-lg border px-3 py-2"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-500 mb-1">ยืนยันรหัสผ่านใหม่</label>
                <input
                  type="password"
                  className="w-full rounded-lg border px-3 py-2"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="พิมพ์ซ้ำอีกครั้ง"
                />
              </div>
            </div>

            <div className="mt-4">
              <button
                type="submit"
                disabled={changingPass}
                className="rounded-xl border px-4 py-2 hover:bg-slate-50 disabled:opacity-50"
              >
                {changingPass ? 'กำลังเปลี่ยน…' : 'เปลี่ยนรหัสผ่าน'}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
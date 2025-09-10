'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import PermissionGate from '../../components/PermissionGate';

type Role = 'admin' | 'member' | null;

type Client = {
  id?: string; // profile_details may not have id; keep optional for future use
  user_id: string;
  first_name?: string | null;
  last_name?: string | null;
  dob?: string | null;         // YYYY-MM-DD
  birth_time?: string | null;  // HH:mm
  birth_place?: string | null;
};

export default function NatalPage() {
  const [role, setRole] = useState<Role>(null);

  // รายชื่อสำหรับ admin
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');

  // ฟอร์มข้อมูลพื้นดวง (ใช้ร่วมกันทั้ง admin/member)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [birthDate, setBirthDate] = useState(''); // YYYY-MM-DD
  const [birthTime, setBirthTime] = useState(''); // HH:mm
  const [birthPlace, setBirthPlace] = useState(''); // สถานที่เกิด (อำเภอ/จังหวัด/ประเทศ)
  const [astroSys, setAstroSys] = useState<'thai' | 'western'>('thai');

  // UI state
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // โหลด role และตั้งค่าเริ่มต้นสำหรับ member/admin
  useEffect(() => {
    let ignore = false;

    async function seed() {
      setLoading(true);
      setErrMsg(null);
      try {
        const { data: { user }, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        if (!user) {
          if (!ignore) setLoading(false);
          return;
        }

        // อ่าน role จาก profiles
        const { data: prof, error: profErr } = await supabase
          .from('profiles')
          .select('user_id, role, display_name')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profErr) throw profErr;

        const r: Role = (prof?.role as Role) ?? null;
        if (!ignore) setRole(r);

        if (r === 'member') {
          // ดึงข้อมูลส่วนตัวจาก profile_details ของตัวเอง
          const { data: mine, error: mineErr } = await supabase
            .from('profile_details')
            .select('user_id, first_name, last_name, dob, birth_time, birth_place')
            .eq('user_id', user.id)
            .maybeSingle();

          if (mineErr) throw mineErr;

          if (!ignore) {
            if (mine) {
              setFirstName(mine.first_name ?? '');
              setLastName(mine.last_name ?? '');
              setBirthDate(mine.dob ?? '');
              setBirthTime(mine.birth_time ?? '');
              setBirthPlace(mine.birth_place ?? '');
            } else {
              // fallback จาก user_metadata
              const meta: any = user.user_metadata || {};
              const display = meta.full_name || meta.name || '';
              if (display) {
                const [fn, ...rest] = String(display).split(' ');
                setFirstName(fn || '');
                setLastName(rest.join(' ') || '');
              }
            }
          }
        }

        if (r === 'admin') {
          // โหลดรายชื่อลูกดวงทั้งหมดจาก profile_details
          const { data: list, error: listErr } = await supabase
            .from('profile_details')
            .select('user_id, first_name, last_name, dob, birth_time, birth_place')
            .order('first_name', { ascending: true });

          if (listErr) throw listErr;

          if (!ignore) {
            const mapped = (list || []).map((p: any) => ({
              id: p.user_id,
              user_id: p.user_id,
              first_name: p.first_name,
              last_name: p.last_name,
              dob: p.dob,
              birth_time: p.birth_time,
              birth_place: p.birth_place,
            }));
            setClients(mapped);

            // เลือกค่าเริ่มต้นให้ dropdown ถ้ามีรายการและยังไม่เลือก
            if (mapped.length > 0 && !selectedClientId) {
              setSelectedClientId(mapped[0].user_id);
            }
          }
        }
      } catch (e: any) {
        if (!ignore) setErrMsg(e?.message || 'โหลดข้อมูลไม่สำเร็จ');
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    seed();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      // ถ้ามีการเปลี่ยนสถานะ login ให้โหลดใหม่
      seed();
    });

    return () => {
      ignore = true;
      try {
        sub?.subscription?.unsubscribe();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // เมื่อ admin เปลี่ยนลูกดวง ให้เติมลงฟอร์ม
  useEffect(() => {
    if (role !== 'admin') return;
    const c = clients.find(x => x.user_id === selectedClientId);
    if (!c) {
      setFirstName('');
      setLastName('');
      setBirthDate('');
      setBirthTime('');
      setBirthPlace('');
      return;
    }
    setFirstName(c.first_name ?? '');
    setLastName(c.last_name ?? '');
    setBirthDate(c.dob ?? '');
    setBirthTime(c.birth_time ?? '');
    setBirthPlace(c.birth_place ?? '');
  }, [role, clients, selectedClientId]);

  const fullName = useMemo(
    () => [firstName, lastName].filter(Boolean).join(' ').trim() || '—',
    [firstName, lastName]
  );

  function onStart() {
    // TODO: ต่อเข้าฟังก์ชันวิเคราะห์พื้นดวงตาม astroSys
    alert(
      `เริ่มดูพื้นดวงแบบ: ${astroSys === 'thai' ? 'ไทย' : 'ตะวันตก'}\n` +
      `ชื่อ: ${fullName}\n` +
      `เกิด: ${birthDate} ${birthTime || ''}\n` +
      `สถานที่เกิด: ${birthPlace || '-'}`
    );
  }

  return (
    <PermissionGate requirePerms={['natal']}>
      <div className="max-w-3xl mx-auto px-4 space-y-6">
        <h1 className="text-xl font-semibold">พื้นดวง (Natal)</h1>

        {errMsg && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-800 px-3 py-2 text-sm">
            {errMsg}
          </div>
        )}

        {/* แถวเลือกผู้ดู/แสดงข้อมูลลูกดวง */}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            {role === 'admin' ? (
              <>
                <label className="block text-sm text-slate-600 mb-1">
                  เลือกลูกดวง (สำหรับผู้ดูและระบบ)
                </label>
                <select
                  className="w-full rounded-lg border-slate-300 h-11 disabled:opacity-60"
                  value={selectedClientId}
                  onChange={e => setSelectedClientId(e.target.value)}
                  disabled={loading || clients.length === 0}
                >
                  {clients.length === 0 ? (
                    <option value="">— ไม่มีข้อมูลลูกดวง —</option>
                  ) : (
                    <>
                      {clients.map(c => (
                        <option key={c.user_id} value={c.user_id}>
                          {[c.first_name, c.last_name].filter(Boolean).join(' ') || c.user_id}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </>
            ) : (
              <div>
                <label className="block text-sm text-slate-600 mb-1">ลูกดวง</label>
                <div className="rounded-lg border px-3 py-2 bg-slate-50">{fullName}</div>
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-slate-50 p-4">
            <div className="font-medium">ข้อมูลลูกดวง</div>
            <div className="text-sm text-slate-600 mt-1">
              {fullName !== '—' ? fullName : (loading ? 'กำลังโหลด…' : 'ยังไม่มีข้อมูล')}
              {birthDate ? ` • เกิด ${birthDate}${birthTime ? ` ${birthTime}` : ''}` : ''}
              {birthPlace ? ` • ${birthPlace}` : ''}
            </div>
          </div>
        </div>

        {/* ฟอร์มข้อมูลพื้นดวง */}
        <div className="rounded-xl border p-4 space-y-4">
          <div>
            <label className="block text-sm text-slate-600">ชื่อ</label>
            <input
              className="mt-1 w-full rounded-lg border-slate-300 h-11"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="ชื่อจริง"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-600">นามสกุล</label>
            <input
              className="mt-1 w-full rounded-lg border-slate-300 h-11"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              placeholder="นามสกุล"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="block text-sm text-slate-600">วัน/เดือน/ปี เกิด</label>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border-slate-300 h-11"
                value={birthDate}
                onChange={e => setBirthDate(e.target.value)}
                placeholder="YYYY-MM-DD"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600">เวลาเกิด</label>
              <input
                type="time"
                className="mt-1 w-full rounded-lg border-slate-300 h-11"
                value={birthTime}
                onChange={e => setBirthTime(e.target.value)}
                placeholder="HH:mm"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600">สถานที่เกิด</label>
              <input
                className="mt-1 w-full rounded-lg border-slate-300 h-11"
                value={birthPlace}
                onChange={e => setBirthPlace(e.target.value)}
                placeholder="อำเภอ/จังหวัด/ประเทศ"
              />
            </div>
          </div>
        </div>

        {/* ระบบโหราศาสตร์ + ปุ่มเริ่มดูดวง */}
        <div className="rounded-xl border p-4">
          <label className="block text-sm text-slate-600 mb-2">เลือกระบบโหราศาสตร์</label>
          <div className="flex gap-3">
            <button
              onClick={() => setAstroSys('thai')}
              className={`w-full sm:w-auto rounded-lg px-4 py-2 border ${astroSys==='thai' ? 'bg-indigo-50 border-indigo-400' : 'border-slate-300'}`}
            >
              ไทย
            </button>
            <button
              onClick={() => setAstroSys('western')}
              className={`w-full sm:w-auto rounded-lg px-4 py-2 border ${astroSys==='western' ? 'bg-indigo-50 border-indigo-400' : 'border-slate-300'}`}
            >
              ตะวันตก
            </button>
          </div>

          <div className="mt-4">
            <button
              onClick={onStart}
              className="w-full sm:w-auto rounded-lg bg-indigo-600 text-white px-4 py-2"
              disabled={loading}
            >
              เริ่มดูพื้นดวง
            </button>
          </div>
        </div>
      </div>
    </PermissionGate>
  );
}
// app/reading/natal/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import PermissionGate from '@/components/PermissionGate';

type Role = 'admin' | 'member' | null;

type Client = {
  id?: string; // profile_details may not have id; keep optional for future use
  user_id: string;
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;   // YYYY-MM-DD
  birth_time?: string | null;   // HH:mm
  birth_place?: string | null;
};

type ProfileRow = {
  user_id: string;
  role: Role;
  display_name: string | null;
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

  // โหลด role และตั้งค่าเริ่มต้นสำหรับ member
  useEffect(() => {
    let ignore = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // อ่าน role จาก profiles
      const { data: prof } = await supabase
        .from('profiles')
        .select('user_id, role, display_name')
        .eq('user_id', user.id)
        .maybeSingle();

      if (ignore) return;
      const r = (prof?.role as Role) ?? null;
      setRole(r);

      // MEMBER: ลองดึงข้อมูลส่วนตัวมาเติม (ดึงจากตาราง profile_details ของเจ้าตัว ถ้ามี)
      if (r === 'member') {
        // ตัวอย่าง: หากมีตาราง profile_details ที่ผูกกับ user_id ของตน ให้ลองดึงรายการล่าสุด/เรคคอร์ดหลัก
        const { data: mine } = await supabase
          .from('profile_details')
          .select('user_id, first_name, last_name, birth_date, birth_time, birth_place')
          .eq('user_id', user.id)
          .maybeSingle();

        if (mine) {
          setFirstName(mine.first_name ?? '');
          setLastName(mine.last_name ?? '');
          setBirthDate(mine.birth_date ?? '');
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

      // ADMIN: โหลดรายชื่อลูกดวงให้เลือก
      if (r === 'admin') {
        const { data: list } = await supabase
          .from('profile_details')
          .select('user_id, first_name, last_name, birth_date, birth_time, birth_place')
          .order('first_name', { ascending: true });

        setClients((list || []).map((p: any) => ({
          id: p.user_id,
          user_id: p.user_id,
          first_name: p.first_name,
          last_name: p.last_name,
          birth_date: p.birth_date,
          birth_time: p.birth_time,
          birth_place: p.birth_place,
        })));
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {});
    return () => {
      ignore = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // เมื่อ admin เปลี่ยนลูกดวง ให้เติมลงฟอร์ม
  useEffect(() => {
    if (role !== 'admin') return;
    const c = clients.find(x => x.user_id === selectedClientId);
    if (!c) {
      setFirstName(''); setLastName(''); setBirthDate(''); setBirthTime(''); setBirthPlace('');
      return;
    }
    setFirstName(c.first_name ?? '');
    setLastName(c.last_name ?? '');
    setBirthDate(c.birth_date ?? '');
    setBirthTime(c.birth_time ?? '');
    setBirthPlace(c.birth_place ?? '');
  }, [role, clients, selectedClientId]);

  const fullName = useMemo(
    () => [firstName, lastName].filter(Boolean).join(' ').trim() || '—',
    [firstName, lastName]
  );

  function onStart() {
    // TODO: ต่อเข้าฟังก์ชันวิเคราะห์พื้นดวงตาม astroSys
    // ส่งข้อมูล birthDate, birthTime, birthPlace, fullName ไปคำนวณ
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

        {/* แถวเลือกผู้ดู/แสดงข้อมูลลูกดวง */}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            {role === 'admin' ? (
              <>
                <label className="block text-sm text-slate-600 mb-1">
                  เลือกลูกดวง (สำหรับผู้ดูและระบบ)
                </label>
                <select
                  className="w-full rounded-lg border-slate-300 h-11"
                  value={selectedClientId}
                  onChange={e => setSelectedClientId(e.target.value)}
                >
                  <option value="">— ไม่ระบุ —</option>
                  {clients.map(c => (
                    <option key={c.user_id} value={c.user_id}>
                      {[c.first_name, c.last_name].filter(Boolean).join(' ') || c.user_id}
                    </option>
                  ))}
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
              {fullName !== '—' ? fullName : 'ยังไม่มีข้อมูล'}
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
            >
              เริ่มดูพื้นดวง
            </button>
          </div>
        </div>
      </div>
    </PermissionGate>
  );
}
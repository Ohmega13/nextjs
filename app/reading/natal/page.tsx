'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import PermissionGate from '../../components/PermissionGate';

// ---- Types ----
 type Role = 'admin' | 'member' | null;
 type Client = {
  id?: string;
  user_id: string;
  first_name?: string | null;
  last_name?: string | null;
  dob?: string | null;
  birth_time?: string | null;
  birth_place?: string | null;
};

// ---- Page ----
export default function NatalPage() {
  const [role, setRole] = useState<Role>(null);

  // admin: list + selected; member: always own
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');

  // shared profile form state (display on the card)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthTime, setBirthTime] = useState('');
  const [birthPlace, setBirthPlace] = useState('');

  // natal reading UI
  const [question, setQuestion] = useState('');
  const [system, setSystem] = useState<'thai' | 'western'>('thai');

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // seed role + profile(s)
  useEffect(() => {
    let ignore = false;

    async function seed() {
      setLoading(true);
      setErrMsg(null);
      try {
        const { data: { user }, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        if (!user) { if (!ignore) setLoading(false); return; }

        const { data: prof, error: profErr } = await supabase
          .from('profiles')
          .select('user_id, role, display_name')
          .eq('user_id', user.id)
          .maybeSingle();
        if (profErr) throw profErr;

        const r: Role = (prof?.role as Role) ?? null;
        if (!ignore) setRole(r);

        if (r === 'member') {
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
              setSelectedClientId(mine.user_id);
            } else {
              const meta: any = user.user_metadata || {};
              const display = meta.full_name || meta.name || '';
              if (display) {
                const [fn, ...rest] = String(display).split(' ');
                setFirstName(fn || '');
                setLastName(rest.join(' ') || '');
              }
              setSelectedClientId(user.id);
            }
          }
        }

        if (r === 'admin') {
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
            if (mapped.length > 0) setSelectedClientId(mapped[0].user_id);
          }
        }
      } catch (e: any) {
        if (!ignore) setErrMsg(e?.message || 'โหลดข้อมูลไม่สำเร็จ');
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    seed();
    const { data: sub } = supabase.auth.onAuthStateChange(() => seed());
    return () => { ignore = true; try { sub?.subscription?.unsubscribe(); } catch {} };
  }, []);

  // when admin switches selected client, update card
  useEffect(() => {
    if (role !== 'admin') return;
    const c = clients.find(x => x.user_id === selectedClientId);
    if (!c) { setFirstName(''); setLastName(''); setBirthDate(''); setBirthTime(''); setBirthPlace(''); return; }
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

  function onRead() {
    alert(
      `เริ่มดูพื้นดวงด้วยระบบ: ${system === 'thai' ? 'ไทย' : 'ตะวันตก'}\n` +
      `ชื่อลูกดวง: ${fullName}\n` +
      `เกิด: ${birthDate}${birthTime ? ' ' + birthTime : ''}\n` +
      `สถานที่เกิด: ${birthPlace || '-'}\n` +
      `คำถาม: ${question || '-'}\n`
    );
  }

  return (
    <PermissionGate requirePerms={['natal']}> 
      <div className="max-w-3xl mx-auto px-4 space-y-6">
        <h1 className="text-xl font-semibold">พื้นดวง (Natal)</h1>

        {errMsg && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-800 px-3 py-2 text-sm">{errMsg}</div>
        )}

        {/* เลือกลูกดวง / การแสดงข้อมูล */}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            {role === 'admin' ? (
              <>
                <label className="block text-sm text-slate-600 mb-1">เลือกลูกดวง (สำหรับผู้ดูและระบบ)</label>
                <select
                  className="w-full rounded-lg border-slate-300 h-11 disabled:opacity-60"
                  value={selectedClientId}
                  onChange={e => setSelectedClientId(e.target.value)}
                  disabled={loading || clients.length === 0}
                >
                  {clients.length === 0 ? (
                    <option value="">— ไม่มีข้อมูลลูกดวง —</option>
                  ) : (
                    clients.map(c => (
                      <option key={c.user_id} value={c.user_id}>
                        {[c.first_name, c.last_name].filter(Boolean).join(' ') || c.user_id}
                      </option>
                    ))
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

        {/* ตั้งค่าพื้นดวง */}
        <div className="rounded-xl border p-4 space-y-4">
          <div className="font-medium">เลือกระบบโหราศาสตร์</div>
          <div className="grid gap-3 md:grid-cols-2">
            <button
              onClick={() => setSystem('thai')}
              className={`rounded-lg px-4 py-2 border ${system==='thai' ? 'bg-indigo-50 border-indigo-500' : 'border-slate-300'}`}
            >ไทย</button>
            <button
              onClick={() => setSystem('western')}
              className={`rounded-lg px-4 py-2 border ${system==='western' ? 'bg-indigo-50 border-indigo-500' : 'border-slate-300'}`}
            >ตะวันตก</button>
          </div>

          <div>
            <label className="block text-sm text-slate-600">คำถามเพิ่มเติม (อ้างอิงจากพื้นดวง)</label>
            <input
              className="mt-1 w-full rounded-lg border-slate-300 h-11"
              placeholder="พิมพ์สิ่งที่อยากถาม"
              value={question}
              onChange={e => setQuestion(e.target.value)}
            />
          </div>

          <div>
            <button
              onClick={onRead}
              className="w-full sm:w-auto rounded-lg bg-indigo-600 text-white px-4 py-2"
              disabled={loading}
            >ดูดวงอ้างอิงตามพื้นดวง</button>
          </div>
        </div>
      </div>
    </PermissionGate>
  );
}
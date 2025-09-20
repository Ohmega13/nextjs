'use client';

import React, { KeyboardEvent } from 'react';
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

  // --- NEW: baseline natal reading prerequisite ---
  const [baseline, setBaseline] = useState<any | null>(null); // last/first natal reading
  const [loadingBaseline, setLoadingBaseline] = useState(false);
  const [showBaseline, setShowBaseline] = useState(false);
  const hasBaseline = !!baseline;

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

  // load baseline natal reading for the target user (must exist before asking questions)
  useEffect(() => {
    (async () => {
      // resolve target user
      let targetUserId: string | null = null;
      if (role === 'admin') {
        targetUserId = selectedClientId || null;
      } else if (role === 'member') {
        const { data: { user } } = await supabase.auth.getUser();
        targetUserId = user?.id ?? null;
      } else {
        targetUserId = null;
      }
      if (!targetUserId) { setBaseline(null); return; }

      setLoadingBaseline(true);
      try {
        const { data, error } = await supabase
          .from('readings')
          .select('id, created_at, mode, topic, payload, user_id')
          .eq('user_id', targetUserId)
          .eq('mode', 'natal')
          .order('created_at', { ascending: false })
          .limit(1);
        if (error) throw error;
        setBaseline((data && data[0]) || null);
      } catch (e) {
        setBaseline(null);
      } finally {
        setLoadingBaseline(false);
      }
    })();
  }, [role, selectedClientId]);

  const fullName = useMemo(
    () => [firstName, lastName].filter(Boolean).join(' ').trim() || '—',
    [firstName, lastName]
  );

  // --- NEW: first-time baseline generation ---
  async function onBaselineInit() {
    try {
      // attach access token for RLS
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const body = {
        system, // 'thai' | 'western'
        action: 'init-baseline',
        // server will infer target user from auth; admin case can optionally pass selectedClientId in future
      };

      const res = await fetch('/api/natal', { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) {
        // fallback UI if API not implemented yet
        const txt = await res.text().catch(() => '');
        alert('ยังไม่สามารถสร้างพื้นดวงได้ในขณะนี้\n' + (txt || 'API /api/natal ยังไม่พร้อม'));
        return;
      }
      // refresh baseline
      const { data: { user } } = await supabase.auth.getUser();
      const targetUserId = role === 'admin' ? (selectedClientId || user?.id || '') : (user?.id || '');
      const { data, error } = await supabase
        .from('readings')
        .select('id, created_at, mode, topic, payload, user_id')
        .eq('user_id', targetUserId)
        .eq('mode', 'natal')
        .order('created_at', { ascending: false })
        .limit(1);
      if (!error) setBaseline((data && data[0]) || null);
    } catch (e) {
      // noop
    }
  }

  function onRead() {
    if (!hasBaseline) {
      alert('โปรดดูพื้นดวงก่อน จากนั้นจึงพิมพ์คำถามเพิ่มเติมได้');
      return;
    }
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

          {/* ขั้นตอนที่ 1: ต้องมีพื้นดวงก่อน */}
          <div className="rounded-lg border p-3 bg-slate-50">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                {loadingBaseline ? 'กำลังตรวจสอบพื้นดวง…' : hasBaseline ? 'พบข้อมูลพื้นดวงก่อนหน้าแล้ว' : 'ยังไม่พบข้อมูลพื้นดวง'}
              </div>
              <div className="flex gap-2">
                {!hasBaseline ? (
                  <button
                    onClick={onBaselineInit}
                    disabled={loadingBaseline || loading}
                    className="rounded-md bg-indigo-600 text-white px-3 py-2 disabled:opacity-50"
                  >
                    ดูพื้นดวงครั้งแรก
                  </button>
                ) : (
                  <button
                    onClick={() => setShowBaseline(true)}
                    className="rounded-md border px-3 py-2 hover:bg-slate-100"
                  >
                    ดูพื้นดวงของฉัน
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ขั้นตอนที่ 2: ถ้ามีพื้นดวงแล้วค่อยถามคำถาม */}
          <div className={`${!hasBaseline ? 'opacity-60 pointer-events-none' : ''}`}>
            <label className="block text-sm text-slate-600">คำถามเพิ่มเติม (อ้างอิงจากพื้นดวง)</label>
            <input
              className="mt-1 w-full rounded-lg border-slate-300 h-11"
              placeholder={hasBaseline ? 'พิมพ์สิ่งที่อยากถาม' : 'ต้องดูพื้นดวงก่อน จึงจะพิมพ์คำถามได้'}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              disabled={!hasBaseline}
            />
          </div>

          <div>
            <button
              onClick={onRead}
              className="w-full sm:w-auto rounded-lg bg-indigo-600 text-white px-4 py-2 disabled:opacity-50"
              disabled={loading || !hasBaseline}
            >ดูดวงอ้างอิงตามพื้นดวง</button>
          </div>
        </div>
      </div>

      {/* Modal: แสดงพื้นดวงที่เคยดูแล้ว */}
      {showBaseline && baseline && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowBaseline(false)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(800px,92vw)] max-h-[85vh] overflow-auto bg-white rounded-2xl shadow-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">พื้นดวงของฉัน</h3>
              <button className="px-2 py-1 rounded-md border hover:bg-slate-50" onClick={() => setShowBaseline(false)}>ปิด</button>
            </div>
            <div className="text-sm space-y-3">
              <div className="grid grid-cols-[110px_1fr] gap-x-3">
                <div className="text-slate-500">วันที่</div>
                <div>{new Date(baseline.created_at).toLocaleString()}</div>
                <div className="text-slate-500">หัวข้อ</div>
                <div>{baseline.topic ?? '-'}</div>
              </div>
              {baseline.payload?.analysis && (
                <div className="rounded-xl border p-3">
                  <div className="font-medium mb-1">คำอธิบายพื้นดวง</div>
                  <div className="whitespace-pre-wrap text-slate-700">
                    {baseline.payload.analysis}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </PermissionGate>
  );
}
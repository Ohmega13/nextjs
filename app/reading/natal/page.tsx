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

  // --- NEW: baseline natal reading prerequisite (per-system) ---
  const [baselineThai, setBaselineThai] = useState<any | null>(null);
  const [baselineWestern, setBaselineWestern] = useState<any | null>(null);
  const hasThai = !!baselineThai;
  const hasWestern = !!baselineWestern;
  const hasAnyBaseline = hasThai || hasWestern;
  const baselineSelected = system === 'thai' ? baselineThai : baselineWestern;
  const [loadingBaseline, setLoadingBaseline] = useState(false);
  const [showBaseline, setShowBaseline] = useState(false);

  // --- NEW: confirm & progress for baseline ---
  const [showConfirm, setShowConfirm] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  // --- NEW: follow-up ask result modal ---
  const [asking, setAsking] = useState(false);
  const [followup, setFollowup] = useState<{ created_at?: string; topic?: string; analysis?: string } | null>(null);
  const [showFollowup, setShowFollowup] = useState(false);
  // Animate progress bar for baseline generation
  useEffect(() => {
    let t: any;
    if (isGenerating) {
      setProgress(8);
      t = setInterval(() => {
        setProgress((p) => (p < 92 ? p + Math.random() * 7 : p));
      }, 300);
    } else {
      setProgress(0);
    }
    return () => clearInterval(t);
  }, [isGenerating]);

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
      }
      if (!targetUserId) { setBaselineThai(null); setBaselineWestern(null); return; }

      setLoadingBaseline(true);
      try {
        const q = supabase
          .from('readings')
          .select('id, created_at, mode, topic, payload, user_id')
          .eq('user_id', targetUserId)
          .eq('mode', 'natal')
          .order('created_at', { ascending: false });
        const { data, error } = await q;
        if (error) throw error;
        const thai = (data || []).find(r => r?.payload?.system === 'thai') || null;
        const western = (data || []).find(r => r?.payload?.system === 'western') || null;
        setBaselineThai(thai);
        setBaselineWestern(western);
      } catch (e) {
        setBaselineThai(null);
        setBaselineWestern(null);
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
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      if (!birthDate || !birthPlace) {
        alert('กรุณากรอก “วันเกิด” และ “สถานที่เกิด” ในโปรไฟล์ให้ครบก่อนเริ่มดูพื้นดวง');
        return;
      }
      const targetUserIdForApi = role === 'admin' && selectedClientId ? selectedClientId : undefined;
      const body = {
        system,
        action: 'init-baseline',
        profile: {
          full_name: ([firstName, lastName].filter(Boolean).join(' ') || '').trim(),
          dob: birthDate || '',
          birth_time: birthTime || '',
          birth_place: birthPlace || '',
        },
        ...(targetUserIdForApi ? { targetUserId: targetUserIdForApi } : {}),
      };

      setLoadingBaseline(true);
      const res = await fetch('/api/natal', { method: 'POST', headers, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'ยังไม่สามารถสร้างพื้นดวงได้ในขณะนี้');
      }

      // refresh baselines for both systems
      const { data: { user } } = await supabase.auth.getUser();
      const targetUserId = role === 'admin' ? (selectedClientId || user?.id || '') : (user?.id || '');
      const { data, error } = await supabase
        .from('readings')
        .select('id, created_at, mode, topic, payload, user_id')
        .eq('user_id', targetUserId)
        .eq('mode', 'natal')
        .order('created_at', { ascending: false });
      if (!error) {
        const thai = (data || []).find(r => r?.payload?.system === 'thai') || null;
        const western = (data || []).find(r => r?.payload?.system === 'western') || null;
        setBaselineThai(thai);
        setBaselineWestern(western);
      }
    } catch (e: any) {
      alert(e?.message || 'เกิดข้อผิดพลาดระหว่างสร้างพื้นดวง');
    } finally {
      setLoadingBaseline(false);
    }
  }

  // --- NEW: ask follow-up based on existing baseline ---
  async function onAskFollowup() {
    if (!hasAnyBaseline) {
      alert('โปรดดูพื้นดวงก่อน จากนั้นจึงพิมพ์คำถามเพิ่มเติมได้');
      return;
    }
    if (!question.trim()) {
      alert('กรุณาพิมพ์คำถามเพิ่มเติมก่อน');
      return;
    }
    // optional: basic profile guard
    if (!birthDate || !birthPlace) {
      alert('ข้อมูลวันเกิด/สถานที่เกิดไม่ครบ กรุณาอัปเดตโปรไฟล์ก่อนถามต่อยอด');
      return;
    }

    try {
      setAsking(true);
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const targetUserIdForApi = role === 'admin' && selectedClientId ? selectedClientId : undefined;
      const body = {
        system,
        action: 'ask-followup',
        question: question.trim(),
        profile: {
          full_name: ([firstName, lastName].filter(Boolean).join(' ') || '').trim(),
          dob: birthDate || '',
          birth_time: birthTime || '',
          birth_place: birthPlace || '',
        },
        ...(targetUserIdForApi ? { targetUserId: targetUserIdForApi } : {}),
      };

      const res = await fetch('/api/natal', { method: 'POST', headers, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'ขอคำตอบไม่สำเร็จ');
      }

      const reading = json.reading || {};
      setFollowup({
        created_at: reading.created_at,
        topic: reading.topic,
        analysis: reading?.payload?.analysis || '',
      });
      setShowFollowup(true);
      setQuestion('');
    } catch (e: any) {
      alert(e?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setAsking(false);
    }
  }

  function onRead() {
    // keep for backward compatibility – now delegates to follow-up API
    onAskFollowup();
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
          <div className="rounded-lg border p-3 bg-white/60 text-sm">
            <div className="font-medium mb-1">ความแตกต่างแบบย่อ: โหราศาสตร์ไทย vs ตะวันตก</div>
            <ul className="list-disc pl-5 space-y-1">
              <li><span className="font-medium">ไทย</span>: เน้นภพ (ลัคนา/ภพลาภะ/กัมมะ ฯลฯ), ระบบมหาทักษา/ตรีวัย/จักรฤกษ์ และการพิจารณาดาวเกษตร-เจ้าเรือน</li>
              <li><span className="font-medium">ตะวันตก</span>: เน้น Sun–Moon–Rising, Houses 1–12, Aspects, Nodes และวงรอบใหญ่เช่น Saturn Return</li>
              <li>ทั้งสองแนวทางให้ภาพรวมชีวิตต่างมุมมอง เลือกแบบที่คุณคุ้นเคยหรืออยากลองศึกษามุมใหม่</li>
            </ul>
          </div>

          {/* ขั้นตอนที่ 1: ต้องมีพื้นดวงก่อน */}
          <div className="rounded-lg border p-3 bg-slate-50">
            <div className="flex items-center justify-between">
              <div className="text-sm space-x-2">
                {loadingBaseline ? (
                  'กำลังตรวจสอบพื้นดวง…'
                ) : (
                  <>
                    <span>สถานะพื้นดวง:</span>
                    <span className={baselineSelected ? 'text-emerald-700' : 'text-slate-600'}>
                      {system === 'thai' ? 'ไทย' : 'ตะวันตก'} — {baselineSelected ? 'พบแล้ว' : 'ยังไม่มี'}
                    </span>
                    <span className="ml-2 text-xs text-slate-500">(ไทย: {hasThai ? '✔' : '—'} / ตะวันตก: {hasWestern ? '✔' : '—'})</span>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                {!baselineSelected ? (
                  <button onClick={() => setShowConfirm(true)} disabled={loadingBaseline || loading} className="rounded-md bg-indigo-600 text-white px-3 py-2 disabled:opacity-50">
                    ดูพื้นดวงครั้งแรก
                  </button>
                ) : (
                  <button onClick={() => setShowBaseline(true)} className="rounded-md border px-3 py-2 hover:bg-slate-100">
                    ดูพื้นดวงของฉัน
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ขั้นตอนที่ 2: ถ้ามีพื้นดวงแล้วค่อยถามคำถาม */}
          <div className={`${!hasAnyBaseline ? 'opacity-60 pointer-events-none' : ''}`}>
            <label className="block text-sm text-slate-600">คำถามเพิ่มเติม (อ้างอิงจากพื้นดวง)</label>
            <input
              className="mt-1 w-full rounded-lg border-slate-300 h-11"
              placeholder={hasAnyBaseline ? 'พิมพ์สิ่งที่อยากถาม' : 'ต้องดูพื้นดวงก่อน จึงจะพิมพ์คำถามได้'}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              disabled={!hasAnyBaseline}
            />
          </div>

          <div>
            <button
              onClick={onRead}
              className="w-full sm:w-auto rounded-lg bg-indigo-600 text-white px-4 py-2 disabled:opacity-50"
              disabled={loading || !hasAnyBaseline || asking}
            >{asking ? 'กำลังวิเคราะห์…' : 'ดูดวงอ้างอิงตามพื้นดวง'}</button>
          </div>
        </div>
      </div>

      {/* Modal: ยืนยันเริ่มดูพื้นดวง */}
      {showConfirm && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => !isGenerating && setShowConfirm(false)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(720px,90vw)] max-h-[85vh] overflow-auto bg-white rounded-2xl shadow-xl p-5">
            <h3 className="text-lg font-semibold mb-3">ยืนยันการดูพื้นดวง</h3>
            <div className="grid grid-cols-[130px_1fr] gap-x-3 text-sm mb-3">
              <div className="text-slate-500">ระบบ</div>
              <div>{system === 'thai' ? 'โหราศาสตร์ไทย' : 'โหราศาสตร์ตะวันตก'}</div>
              <div className="text-slate-500">ชื่อ-นามสกุล</div>
              <div>{fullName}</div>
              <div className="text-slate-500">วันเดือนปีเกิด</div>
              <div>{birthDate || '-'}</div>
              <div className="text-slate-500">เวลาเกิด</div>
              <div>{birthTime || '-'}</div>
              <div className="text-slate-500">สถานที่เกิด</div>
              <div>{birthPlace || '-'}</div>
            </div>
            {isGenerating ? (
              <div className="mt-2">
                <div className="h-2 w-full rounded bg-slate-200 overflow-hidden">
                  <div className="h-2 bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs text-slate-500 mt-2">กรุณารอสักครู่…</p>
              </div>
            ) : (
              <div className="text-xs text-slate-600 mb-1">
                ตรวจสอบข้อมูลให้ถูกต้องก่อนเริ่มระบบวิเคราะห์พื้นดวง
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button className="px-3 py-2 rounded-md border" onClick={() => setShowConfirm(false)} disabled={isGenerating}>ยกเลิก</button>
              <button
                className="px-4 py-2 rounded-md bg-indigo-600 text-white disabled:opacity-50"
                onClick={async () => {
                  try {
                    setIsGenerating(true);
                    await onBaselineInit();
                    setProgress(100);
                    setTimeout(() => setShowConfirm(false), 400);
                  } finally {
                    setIsGenerating(false);
                  }
                }}
                disabled={isGenerating}
              >
                เริ่มดูพื้นดวง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: แสดงพื้นดวงที่เคยดูแล้ว */}
      {showBaseline && baselineSelected && (
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
                <div>{new Date(baselineSelected.created_at).toLocaleString()}</div>
                <div className="text-slate-500">หัวข้อ</div>
                <div>{baselineSelected.topic ?? '-'}</div>
              </div>
              {baselineSelected.payload?.analysis && (
                <div className="rounded-xl border p-3">
                  <div className="font-medium mb-1">คำอธิบายพื้นดวง</div>
                  <div className="whitespace-pre-wrap text-slate-700">
                    {baselineSelected.payload.analysis}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: คำตอบจากพื้นดวง (ถามต่อยอด) */}
      {showFollowup && followup && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowFollowup(false)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(800px,92vw)] max-h-[85vh] overflow-auto bg-white rounded-2xl shadow-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">ผลการวิเคราะห์ (อ้างอิงพื้นดวง)</h3>
              <button className="px-2 py-1 rounded-md border hover:bg-slate-50" onClick={() => setShowFollowup(false)}>ปิด</button>
            </div>
            <div className="text-sm space-y-3">
              <div className="grid grid-cols-[110px_1fr] gap-x-3">
                <div className="text-slate-500">วันที่</div>
                <div>{followup.created_at ? new Date(followup.created_at).toLocaleString() : '-'}</div>
                <div className="text-slate-500">หัวข้อ</div>
                <div>{followup.topic ?? '-'}</div>
              </div>
              {followup.analysis && (
                <div className="rounded-xl border p-3">
                  <div className="font-medium mb-1">คำตอบ</div>
                  <div className="whitespace-pre-wrap text-slate-700">
                    {followup.analysis}
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
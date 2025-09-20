'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import PermissionGate from '@/components/PermissionGate';
import { getProfileDetailsByUserId, type ProfileRow } from '@/lib/profile';
import { ClientSelector } from '@/components/ClientSelector';

type ReadingType = '3cards' | 'weigh' | 'celtic';
type CardPick = { name: string; reversed: boolean };
type ReadingRow = { id: string; created_at: string; topic: string | null; payload: any };

// --- helpers ---------------------------------------------------------------

// แปลง payload → ชื่อประเภทการดู
function getReadingTypeLabel(payload: any): string {
  if (!payload) return 'ไพ่ยิปซี';
  if (Array.isArray(payload.pairs)) return 'เปรียบเทียบ/ชั่งน้ำหนัก (1 ใบ/ตัวเลือก)';
  if (Array.isArray(payload.slots) && payload.slots.length === 10) return 'แบบคลาสสิก 10 ใบ';
  if (Array.isArray(payload.cards) && payload.cards.length === 3) return 'ถามเรื่องเดียว 3 ใบ';
  return 'ไพ่ยิปซี';
}

// ดึงชุดไพ่จาก payload (รองรับทั้ง 3 โหมด)
function getCardsFromPayload(p: any): CardPick[] {
  if (!p) return [];
  if (Array.isArray(p.cards)) return p.cards as CardPick[];
  if (Array.isArray(p.pairs)) return (p.pairs as any[]).map(x => x.card as CardPick);
  if (Array.isArray(p.slots)) return (p.slots as any[]).map(x => x.card as CardPick);
  return [];
}

// --------------------------------------------------------------------------

export default function TarotReadingPage() {
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [clientId, setClientId] = useState<string | null>(null);

  // โปรไฟล์ที่จะโชว์ทางขวา
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // พารามิเตอร์การดูไพ่
  const [readingType, setReadingType] = useState<ReadingType>('3cards');
  const [topic, setTopic] = useState('');
  const [cards, setCards] = useState<CardPick[]>([]);
  const [result, setResult] = useState<string>('');
  const [history, setHistory] = useState<ReadingRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ตัวเลือกสำหรับโหมดชั่งน้ำหนัก (2–3 ตัวเลือก)
  const [options, setOptions] = useState<string[]>(['', '', '']);

  // <<< NEW: modal state สำหรับดูประวัติแบบป๊อปอัป >>>
  const [openView, setOpenView] = useState<ReadingRow | null>(null);

  // ปิดโมดัลด้วย ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenView(null);
    }
    if (openView) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openView]);

  function updateOption(i: number, v: string) {
    setOptions(prev => prev.map((x, idx) => (idx === i ? v : x)));
  }

  function canSubmit(): boolean {
    if (readingType === '3cards') return topic.trim().length > 0; // ต้องมีคำถาม
    if (readingType === 'weigh') return options.map(o => o.trim()).filter(Boolean).length >= 2; // อย่างน้อย 2 ตัวเลือก
    return true; // celtic ไม่ต้องกรอกอะไรเพิ่ม
  }

  // เรียก API Route ให้สุ่มไพ่ + บันทึก Supabase ผ่าน cookies/headers
  async function handleDraw() {
    // เตรียม payload ให้ API ตามโหมด
    let apiPayload: any = {};
    if (readingType === '3cards') {
      apiPayload = { mode: 'threeCards', question: topic.trim() };
    } else if (readingType === 'weigh') {
      const opts = options.map(o => o.trim()).filter(Boolean).slice(0, 3);
      apiPayload = { mode: 'weighOptions', options: opts };
    } else {
      apiPayload = { mode: 'classic10' };
    }

    // แนบ access token ใน Authorization header เพื่อให้ API auth ผ่าน
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch {}

    const res = await fetch('/api/tarot', {
      method: 'POST',
      headers,
      body: JSON.stringify(apiPayload),
    });

    if (!res.ok) return;
    const data = await res.json(); // { ok, reading }
    const r = data?.reading;
    if (!r) return;

    // อัปเดตไพ่บนหน้าจอสำหรับโชว์ทันที
    if (r.payload?.cards) {
      setCards(r.payload.cards);
    } else if (r.payload?.pairs) {
      setCards(r.payload.pairs.map((p: any) => p.card));
    } else if (r.payload?.slots) {
      setCards(r.payload.slots.map((s: any) => s.card));
    }

    // เก็บข้อความคำทำนายจาก API (ถ้ามี)
    setResult(r.payload?.analysis ?? "");

    // prepend ประวัติ
    setHistory(prev => [{ id: r.id, created_at: r.created_at, topic: r.topic, payload: r.payload }, ...prev]);
  }

  // ตรวจ role
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const prof = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
      setRole((prof.data?.role as any) || 'member');
    })();
  }, []);

  // โหลดโปรไฟล์ (ข้อมูลดวง) ตาม role + clientId
  useEffect(() => {
    (async () => {
      setLoadingProfile(true);
      try {
        // target คือ client ที่เลือก (ถ้า admin) หรือ uid ของตัวเอง (ถ้า member)
        let targetUserId: string | null = null;
        if (role === 'admin') {
          targetUserId = clientId ?? null;
        } else {
          const { data: { user } } = await supabase.auth.getUser();
          targetUserId = user?.id ?? null;
        }

        if (!targetUserId) {
          setProfile(null);
          return;
        }

        const p = await getProfileDetailsByUserId(targetUserId);
        setProfile(p);
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, [role, clientId]);

  // โหลดประวัติการดูไพ่ของ user เดียวกัน
  useEffect(() => {
    (async () => {
      setLoadingHistory(true);
      try {
        let targetUserId: string | null = null;
        if (role === 'admin') {
          targetUserId = clientId ?? null;
        } else {
          const { data: { user } } = await supabase.auth.getUser();
          targetUserId = user?.id ?? null;
        }
        if (!targetUserId) {
          setHistory([]);
          return;
        }

        const { data, error } = await supabase
          .from('readings')
          .select('id, created_at, topic, payload')
          .eq('user_id', targetUserId)
          .eq('mode', 'tarot')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setHistory((data ?? []) as ReadingRow[]);
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [role, clientId]);

  return (
    <PermissionGate requirePerms={['tarot']}>
      <div className="max-w-5xl mx-auto p-4 space-y-6">
        <h1 className="text-xl font-semibold">ไพ่ยิปซี (Tarot)</h1>

        {/* แถบเลือก client เฉพาะ admin */}
        {role === 'admin' && (
          <div className="rounded-xl border p-4 space-y-2">
            <div className="text-sm text-slate-600">เลือกลูกดวง</div>
            <ClientSelector value={clientId} onChange={(id) => setClientId(id)} />
          </div>
        )}

        {/* กล่องข้อมูลดวง */}
        <div className="rounded-xl border p-4">
          <div className="font-medium mb-2">ข้อมูลดวง</div>
          {loadingProfile ? (
            <div className="text-sm text-slate-500">กำลังโหลด…</div>
          ) : profile ? (
            <div className="text-sm space-y-1">
              <div>ชื่อ-นามสกุล: {profile.first_name ?? '-'} {profile.last_name ?? ''}</div>
              <div>วัน/เดือน/ปี เกิด: {profile.dob ?? '-'}</div>
              <div>เวลาเกิด: {profile.birth_time ?? '-'}</div>
            </div>
          ) : (
            <div className="text-sm text-slate-500">ยังไม่มีข้อมูล</div>
          )}
        </div>

        {/* ตั้งค่าการดู */}
        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              className={`px-3 py-2 rounded-md border ${readingType==='3cards'?'bg-indigo-600 text-white':'bg-white'}`}
              onClick={() => setReadingType('3cards')}
            >
              ถามเรื่องเดียว 3 ใบ
            </button>
            <button
              type="button"
              className={`px-3 py-2 rounded-md border ${readingType==='weigh'?'bg-indigo-600 text-white':'bg-white'}`}
              onClick={() => setReadingType('weigh')}
            >
              เปรียบเทียบ/ชั่งน้ำหนัก (1 ใบ/ตัวเลือก)
            </button>
            <button
              type="button"
              className={`px-3 py-2 rounded-md border ${readingType==='celtic'?'bg-indigo-600 text-white':'bg-white'}`}
              onClick={() => setReadingType('celtic')}
            >
              แบบคลาสสิก 10 ใบ
            </button>
          </div>

          {readingType === '3cards' && (
            <div>
              <label className="block mb-2 font-medium">พิมพ์คำถาม</label>
              <input
                className="w-full border rounded-md px-3 py-2"
                placeholder="พิมพ์สิ่งที่อยากถาม..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
              <p className="text-sm text-slate-500 mt-1">ระบบจะเปิดไพ่ 3 ใบ และตีความตามคำถามนี้</p>
            </div>
          )}

          {readingType === 'weigh' && (
            <div>
              <label className="block mb-2 font-medium">ใส่ตัวเลือก 2–3 ทาง (1 ใบ/ตัวเลือก)</label>
              <div className="grid gap-3 md:grid-cols-3">
                {options.map((opt, idx) => (
                  <input
                    key={idx}
                    className="w-full border rounded-md px-3 py-2"
                    placeholder={`ตัวเลือกที่ ${idx + 1}`}
                    value={opt}
                    onChange={(e) => updateOption(idx, e.target.value)}
                  />
                ))}
              </div>
              <p className="text-sm text-slate-500 mt-1">
                อย่างน้อย 2 ตัวเลือก ระบบจะเปิดไพ่ 1 ใบต่อ 1 ตัวเลือก แล้วสรุปว่า &quot;ควรเลือกอันไหน เพราะอะไร&quot;
              </p>
            </div>
          )}

          {readingType === 'celtic' && (
            <div className="rounded-xl border p-4">
              <p className="font-medium mb-3">เปิดไพ่ 10 ใบแบบคลาสสิก</p>
              <ol className="grid gap-2 md:grid-cols-2">
                <li>1. สถานการณ์ปัจจุบัน (Present)</li>
                <li>2. อุปสรรค/สิ่งท้าทาย (Challenge)</li>
                <li>3. รากฐาน (Foundation)</li>
                <li>4. อดีต (Past)</li>
                <li>5. ความหวัง/เป้าหมาย (Goal)</li>
                <li>6. อนาคตอันใกล้ (Near Future)</li>
                <li>7. ตัวตน (Self)</li>
                <li>8. สิ่งแวดล้อม (External Influences)</li>
                <li>9. ความหวังและความกลัว (Hopes and Fears)</li>
                <li>10. ผลลัพธ์ (Outcome)</li>
              </ol>
              <p className="text-sm text-slate-500 mt-2">โหมดนี้จะเปิดไพ่ตามตำแหน่งทั้ง 10 โดยไม่ต้องกรอกคำถาม</p>
            </div>
          )}

          <button
            className="px-4 py-2 rounded-md bg-indigo-600 text-white disabled:opacity-50"
            disabled={!canSubmit()}
            onClick={handleDraw}
          >
            ดูดวง
          </button>

          {!!cards.length && (
            <div className="text-sm">
              ไพ่ที่ได้: {cards.map(c => `${c.name}${c.reversed ? ' (กลับหัว)' : ''}`).join(', ')}
            </div>
          )}
          {result && (
            <div className="rounded-xl border p-4 mt-3">
              <div className="font-medium mb-2">คำทำนาย</div>
              <div className="whitespace-pre-wrap text-sm text-slate-700">{result}</div>
            </div>
          )}
        </div>

        {/* ประวัติดูไพ่ */}
        <div className="rounded-xl border p-4">
          <div className="font-medium mb-2">ประวัติดูดวง Tarot</div>
          {loadingHistory ? (
            <div className="text-sm text-slate-500">กำลังโหลด…</div>
          ) : history.length ? (
            <ul className="text-sm space-y-2">
              {history.map(h => (
                <li
                  key={h.id}
                  className="border rounded-md p-2 cursor-pointer hover:bg-slate-50"
                  onClick={() => setOpenView(h)}   // <<< NEW: เปิดป๊อปอัป
                >
                  <div className="text-slate-600">{new Date(h.created_at).toLocaleString()}</div>
                  <div>ประเภท: {getReadingTypeLabel(h.payload)}</div>
                  <div>หัวข้อ: {h.topic ?? '-'}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-slate-500">ยังไม่มีประวัติ</div>
          )}
        </div>
      </div>

      {/* --- Modal แสดงผลประวัติ --- */}
      {openView && (
        <div className="fixed inset-0 z-50">
          {/* backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpenView(null)} />
          {/* dialog */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                          w-[min(720px,90vw)] max-h-[85vh] overflow-auto
                          bg-white rounded-2xl shadow-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">ผลการดูดวง</h3>
              <button
                className="px-2 py-1 rounded-md border hover:bg-slate-50"
                onClick={() => setOpenView(null)}
              >
                ปิด
              </button>
            </div>

            <div className="text-sm space-y-3">
              <div className="grid grid-cols-[110px_1fr] gap-x-3">
                <div className="text-slate-500">วันที่</div>
                <div>{new Date(openView.created_at).toLocaleString()}</div>

                <div className="text-slate-500">ประเภท</div>
                <div>{getReadingTypeLabel(openView.payload)}</div>

                <div className="text-slate-500">หัวข้อ</div>
                <div>{openView.topic ?? '-'}</div>

                <div className="text-slate-500">ไพ่</div>
                <div>
                  {getCardsFromPayload(openView.payload)
                    .map(c => `${c.name}${c.reversed ? ' (กลับหัว)' : ''}`)
                    .join(', ')}
                </div>
              </div>

              {openView.payload?.analysis && (
                <div className="rounded-xl border p-3">
                  <div className="font-medium mb-1">คำทำนาย</div>
                  <div className="whitespace-pre-wrap text-slate-700">
                    {openView.payload.analysis}
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
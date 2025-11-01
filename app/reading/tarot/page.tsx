'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import PermissionGate from '@/components/PermissionGate';
import { getProfileDetailsByUserId, type ProfileRow } from '@/lib/profile';
import { ClientSelector } from '@/components/ClientSelector';

// --- credit costs per mode (used for UI hint only) ------------------------
const TAROT_COST: Record<'threeCards' | 'weighOptions' | 'classic10', number> = {
  threeCards: 1,
  weighOptions: 1,
  classic10: 5,
};

type CreditsMe =
  | { ok: true; balance: number }
  | { ok: true; credits: { balance: number } }
  | { ok: false; error: string };

type ReadingType = '3cards' | 'weigh' | 'celtic';
type CardPick = { name: string; reversed: boolean };
type ReadingRow = {
  id: string;
  created_at: string;
  topic: string | null;
  payload: any;
  content?: string | null; // <<< รับ content จาก DB (เผื่อ payload.analysis ว่าง)
};

// --- helpers ---------------------------------------------------------------

function formatThaiDob(dob?: string | null) {
  if (!dob) return '-';
  const d = new Date(`${dob}T00:00:00`); // avoid TZ shift
  try {
    const raw = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
    // Drop the explicit "พ.ศ." to match design
    let s = raw.replace('พ.ศ. ', '');
    // If it already has "ที่" after weekday, keep it as-is
    if (/วัน\S+ที่\s+\d/.test(s)) return s;
    // Otherwise insert "ที่" between weekday and day
    return s.replace(/^(วัน\S+)\s+(\d)/, '$1ที่ $2');
  } catch {
    return dob;
  }
}

function getReadingTypeLabel(payload: any): string {
  if (!payload) return 'ไพ่ยิปซี';
  if (Array.isArray(payload.pairs)) return 'เปรียบเทียบ/ชั่งน้ำหนัก (1 ใบ/ตัวเลือก)';
  if (Array.isArray(payload.slots) && payload.slots.length === 10) return 'แบบคลาสสิก 10 ใบ';
  if (Array.isArray(payload.cards) && payload.cards.length === 3) return 'ถามเรื่องเดียว 3 ใบ';
  return 'ไพ่ยิปซี';
}

function getCardsFromPayload(p: any): CardPick[] {
  if (!p) return [];
  if (Array.isArray(p.cards)) return p.cards as CardPick[];
  if (Array.isArray(p.pairs)) return (p.pairs as any[]).map(x => x.card as CardPick);
  if (Array.isArray(p.slots)) return (p.slots as any[]).map(x => x.card as CardPick);
  return [];
}

// --- utility: เลือกข้อความคำทำนายที่ “มีจริง” ก่อนเสมอ --------------------
function pickAnalysisText(r?: { payload?: any; content?: string | null }) {
  const a = r?.payload?.analysis;
  const c = r?.content;
  const text = (c && String(c).trim()) || (a && String(a).trim()) || '';
  return text;
}

// --------------------------------------------------------------------------

export default function TarotReadingPage() {
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [clientId, setClientId] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const [readingType, setReadingType] = useState<ReadingType>('3cards');
  const [topic, setTopic] = useState('');
  const [cards, setCards] = useState<CardPick[]>([]);
  const [result, setResult] = useState<string>('');
  const [history, setHistory] = useState<ReadingRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [showConfirm, setShowConfirm] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [progress, setProgress] = useState(0);

  const [options, setOptions] = useState<string[]>(['', '', '']);

  const [openView, setOpenView] = useState<ReadingRow | null>(null);

  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenView(null);
    }
    if (openView) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openView]);

  useEffect(() => {
    let t: any;
    if (isDrawing) {
      setProgress(8);
      t = setInterval(() => {
        setProgress((p) => (p < 92 ? p + Math.random() * 8 : p));
      }, 300);
    } else {
      setProgress(0);
    }
    return () => clearInterval(t);
  }, [isDrawing]);

  function updateOption(i: number, v: string) {
    setOptions(prev => prev.map((x, idx) => (idx === i ? v : x)));
  }

  async function loadCredits(targetUserId?: string) {
    try {
      // admin + มีลูกดวงที่เลือก → ใช้ endpoint แอดมินตาม user_id
      if (role === 'admin' && (targetUserId || clientId)) {
        const uid = targetUserId || clientId!;
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const res = await fetch(`/api/admin/credits?user_id=${encodeURIComponent(uid)}`, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) { setCredits(0); return; }
        const j: any = await res.json();
        const v = Number(j.balance ?? j.carry_balance ?? j.credit ?? j?.credits?.balance ?? 0);
        setCredits(Number.isFinite(v) ? v : 0);
        return;
      }

      // member (หรือ admin ที่ยังไม่ได้เลือกลูกดวง) → ใช้ของตัวเอง
      const res = await fetch('/api/credits/me', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
      });
      if (!res.ok) { setCredits(0); return; }
      const data: any = await res.json();
      const v = Number(
        data.balance ?? data.carry_balance ?? data.credit ?? data.credits?.balance ?? 0
      );
      setCredits(Number.isFinite(v) ? v : 0);
    } catch {
      setCredits(0);
    }
  }

  function canSubmit(): boolean {
    if (readingType === '3cards') return topic.trim().length > 0;
    if (readingType === 'weigh') return options.map(o => o.trim()).filter(Boolean).length >= 2;
    return true;
    // 'celtic' ไม่ต้องกรอกอะไรเพิ่ม
  }

  // ตรวจเครดิตก่อนเปิด modal หรือเรียก API จริง (helper)
  async function checkCreditBeforeOpen(): Promise<number> {
    try {
      if (role === 'admin' && clientId) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const r = await fetch(`/api/admin/credits?user_id=${encodeURIComponent(clientId)}`, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!r.ok) return 0;
        const j: any = await r.json();
        const v = Number(j.balance ?? j.carry_balance ?? j.credit ?? j?.credits?.balance ?? 0);
        return Number.isFinite(v) ? v : 0;
      }
      const r = await fetch('/api/credits/me', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
      });
      if (!r.ok) return 0;
      const j: any = await r.json();
      const v = Number(j.balance ?? j.carry_balance ?? j.credit ?? j?.credits?.balance ?? 0);
      return Number.isFinite(v) ? v : 0;
    } catch {
      return 0;
    }
  }

  // --- เปิดไพ่ + บันทึกผ่าน API Route ---
  async function handleDraw() {
    // ตรวจเครดิตก่อนเรียก API จริง (ให้ logic เหมือนส่วนแสดงผล)
    const cost =
      readingType === '3cards' ? TAROT_COST.threeCards :
      readingType === 'weigh'   ? TAROT_COST.weighOptions :
                                  TAROT_COST.classic10;
    let available = typeof credits === 'number' ? credits : null;
    if (available === null) {
      available = await checkCreditBeforeOpen();
      // sync state เผื่อที่หัวโชว์เป็น '—'
      if (typeof available === 'number') setCredits(available);
    }
    if ((available ?? 0) < cost) {
      alert('เครดิตไม่พอ กรุณาเติมเครดิต หรือรอรีเซ็ตตามแพ็กเกจ');
      setShowConfirm(false);
      return;
    }

    let apiPayload: any = {};
    if (readingType === '3cards') {
      apiPayload = { mode: 'threeCards', question: topic.trim() };
    } else if (readingType === 'weigh') {
      const opts = options.map(o => o.trim()).filter(Boolean).slice(0, 3);
      apiPayload = { mode: 'weighOptions', options: opts };
    } else {
      apiPayload = { mode: 'classic10' };
    }

    const headers: Record<string, string> = { 'content-type': 'application/json' };
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (role === 'admin' && clientId) headers['x-ddt-target-user'] = clientId;
    } catch {}

    setIsDrawing(true);
    let res: Response;
    try {
      res = await fetch('/api/tarot', {
        method: 'POST',
        headers,
        body: JSON.stringify(apiPayload),
        cache: 'no-store',
        credentials: 'include',
      });
    } catch (e) {
      setIsDrawing(false);
      setShowConfirm(false);
      setProgress(100);
      setTimeout(() => setProgress(0), 600);
      alert(`เชื่อมต่อเซิร์ฟเวอร์ไม่ได้: ${(e as Error).message}`);
      return;
    }

    let data: any = null;
    try { data = await res.json(); } catch {}

    if (!res.ok || !data?.ok) {
      setIsDrawing(false);
      setShowConfirm(false);
      setProgress(100);
      setTimeout(() => setProgress(0), 600);

      const isNoCredit =
        res.status === 402 ||
        (typeof data?.error === 'string' && /เครดิตไม่พอ|insufficient\s*credit/i.test(data.error));

      const msg = isNoCredit
        ? 'เครดิตไม่พอ กรุณาเติมเครดิต หรือรอรีเซ็ตตามแพ็กเกจ'
        : (data?.error || `เกิดข้อผิดพลาด (${res.status})`);

      // แสดงข้อความชัดเจนเมื่อเครดิตไม่พอ และไม่เปิด modal แสดงผล
      alert(msg);
      return;
    }

    const r = data?.reading as ReadingRow | undefined;
    if (!r) {
      setIsDrawing(false);
      setShowConfirm(false);
      setProgress(100);
      setTimeout(() => setProgress(0), 600);
      alert('ไม่ได้รับผลการดูไพ่จากเซิร์ฟเวอร์');
      return;
    }

    // อัปเดตไพ่ที่โชว์ทันที (ทุกโหมด)
    if (r.payload?.cards) {
      setCards(r.payload.cards);
    } else if (r.payload?.pairs) {
      setCards(r.payload.pairs.map((p: any) => p.card));
    } else if (r.payload?.slots) {
      setCards(r.payload.slots.map((s: any) => s.card));
    }

    // ✅ ใช้ content → payload.analysis เป็นลำดับ
    setResult(pickAnalysisText(r));

    // เปิดป๊อปอัปผลล่าสุด
    setOpenView({
      id: r.id,
      created_at: r.created_at,
      topic: r.topic,
      payload: r.payload,
      content: r.content,
    });

    // prepend ประวัติ
    setHistory(prev => [
      {
        id: r.id,
        created_at: r.created_at,
        topic: r.topic,
        payload: r.payload,
        content: r.content,
      },
      ...prev
    ]);

    // รีเฟรชยอดเครดิตในเพจนี้ด้วย
    loadCredits().catch(() => {});
    // รีเฟรชยอดเครดิตบนหัวเว็บ (ถ้ามี listener ฝั่ง TopNav)
    try {
      await fetch('/api/credits/me', { method: 'GET', cache: 'no-store' });
      // ให้ส่วนหัวที่แสดงเครดิต สามารถฟัง event นี้เพื่ออัปเดต
      window.dispatchEvent(new CustomEvent('credits:refresh'));
    } catch {}

    setIsDrawing(false);
    setShowConfirm(false);
    setProgress(100);
    setTimeout(() => setProgress(0), 600);
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

  // โหลดโปรไฟล์ (ข้อมูลดวง)
  useEffect(() => {
    (async () => {
      setLoadingProfile(true);
      try {
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

  // โหลดประวัติการดูไพ่
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
          .select('id, created_at, topic, payload, content') // <<< รวม content มาด้วย
          .eq('user_id', targetUserId)
          .eq('type', 'tarot')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setHistory((data ?? []) as ReadingRow[]);
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [role, clientId]);

  useEffect(() => {
    // โหลดเครดิตตามบทบาท/ลูกดวงที่เลือก
    loadCredits(clientId ?? undefined);
    const onRefresh = () => loadCredits(clientId ?? undefined);
    window.addEventListener('credits:refresh', onRefresh);
    return () => window.removeEventListener('credits:refresh', onRefresh);
  }, [role, clientId]);

  return (
    <PermissionGate requirePerms={['tarot']}>
      <div className="max-w-5xl mx-auto p-4 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">ไพ่ยิปซี (Tarot)</h1>
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-full border px-3 py-1 bg-white">
              เครดิตคงเหลือ: {credits ?? '—'}
            </span>
            <span className="rounded-full border px-3 py-1 bg-slate-50">
              ใช้ต่อครั้ง: {
                readingType === '3cards'
                  ? TAROT_COST.threeCards
                  : readingType === 'weigh'
                  ? TAROT_COST.weighOptions
                  : TAROT_COST.classic10
              }
            </span>
          </div>
        </div>

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
              <div>เกิด {formatThaiDob(profile.dob)}</div>
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
            onClick={() => setShowConfirm(true)}
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
              <div className="whitespace-pre-wrap text-slate-700">{result}</div>
            </div>
          )}
        </div>

        {/* ประวัติ */}
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
                  onClick={() => setOpenView(h)}
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

      {/* Modal ก่อนเริ่ม */}
      {showConfirm && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => !isDrawing && setShowConfirm(false)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(720px,90vw)] max-h-[85vh] overflow-auto bg-white rounded-2xl shadow-xl p-5">
            <h3 className="text-lg font-semibold mb-3">เตรียมจิตก่อนเปิดไพ่</h3>
            <div className="text-sm whitespace-pre-wrap bg-slate-50 rounded-xl p-4">
              {`นั่งในท่าสบาย ๆ หายใจเข้าออกสักครู่ แล้วตั้งจิตอธิษฐาน

“ข้าพเจ้า ${`${(profile?.first_name ?? '')} ${(profile?.last_name ?? '')}`.trim() || '-'} เกิด ${formatThaiDob(profile?.dob)}
ขอนอบน้อมต่อสิ่งศักดิ์สิทธิ์ทั้งหลาย
ขอบารมีพระพุทธ พระธรรม พระสงฆ์ เทพเทวา ครูบาอาจารย์ และพลังแห่งจักรวาล
โปรดเปิดทางแห่งความจริงให้ปรากฏ
ขอให้คำทำนายครั้งนี้ชัดเจน ตรงไปตรงมา เพื่อประโยชน์สูงสุดของข้าพเจ้า

ขอให้จิตของข้าพเจ้าสงบ สะอาด และเปิดรับอย่างบริสุทธิ์
หากสิ่งใดควรรู้ ขอให้ไพ่เปิดเผย
หากสิ่งใดควรระวัง ขอให้ไพ่เตือน
หากสิ่งใดควรหลีกเลี่ยง ขอให้ไพ่ชี้แนะ
ด้วยจิตศรัทธาและเคารพเป็นอย่างสูง”`}
            </div>
            {isDrawing ? (
              <div className="mt-4">
                <div className="h-2 w-full rounded bg-slate-200 overflow-hidden">
                  <div className="h-2 bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs text-slate-500 mt-2">กรุณารอสักครู่…</p>
              </div>
            ) : null}
            <div className="flex justify-end gap-2 mt-5">
              <button className="px-3 py-2 rounded-md border" onClick={() => setShowConfirm(false)} disabled={isDrawing}>ยกเลิก</button>
              <button className="px-4 py-2 rounded-md bg-indigo-600 text-white disabled:opacity-50" onClick={handleDraw} disabled={isDrawing}>เปิดไพ่</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal แสดงผล */}
      {openView && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpenView(null)} />
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

              {/* ✅ ใช้ content → payload.analysis */}
              {pickAnalysisText(openView) && (
                <div className="rounded-xl border p-3">
                  <div className="font-medium mb-1">คำทำนาย</div>
                  <div className="whitespace-pre-wrap text-slate-700">
                    {pickAnalysisText(openView)}
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
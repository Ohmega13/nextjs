'use client';

import { useEffect, useState, useCallback } from 'react';
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

// --- feature keys & buckets (keep in sync with API & credit_rules.feature) ----
const FEATURE_KEY_BY_MODE: Record<'threeCards' | 'weighOptions' | 'classic10', string> = {
  threeCards: 'tarot_3',
  weighOptions: 'tarot_weight',
  classic10: 'tarot_10',
};

function buildBuckets(mode: 'threeCards' | 'weighOptions' | 'classic10') {
  const primary = FEATURE_KEY_BY_MODE[mode];
  // try most specific first, then generic ones
  const seq = [primary, 'tarot', 'global'];
  // dedupe while preserving order
  return Array.from(new Set(seq));
}

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

/** Normalize any server response shape into a numeric balance */
function extractBalance(raw: any): number {
  const d = raw?.data ?? raw;
  const n = Number(
    d?.remaining_total ??
    d?.remaining ??
    d?.balance ??
    d?.carry_balance ??
    d?.credit ??
    d?.credits?.balance ??
    d?.creditsRemaining ??
    d?.newBalance ?? // some API may return this naked
    0
  );
  return Number.isFinite(n) ? n : 0;
}

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, _session) => {
      loadCredits(clientId ?? undefined);
      window.dispatchEvent(new CustomEvent('credits:refresh'));
    });
    return () => { sub.subscription?.unsubscribe?.(); };
  }, [clientId, loadCredits, supabase]);
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

  const loadCredits = useCallback(async (targetUserId?: string) => {
    try {
      // Admin must select a client to show credits
      if (role === 'admin' && !(targetUserId || clientId)) {
        setCredits(null);
        return;
      }
      const uid =
        role === 'admin' && (targetUserId || clientId)
          ? (targetUserId || clientId!)
          : '';

      // Build URL with hard cache-buster
      const qs = new URLSearchParams();
      if (uid) qs.set('user_id', uid);
      qs.set('t', `${Date.now()}`);
      qs.set('_', Math.random().toString(36).slice(2));
      const url = `/api/credits/me?${qs.toString()}`;

      // Prepare headers
      const headers: Record<string, string> = {
        accept: 'application/json',
        'cache-control': 'no-cache, no-store, max-age=0',
        pragma: 'no-cache',
        'x-no-cache': `${Date.now()}`,
      };
      if (uid) {
        headers['x-ddt-target-user'] = uid;
        headers['X-DDT-Target-User'] = uid;
        headers['x-ddt-targetuser'] = uid;
        headers['x-ddt-target-user-id'] = uid;
      }
      // Forward URL context so the API route can reconstruct NextRequest URL
      try {
        const loc = window.location;
        headers['x-url'] = loc.href;
        headers['x-forwarded-host'] = loc.host;
        headers['x-forwarded-proto'] = loc.protocol.replace(':','');
      } catch {}
      // Attach Supabase access token if available (helps when cookies are not forwarded)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) headers['authorization'] = `Bearer ${token}`;
      } catch {}

      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
        headers,
      });

      // Fallback retry: some proxies strip custom headers
      if (!res.ok) {
        try {
          const res2 = await fetch(url, {
            method: 'GET',
            cache: 'no-store',
            credentials: 'include',
            headers: { accept: 'application/json' },
          });
          if (res2.ok) {
            const j2 = await res2.json().catch(() => 0);
            const nb2 = typeof j2 === 'number' ? j2 : extractBalance(j2);
            if (Number.isFinite(nb2)) {
              setCredits(nb2 as number);
              return;
            }
          }
        } catch {}
      }

      // Try parse JSON; if parse fails, fall back to 0
      let next = 0;
      try {
        const j = await res.json();
        // Support plain number or wrapped object
        if (typeof j === 'number') {
          next = j;
        } else {
          next = extractBalance(j);
        }
      } catch {
        next = 0;
      }
      setCredits(Number.isFinite(next) ? next : 0);
    } catch {
      setCredits(0);
    }
  }, [role, clientId]);

  function canSubmit(): boolean {
    // แอดมินต้องเลือกลูกดวงก่อน
    if (role === 'admin' && !clientId) return false;

    if (readingType === '3cards') return topic.trim().length > 0;
    if (readingType === 'weigh') return options.map(o => o.trim()).filter(Boolean).length >= 2;
    return true; // 'celtic' ไม่ต้องกรอกอะไรเพิ่ม
  }

  // ตรวจเครดิตก่อนเปิด modal หรือเรียก API จริง (helper)
  const checkCreditBeforeOpen = useCallback(async (): Promise<number> => {
    try {
      // If admin but no selected client, treat as 0 to block purchase
      if (role === 'admin' && !clientId) return 0;

      const uid = role === 'admin' && clientId ? clientId : '';
      const qs = new URLSearchParams();
      if (uid) qs.set('user_id', uid);
      qs.set('t', `${Date.now()}`);
      qs.set('_', Math.random().toString(36).slice(2));
      const url = `/api/credits/me?${qs.toString()}`;

      const headers: Record<string, string> = {
        accept: 'application/json',
        'cache-control': 'no-cache, no-store, max-age=0',
        pragma: 'no-cache',
        'x-no-cache': `${Date.now()}`,
      };
      if (uid) {
        headers['x-ddt-target-user'] = uid;
        headers['X-DDT-Target-User'] = uid;
        headers['x-ddt-targetuser'] = uid;
        headers['x-ddt-target-user-id'] = uid;
      }
      try {
        const loc = window.location;
        headers['x-url'] = loc.href;
        headers['x-forwarded-host'] = loc.host;
        headers['x-forwarded-proto'] = loc.protocol.replace(':','');
      } catch {}
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) headers['authorization'] = `Bearer ${token}`;
      } catch {}

      const r = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
        headers,
      });

      // Fallback retry: some proxies strip custom headers
      if (!r.ok) {
        try {
          const r2 = await fetch(url, {
            method: 'GET',
            cache: 'no-store',
            credentials: 'include',
            headers: { accept: 'application/json' },
          });
          if (r2.ok) {
            const j2 = await r2.json().catch(() => 0);
            const nb2 = typeof j2 === 'number' ? j2 : extractBalance(j2);
            if (Number.isFinite(nb2)) return nb2 as number;
          }
        } catch {}
      }

      let v = 0;
      try {
        const j = await r.json();
        if (typeof j === 'number') v = j;
        else v = extractBalance(j);
      } catch {
        v = 0;
      }
      return Number.isFinite(v) ? v : 0;
    } catch {
      return 0;
    }
  }, [role, clientId]);
  useEffect(() => {
    // reset visible balance when switching context to prevent stale display
    if (role === 'admin' && !clientId) {
      setCredits(null);
    }
  }, [role, clientId]);

  // --- เปิดไพ่ + บันทึกผ่าน API Route ---
  async function handleDraw() {
    // ตรวจเครดิตก่อนเรียก API จริง (ให้ logic เหมือนส่วนแสดงผล)
    const cost =
      readingType === '3cards' ? TAROT_COST.threeCards :
      readingType === 'weigh'   ? TAROT_COST.weighOptions :
                                  TAROT_COST.classic10;

    // unify mode/featureKey/buckets
    const modeStr: 'threeCards' | 'weighOptions' | 'classic10' =
      readingType === '3cards' ? 'threeCards' :
      readingType === 'weigh'   ? 'weighOptions' :
                                  'classic10';
    const featureKey = FEATURE_KEY_BY_MODE[modeStr];
    const bucketsToTry = buildBuckets(modeStr);

    // ดึงเครดิตล่าสุดจากเซิร์ฟเวอร์ทุกครั้ง (อย่าพึ่งพา state ภายในรอบนี้)
    const available = await checkCreditBeforeOpen();
    if (typeof available === 'number') {
      // ซิงก์ state ไว้ให้ UI หัวเพจอัปเดต
      setCredits(available);
    }
    if ((available ?? 0) < cost) {
      alert('เครดิตไม่พอ กรุณาเติมเครดิต หรือรอรีเซ็ตตามแพ็กเกจ');
      setShowConfirm(false);
      return;
    }

    let apiPayload: any = {};
    if (readingType === '3cards') {
      apiPayload = { question: topic.trim() };
    } else if (readingType === 'weigh') {
      const opts = options.map(o => o.trim()).filter(Boolean).slice(0, 3);
      apiPayload = { options: opts };
    } else {
      apiPayload = {};
    }
    // ✅ ถ้าเป็นแอดมินและเลือกลูกดวงอยู่ ให้ส่ง user_id ไปใน payload ด้วย
    // เพื่อเป็น fallback กรณี header ถูกตัดทิ้งระหว่างทาง (เช่นผ่าน proxy)
    if (role === 'admin' && clientId) {
      apiPayload.user_id = clientId;           // server may expect user_id
      apiPayload.targetUserId = clientId;      // or targetUserId
      apiPayload.client_id = clientId;         // some routes expect client_id
      apiPayload.targetClientId = clientId;    // or targetClientId
    }
    // append common fields
    apiPayload = {
      ...apiPayload,
      featureKey,
      cost,
      mode: modeStr,
      primaryBucket: featureKey,
      bucketsToTry,
    };

    // Build headers for tarot API: always send credentials and (if admin) the target user
    const hdrs = new Headers({ 'Content-Type': 'application/json' });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) {
        hdrs.set('Authorization', `Bearer ${token}`);
      }
      if (role === 'admin' && clientId) {
        hdrs.set('x-ddt-target-user', clientId);
        hdrs.set('X-DDT-Target-User', clientId);
        hdrs.set('x-ddt-targetUser', clientId);
        hdrs.set('x-ddt-target-client', clientId);   // some APIs use client id
        hdrs.set('X-DDT-Target-Client', clientId);
        hdrs.set('x-ddt-targetuser', clientId);        // อีกเวอร์ชันตัวพิมพ์เล็กติดกัน (บาง proxy ใช้อันนี้)
        hdrs.set('x-ddt-target-user-id', clientId);    // เผื่อ API คาดชื่อนี้
      }
      hdrs.set('x-ddt-feature-key', featureKey);
      hdrs.set('X-DDT-Feature-Key', featureKey);
      hdrs.set('x-ddt-mode', modeStr);
      hdrs.set('x-ddt-cost', String(cost));
      hdrs.set('x-ddt-buckets', JSON.stringify(bucketsToTry));
      hdrs.set('x-ddt-primary-bucket', featureKey);
    } catch {}

    setIsDrawing(true);
    let res: Response;
    try {
      res = await fetch('/api/tarot', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify(apiPayload),
        cache: 'no-store',
        credentials: 'include',
      });
      // Fallback: บางโฮส/Proxy อาจตัด header ผู้ใช้เป้าหมายทิ้ง ลองส่งผ่าน query แทน
      if (!res.ok && role === 'admin' && clientId) {
        res = await fetch(`/api/tarot?user_id=${encodeURIComponent(clientId)}`, {
          method: 'POST',
          headers: hdrs,
          body: JSON.stringify(apiPayload),
          cache: 'no-store',
          credentials: 'include',
        });
      }
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

    // Try to extract the balance from the primary payload first
    let newBalanceFromPayload = extractBalance(data);
    // If not found, attempt known debug paths
    if (!Number.isFinite(newBalanceFromPayload) || newBalanceFromPayload === 0) {
      const dbg = data?.debug?.creditDebug;
      const nb = Number(
        dbg?.newBalance ??
        dbg?.after ??
        data?.balanceAfter ??
        data?.remaining_after ??
        0
      );
      if (Number.isFinite(nb) && nb > 0) newBalanceFromPayload = nb;
    }

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

      // ซิงก์ยอดล่าสุดจากเซิร์ฟเวอร์ (กันหัวเว็บ/เพจไม่ตรงกัน)
      loadCredits(clientId ?? undefined).catch(() => {});
      window.dispatchEvent(new CustomEvent('credits:refresh'));

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

    // อัปเดตเครดิตแบบ Optimistic/Authoritative: ใช้ค่าจาก payload ก่อน ถ้าไม่มีค่อยหักตาม cost
    if (Number.isFinite(newBalanceFromPayload)) {
      setCredits(Math.max(0, Number(newBalanceFromPayload)));
    } else {
      setCredits((prev) => {
        const cur = Number(prev ?? 0);
        return Number.isFinite(cur) ? Math.max(0, cur - cost) : cur;
      });
    }

    // รีเฟรชอีกครั้งแบบ authoritative และแจ้ง global header
    await loadCredits(clientId ?? undefined).catch(() => {});
    window.dispatchEvent(new CustomEvent('credits:refresh'));

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
      let roleValue: string | null = null;
      // Try schema where profiles.user_id references auth id
      {
        const prof = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
        roleValue = (prof.data?.role as any) ?? null;
      }
      // Fallback schema where profiles.id is the auth id
      if (!roleValue) {
        const prof2 = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
        roleValue = (prof2.data?.role as any) ?? null;
      }
      setRole(((roleValue || '') as string).toLowerCase() === 'admin' ? 'admin' : 'member');
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
    loadCredits(clientId ?? undefined);
    const onRefresh = () => loadCredits(clientId ?? undefined);
    const onVisible = () => { if (!document.hidden) loadCredits(clientId ?? undefined); };
    window.addEventListener('credits:refresh', onRefresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('credits:refresh', onRefresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [clientId, role, loadCredits]);

  return (
    <PermissionGate requirePerms={['tarot']}>
      <div className="max-w-5xl mx-auto p-4 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">ไพ่ยิปซี (Tarot)</h1>
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-full border px-3 py-1 bg-white">
              เครดิตคงเหลือ: {role === 'admin' && !clientId ? '—' : ((credits ?? null) === null ? '—' : credits)}
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
            onClick={async () => {
              // ตรวจเครดิตล่วงหน้าก่อนเปิด modal เพื่อลดโอกาสโดน 402 จากฝั่งเซิร์ฟเวอร์
              const cost =
                readingType === '3cards' ? TAROT_COST.threeCards :
                readingType === 'weigh'   ? TAROT_COST.weighOptions :
                                            TAROT_COST.classic10;

              const available = await checkCreditBeforeOpen();
              if (typeof available === 'number') setCredits(available);

              if ((available ?? 0) < cost) {
                alert('เครดิตไม่พอ กรุณาเติมเครดิต หรือรอรีเซ็ตตามแพ็กเกจ');
                return;
              }

              // ผ่านเงื่อนไข → เปิด modal ต่อได้
              setShowConfirm(true);
            }}
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
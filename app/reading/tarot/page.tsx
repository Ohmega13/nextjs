'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import PermissionGate from '@/components/PermissionGate';
import { getProfileDetailsByUserId, type ProfileRow } from '@/lib/profile';
import { ClientSelector } from '@/components/ClientSelector';

type ReadingType = '3cards' | 'weigh' | 'celtic';
type CardPick = { name: string; reversed: boolean };
type ReadingRow = { id: string; created_at: string; topic: string | null; payload: any };

const FULL_DECK: string[] = [
  'The Fool','The Magician','The High Priestess','The Empress','The Emperor',
  'The Hierophant','The Lovers','The Chariot','Strength','The Hermit',
  'Wheel of Fortune','Justice','The Hanged Man','Death','Temperance',
  'The Devil','The Tower','The Star','The Moon','The Sun','Judgement','The World',
];

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

  // (ตัวอย่าง) โหลดประวัติการดูไพ่ของ user เดียวกัน
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

  // ฟังก์ชันสุ่มไพ่ (เดิมของคุณ)
  const drawCards = (count: number) => {
    const picks: CardPick[] = [];
    const used = new Set<number>();
    while (picks.length < count) {
      const i = Math.floor(Math.random() * FULL_DECK.length);
      if (used.has(i)) continue;
      used.add(i);
      picks.push({ name: FULL_DECK[i], reversed: Math.random() < 0.5 });
    }
    setCards(picks);
  };

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
              {/* Tarot ไม่ได้ใช้สถานที่เกิดก็ได้ ถ้าจะโชว์ก็เพิ่มบรรทัดนี้ */}
              {/* <div>สถานที่เกิด: {profile.birth_place ?? '-'}</div> */}
            </div>
          ) : (
            <div className="text-sm text-slate-500">ยังไม่มีข้อมูล</div>
          )}
        </div>

        {/* ตั้งค่าการดู */}
        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex gap-2">
            <button
              className={`px-3 py-2 rounded-md border ${readingType==='3cards'?'bg-indigo-600 text-white':'bg-white'}`}
              onClick={() => setReadingType('3cards')}
            >
              ถามเรื่องต่างๆ 3 ใบ
            </button>
            <button
              className={`px-3 py-2 rounded-md border ${readingType==='weigh'?'bg-indigo-600 text-white':'bg-white'}`}
              onClick={() => setReadingType('weigh')}
            >
              ถามจ้อหนึ่งหน้า 1 ใบต่อตัวเลือก
            </button>
            <button
              className={`px-3 py-2 rounded-md border ${readingType==='celtic'?'bg-indigo-600 text-white':'bg-white'}`}
              onClick={() => setReadingType('celtic')}
            >
              แบบคาสสิค 10 ใบ
            </button>
          </div>

          <input
            className="w-full border rounded-md px-3 py-2"
            placeholder="พิมพ์สิ่งที่อยากถาม"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />

          <button
            className="px-4 py-2 rounded-md bg-indigo-600 text-white"
            onClick={() => drawCards(readingType === '3cards' ? 3 : readingType === 'weigh' ? 2 : 10)}
          >
            ดูดวง
          </button>

          {!!cards.length && (
            <div className="text-sm">
              ไพ่ที่ได้: {cards.map(c => `${c.name}${c.reversed ? ' (กลับหัว)' : ''}`).join(', ')}
            </div>
          )}
          {!!result && <div className="text-sm text-slate-700">{result}</div>}
        </div>

        {/* ประวัติดูไพ่ */}
        <div className="rounded-xl border p-4">
          <div className="font-medium mb-2">ประวัติดูดวง Tarot</div>
          {loadingHistory ? (
            <div className="text-sm text-slate-500">กำลังโหลด…</div>
          ) : history.length ? (
            <ul className="text-sm space-y-2">
              {history.map(h => (
                <li key={h.id} className="border rounded-md p-2">
                  <div className="text-slate-600">{new Date(h.created_at).toLocaleString()}</div>
                  <div>หัวข้อ: {h.topic ?? '-'}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-slate-500">ยังไม่มีประวัติ</div>
          )}
        </div>
      </div>
    </PermissionGate>
  );
}
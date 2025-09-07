'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import PermissionGate from '@/app/components/PermissionGate';

type Role = 'admin' | 'member' | null;

type ProfileDetails = {
  user_id: string;
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
  dob?: string | null;
  birth_time?: string | null;
  birth_place?: string | null;
};

type ClientLite = {
  user_id: string;
  display: string;
  dob?: string | null;
};

type CardPick = { name: string; reversed: boolean };

const MAJOR_ARCANA = [
  'The Fool','The Magician','The High Priestess','The Empress','The Emperor',
  'The Hierophant','The Lovers','The Chariot','Strength','The Hermit',
  'Wheel of Fortune','Justice','The Hanged Man','Death','Temperance',
  'The Devil','The Tower','The Star','The Moon','The Sun','Judgement','The World'
];

function drawCardsFrom(deckInput: string[], count: number): CardPick[] {
  const deck = [...deckInput];
  const picks: CardPick[] = [];
  const n = Math.min(count, deck.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * deck.length);
    const name = deck.splice(idx, 1)[0];
    const reversed = Math.random() < 0.48;
    picks.push({ name, reversed });
  }
  return picks;
}

export default function TarotReadingPage() {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role>(null);
  const [me, setMe] = useState<ProfileDetails | null>(null);

  // admin-only list of all members (from profile_details)
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>(''); // whose info to show (admin only)

  // reading input
  const [topic, setTopic] = useState('');
  const [spread, setSpread] = useState<'3-cards' | 'weighing' | 'classic-10'>('3-cards');
  const [weighingOptions, setWeighingOptions] = useState<string>('ตัวเลือก A\nตัวเลือก B');

  // output cards
  const [cards, setCards] = useState<CardPick[]>([]);

  // ==== bootstrap: figure out role and load details ====
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      setLoading(true);
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!user) {
          setRole(null);
          setMe(null);
          setClients([]);
          return;
        }

        // role from profiles
        const { data: prof } = await supabase
          .from('profiles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        const r: Role = (prof?.role as Role) ?? 'member';
        if (!cancelled) setRole(r);

        // load my details
        const { data: myDet } = await supabase
          .from('profile_details')
          .select('user_id, first_name, last_name, nickname, dob, birth_time, birth_place')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!cancelled) setMe((myDet as ProfileDetails) ?? null);

        // if admin, load others to choose from
        if (r === 'admin') {
          const { data: all } = await supabase
            .from('profile_details')
            .select('user_id, first_name, last_name, nickname, dob')
            .order('updated_at', { ascending: false })
            .limit(500);

          const list: ClientLite[] = (all ?? []).map((x: any) => ({
            user_id: x.user_id,
            display: x.nickname || `${x.first_name ?? ''} ${x.last_name ?? ''}`.trim() || x.user_id,
            dob: x.dob ?? null,
          }));
          if (!cancelled) {
            setClients(list);
            if (list.length && !selectedUserId) setSelectedUserId(list[0].user_id);
          }
        }
      } catch (e) {
        console.error('Tarot bootstrap error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    bootstrap();
    return () => { cancelled = true; };
  }, []);

  // details to show on the form (admin can switch)
  const currentTargetUserId = useMemo(() => {
    if (role === 'admin' && selectedUserId) return selectedUserId;
    return me?.user_id ?? '';
  }, [role, selectedUserId, me?.user_id]);

  const currentTargetDisplay = useMemo(() => {
    if (role === 'admin' && selectedUserId) {
      const f = clients.find(c => c.user_id === selectedUserId);
      return f?.display ?? '';
    }
    const n = me?.nickname || `${me?.first_name ?? ''} ${me?.last_name ?? ''}`.trim();
    return n || '';
  }, [role, selectedUserId, clients, me]);

  const onDraw = () => {
    const deck = MAJOR_ARCANA; // TODO: extend to Minor Arcana ifต้องการ
    if (spread === '3-cards') {
      setCards(drawCardsFrom(deck, 3));
    } else if (spread === 'classic-10') {
      setCards(drawCardsFrom(deck, 10));
    } else {
      // weighing: draw 1 per option
      const options = weighingOptions
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
      const picks = options.map(() => drawCardsFrom(deck, 1)[0]);
      setCards(picks);
    }
  };

  const onSave = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('กรุณาเข้าสู่ระบบ');
        return;
      }
      // payload to store
      const payload: any = {
        topic,
        spread,
        cards,
        target_user_id: currentTargetUserId || null,
        target_name: currentTargetDisplay || null,
        options: spread === 'weighing'
          ? weighingOptions.split('\n').map(s => s.trim()).filter(Boolean)
          : undefined,
      };

      const insertBody = {
        user_id: user.id,
        client_id: null, // ถ้าอยากโยงไปยังตารางอื่นค่อยอัปเดตภายหลัง
        mode: 'tarot' as const,
        topic: topic || null,
        payload,
      };

      const { error } = await supabase.from('readings').insert(insertBody);
      if (error) throw error;

      alert('บันทึกประวัติเรียบร้อย');
    } catch (e: any) {
      console.error('save tarot error:', e);
      alert(`บันทึกไม่สำเร็จ: ${e?.message ?? e}`);
    }
  };

  return (
    <PermissionGate requirePerms={['tarot']}>
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Link href="/reading" className="underline hover:text-indigo-600">เลือกประเภทการดูดวง</Link>
          <span>/</span>
          <span className="text-slate-900 font-medium">ไพ่ยิปซี</span>
        </div>

        <h1 className="text-xl font-semibold">ไพ่ยิปซี (Tarot)</h1>

        {/* Target person (admin sees dropdown; member sees their own info) */}
        <div className="rounded-xl border p-4 space-y-3">
          <h2 className="font-medium">ข้อมูลลูกดวง</h2>

          {role === 'admin' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm text-slate-600">เลือกลูกดวง</label>
                <select
                  className="mt-1 w-full rounded-lg border-slate-300"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  {clients.map(c => (
                    <option key={c.user_id} value={c.user_id}>
                      {c.display} {c.dob ? `• เกิด: ${c.dob}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-sm text-slate-600 self-end">
                <p>ชื่อ: <span className="font-medium">{currentTargetDisplay || '-'}</span></p>
                <p>วันเกิด: <span className="font-medium">{clients.find(x => x.user_id === selectedUserId)?.dob || '-'}</span></p>
              </div>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3 text-sm text-slate-700">
              <p>ชื่อ: <span className="font-medium">{currentTargetDisplay || '-'}</span></p>
              <p>วันเกิด: <span className="font-medium">{me?.dob || '-'}</span></p>
              <p>เวลาเกิด: <span className="font-medium">{me?.birth_time || '-'}</span></p>
              <p>สถานที่เกิด: <span className="font-medium">{me?.birth_place || '-'}</span></p>
            </div>
          )}
        </div>

        {/* reading controls */}
        <div className="rounded-xl border p-4 space-y-4">
          <div>
            <label className="block text-sm text-slate-600">หัวข้อ / คำถาม</label>
            <input
              className="mt-1 w-full rounded-lg border-slate-300"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="พิมพ์สิ่งที่อยากถาม"
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm text-slate-600">ประเภทการเปิดไพ่</div>
            <div className="grid sm:grid-cols-3 gap-2">
              <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer">
                <input
                  type="radio"
                  name="spread"
                  value="3-cards"
                  checked={spread === '3-cards'}
                  onChange={() => setSpread('3-cards')}
                />
                <span>ถามเรื่องต่างๆ 3 ใบ</span>
              </label>
              <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer">
                <input
                  type="radio"
                  name="spread"
                  value="weighing"
                  checked={spread === 'weighing'}
                  onChange={() => setSpread('weighing')}
                />
                <span>ถามชั่งน้ำหนัก (1 ใบต่อตัวเลือก)</span>
              </label>
              <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer">
                <input
                  type="radio"
                  name="spread"
                  value="classic-10"
                  checked={spread === 'classic-10'}
                  onChange={() => setSpread('classic-10')}
                />
                <span>แบบคลาสสิก 10 ใบ</span>
              </label>
            </div>
          </div>

          {spread === 'weighing' && (
            <div>
              <label className="block text-sm text-slate-600">ตัวเลือก (พิมพ์ทีละบรรทัด)</label>
              <textarea
                className="mt-1 w-full rounded-lg border-slate-300 min-h-[100px]"
                value={weighingOptions}
                onChange={(e) => setWeighingOptions(e.target.value)}
              />
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-lg bg-indigo-600 text-white px-4 py-2"
              onClick={onDraw}
            >
              ดูดวง
            </button>
            <button
              className="rounded-lg border px-4 py-2 disabled:opacity-60"
              disabled={!cards.length}
              onClick={onSave}
            >
              บันทึกประวัติ
            </button>
          </div>
        </div>

        {/* results */}
        <div className="rounded-xl border p-4 space-y-3">
          <h2 className="font-medium">ผลการเปิดไพ่</h2>
          {cards.length === 0 ? (
            <div className="text-sm text-slate-500">ยังไม่มีผลลัพธ์</div>
          ) : (
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {cards.map((c, i) => (
                <li key={i}>
                  {c.name} {c.reversed ? '(กลับหัว)' : ''}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-500 mt-2">* หมายเหตุ: ตัวอย่างนี้สุ่มจาก Major Arcana. สามารถขยายสำรับให้ครบได้ภายหลัง</p>
        </div>
      </div>
    </PermissionGate>
  );
}
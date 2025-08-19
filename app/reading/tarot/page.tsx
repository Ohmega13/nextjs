'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import PermissionGate from '@/components/PermissionGate';
import ClientPicker from '@/components/ClientPicker';

type CardPick = { name: string; reversed: boolean };

export default function TarotReadingPage() {
  const [topic, setTopic] = useState('');
  const [cards, setCards] = useState<CardPick[]>([]);
  const [role, setRole] = useState<string | null>(null);

  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || ignore) return;
      const { data } = await supabase
        .from('profiles')
        .select('role, display_name')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!ignore) setRole((data as any)?.role ?? null);
    })();
    return () => { ignore = true; };
  }, []);

  const fullDeck: string[] = [
    'The Fool','The Magician','The High Priestess','The Empress','The Emperor',
    'The Hierophant','The Lovers','The Chariot','Strength','The Hermit',
    'Wheel of Fortune','Justice','The Hanged Man','Death','Temperance',
    'The Devil','The Tower','The Star','The Moon','The Sun','Judgement','The World',
  ];

  function draw(count: number) {
    const deck = [...fullDeck];
    const picks: CardPick[] = [];
    for (let i = 0; i < Math.min(count, deck.length); i++) {
      const idx = Math.floor(Math.random() * deck.length);
      const name = deck.splice(idx, 1)[0];
      const reversed = Math.random() < 0.48;
      picks.push({ name, reversed });
    }
    setCards(picks);
  }

  function saveToHistory() {
    type HistoryItem = {
      id: string;
      date: string;
      mode: 'tarot';
      topic?: string;
      cards: CardPick[];
      clientId?: string | null;
      clientName?: string | null;
    };

    const item: HistoryItem = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      mode: 'tarot',
      topic,
      cards,
      clientId: role === 'admin' ? clientId : null,
      clientName: role === 'admin' ? clientName : null,
    };

    try {
      const raw = localStorage.getItem('ddt_history');
      const arr = raw ? (JSON.parse(raw) as HistoryItem[]) : [];
      arr.unshift(item);
      localStorage.setItem('ddt_history', JSON.stringify(arr));
      alert('บันทึกประวัติแล้ว');
    } catch {
      alert('บันทึกไม่สำเร็จ');
    }
  }

  return (
    <PermissionGate requirePerms={['tarot']}>
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">ดูดวงไพ่ยิปซี (Tarot)</h1>

        {role === 'admin' && (
          <ClientPicker
            value={clientId}
            onChange={(id, client) => {
              setClientId(id);
              setClientName(client?.name || client?.email || null);
            }}
          />
        )}

        <div className="rounded-xl border p-4 space-y-2">
          <label className="text-sm text-slate-600">หัวข้อ/คำถาม</label>
          <input
            className="w-full rounded-lg border px-3 py-2"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="พิมพ์หัวข้อที่ต้องการถาม"
          />

          <div className="grid gap-3 sm:grid-cols-3 mt-2">
            <button className="rounded-lg border px-4 py-2" onClick={() => draw(1)}>สุ่ม 1 ใบ</button>
            <button className="rounded-lg border px-4 py-2" onClick={() => draw(3)}>สุ่ม 3 ใบ</button>
            <button className="rounded-lg border px-4 py-2" onClick={() => draw(5)}>สุ่ม 5 ใบ</button>
          </div>
        </div>

        <div className="rounded-xl border p-4">
          <h2 className="font-medium mb-2">ไพ่ที่สุ่มได้</h2>
          {cards.length === 0 ? (
            <div className="text-slate-500 text-sm">ยังไม่มีไพ่ที่สุ่ม</div>
          ) : (
            <ul className="list-disc pl-5">
              {cards.map((c, i) => (
                <li key={i}>{c.name} {c.reversed ? '(กลับหัว)' : ''}</li>
              ))}
            </ul>
          )}
        </div>

        <button
          className="rounded-lg bg-indigo-600 text-white px-4 py-2 disabled:opacity-60"
          disabled={cards.length === 0}
          onClick={saveToHistory}
        >
          บันทึกประวัติ
        </button>
      </div>
    </PermissionGate>
  );
}
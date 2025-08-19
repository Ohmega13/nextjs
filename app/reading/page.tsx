'use client';

import { useState } from 'react';
import PermissionGate from '../components/PermissionGate';

type CardPick = {
  name: string;
  reversed: boolean;
};

export default function ReadingPage() {
  const [cards, setCards] = useState<CardPick[]>([]);
  const [topic, setTopic] = useState('');

  const fullDeck: string[] = [
    // ... ใส่ชื่อไพ่ของคุณตามเดิม
    'The Fool','The Magician','The High Priestess','The Empress','The Emperor',
    'The Hierophant','The Lovers','The Chariot','Strength','The Hermit',
    'Wheel of Fortune','Justice','The Hanged Man','Death','Temperance',
    'The Devil','The Tower','The Star','The Moon','The Sun','Judgement','The World',
    // ... หรือเพิ่ม Minor Arcana ตามของเดิม
  ];

  function drawCards(count: number, deckInput: string[] = fullDeck): CardPick[] {
    const deck = [...deckInput];
    const picks: CardPick[] = [];
    for (let i = 0; i < Math.min(count, deck.length); i++) {
      const idx = Math.floor(Math.random() * deck.length);
      const name = deck.splice(idx, 1)[0];
      const reversed = Math.random() < 0.48;
      picks.push({ name, reversed });
    }
    return picks;
  }

  function onDraw(count: number) {
    const picked = drawCards(count);
    setCards(picked);
  }

  function saveToHistory() {
    // โครง type ให้ชัดเจน จะไม่ชนกับ TS
    type HistoryItem = {
      id: string;
      date: string;
      mode: 'tarot';
      topic?: string;
      notes?: string;
      cards: CardPick[];
    };

    const now = new Date().toISOString();
    const item: HistoryItem = {
      id: crypto.randomUUID(),
      date: now,
      mode: 'tarot',
      topic,
      cards,
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
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">เริ่มดูดวง (Tarot)</h1>

        <div className="grid gap-3 md:grid-cols-3">
          <button className="rounded-lg border px-4 py-2" onClick={() => onDraw(1)}>สุ่ม 1 ใบ</button>
          <button className="rounded-lg border px-4 py-2" onClick={() => onDraw(3)}>สุ่ม 3 ใบ</button>
          <button className="rounded-lg border px-4 py-2" onClick={() => onDraw(5)}>สุ่ม 5 ใบ</button>
        </div>

        <div className="rounded-xl border p-4">
          <label className="block text-sm text-slate-600">หัวข้อ/คำถาม</label>
          <input
            className="mt-1 w-full rounded-lg border-slate-300"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="พิมพ์หัวข้อที่ต้องการถาม"
          />
        </div>

        <div className="rounded-xl border p-4">
          <h2 className="font-medium mb-2">ไพ่ที่สุ่มได้</h2>
          {cards.length === 0 ? (
            <div className="text-slate-500 text-sm">ยังไม่มีไพ่ที่สุ่ม</div>
          ) : (
            <ul className="list-disc pl-5">
              {cards.map((c, i) => (
                <li key={i}>
                  {c.name} {c.reversed ? '(กลับหัว)' : ''}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-3">
          <button
            className="rounded-lg bg-indigo-600 text-white px-4 py-2 disabled:opacity-60"
            onClick={saveToHistory}
            disabled={cards.length === 0}
          >
            บันทึกประวัติ
          </button>
        </div>
      </div>
    </PermissionGate>
  );
}
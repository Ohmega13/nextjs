'use client';

import PermissionGate from '../../components/PermissionGate';
import { useState } from 'react';

export default function PalmPage() {
  const [notes, setNotes] = useState('');

  function save() {
    type HistoryItem = {
      id: string;
      date: string;
      mode: 'palm';
      payload: { notes: string };
    };
    const item: HistoryItem = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      mode: 'palm',
      payload: { notes },
    };
    const raw = localStorage.getItem('ddt_history');
    const arr = raw ? (JSON.parse(raw) as HistoryItem[]) : [];
    arr.unshift(item);
    localStorage.setItem('ddt_history', JSON.stringify(arr));
    alert('บันทึกการอ่านลายมือแล้ว');
  }

  return (
    <PermissionGate requirePerms={['palm']}>
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">ลายมือ (Palm)</h1>
        <div className="rounded-xl border p-4">
          <label className="text-sm text-slate-600">บันทึก/ข้อสังเกต</label>
          <textarea
            className="mt-1 w-full rounded-lg border px-3 py-2 min-h-[120px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="พิมพ์สรุปการอ่านลายมือ"
          />
        </div>
        <button className="rounded-lg bg-indigo-600 text-white px-4 py-2" onClick={save}>
          บันทึกการอ่านลายมือ
        </button>
      </div>
    </PermissionGate>
  );
}
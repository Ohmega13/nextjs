'use client';

import PermissionGate from '../../components/PermissionGate';
import { useState } from 'react';

export default function NatalPage() {
  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');

  function save() {
    type HistoryItem = {
      id: string;
      date: string;
      mode: 'natal';
      payload: { name: string; birth: string };
    };
    const item: HistoryItem = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      mode: 'natal',
      payload: { name, birth },
    };
    const raw = localStorage.getItem('ddt_history');
    const arr = raw ? (JSON.parse(raw) as HistoryItem[]) : [];
    arr.unshift(item);
    localStorage.setItem('ddt_history', JSON.stringify(arr));
    alert('บันทึกพื้นดวงแล้ว');
  }

  return (
    <PermissionGate requirePerms={['natal']}>
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">พื้นดวง (Natal)</h1>
        <div className="rounded-xl border p-4 space-y-3">
          <div>
            <label className="text-sm text-slate-600">ชื่อ</label>
            <input className="w-full rounded-lg border px-3 py-2"
              value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-slate-600">วัน/เวลาเกิด</label>
            <input className="w-full rounded-lg border px-3 py-2"
              placeholder="YYYY-MM-DD HH:mm"
              value={birth} onChange={(e) => setBirth(e.target.value)} />
          </div>
        </div>
        <button className="rounded-lg bg-indigo-600 text-white px-4 py-2" onClick={save}>
          บันทึกพื้นดวง
        </button>
      </div>
    </PermissionGate>
  );
}
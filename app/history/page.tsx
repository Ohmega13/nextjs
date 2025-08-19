// app/history/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';

type HistoryItem = {
  id: string;
  date: string;          // ISO (yyyy-mm-dd) หรือ string ที่ new Date() ได้
  clientId?: string;     // สมาชิกเห็นของตัวเอง ไม่ได้ใช้ client name แล้ว
  mode?: 'tarot' | 'natal' | 'palm' | string; // เผื่อมีค่าอื่นในอนาคต
  topic?: string;
  notes?: string;
};

type Filters = {
  mode?: '' | 'tarot' | 'natal' | 'palm';
  from?: string; // yyyy-mm-dd
  to?: string;   // yyyy-mm-dd
};

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [filters, setFilters] = useState<Filters>({
    mode: '',
    from: '',
    to: '',
  });

  // โหลดประวัติจาก localStorage (สมาชิกเห็นเฉพาะของตัวเองในอุปกรณ์)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ddt_history');
      if (!raw) {
        setItems([]);
        return;
      }
      const parsed = JSON.parse(raw) as HistoryItem[] | unknown;
      if (Array.isArray(parsed)) setItems(parsed as HistoryItem[]);
      else setItems([]);
    } catch {
      setItems([]);
    }
  }, []);

  const applied = filters; // แค่ตั้งชื่อสั้น ๆ

  const filtered = useMemo(() => {
    return (items || []).filter((h) => {
      // กรองตามประเภทการดูดวง
      if (applied.mode && (h.mode || '') !== applied.mode) return false;

      // กรองตามช่วงวันที่
      if (applied.from && new Date(h.date) < new Date(applied.from)) return false;
      if (
        applied.to &&
        new Date(h.date) > new Date(`${applied.to}T23:59:59`)
      )
        return false;

      return true;
    });
  }, [items, applied.mode, applied.from, applied.to]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">ประวัติการดูดวงของฉัน</h1>

      {/* ฟิลเตอร์ */}
      <div className="rounded-xl border p-4 grid gap-3 md:grid-cols-4">
        <div>
          <label className="block text-sm text-slate-600">ประเภทการดูดวง</label>
          <select
            className="mt-1 w-full rounded-lg border-slate-300"
            value={filters.mode}
            onChange={(e) => setFilters((f) => ({ ...f, mode: e.target.value as Filters['mode'] }))}
          >
            <option value="">ทั้งหมด</option>
            <option value="tarot">Tarot</option>
            <option value="natal">พื้นดวง</option>
            <option value="palm">ลายมือ</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-600">ตั้งแต่วันที่</label>
          <input
            type="date"
            className="mt-1 w-full rounded-lg border-slate-300"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600">ถึงวันที่</label>
          <input
            type="date"
            className="mt-1 w-full rounded-lg border-slate-300"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={() => setFilters({ mode: '', from: '', to: '' })}
            className="rounded-lg border px-4 py-2 w-full hover:bg-slate-50"
          >
            ล้างตัวกรอง
          </button>
        </div>
      </div>

      {/* ตาราง */}
      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left">วันที่</th>
              <th className="px-3 py-2">ประเภท</th>
              <th className="px-3 py-2 text-left">หัวข้อ</th>
              <th className="px-3 py-2 text-left">บันทึก</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((h) => (
              <tr key={h.id} className="border-t">
                <td className="px-3 py-2">
                  {new Date(h.date).toLocaleDateString('th-TH')}
                </td>
                <td className="px-3 py-2 text-center">{h.mode ?? '-'}</td>
                <td className="px-3 py-2">{h.topic ?? '-'}</td>
                <td className="px-3 py-2">{h.notes ?? '-'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={4}>
                  ไม่พบประวัติที่ตรงกับตัวกรอง
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        * สมาชิกจะเห็นเฉพาะประวัติบนอุปกรณ์ของตนเองเท่านั้น
      </p>
    </div>
  );
}
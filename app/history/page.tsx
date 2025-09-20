// app/history/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ClientSelector } from '@/components/ClientSelector';

type Role = 'admin' | 'member';

type ReadingRow = {
  id: string;
  created_at: string;
  mode: string; // 'tarot' | 'palm' | 'natal' | etc.
  topic: string | null;
  payload: any;
  user_id: string;
};

// Helper function to map tarot layout code to name
function getTarotLayoutName(layoutCode: string | undefined): string {
  const layouts: Record<string, string> = {
    'celtic_cross': 'เซลติกครอส',
    'three_card': 'สามใบ',
    'horseshoe': 'เกือกม้า',
  };
  return layoutCode ? layouts[layoutCode] ?? layoutCode : '-';
}

// Helper function to extract cards from payload
function extractTarotCards(payload: any): string[] {
  if (!payload || !payload.cards) return [];
  return payload.cards.map((c: any) => c.name ?? c);
}

export default function HistoryPage() {
  // role & target user
  const [role, setRole] = useState<Role>('member');
  const [clientId, setClientId] = useState<string | null>(null); // for admin; member uses own id

  // filters
  const [type, setType] = useState<'all' | 'tarot' | 'palm' | 'natal'>('all');
  const [from, setFrom] = useState<string>(''); // YYYY-MM-DD (empty = no lower bound)
  const [to, setTo] = useState<string>('');     // YYYY-MM-DD (empty = no upper bound)

  // data
  const [rows, setRows] = useState<ReadingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // popup state
  const [openView, setOpenView] = useState<ReadingRow | null>(null);

  // detect role & default client id
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      const r = (prof?.role as Role) ?? 'member';
      setRole(r);
      // default view = self (member) ; admin may change client later
      setClientId(user.id);
    })();
  }, []);

  // fetch history on change
  useEffect(() => {
    (async () => {
      if (!clientId) return;
      setLoading(true);
      setError(null);

      try {
        // base query
        let q = supabase
          .from('readings')
          .select('id, created_at, mode, topic, payload, user_id')
          .eq('user_id', clientId)
          .order('created_at', { ascending: false });

        // type filter
        if (type !== 'all') q = q.eq('mode', type);

        // date range
        if (from) q = q.gte('created_at', new Date(from + 'T00:00:00.000Z').toISOString());
        if (to) q = q.lte('created_at', new Date(to + 'T23:59:59.999Z').toISOString());

        const { data, error } = await q;
        if (error) throw error;
        setRows((data ?? []) as ReadingRow[]);
      } catch (e: any) {
        setError(e.message ?? 'โหลดข้อมูลล้มเหลว');
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [clientId, type, from, to]);

  // Escape key closes popup
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenView(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const typeLabel = useMemo(
    () =>
      ({
        tarot: 'ไพ่ยิปซี',
        palm: 'ลายมือ',
        natal: 'ดวงกำเนิด',
      } as const),
    []
  );

  return (
    <div className="max-w-5xl mx-auto px-4 space-y-6">
      <h1 className="text-xl font-semibold">ประวัติการดูดวงของฉัน</h1>

      {/* Filters */}
      <div className="rounded-xl border p-4 grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-4 items-end">
        <div>
          <label className="block text-sm text-slate-600">ประเภทการดูดวง</label>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={type}
            onChange={(e) => setType(e.target.value as any)}
          >
            <option value="all">ทั้งหมด</option>
            <option value="tarot">ไพ่ยิปซี</option>
            <option value="palm">ลายมือ</option>
            <option value="natal">ดวงกำเนิด</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-slate-600">ตั้งแต่วันที่</label>
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm text-slate-600">ถึงวันที่</label>
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>

        {/* Admin-only: choose client */}
        <div className="space-y-1">
          <label className="block text-sm text-slate-600">
            {role === 'admin' ? 'เลือกลูกดวง (สำหรับแอดมิน)' : 'สมาชิกเห็นเฉพาะของตัวเอง'}
          </label>
          {role === 'admin' ? (
            <ClientSelector value={clientId} onChange={(id) => setClientId(id)} />
          ) : (
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 bg-slate-50"
              value="บัญชีของฉัน"
              readOnly
            />
          )}
        </div>

        <div className="md:col-span-4">
          <button
            onClick={() => {
              setType('all');
              setFrom('');
              setTo('');
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50"
          >
            ล้างตัวกรอง
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-2 py-2 text-left">วันที่</th>
              <th className="px-2 py-2 text-center">ประเภท</th>
              <th className="px-2 py-2 text-center">รูปแบบ</th>
              <th className="px-2 py-2 text-left">หัวข้อ</th>
              <th className="px-2 py-2 text-left">บันทึก</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  กำลังโหลด…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-red-600">
                  เกิดข้อผิดพลาด: {error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  ไม่พบประวัติที่ตรงกับตัวกรอง
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t cursor-pointer hover:bg-slate-50"
                  onClick={() => setOpenView(r)}
                >
                  <td className="px-2 py-2">
                    {new Date(r.created_at).toLocaleString('th-TH', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="px-2 py-2 text-center">
                    {typeLabel[r.mode as keyof typeof typeLabel] ?? r.mode}
                  </td>
                  <td className="px-2 py-2 text-center">
                    {r.mode === 'tarot' ? getTarotLayoutName(r.payload?.layout) : '-'}
                  </td>
                  <td className="px-2 py-2 truncate">{r.topic ?? '-'}</td>
                  <td className="px-2 py-2 truncate">{r.payload?.note ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        * สมาชิกทั่วไปจะเห็นประวัติของตนเองเท่านั้น; แอดมินสามารถเลือกผู้ใช้เพื่อดูประวัติได้
      </p>

      {/* Modal Popup for reading details */}
      {openView && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 relative">
            <button
              onClick={() => setOpenView(null)}
              className="absolute top-4 right-4 text-slate-600 hover:text-slate-900"
              aria-label="Close"
            >
              ✕
            </button>
            <h2 className="text-xl font-semibold mb-4">รายละเอียดการดูดวง</h2>
            <p>
              <strong>วันที่:</strong>{' '}
              {new Date(openView.created_at).toLocaleString('th-TH', {
                dateStyle: 'full',
                timeStyle: 'short',
              })}
            </p>
            <p>
              <strong>ประเภท:</strong> {typeLabel[openView.mode as keyof typeof typeLabel] ?? openView.mode}
            </p>
            {openView.mode === 'tarot' && (
              <p>
                <strong>รูปแบบ:</strong> {getTarotLayoutName(openView.payload?.layout)}
              </p>
            )}
            <p>
              <strong>หัวข้อ:</strong> {openView.topic ?? '-'}
            </p>
            {openView.mode === 'tarot' && (
              <>
                <p className="mt-4 font-semibold">ไพ่ที่เลือก:</p>
                <ul className="list-disc list-inside mb-4">
                  {extractTarotCards(openView.payload).map((card, i) => (
                    <li key={i}>{card}</li>
                  ))}
                </ul>
                <p>
                  <strong>วิเคราะห์:</strong> {openView.payload?.analysis ?? '-'}
                </p>
              </>
            )}
            {openView.mode !== 'tarot' && (
              <p className="mt-4">
                <strong>บันทึก:</strong> {openView.payload?.note ?? '-'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
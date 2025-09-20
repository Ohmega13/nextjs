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

// New helper function to get reading type label (tarot) by inspecting payload
function getReadingTypeLabel(payload: any): string {
  if (!payload) return 'ไพ่ยิปซี';
  // โหมดเปรียบเทียบ: จะมี pairs เป็นอาร์เรย์ของ { option, card }
  if (Array.isArray(payload.pairs)) return 'เปรียบเทียบ';
  // คลาสสิก 10 ใบ: จะมี slots ยาว 10
  if (Array.isArray(payload.slots) && payload.slots.length === 10) return 'แบบคลาสสิก 10 ใบ';
  // ถามเรื่องเดียว 3 ใบ: มี cards ยาว 3
  if (Array.isArray(payload.cards) && payload.cards.length === 3) return 'ถามเรื่องเดียว 3 ใบ';
  return 'ไพ่ยิปซี';
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

  // --- admin edit/delete states ---
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [editTarget, setEditTarget] = useState<ReadingRow | null>(null);
  const [editTopic, setEditTopic] = useState('');
  const [editAnalysis, setEditAnalysis] = useState('');

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
              <th className="px-2 py-2 text-left">หัวข้อ</th>
              <th className="px-2 py-2 text-left">บันทึก</th>
              {role === 'admin' && <th className="px-2 py-2 text-center w-28">จัดการ</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={role === 'admin' ? 5 : 4} className="px-3 py-6 text-center text-slate-500">
                  กำลังโหลด…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={role === 'admin' ? 5 : 4} className="px-3 py-6 text-center text-red-600">
                  เกิดข้อผิดพลาด: {error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={role === 'admin' ? 5 : 4} className="px-3 py-6 text-center text-slate-500">
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
                    {r.mode === 'tarot'
                      ? getReadingTypeLabel(r.payload)
                      : (typeLabel[r.mode as keyof typeof typeLabel] ?? r.mode)}
                  </td>
                  <td className="px-2 py-2 truncate">{r.topic ?? '-'}</td>
                  <td className="px-2 py-2 truncate">{r.payload?.note ?? '-'}</td>
                  {role === 'admin' && (
                    <td className="px-2 py-2">
                      <div
                        className="flex items-center justify-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="px-2 py-1 rounded border text-xs hover:bg-slate-100"
                          onClick={() => {
                            setEditTarget(r);
                            setEditTopic(r.topic ?? '');
                            setEditAnalysis(
                              r?.payload?.analysis ?? (r?.payload?.note ?? '')
                            );
                            setShowEdit(true);
                          }}
                        >
                          แก้ไข
                        </button>
                        <button
                          className="px-2 py-1 rounded border text-xs hover:bg-red-50 text-red-600 border-red-300 disabled:opacity-50"
                          disabled={deletingId === r.id}
                          onClick={async () => {
                            if (!confirm('ยืนยันการลบรายการนี้?')) return;
                            try {
                              setDeletingId(r.id);
                              const { error } = await supabase.from('readings').delete().eq('id', r.id);
                              if (error) throw error;
                              // remove from UI
                              setRows((prev) => prev.filter((x) => x.id !== r.id));
                              // close detail modal if it was this record
                              setOpenView((ov) => (ov && ov.id === r.id ? null : ov));
                            } catch (e: any) {
                              alert(e?.message || 'ลบไม่สำเร็จ');
                            } finally {
                              setDeletingId(null);
                            }
                          }}
                        >
                          {deletingId === r.id ? 'กำลังลบ…' : 'ลบ'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        * ประวัติการดูดวงทั้งหมด
      </p>

      {/* Modal: แก้ไขผลการดูดวง (admin) */}
      {showEdit && editTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 relative">
            <button
              onClick={() => !savingEdit && setShowEdit(false)}
              className="absolute top-4 right-4 text-slate-600 hover:text-slate-900"
              aria-label="Close"
            >
              ✕
            </button>
            <h2 className="text-xl font-semibold mb-4">แก้ไขผลการดูดวง</h2>

            <div className="grid grid-cols-[110px_1fr] gap-x-3 text-sm mb-4">
              <div className="text-slate-500">วันที่</div>
              <div>{new Date(editTarget.created_at).toLocaleString()}</div>
              <div className="text-slate-500">ประเภท</div>
              <div>
                {editTarget.mode === 'tarot'
                  ? getReadingTypeLabel(editTarget.payload)
                  : (typeLabel[editTarget.mode as keyof typeof typeLabel] ?? editTarget.mode)}
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-slate-600 mb-1">หัวข้อ</label>
              <input
                className="w-full rounded border px-3 py-2"
                value={editTopic}
                onChange={(e) => setEditTopic(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <label className="block text-slate-600 mb-1">คำทำนาย / ผลวิเคราะห์</label>
              <textarea
                className="w-full rounded border px-3 py-2 min-h-[220px] whitespace-pre-wrap"
                value={editAnalysis}
                onChange={(e) => setEditAnalysis(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-2 rounded-md border"
                onClick={() => setShowEdit(false)}
                disabled={savingEdit}
              >
                ยกเลิก
              </button>
              <button
                className="px-4 py-2 rounded-md bg-indigo-600 text-white disabled:opacity-50"
                disabled={savingEdit}
                onClick={async () => {
                  try {
                    setSavingEdit(true);
                    const newPayload = { ...(editTarget.payload || {}), analysis: editAnalysis };
                    const { data, error } = await supabase
                      .from('readings')
                      .update({ topic: editTopic, payload: newPayload })
                      .eq('id', editTarget.id)
                      .select('id, created_at, mode, topic, payload, user_id')
                      .single();
                    if (error) throw error;
                    // update list
                    setRows((prev) => prev.map((x) => (x.id === editTarget.id ? (data as ReadingRow) : x)));
                    // update detail modal if showing same record
                    setOpenView((ov) => (ov && ov.id === editTarget.id ? (data as ReadingRow) : ov));
                    setShowEdit(false);
                  } catch (e: any) {
                    alert(e?.message || 'บันทึกไม่สำเร็จ');
                  } finally {
                    setSavingEdit(false);
                  }
                }}
              >
                {savingEdit ? 'กำลังบันทึก…' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

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
              <strong>ประเภท:</strong>{' '}
              {openView.mode === 'tarot'
                ? getReadingTypeLabel(openView.payload)
                : (typeLabel[openView.mode as keyof typeof typeLabel] ?? openView.mode)}
            </p>
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
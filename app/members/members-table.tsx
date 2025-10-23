'use client';
import React from 'react';

type Row = {
  user_id: string;
  email: string;
  role: string;
  status: string;
  display_name: string | null;
  credit_balance?: number; // from legacy API
  balance?: number;        // from /api/admin/credits
  permissions: {
    tarot?: boolean;
    natal?: boolean;
    palm?: boolean;
    [k: string]: any;
  };
};

type Props = {
  rows: Row[];
  toggle: (row: Row, key: 'tarot' | 'natal' | 'palm', next: boolean) => void | Promise<void>;
  topup?: (row: Row, amount: number, note?: string) => Promise<void>;
};

export default function MembersTable({ rows, toggle, topup }: Props) {

  return (
    <div className="rounded-xl border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left">อีเมล</th>
            <th className="px-3 py-2">ชื่อแสดง</th>
            <th className="px-3 py-2">บทบาท</th>
            <th className="px-3 py-2">สถานะ</th>
            <th className="px-3 py-2 text-right">เครดิตคงเหลือ</th>
            <th className="px-3 py-2">เติมเครดิต</th>
            <th className="px-3 py-2">Tarot</th>
            <th className="px-3 py-2">พื้นดวง</th>
            <th className="px-3 py-2">ลายมือ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.user_id} className="border-t">
              <td className="px-3 py-2">{r.email}</td>
              <td className="px-3 py-2">{r.display_name ?? '-'}</td>
              <td className="px-3 py-2">{r.role}</td>
              <StatusDropdown user_id={r.user_id} status={r.status} />
              <td className="px-3 py-2 text-right">
                {r.balance !== undefined && r.balance !== null ? (
                  r.balance
                ) : (
                  <span className="text-slate-400">กำลังโหลดเครดิต...</span>
                )}
              </td>
              <td className="px-3 py-2 text-center">
                <button
                  className="rounded bg-blue-600 px-2 py-1 text-white hover:bg-blue-700"
                  onClick={async () => {
                    if (!topup) {
                      alert('ยังไม่ได้เชื่อมต่อฟังก์ชันเติมเครดิตจากหน้าหลัก');
                      return;
                    }
                    const input = prompt('กรุณากรอกจำนวนเครดิตที่ต้องการเติม (+/- ได้) เช่น 10 หรือ -5', '10');
                    if (!input) return;
                    const amount = Number(input);
                    if (isNaN(amount) || amount === 0) {
                      alert('จำนวนเครดิตไม่ถูกต้อง');
                      return;
                    }
                    const note = prompt('หมายเหตุ (ถ้ามี)', 'admin top-up') || '';
                    try {
                      const result = await topup(r, amount, note);
                      if (result && typeof result === 'object' && 'error' in result) {
                        alert(`เติมเครดิตไม่สำเร็จ: ${result.error}`);
                      }
                    } catch (e: any) {
                      alert(`เติมเครดิตไม่สำเร็จ: ${e?.message || e}`);
                    }
                  }}
                >
                  เติมเครดิต
                </button>
              </td>
              <td className="px-3 py-2 text-center">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={!!r.permissions?.tarot}
                    onChange={(e) => toggle(r, 'tarot', e.target.checked)}
                    aria-label={`ให้สิทธิ์ Tarot กับ ${r.email}`}
                  />
                </label>
              </td>

              <td className="px-3 py-2 text-center">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={!!r.permissions?.natal}
                    onChange={(e) => toggle(r, 'natal', e.target.checked)}
                    aria-label={`ให้สิทธิ์ พื้นดวง กับ ${r.email}`}
                  />
                </label>
              </td>

              <td className="px-3 py-2 text-center">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={!!r.permissions?.palm}
                    onChange={(e) => toggle(r, 'palm', e.target.checked)}
                    aria-label={`ให้สิทธิ์ ลายมือ กับ ${r.email}`}
                  />
                </label>
              </td>
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td className="px-3 py-6 text-center text-slate-500" colSpan={9}>
                ยังไม่มีสมาชิก
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
// Dropdown สำหรับเปลี่ยนสถานะสมาชิก

function StatusDropdown({ user_id, status }: { user_id: string; status: string }) {
  const [value, setValue] = React.useState(status);
  const [loading, setLoading] = React.useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = e.target.value;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/members/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id, status: nextValue }),
      });
      if (!res.ok) {
        alert('อัปเดตสถานะไม่สำเร็จ');
        // revert select value
        e.target.value = value;
      } else {
        setValue(nextValue);
      }
    } catch (err) {
      alert('อัปเดตสถานะไม่สำเร็จ');
      e.target.value = value;
    }
    setLoading(false);
  };

  return (
    <td className="px-3 py-2">
      <select
        className="border rounded px-2 py-1"
        value={value}
        onChange={handleChange}
        disabled={loading}
      >
        <option value="pending">pending</option>
        <option value="active">active</option>
        <option value="suspended">suspended</option>
      </select>
    </td>
  );
}
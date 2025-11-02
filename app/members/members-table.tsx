'use client';

import React from 'react';

export type Row = {
  user_id: string;
  email: string | null;
  role: 'admin' | 'member';
  status: 'pending' | 'active' | 'suspended';
  display_name: string | null;
  credits_remaining: number;          // normalized: always a number
  tarot: boolean;                     // normalized: always a boolean
  natal: boolean;                     // normalized: always a boolean
  palm: boolean;                      // normalized: always a boolean
};

type Props = {
  rows: Row[];
  toggle: (row: Row, key: 'tarot' | 'natal' | 'palm', next: boolean) => void | Promise<void>;
  topup?: (row: Row, amount: number, note?: string) => Promise<void>;
};

export default function MembersTable({ rows, toggle, topup }: Props) {
  const renderBalance = (r: Row) => {
    // rows.credits_remaining ถูก normalize แล้วเป็น number เสมอ
    const n = Number(r.credits_remaining ?? 0);
    return Number.isFinite(n) ? n.toLocaleString('th-TH') : '0';
  };

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
            <th className="px-3 py-2 text-center">Tarot</th>
            <th className="px-3 py-2 text-center">พื้นดวง</th>
            <th className="px-3 py-2 text-center">ลายมือ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.user_id} className="border-t">
              <td className="px-3 py-2">{r.email ?? '-'}</td>
              <td className="px-3 py-2">{r.display_name ?? '-'}</td>
              <td className="px-3 py-2">{r.role}</td>
              <StatusDropdown user_id={r.user_id} status={r.status} />
              <td className="px-3 py-2 text-right">
                {renderBalance(r)}
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
                      await topup(r, amount, note);
                    } catch (e: any) {
                      alert(`เติมเครดิตไม่สำเร็จ: ${e?.message || e}`);
                    }
                  }}
                >
                  เติมเครดิต
                </button>
              </td>

              <td className="px-3 py-2 text-center">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={!!r.tarot}
                  onChange={(e) => toggle(r, 'tarot', e.target.checked)}
                  aria-label={`ให้สิทธิ์ Tarot กับ ${r.email ?? '-'}`}
                />
              </td>

              <td className="px-3 py-2 text-center">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={!!r.natal}
                  onChange={(e) => toggle(r, 'natal', e.target.checked)}
                  aria-label={`ให้สิทธิ์ พื้นดวง กับ ${r.email ?? '-'}`}
                />
              </td>

              <td className="px-3 py-2 text-center">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={!!r.palm}
                  onChange={(e) => toggle(r, 'palm', e.target.checked)}
                  aria-label={`ให้สิทธิ์ ลายมือ กับ ${r.email ?? '-'}`}
                />
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
        e.target.value = value; // revert
      } else {
        setValue(nextValue);
      }
    } catch {
      alert('อัปเดตสถานะไม่สำเร็จ');
      e.target.value = value; // revert
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
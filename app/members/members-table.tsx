'use client';

type Row = {
  user_id: string;
  email: string;
  role: string;
  status: string;
  display_name: string | null;
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
};

export default function MembersTable({ rows, toggle }: Props) {
  return (
    <div className="rounded-xl border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left">อีเมล</th>
            <th className="px-3 py-2">ชื่อแสดง</th>
            <th className="px-3 py-2">บทบาท</th>
            <th className="px-3 py-2">สถานะ</th>
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
              <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
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
import React from 'react';

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
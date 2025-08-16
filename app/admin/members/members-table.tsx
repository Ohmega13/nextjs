'use client';

import { useState, useTransition } from 'react';

type Member = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: 'admin' | 'member';
  approved: boolean;
  permissions: {
    tarot?: boolean;
    natal?: boolean;
    palm?: boolean;
    numerology?: boolean;
  } | null;
};

export default function MembersTable({ members }: { members: Member[] }) {
  const [rows, setRows] = useState(members);
  const [isPending, startTransition] = useTransition();

  const toggle = (uid: string, path: 'approved' | `permissions.${string}`, value: boolean) => {
    // optimistic UI
    setRows(prev =>
      prev.map(r =>
        r.id === uid
          ? path === 'approved'
            ? { ...r, approved: value }
            : { ...r, permissions: { ...(r.permissions ?? {}), [path.split('.')[1]]: value } }
          : r
      )
    );

    startTransition(async () => {
      await fetch('/api/admin/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: uid, path, value }),
      });
    });
  };

  const setRole = (uid: string, role: 'admin' | 'member') => {
    setRows(prev => prev.map(r => (r.id === uid ? { ...r, role } : r)));
    startTransition(async () => {
      await fetch('/api/admin/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: uid, path: 'role', value: role }),
      });
    });
  };

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2 text-left">อีเมล</th>
            <th className="px-3 py-2 text-left">ชื่อ</th>
            <th className="px-3 py-2">อนุมัติ</th>
            <th className="px-3 py-2">Tarot</th>
            <th className="px-3 py-2">พื้นดวง</th>
            <th className="px-3 py-2">ลายมือ</th>
            <th className="px-3 py-2">ตัวเลข</th>
            <th className="px-3 py-2">Role</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const p = m.permissions ?? {};
            return (
              <tr key={m.id} className="border-t">
                <td className="px-3 py-2">{m.email}</td>
                <td className="px-3 py-2">{m.display_name ?? '-'}</td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={m.approved}
                    onChange={(e) => toggle(m.id, 'approved', e.target.checked)}
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={!!p.tarot}
                    onChange={(e) => toggle(m.id, 'permissions.tarot', e.target.checked)}
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={!!p.natal}
                    onChange={(e) => toggle(m.id, 'permissions.natal', e.target.checked)}
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={!!p.palm}
                    onChange={(e) => toggle(m.id, 'permissions.palm', e.target.checked)}
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={!!p.numerology}
                    onChange={(e) => toggle(m.id, 'permissions.numerology', e.target.checked)}
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    className="rounded border px-2 py-1"
                    value={m.role}
                    onChange={(e) => setRole(m.id, e.target.value as 'admin' | 'member')}
                  >
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {isPending && <div className="p-2 text-xs text-slate-500">Saving…</div>}
    </div>
  );
}
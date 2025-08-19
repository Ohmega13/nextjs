'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Client = { id: string; name: string; email?: string | null };

export default function ClientPicker({
  value,
  onChange,
}: {
  value?: string | null;
  onChange: (id: string | null, client?: Client | null) => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    (async () => {
      setLoading(true);
      // 1) พยายามโหลดจากตาราง Supabase (ถ้ามี)
      const { data, error } = await supabase
        .from('clients')
        .select('id,name,email')
        .order('name', { ascending: true });

      if (!ignore && !error && data?.length) {
        setClients(
          data.map((x) => ({
            id: String(x.id),
            name: x.name || '',
            email: (x as any).email ?? null,
          }))
        );
        setLoading(false);
        return;
      }

      // 2) fallback: localStorage key: ddt_clients  ( [{id,name,email?}] )
      try {
        const raw = localStorage.getItem('ddt_clients');
        const arr = raw ? (JSON.parse(raw) as Client[]) : [];
        if (!ignore) setClients(arr);
      } catch {
        if (!ignore) setClients([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    })();

    return () => {
      ignore = true;
    };
  }, []);

  const selected = clients.find((c) => c.id === value) || null;

  return (
    <div className="space-y-2">
      <label className="text-sm text-slate-600">เลือกลูกดวง (สำหรับผู้ดูแลระบบ)</label>
      {loading ? (
        <div className="text-sm text-slate-500">กำลังโหลดรายชื่อลูกดวง…</div>
      ) : (
        <select
          className="w-full rounded-lg border px-3 py-2"
          value={value ?? ''}
          onChange={(e) => {
            const id = e.target.value || null;
            onChange(id, clients.find((c) => c.id === id) || null);
          }}
        >
          <option value="">— ไม่ระบุ —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name || c.email || c.id}
            </option>
          ))}
        </select>
      )}

      {selected && (
        <div className="text-xs text-slate-500">
          เลือก: <b>{selected.name || selected.email || selected.id}</b>
        </div>
      )}
    </div>
  );
}
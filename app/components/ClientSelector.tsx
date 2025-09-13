'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type ProfileDetail = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  dob: string | null;
  birth_time: string | null;
  birth_place: string | null;
};

type Option = { id: string; label: string; raw: ProfileDetail };

export async function fetchClientOptions(): Promise<Option[]> {
  const { data, error } = await supabase
    .from('profile_details')
    .select('user_id, first_name, last_name, phone, dob, birth_time, birth_place')
    .order('dob', { ascending: false });

  if (error) {
    console.error('Error fetching profile_details:', error);
    return [];
  }

  return (data ?? []).map((d: ProfileDetail) => ({
    id: d.user_id,
    label:
      [d.first_name ?? '', d.last_name ?? ''].filter(Boolean).join(' ') ||
      d.phone ||
      '—',
    raw: d,
  }));
}

export function ClientSelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setOptions(await fetchClientOptions());
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!q) return options;
    const k = q.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(k));
  }, [options, q]);

  return (
    <div className="space-y-2">
      <input
        className="w-full rounded-md border px-3 py-2 text-sm"
        placeholder="พิมพ์ค้นหา…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <select
        className="w-full rounded-md border px-3 py-2 text-sm"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={loading}
      >
        <option value="">{loading ? 'กำลังโหลด…' : '— เลือกลูกดวง —'}</option>
        {filtered.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// default export ให้ใช้งานได้ทั้งสองแบบ
export default ClientSelector;
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// ถ้าคุณวางฟังก์ชันไว้ตามที่คุยกัน:
//  - lib/data/clients.ts -> loadClients
//  - lib/data/readings.ts -> saveReading, loadHistory
//  - lib/data/palm.ts -> uploadPalmImage
import { loadClients } from '@/lib/clients';
import { saveReading } from '@/lib/readings';
import { loadHistory } from '@/lib/history';
import { uploadPalmImage } from '@/lib/palm';

export default function DevTestPage() {
  const [role, setRole] = useState<'admin'|'member'>('member');
  const [out, setOut] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);

  async function getUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new Error('ยังไม่ได้ล็อกอิน');
    return user;
  }

  // 4.1 โหลดลูกดวง
  async function onLoadClients() {
    const user = await getUser();
    const data = await loadClients(user.id, role);
    setOut({ action: 'loadClients', data });
  }

  // 4.2 บันทึกประวัติดูดวง
  async function onSaveReadingTarot() {
    const user = await getUser();
    const data = await saveReading(user.id, 'tarot', {
      topic: 'การงาน',
      spread: '3-cards',
      result: [
        { name: 'The Sun', reversed: false },
        { name: 'The Hermit', reversed: true },
        { name: 'Justice', reversed: false },
      ],
    });
    setOut({ action: 'saveReading(tarot)', data });
  }

  // 4.3 อัปโหลดลายมือ + เมตา
  async function onUploadPalm() {
    if (!file) {
      alert('เลือกไฟล์ก่อน');
      return;
    }
    const user = await getUser();
    const data = await uploadPalmImage(user.id, file, { side: 'left' });
    setOut({ action: 'uploadPalmImage', data });
  }

  // 4.4 โหลด History
  async function onLoadHistory() {
    const user = await getUser();
    const data = await loadHistory(user.id, role);
    setOut({ action: 'loadHistory', data });
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">Dev Test Panel</h1>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-sm">ทดสอบในบทบาท:</label>
          <select
            className="border rounded-lg px-3 py-2"
            value={role}
            onChange={(e) => setRole(e.target.value as 'admin'|'member')}
          >
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-3">
          <button className="border rounded-lg px-3 py-2" onClick={onLoadClients}>
            4.1 โหลดลูกดวง
          </button>

          <button className="border rounded-lg px-3 py-2" onClick={onSaveReadingTarot}>
            4.2 บันทึกประวัติดูดวง (Tarot)
          </button>

          <label className="border rounded-lg px-3 py-2 cursor-pointer">
            เลือกรูปมือ
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFile(e.currentTarget.files?.[0] ?? null)}
            />
          </label>
          <button className="border rounded-lg px-3 py-2" onClick={onUploadPalm}>
            4.3 อัปโหลดลายมือ + เมตา
          </button>

          <button className="border rounded-lg px-3 py-2" onClick={onLoadHistory}>
            4.4 โหลด History
          </button>
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <div className="text-sm text-slate-500 mb-2">Output</div>
        <pre className="text-xs whitespace-pre-wrap">{out ? JSON.stringify(out, null, 2) : '—'}</pre>
      </div>
    </div>
  );
}
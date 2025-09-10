'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';
import PermissionGate from '../../components/PermissionGate';
import ClientPicker from '@/components/ClientPicker';
import ClientInfoCard from '@/components/ClientInfoCard';
import { saveReading } from '@/lib/readings';
import { uploadPalmImage } from '@/lib/palm';

type ImgItem = { id: string; url: string; side: 'left' | 'right' };

export default function PalmPage() {
  const [role, setRole] = useState<string|null>(null);
  const [clientId, setClientId] = useState<string|null>(null);
  const [clientName, setClientName] = useState<string|null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [images, setImages] = useState<ImgItem[]>([]);
  const [result, setResult] = useState<string>('');
  const [question, setQuestion] = useState('');
  const storageKey = useMemo(()=> 'ddt_palm_history', []);

  const leftImg = useMemo(() => images.find(i => i.side === 'left') || null, [images]);
  const rightImg = useMemo(() => images.find(i => i.side === 'right') || null, [images]);

  useEffect(()=> {
    (async ()=>{
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase.from('profiles').select('role').eq('user_id',user.id).maybeSingle();
      setRole((data as any)?.role ?? null);
    })();
  }, []);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>, side: 'left' | 'right') {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!userId) {
      alert('ยังไม่ได้ล็อกอิน');
      return;
    }
    // เป้าหมายสำหรับบันทึก: ถ้าเป็นแอดมินและเลือก client ให้ใช้ clientId, ไม่งั้นใช้ userId ของตัวเอง
    const targetId = role === 'admin' && clientId ? clientId : userId;

    try {
      // อัปโหลดจริงไป Supabase (ใช้ helper ที่มีอยู่)
      await uploadPalmImage(targetId, file);

      // แสดงตัวอย่างในหน้าจอทันที (ไม่รอโหลดกลับ)
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result);
        const others = images.filter(i => i.side !== side);
        const item: ImgItem = { id: crypto.randomUUID(), url, side };
        setImages([...others, item]);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('uploadPalmImage error:', err);
      alert('อัปโหลดรูปไม่สำเร็จ');
    }
  }

  async function startReading() {
    if (images.length < 2) {
      alert('กรุณาอัปโหลดรูปมือทั้ง 2 ข้างก่อน');
      return;
    }
    if (!userId) {
      alert('ยังไม่ได้ล็อกอิน');
      return;
    }

    const text = 'ผลอ่านลายมือ: เส้นชีพเด่น มีพลังใจและความอึด เส้นสมองมั่นคง ช่วงนี้เหมาะวางแผนงานระยะกลาง';
    setResult(text);

    // ผู้ถูกอ่าน: ถ้าแอดมินเลือก client ให้ใช้ clientId, ไม่งั้นใช้ userId ของตัวเอง
    const targetId = role === 'admin' && clientId ? clientId : userId;

    try {
      await saveReading(targetId, 'palm', {
        question,
        result: text,
        images: images.map(i => ({ side: i.side, id: i.id })),
      });
      // เก็บสถานะบนหน้าไว้เหมือนเดิม
    } catch (err) {
      console.error('saveReading(palm) error:', err);
      alert('บันทึกประวัติไม่สำเร็จ');
    }
  }

  function askFollowup(){
    alert('วิเคราะห์คำถามอ้างอิงตามลายมือ (ตัวอย่าง)');
  }

  const hasBothHands = images.some(i=>i.side==='left') && images.some(i=>i.side==='right');

  return (
    <PermissionGate requirePerms={['palm']}>
      <div className="space-y-6 max-w-3xl mx-auto px-4">
        <h1 className="text-xl font-semibold">ลายมือ (Palm)</h1>

        {role==='admin'
          ? <div className="grid gap-4 sm:grid-cols-2">
              <ClientPicker
                value={clientId}
                onChange={(id, c)=>{
                  setClientId(id);
                  setClientName(c?.name || c?.email || null);
                }}
                tableName="profile_details"
              />
              <ClientInfoCard forUserId={clientId ?? undefined} />
            </div>
          : <ClientInfoCard forUserId={userId ?? undefined} />
        }

        <div className="rounded-xl border p-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm text-slate-600 mb-1">รูปมือซ้าย</div>
              <input
                type="file"
                accept="image/*"
                className="block w-full text-sm file:mr-4 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white hover:file:bg-indigo-700"
                onChange={(e)=>onUpload(e,'left')}
              />
              {leftImg && (
                <div className="mt-2 h-40 w-full max-w-xs relative rounded-md border overflow-hidden">
                  <Image
                    src={leftImg!.url}
                    alt="left hand"
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 100vw, 256px"
                    style={{ objectFit: 'contain' }}
                  />
                </div>
              )}
            </div>
            <div>
              <div className="text-sm text-slate-600 mb-1">รูปมือขวา</div>
              <input
                type="file"
                accept="image/*"
                className="block w-full text-sm file:mr-4 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white hover:file:bg-indigo-700"
                onChange={(e)=>onUpload(e,'right')}
              />
              {rightImg && (
                <div className="mt-2 h-40 w-full max-w-xs relative rounded-md border overflow-hidden">
                  <Image
                    src={rightImg!.url}
                    alt="right hand"
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 100vw, 256px"
                    style={{ objectFit: 'contain' }}
                  />
                </div>
              )}
            </div>
          </div>

          {!result ? (
            <button type="button" className="rounded-lg bg-indigo-600 text-white px-4 py-2 w-full sm:w-auto" onClick={startReading}>
              เริ่มดูดวง
            </button>
          ) : (
            <>
              <div className="rounded-lg border p-3 bg-slate-50">
                <div className="font-medium mb-1">คำทำนาย</div>
                <p className="text-sm">{result}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-slate-600">คำถามเพิ่มเติม</label>
                <input
                  className="w-full h-11 rounded-lg border px-3"
                  value={question}
                  onChange={(e)=>setQuestion(e.target.value)}
                  placeholder="พิมพ์คำถาม"
                />
                <button
                  type="button"
                  className="rounded-lg bg-emerald-600 text-white px-4 py-2 disabled:opacity-60 w-full sm:w-auto"
                  onClick={askFollowup}
                  disabled={!hasBothHands}
                >
                  ดูดวงอ้างอิงตามลายมือ
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </PermissionGate>
  );
}
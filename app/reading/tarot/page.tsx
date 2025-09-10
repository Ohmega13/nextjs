'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import PermissionGate from '@/components/PermissionGate';
import ClientPicker from '@/components/ClientPicker';
import ClientInfoCard from '@/components/ClientInfoCard';

type CardPick = { name: string; reversed: boolean };
type ReadingType = '3cards' | 'weigh' | 'celtic';

const FULL_DECK: string[] = [
  'The Fool','The Magician','The High Priestess','The Empress','The Emperor',
  'The Hierophant','The Lovers','The Chariot','Strength','The Hermit',
  'Wheel of Fortune','Justice','The Hanged Man','Death','Temperance',
  'The Devil','The Tower','The Star','The Moon','The Sun','Judgement','The World',
];

export default function TarotReadingPage() {
  const [role, setRole] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);

  const [readingType, setReadingType] = useState<ReadingType>('3cards');
  const [topic, setTopic] = useState('');
  const [options, setOptions] = useState<string[]>(['ตัวเลือก A', 'ตัวเลือก B']); // สำหรับโหมดชั่งน้ำหนัก
  const [cards, setCards] = useState<CardPick[]>([]);
  const [result, setResult] = useState<string>(''); // ข้อความคำทำนาย (mock)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      setRole((data as any)?.role ?? null);
    })();
  }, []);

  const requiredCount = useMemo(() => {
    if (readingType === '3cards') return 3;
    if (readingType === 'weigh') return options.length; // 1 ใบต่อตัวเลือก
    return 10; // celtic 10 ใบ
  }, [readingType, options.length]);

  function draw() {
    const deck = [...FULL_DECK];
    const picks: CardPick[] = [];
    for (let i = 0; i < Math.min(requiredCount, deck.length); i++) {
      const idx = Math.floor(Math.random() * deck.length);
      const name = deck.splice(idx, 1)[0];
      const reversed = Math.random() < 0.48;
      picks.push({ name, reversed });
    }
    setCards(picks);

    // สร้างคำทำนายอย่างง่าย (mock)
    let text = '';
    if (readingType === '3cards') {
      text = `สรุป 3 ใบสำหรับ "${topic || 'คำถาม'}" : ไพ่ชี้ให้เห็นมุมอดีต-ปัจจุบัน-อนาคต ควรใช้สติและวางแผนต่อเนื่อง`;
    } else if (readingType === 'weigh') {
      text = `การชั่งน้ำหนักตัวเลือก: ไพ่ที่ออกเป็นแนวทาง เปรียบเทียบ ${options.join(' / ')} โดยรวมให้ฟังเสียงหัวใจและข้อมูลจริงควบคู่กัน`;
    } else {
      text = `Celtic Cross 10 ใบ: สถานการณ์มีหลายชั้น ลองทบทวนเป้าหมายและขอคำแนะนำจากคนที่ไว้ใจ`;
    }
    setResult(text);
  }

  async function saveToHistory() {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      alert('บันทึกไม่สำเร็จ');
      return;
    }
    const userId = userData.user.id;
    const payload = {
      readingType,
      options: readingType === 'weigh' ? options : undefined,
      cards,
      result,
    };
    const insertData = {
      user_id: userId,
      client_id: role === 'admin' ? clientId : null,
      mode: 'tarot',
      topic,
      payload,
    };
    const { error } = await supabase.from('readings').insert(insertData);
    if (error) {
      alert('บันทึกไม่สำเร็จ');
    } else {
      alert('บันทึกผลลัพธ์สำเร็จ');
    }
  }

  return (
    <PermissionGate requirePerms={['tarot']}>
      <div className="space-y-6 max-w-3xl mx-auto px-4 sm:px-0">
        <h1 className="text-lg sm:text-xl font-semibold">ไพ่ยิปซี (Tarot)</h1>

        {/* Admin เท่านั้นถึงจะเลือกชื่อลูกดวงได้ */}
        {role === 'admin' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <ClientPicker
              value={clientId}
              onChange={(id, c) => {
                setClientId(id);
                setClientName(c?.name || c?.email || null);
              }}
            />
            <ClientInfoCard forUserId={clientId ?? undefined} />
          </div>
        ) : (
          <ClientInfoCard /> // member แสดงของตัวเอง
        )}

        {/* ประเภทการเปิดไพ่ */}
        <div className="rounded-xl border p-4 space-y-3">
          <label className="text-sm text-slate-600">ประเภทไพ่ที่เปิด</label>
          <div className="grid gap-2 sm:grid-cols-3">
            <button
              className={`w-full rounded-lg border px-3 py-3 sm:py-2 ${readingType==='3cards'?'bg-indigo-600 text-white':'bg-white'}`}
              onClick={() => setReadingType('3cards')}
            >
              ถามเรื่องต่างๆ 3 ใบ
            </button>
            <button
              className={`w-full rounded-lg border px-3 py-3 sm:py-2 ${readingType==='weigh'?'bg-indigo-600 text-white':'bg-white'}`}
              onClick={() => setReadingType('weigh')}
            >
              ถามชั่งน้ำหนัก 1 ใบต่อตัวเลือก
            </button>
            <button
              className={`w-full rounded-lg border px-3 py-3 sm:py-2 ${readingType==='celtic'?'bg-indigo-600 text-white':'bg-white'}`}
              onClick={() => setReadingType('celtic')}
            >
              แบบคลาสสิก 10 ใบ
            </button>
          </div>

          {/* ฟิลด์ประกอบ */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm text-slate-600">หัวข้อ/คำถาม</label>
              <input
                className="mt-1 w-full h-11 rounded-lg border px-3"
                value={topic}
                onChange={(e)=>setTopic(e.target.value)}
                placeholder="พิมพ์สิ่งที่อยากถาม"
              />
            </div>
            {readingType==='weigh' && (
              <div>
                <label className="text-sm text-slate-600">ตัวเลือก (แก้ไขได้)</label>
                <div className="space-y-2 mt-1">
                  {options.map((op, i)=>(
                    <input key={i}
                      className="w-full h-11 rounded-lg border px-3"
                      value={op}
                      onChange={(e)=>{
                        const arr=[...options]; arr[i]=e.target.value; setOptions(arr);
                      }}
                    />
                  ))}
                  <div className="flex gap-2">
                    <button className="rounded-lg border px-3 min-h-[40px]" onClick={()=>setOptions([...options, `ตัวเลือก ${options.length+1}`])}>+ เพิ่มตัวเลือก</button>
                    {options.length>2 && (
                      <button className="rounded-lg border px-3 min-h-[40px]" onClick={()=>setOptions(options.slice(0,-1))}>− ลบตัวเลือกท้าย</button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button className="w-full sm:w-auto rounded-lg bg-indigo-600 text-white px-4 py-3 sm:py-2" onClick={draw}>
              ดูดวง
            </button>
          </div>
        </div>

        {/* ผลลัพธ์ */}
        {cards.length>0 && (
          <div className="space-y-4">
            <div className="rounded-xl border p-4">
              <div className="font-medium mb-2">ไพ่ที่เปิดได้ (ทั้งหมด {cards.length} ใบ)</div>
              <ul className="list-disc pl-5 text-sm">
                {cards.map((c,i)=>(
                  <li key={i}>{c.name} {c.reversed ? '(กลับหัว)' : ''}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border p-4">
              <div className="font-medium mb-2">คำทำนาย</div>
              <p className="text-sm text-slate-700 whitespace-pre-line">{result}</p>
            </div>

            <div>
              <button className="w-full sm:w-auto rounded-lg bg-emerald-600 text-white px-4 py-3 sm:py-2" onClick={saveToHistory}>
                บันทึกผลลัพธ์
              </button>
            </div>
          </div>
        )}
      </div>
    </PermissionGate>
  );
}
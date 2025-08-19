"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Select, Shell, copy } from "../components/ui";

// หมายเหตุ: สำหรับสมาชิก (member) หน้านี้จะแสดงประวัติของผู้ใช้เองเท่านั้น
// ตัวกรองเหลือเพียง ประเภทการดูดวง และช่วงวันที่
export default function HistoryPage(){
  const [items,setItems]=useState([]);

  // ตัวกรองที่ผู้ใช้กำลังตั้งค่า (ยังไม่ค้นหา)
  const [form,setForm]=useState({ mode:"", from:"", to:"" });
  // ตัวกรองที่ถูก “ยืนยันค้นหา” แล้ว
  const [applied,setApplied]=useState({ mode:"", from:"", to:"", active:false });

  useEffect(()=>{ 
    try{
      // ประวัติทั้งหมดบนอุปกรณ์นี้ (ผูกกับผู้ใช้ที่ล็อกอินอุปกรณ์นี้อยู่แล้ว)
      setItems(JSON.parse(localStorage.getItem("history")||"[]"));
    }catch{}
  },[]);

  // สมาชิกไม่ต้องเลือกชื่อลูกดวงอีกต่อไป
  const canSearch = true;

  const onSearch = ()=>{
    setApplied({ ...form, active:true });
  };
  const onReset = ()=>{
    setForm({ mode:"", from:"", to:"" });
    setApplied({ mode:"", from:"", to:"", active:false });
  };

  const filtered = useMemo(()=>{
    if(!applied.active) return [];
    return (items||[]).filter(h=>{
      // ไม่ต้องกรองตามชื่อลูกดวงอีกต่อไป (สมาชิกเห็นเฉพาะประวัติตัวเองที่บันทึกไว้ในเครื่อง)
      if(applied.mode && (h.mode||"") !== applied.mode) return false;
      if(applied.from && new Date(h.date) < new Date(applied.from)) return false;
      if(applied.to && new Date(h.date) > new Date(applied.to + "T23:59:59")) return false;
      return true;
    });
  },[items, applied]);

  const modes = ["1 ใบ (Quick)","3 ใบ (อดีต-ปัจจุบัน-อนาคต)","5 ใบ (เจาะลึก)","Celtic Cross (10)"];

  return (
    <Shell title="ประวัติการดูดวง" subtitle="เลือกรูปแบบไพ่ และช่วงวันที่ แล้วกดค้นหา">
      <Card className="p-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <Select label="รูปแบบไพ่" value={form.mode} onChange={e=>setForm(f=>({...f,mode:e.target.value}))}>
            <option value="">— ทั้งหมด —</option>
            {modes.map(m=>
              <option key={m} value={m}>{m}</option>
            )}
          </Select>
          <label className="text-sm grid gap-1">
            <span className="text-slate-700">ตั้งแต่วันที่</span>
            <input type="date" value={form.from} onChange={e=>setForm(f=>({...f,from:e.target.value}))} className="px-3 py-2 rounded-xl border bg-white"/>
          </label>
          <label className="text-sm grid gap-1">
            <span className="text-slate-700">ถึงวันที่</span>
            <input type="date" value={form.to} onChange={e=>setForm(f=>({...f,to:e.target.value}))} className="px-3 py-2 rounded-xl border bg-white"/>
          </label>
        </div>

        <div className="mt-3 flex gap-2">
          <Button onClick={onSearch} disabled={!canSearch}>ค้นหา</Button>
          <Button variant="ghost" onClick={onReset}>ล้างตัวกรอง</Button>
        </div>

        {!applied.active && (
          <div className="mt-3 text-sm text-slate-500">
            เลือก <b>รูปแบบไพ่</b> และ/หรือช่วงวันที่ แล้วกด “ค้นหา”
          </div>
        )}
      </Card>

      {applied.active && !filtered.length && (
        <div className="text-slate-500">ไม่พบประวัติที่ตรงกับเงื่อนไข</div>
      )}

      {!!filtered.length && (
        <div className="grid gap-4">
          {filtered.map(h=>(
            <Card key={h.id} className="p-5">
              <div className="flex justify-between text-sm">
                <div><span className="font-medium">{h.client}</span> • {h.topic} • {h.mode}</div>
                <div className="text-slate-500">{new Date(h.date).toLocaleString()}</div>
              </div>

              {!!(h.per_card||[]).length && (
                <div className="mt-3">
                  <div className="font-medium">ไพ่ที่เปิดได้ & ความหมายรายใบ</div>
                  <ul className="list-disc ml-5 text-sm space-y-1">
                    {(h.per_card||[]).map((pc,i)=>(<li key={i}><b>{pc.name}:</b> {pc.meaning}</li>))}
                  </ul>
                </div>
              )}

              <div className="mt-3">
                <div className="font-medium">สรุปความหมาย</div>
                <p className="text-sm whitespace-pre-wrap">{h.summary}</p>
              </div>

              {!!(h.advices||[]).length && (
                <div className="mt-3">
                  <div className="font-medium">คำแนะนำ</div>
                  <ul className="list-disc ml-5 text-sm">
                    {(h.advices||[]).map((a,i)=>(<li key={i}>{a}</li>))}
                  </ul>
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <Button variant="ghost" onClick={()=>copy(exportText(h))}>คัดลอกสรุป</Button>
                <Button variant="ghost" onClick={()=>window.print()}>พิมพ์ / PDF</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Shell>
  );
}

function exportText(h){
  const per = (h.per_card||[]).map(pc=>`- ${pc.name}: ${pc.meaning}`).join("\n");
  const adv = (h.advices||[]).map(a=>`• ${a}`).join("\n");
  return `ลูกดวง: ${h.client}
วันที่: ${new Date(h.date).toLocaleString()}
หัวข้อ: ${h.topic}
รูปแบบ: ${h.mode}

ไพ่ที่เปิดได้ & ความหมายรายใบ:
${per}

สรุปความหมาย:
${h.summary}

คำแนะนำ:
${adv}
`;
}
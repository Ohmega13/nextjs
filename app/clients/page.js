"use client";
import { useEffect, useState } from "react";
import { Button, Input, Select, Section, Shell, StickyBar, useToast, uid } from "../components/ui";

export default function ClientsPage() {
  const [form, setForm] = useState({
    name:"", nickname:"", contact:"",
    birthDate:"", birthTime:"", birthPlace:"",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Bangkok",
    gender:""
  });
  const [list, setList] = useState([]);
  const { setMsg, Toast } = useToast();

  /* โหลดรายชื่อลูกดวง */
  useEffect(()=>{ try{ setList(JSON.parse(localStorage.getItem("clients")||"[]")); }catch{} },[]);
  /* autosave draft */
  useEffect(()=>{
    const t = setTimeout(()=> localStorage.setItem("client_draft", JSON.stringify(form)), 1500);
    return ()=>clearTimeout(t);
  },[form]);

  const loadDraft = () => {
    try {
      const d = JSON.parse(localStorage.getItem("client_draft")||"null");
      if(d){ setForm(d); setMsg("โหลดร่างล่าสุดแล้ว"); }
    } catch {}
  };
  const clearForm = () => setForm({
    name:"", nickname:"", contact:"", birthDate:"", birthTime:"", birthPlace:"", timezone: form.timezone, gender:""
  });

  const errors = {
    name: form.name.trim() ? "" : "กรุณากรอกชื่อ",
    birthDate: form.birthDate ? "" : "",
  };
  const canSave = !errors.name;

  const save = () => {
    if(!canSave) return setMsg("กรอกข้อมูลให้ครบก่อนจ้า");
    const next = [{ id: uid(), ...form, createdAt: new Date().toISOString() }, ...list];
    setList(next); localStorage.setItem("clients", JSON.stringify(next));
    setMsg("บันทึกแล้ว"); clearForm();
  };

  return (
    <>
      <Shell title="ลงทะเบียนลูกดวงใหม่" subtitle="กรอกเฉพาะที่จำเป็นก่อนก็ได้">
        <Section title="ข้อมูลพื้นฐาน">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="ชื่อ-สกุล *" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="เช่น ปฏิญญา หะยอม ใหม่" error={errors.name}/>
            <Input label="ชื่อเล่น" value={form.nickname} onChange={e=>setForm(f=>({...f,nickname:e.target.value}))}/>
            <Input label="ติดต่อ" value={form.contact} onChange={e=>setForm(f=>({...f,contact:e.target.value}))} hint="เช่น Line/เบอร์/อีเมล อย่างใดอย่างหนึ่ง"/>
            <Select label="เพศ" value={form.gender} onChange={e=>setForm(f=>({...f,gender:e.target.value}))}>
              {["","ชาย","หญิง","ไม่ระบุ"].map(x=><option key={x} value={x}>{x||"-"}</option>)}
            </Select>
            <Input label="วันเกิด" type="date" value={form.birthDate} onChange={e=>setForm(f=>({...f,birthDate:e.target.value}))}/>
            <Input label="เวลาเกิด" type="time" value={form.birthTime} onChange={e=>setForm(f=>({...f,birthTime:e.target.value}))}/>
            <Input label="สถานที่เกิด" value={form.birthPlace} onChange={e=>setForm(f=>({...f,birthPlace:e.target.value}))}/>
            <Input label="โซนเวลา" value={form.timezone} onChange={e=>setForm(f=>({...f,timezone:e.target.value}))}/>
          </div>
        </Section>

        <Section title="ลูกดวงล่าสุด">
          {!list.length ? <div className="text-slate-500 text-sm">ยังไม่มีข้อมูล</div> :
            <div className="divide-y max-h-64 overflow-y-auto">
              {list.slice(0,6).map(c=>(
                <div key={c.id} className="py-2 flex justify-between text-sm">
                  <div>{c.name} {c.nickname?`(${c.nickname})`:""}</div>
                  <div className="text-slate-500">{new Date(c.createdAt).toLocaleString()}</div>
                </div>
              ))}
            </div>}
        </Section>
      </Shell>

      <StickyBar>
        <div className="w-full flex flex-col sm:flex-row sm:items-center gap-2">
          <Button onClick={save} disabled={!canSave} className="w-full sm:w-auto">บันทึก</Button>
          <Button variant="ghost" onClick={clearForm} className="w-full sm:w-auto">ล้างฟอร์ม</Button>
          <Button variant="ghost" onClick={loadDraft} className="w-full sm:w-auto">โหลดร่างล่าสุด</Button>
          <a href="/reading" className="ml-0 sm:ml-auto w-full sm:w-auto">
            <Button variant="ghost" className="w-full sm:w-auto">ไปหน้าเริ่มดูดวง</Button>
          </a>
        </div>
      </StickyBar>
      <Toast/>
    </>
  );
}
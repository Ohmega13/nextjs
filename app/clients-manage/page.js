"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Section, Shell, Select, useToast } from "../components/ui";

export default function ClientsManagePage() {
  const { setMsg, Toast } = useToast();

  const [clients, setClients] = useState([]);
  const [history, setHistory] = useState([]);
  const [q, setQ] = useState("");

  // แก้ไขรายคน
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name:"", nickname:"", contact:"",
    birthDate:"", birthTime:"", birthPlace:"",
    timezone:"", gender:""
  });

  useEffect(()=>{
    refreshAll();
  },[]);

  function refreshAll(){
    try{
      setClients(JSON.parse(localStorage.getItem("clients")||"[]"));
      setHistory(JSON.parse(localStorage.getItem("history")||"[]"));
    }catch{
      setClients([]); setHistory([]);
    }
  }

  const filtered = useMemo(()=>{
    const term = q.trim().toLowerCase();
    if(!term) return clients;
    return clients.filter(c=>{
      const t = `${c.name} ${c.nickname||""} ${c.contact||""} ${c.birthPlace||""}`.toLowerCase();
      return t.includes(term);
    });
  },[clients, q]);

  function startEdit(c){
    setEditingId(c.id);
    setForm({
      name: c.name||"", nickname: c.nickname||"", contact: c.contact||"",
      birthDate: c.birthDate||"", birthTime: c.birthTime||"", birthPlace: c.birthPlace||"",
      timezone: c.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Bangkok",
      gender: c.gender||""
    });
  }
  function cancelEdit(){ setEditingId(null); }

  function saveEdit(){
    const next = clients.map(c => c.id===editingId ? ({...c, ...form}) : c);
    localStorage.setItem("clients", JSON.stringify(next));
    setClients(next);
    setEditingId(null);
    setMsg("บันทึกข้อมูลลูกดวงแล้ว");
  }

  function deleteClient(c){
    // คอนเฟิร์ม: ลบลูกดวง (และเลือกว่าจะลบประวัติทั้งหมดด้วยไหม)
    const confirmAll = confirm(`ลบ "${c.name}${c.nickname?` (${c.nickname})`:""}" และประวัติทั้งหมดของลูกดวงนี้ด้วยหรือไม่?\n\nกด OK = ลบทั้งลูกดวงและประวัติ\nกด Cancel = ลบเฉพาะลูกดวง (เก็บประวัติไว้)`);
    const newClients = clients.filter(x=>x.id!==c.id);
    localStorage.setItem("clients", JSON.stringify(newClients));
    setClients(newClients);

    if(confirmAll){
      const newHistory = history.filter(h => (h.clientId||"") !== c.id);
      localStorage.setItem("history", JSON.stringify(newHistory));
      setHistory(newHistory);
    }
    setMsg("ลบข้อมูลเรียบร้อย");
  }

  function countHistory(cId){
    return history.filter(h => (h.clientId||"") === cId).length;
  }

  return (
    <>
      <Shell title="ประวัติลูกดวง" subtitle="ค้นหา ดูรายละเอียด แก้ไข หรือลบลูกดวง">
        <Card className="p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="ค้นหาลูกดวง"
              value={q}
              onChange={e=>setQ(e.target.value)}
              placeholder="พิมพ์ชื่อ, ชื่อเล่น, ช่องทางติดต่อ, สถานที่เกิด"
            />
            <div className="self-end sm:self-auto">
              <a href="/clients">
                <Button variant="ghost" className="w-full sm:w-auto">+ เพิ่มลูกดวงใหม่</Button>
              </a>
            </div>
          </div>
        </Card>

        {!filtered.length ? (
          <Card className="p-5 text-center text-slate-600">
            <div className="mb-3">ไม่พบบัญชีลูกดวง</div>
            <a href="/clients">
              <Button className="w-full sm:w-auto">+ เพิ่มลูกดวงใหม่</Button>
            </a>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filtered.map(c=>(
              <Card key={c.id} className="p-4 sm:p-5">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3">
                  <div className="text-sm">
                    <div className="font-medium">{c.name} {c.nickname?`(${c.nickname})`:""}</div>
                    <div className="text-slate-500">สร้างเมื่อ {c.createdAt ? new Date(c.createdAt).toLocaleString() : "-"}</div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    {editingId===c.id ? (
                      <>
                        <Button onClick={saveEdit} className="w-full sm:w-auto">บันทึก</Button>
                        <Button variant="ghost" onClick={cancelEdit} className="w-full sm:w-auto">ยกเลิก</Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" onClick={()=>startEdit(c)} className="w-full sm:w-auto">แก้ไข</Button>
                        <Button variant="danger" onClick={()=>deleteClient(c)} className="w-full sm:w-auto">ลบ</Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Content */}
                {editingId===c.id ? (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="ชื่อ-สกุล *" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
                    <Input label="ชื่อเล่น" value={form.nickname} onChange={e=>setForm(f=>({...f,nickname:e.target.value}))}/>
                    <Input label="ติดต่อ" value={form.contact} onChange={e=>setForm(f=>({...f,contact:e.target.value}))}/>
                    <Select label="เพศ" value={form.gender} onChange={e=>setForm(f=>({...f,gender:e.target.value}))}>
                      {["","ชาย","หญิง","ไม่ระบุ"].map(x=><option key={x} value={x}>{x||"-"}</option>)}
                    </Select>
                    <Input label="วันเกิด" type="date" value={form.birthDate} onChange={e=>setForm(f=>({...f,birthDate:e.target.value}))}/>
                    <Input label="เวลาเกิด" type="time" value={form.birthTime} onChange={e=>setForm(f=>({...f,birthTime:e.target.value}))}/>
                    <Input label="สถานที่เกิด" value={form.birthPlace} onChange={e=>setForm(f=>({...f,birthPlace:e.target.value}))}/>
                    <Input label="โซนเวลา" value={form.timezone} onChange={e=>setForm(f=>({...f,timezone:e.target.value}))}/>
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm break-words">
                    <div>
                      <div className="text-slate-500">ติดต่อ</div>
                      <div>{c.contact || "-"}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">วัน/เวลา/ที่เกิด</div>
                      <div>{c.birthDate || "-"} {c.birthTime||""} {c.birthPlace?`• ${c.birthPlace}`:""}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">โซนเวลา/เพศ</div>
                      <div>{c.timezone || "-"} {c.gender?`• ${c.gender}`:""}</div>
                    </div>
                  </div>
                )}

                {/* Footer info */}
                <div className="mt-3 text-xs text-slate-600">
                  ประวัติที่บันทึกไว้: <b>{countHistory(c.id)}</b> รายการ
                  <span className="mx-2">|</span>
                  <a href="/history" className="underline">ไปหน้าประวัติ</a>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Shell>
      <Toast/>
    </>
  );
}
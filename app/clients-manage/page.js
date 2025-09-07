"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Section, Shell, Select, useToast } from "../components/ui";
import { supabase } from "@/lib/supabaseClient";

export default function ClientsManagePage() {
  const { setMsg, Toast } = useToast();

  // core state
  const [role, setRole] = useState("member"); // 'admin' | 'member' (derived below)
  const [clients, setClients] = useState([]);
  const [counts, setCounts] = useState({}); // { [clientId]: number }
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  // edit state
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name:"", nickname:"", contact:"",
    dob:"", birth_time:"", birth_place:"",
    timezone:"", gender:"",
  });

  useEffect(() => {
    seed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function seed(){
    setLoading(true);
    try {
      // who am I
      const { data: { user }, error: uErr } = await supabase.auth.getUser();
      if (uErr) throw uErr;
      if (!user) {
        setClients([]); setCounts({}); setRole("member"); setLoading(false);
        return;
      }

      // read role from profiles
      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      const r = (prof?.role ?? null) === 'admin' ? 'admin' : 'member';
      setRole(r);

      // fetch clients from profile_details
      let query = supabase
        .from('profile_details')
        .select('id,user_id,name,nickname,contact,dob,birth_time,birth_place,timezone,gender,created_at')
        .order('created_at', { ascending: false });

      if (r !== 'admin') {
        query = query.eq('user_id', user.id);
      }

      const { data: rows, error } = await query.returns();
      if (error) throw error;
      setClients(rows || []);

      // fetch readings and build counts by client_id
      const ids = (rows || []).map(x => x.id).filter(Boolean);
      if (ids.length) {
        const { data: readRows, error: rErr } = await supabase
          .from('readings')
          .select('client_id')
          .in('client_id', ids);
        if (!rErr && readRows) {
          const map = {};
          for (const rr of readRows) {
            const k = rr.client_id || 'null';
            map[k] = (map[k] || 0) + 1;
          }
          setCounts(map);
        } else {
          setCounts({});
        }
      } else {
        setCounts({});
      }
    } catch (e) {
      console.error('seed clients-manage error:', e);
      setMsg('โหลดข้อมูลลูกดวงไม่สำเร็จ');
      setClients([]); setCounts({});
    } finally {
      setLoading(false);
    }
  }

  // filter by search
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if(!term) return clients;
    return clients.filter(c => {
      const t = `${c.name||''} ${c.nickname||''} ${c.contact||''} ${c.birth_place||''}`.toLowerCase();
      return t.includes(term);
    });
  }, [clients, q]);

  // edit helpers
  function startEdit(c){
    setEditingId(c.id);
    setForm({
      name: c.name||"", nickname: c.nickname||"", contact: c.contact||"",
      dob: c.dob||"", birth_time: c.birth_time||"", birth_place: c.birth_place||"",
      timezone: c.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Bangkok",
      gender: c.gender||""
    });
  }
  function cancelEdit(){ setEditingId(null); }

  async function saveEdit(){
    try{
      if(!editingId) return;
      const payload = { ...form };
      const { error } = await supabase
        .from('profile_details')
        .update(payload)
        .eq('id', editingId);
      if (error) throw error;
      setMsg('บันทึกข้อมูลลูกดวงแล้ว');
      setEditingId(null);
      await seed();
    }catch(e){
      console.error('saveEdit error:', e);
      setMsg('บันทึกไม่สำเร็จ');
    }
  }

  async function deleteClient(c){
    try{
      const confirmAll = confirm(`ลบ \"${c.name}${c.nickname?` (${c.nickname})`:""}\" และประวัติทั้งหมดของลูกดวงนี้ด้วยหรือไม่?\n\nกด OK = ลบทั้งลูกดวงและประวัติ\nกด Cancel = ลบเฉพาะลูกดวง (เก็บประวัติไว้)`);

      if (confirmAll) {
        // ลบ readings ที่ผูก client นี้ก่อน (admin เท่านั้นตาม RLS)
        await supabase.from('readings').delete().eq('client_id', c.id);
      }
      const { error } = await supabase.from('profile_details').delete().eq('id', c.id);
      if (error) throw error;
      setMsg('ลบข้อมูลเรียบร้อย');
      await seed();
    }catch(e){
      console.error('deleteClient error:', e);
      setMsg('ลบไม่สำเร็จ');
    }
  }

  function countHistory(clientId){
    return counts[clientId] || 0;
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

        {loading ? (
          <Card className="p-5 text-center text-slate-600">กำลังโหลดข้อมูล…</Card>
        ) : !filtered.length ? (
          <Card className="p-5 text-center text-slate-600">
            <div className="mb-3">ไม่พบบัญชีลูกดวง</div>
            <a href="/clients">
              <Button className="w-full sm:w-auto">+ เพิ่มลูกดวงใหม่</Button>
            </a>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filtered.map(c=> (
              <Card key={c.id} className="p-4 sm:p-5">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3">
                  <div className="text-sm">
                    <div className="font-medium">{c.name} {c.nickname?`(${c.nickname})`:""}</div>
                    <div className="text-slate-500">สร้างเมื่อ {c.created_at ? new Date(c.created_at).toLocaleString() : "-"}</div>
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
                      {["","ชาย","หญิง","ไม่ระบุ"].map(x=> <option key={x} value={x}>{x||"-"}</option>)}
                    </Select>
                    <Input label="วันเกิด" type="date" value={form.dob} onChange={e=>setForm(f=>({...f,dob:e.target.value}))}/>
                    <Input label="เวลาเกิด" type="time" value={form.birth_time} onChange={e=>setForm(f=>({...f,birth_time:e.target.value}))}/>
                    <Input label="สถานที่เกิด" value={form.birth_place} onChange={e=>setForm(f=>({...f,birth_place:e.target.value}))}/>
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
                      <div>{c.dob || "-"} {c.birth_time||""} {c.birth_place?`• ${c.birth_place}`:""}</div>
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
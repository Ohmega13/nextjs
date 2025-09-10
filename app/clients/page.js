"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button, Input, Select, Section, Shell, StickyBar, useToast, uid } from "../components/ui";
import { supabase } from "@/lib/supabaseClient";
import { loadClients } from "@/lib/clients";

export default function ClientsPage() {
  const [form, setForm] = useState({
    name: "",
    nickname: "",
    contact: "",
    birthDate: "",
    birthTime: "",
    birthPlace: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Bangkok",
    gender: "",
  });
  const [list, setList] = useState([]);
  const [role, setRole] = useState("member"); // 'admin' | 'member'
  const [isPending, startTransition] = useTransition();
  const { setMsg, Toast } = useToast();

  // helper: get current user + role
  async function getUserAndRole() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new Error("ยังไม่ได้ล็อกอิน");
    let r = "member";
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (prof?.role === "admin") r = "admin";
    } catch {}
    return { user, role: r };
  }

  /* โหลดรายชื่อลูกดวงจาก Supabase ตามบทบาท */
  useEffect(() => {
    (async () => {
      try {
        const { user, role } = await getUserAndRole();
        setRole(role);
        const rows = await loadClients(user.id, role);
        setList(rows || []);
      } catch (e) {
        console.error("loadClients error", e);
        setMsg("โหลดรายชื่อไม่ได้");
      }
    })();
  }, []);

  /* autosave draft */
  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem("client_draft", JSON.stringify(form)), 1500);
    return () => clearTimeout(t);
  }, [form]);

  const loadDraft = () => {
    try {
      const d = JSON.parse(localStorage.getItem("client_draft") || "null");
      if (d) {
        setForm(d);
        setMsg("โหลดร่างล่าสุดแล้ว");
      }
    } catch {}
  };

  const clearForm = () =>
    setForm((f) => ({
      name: "",
      nickname: "",
      contact: "",
      birthDate: "",
      birthTime: "",
      birthPlace: "",
      timezone: f.timezone,
      gender: "",
    }));

  const errors = useMemo(() => ({
    name: form.name.trim() ? "" : "กรุณากรอกชื่อ",
  }), [form.name]);

  const canSave = !errors.name;

  // map form -> profile_details row
  function buildRow(userId, role) {
    const row = {
      name: form.name.trim(),
      nickname: form.nickname || null,
      contact: form.contact || null,
      dob: form.birthDate || null, // date (YYYY-MM-DD)
      tob: form.birthTime || null, // time (HH:mm)
      birth_place: form.birthPlace || null,
      timezone: form.timezone || null,
      gender: form.gender || null,
      // ownership
      user_id: role === "member" ? userId : null,
      owner_user_id: role === "admin" ? userId : null,
    };
    return row;
  }

  const save = async () => {
    if (!canSave) return setMsg("กรอกข้อมูลให้ครบก่อนจ้า");

    startTransition(async () => {
      try {
        const { user, role } = await getUserAndRole();
        const row = buildRow(user.id, role);

        // ถ้าเป็นสมาชิก: อัปเดตโปรไฟล์ของตัวเอง (กันซ้ำ) ด้วย upsert ตาม user_id
        // ถ้าเป็นแอดมิน: เพิ่มลูกดวงใหม่ให้ตัวเองเป็น owner
        let q;
        if (role === "member") {
          q = supabase
            .from("profile_details")
            .upsert([row], { onConflict: "user_id" })
            .select()
            .single();
        } else {
          q = supabase
            .from("profile_details")
            .insert([row])
            .select()
            .single();
        }
        const { data, error } = await q;
        if (error) throw error;

        setMsg(role === "member" ? "บันทึก/อัปเดตโปรไฟล์แล้ว" : "บันทึกลูกดวงแล้ว");
        clearForm();

        // refresh รายชื่อลูกดวงให้ทันที
        try {
          const next = await loadClients(user.id, role);
          setList(next || []);
        } catch (e) {
          console.warn("refresh clients failed:", e);
        }
      } catch (e) {
        console.error("save client error", e);
        // แสดงรายละเอียด error ถ้ามี
        const msg =
          (e && (e.message || e.error_description || e.hint)) ||
          "บันทึกไม่สำเร็จ";
        setMsg(msg);
      }
    });
  };

  return (
    <>
      <Shell title="ลงทะเบียนลูกดวงใหม่" subtitle="กรอกเฉพาะที่จำเป็นก่อนก็ได้">
        <Section title="ข้อมูลพื้นฐาน">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="ชื่อ-สกุล *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="เช่น ปฏิญญา หะยอม ใหม่"
              error={errors.name}
            />
            <Input label="ชื่อเล่น" value={form.nickname} onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))} />
            <Input
              label="ติดต่อ"
              value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
              hint="เช่น Line/เบอร์/อีเมล อย่างใดอย่างหนึ่ง"
            />
            <Select label="เพศ" value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}>
              {["", "ชาย", "หญิง", "ไม่ระบุ"].map((x) => (
                <option key={x} value={x}>
                  {x || "-"}
                </option>
              ))}
            </Select>
            <Input label="วันเกิด" type="date" value={form.birthDate} onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))} />
            <Input label="เวลาเกิด" type="time" value={form.birthTime} onChange={(e) => setForm((f) => ({ ...f, birthTime: e.target.value }))} />
            <Input label="สถานที่เกิด" value={form.birthPlace} onChange={(e) => setForm((f) => ({ ...f, birthPlace: e.target.value }))} />
            <Input label="โซนเวลา" value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} />
          </div>
        </Section>

        <Section title="ลูกดวงล่าสุด">
          {!list.length ? (
            <div className="text-slate-500 text-sm">ยังไม่มีข้อมูล</div>
          ) : (
            <div className="divide-y max-h-64 overflow-y-auto">
              {list.slice(0, 6).map((c, i) => (
                <div key={c.id ?? `row-${i}`} className="py-2 flex justify-between text-sm">
                  <div>
                    {c.name} {c.nickname ? `(${c.nickname})` : ""}
                  </div>
                  <div className="text-slate-500">
                    {c.created_at ? new Date(c.created_at).toLocaleString() : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </Shell>

      <StickyBar>
        <div className="w-full flex flex-col sm:flex-row sm:items-center gap-2">
          <Button onClick={save} disabled={!canSave || isPending} className="w-full sm:w-auto">
            {isPending ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
          <Button variant="ghost" onClick={clearForm} className="w-full sm:w-auto">
            ล้างฟอร์ม
          </Button>
          <Button variant="ghost" onClick={loadDraft} className="w-full sm:w-auto">
            โหลดร่างล่าสุด
          </Button>
          <a href="/reading" className="ml-0 sm:ml-auto w-full sm:w-auto">
            <Button variant="ghost" className="w-full sm:w-auto">
              ไปหน้าเริ่มดูดวง
            </Button>
          </a>
        </div>
      </StickyBar>
      <Toast />
    </>
  );
}
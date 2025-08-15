"use client";
import { useEffect, useState } from "react";
import { Card, Section, Shell, Button, useToast } from "../components/ui";
import { idbListImages, idbPutMany, idbClearImages } from "../lib/idb";

export default function BackupPage() {
  const { setMsg, Toast } = useToast();
  const [stats, setStats] = useState({ clients: 0, history: 0, images: 0 });

  useEffect(() => { refreshStats(); }, []);

  function refreshStats() {
    try {
      const clients = JSON.parse(localStorage.getItem("clients") || "[]");
      const history = JSON.parse(localStorage.getItem("history") || "[]");
      idbListImages().then(imgs => {
        setStats({ clients: clients.length, history: history.length, images: imgs.length });
      });
    } catch {
      setStats({ clients: 0, history: 0, images: 0 });
    }
  }

  async function onExport() {
    try {
      const clients = JSON.parse(localStorage.getItem("clients") || "[]");
      const history = JSON.parse(localStorage.getItem("history") || "[]");
      const draft = JSON.parse(localStorage.getItem("client_draft") || "null");
      const images = await idbListImages();

      // แปลง Blob -> dataURL
      const imagesPacked = await Promise.all(
        images.map(async (r) => ({
          id: r.id,
          clientId: r.clientId,
          side: r.side,
          createdAt: r.createdAt,
          dataUrl: await blobToDataURL(r.blob),
        }))
      );

      const pkg = {
        version: "beta-one",
        exportedAt: new Date().toISOString(),
        clients,
        history,
        draft,
        images: imagesPacked,
      };

      const blob = new Blob([JSON.stringify(pkg)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0,19).replace(/[-:T]/g,"");
      a.href = url;
      a.download = `ddtarot-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("สำรองข้อมูลเรียบร้อย");
    } catch (e) {
      console.error(e);
      setMsg("สำรองข้อมูลไม่สำเร็จ");
    }
  }

  async function onImport(file) {
    try {
      if (!file) return;
      const text = await file.text();
      const data = JSON.parse(text);

      // ใส่ค่าพื้นฐาน (รองรับกรณีไฟล์เก่าไม่มีบางฟิลด์)
      const clients = Array.isArray(data.clients) ? data.clients : [];
      const history = Array.isArray(data.history) ? data.history : [];
      const draft = data.draft ?? null;
      const images = Array.isArray(data.images) ? data.images : [];

      // คืนค่า localStorage
      localStorage.setItem("clients", JSON.stringify(clients));
      localStorage.setItem("history", JSON.stringify(history));
      if (draft) localStorage.setItem("client_draft", JSON.stringify(draft));

      // คืนรูปลง IndexedDB
      const records = await Promise.all(images.map(async (im) => ({
        id: im.id,
        clientId: im.clientId,
        side: im.side,
        createdAt: im.createdAt,
        blob: dataURLToBlob(im.dataUrl),
      })));
      await idbPutMany(records);

      setMsg("นำเข้าข้อมูลเรียบร้อย");
      refreshStats();
    } catch (e) {
      console.error(e);
      setMsg("นำเข้าข้อมูลไม่สำเร็จ");
    }
  }

  async function onWipeAll() {
    if (!confirm("ลบข้อมูลทั้งหมด (ลูกดวง/ประวัติ/รูป) ?")) return;
    try {
      localStorage.removeItem("clients");
      localStorage.removeItem("history");
      localStorage.removeItem("client_draft");
      await idbClearImages();
      setMsg("ล้างข้อมูลเรียบร้อย");
      refreshStats();
    } catch {
      setMsg("ล้างข้อมูลไม่สำเร็จ");
    }
  }

  return (
    <>
      <Shell title="สำรอง/นำเข้าข้อมูล" subtitle="บันทึกทุกอย่างเป็นไฟล์เดียว หรือกู้คืนจากไฟล์ที่สำรองไว้">
        <Card className="p-5">
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <div>ลูกดวง: <b>{stats.clients}</b> ราย</div>
            <div>ประวัติ: <b>{stats.history}</b> รายการ</div>
            <div>รูปมือ: <b>{stats.images}</b> ไฟล์</div>
          </div>
        </Card>

        <Section title="สำรองข้อมูล (.json ไฟล์เดียว)">
          <Button onClick={onExport}>ดาวน์โหลดไฟล์สำรอง</Button>
        </Section>

        <Section title="นำเข้าข้อมูลจากไฟล์ที่สำรองไว้ (.json)">
          <input
            type="file"
            accept="application/json"
            onChange={(e) => onImport(e.target.files?.[0] || null)}
          />
          <div className="text-xs text-slate-500 mt-2">
            * ข้อมูลใหม่จะทับค่าเดิม (clients/history/draft) และเพิ่มไฟล์รูปในเครื่อง
          </div>
        </Section>

        <Section title="ล้างข้อมูลทั้งหมด (ระวัง)">
          <Button variant="danger" onClick={onWipeAll}>ล้างข้อมูลทั้งหมด</Button>
        </Section>
      </Shell>
      <Toast />
    </>
  );
}

/* ---------- helpers ---------- */
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
function dataURLToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(",");
  const mime = (meta.match(/data:(.*?);base64/) || [])[1] || "application/octet-stream";
  const bin = atob(b64);
  const len = bin.length;
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
}
// app/reading/page.js
"use client";
import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Section,
  Shell,
  TextArea,
  SearchableSelect,
  useToast,
  uid,
} from "../components/ui";
import { idbPutImage } from "../lib/idb";

// หัวข้อให้ติ๊กได้หลายเรื่อง
const TOPIC_OPTIONS = [
  "การงาน",
  "การเงิน",
  "ความสัมพันธ์",
  "สุขภาพ",
  "ธุรกิจ",
  "ครอบครัว",
  "การเรียน",
  "อื่น ๆ",
];

export default function ReadingPage() {
  const [clients, setClients] = useState([]);
  const [selected, setSelected] = useState(null);

  // เลือกศาสตร์
  const [method, setMethod] = useState("tarot"); // tarot | astrology | palm

  // -------- Tarot (ไพ่ยิปซี) --------
  const [tarotType, setTarotType] = useState("ask-3"); // ask-3 | weigh-1v1 | celtic-10
  const [topics, setTopics] = useState([]); // ติ๊กหลายหัวข้อ
  const [details, setDetails] = useState(""); // รายละเอียดเพิ่มเติม
  const [cards, setCards] = useState([]);

  // -------- Astrology (พื้นดวง) --------
  const [astroSystem, setAstroSystem] = useState("thai"); // thai | western

  // -------- Palm (ลายมือ) --------
  const [leftFile, setLeftFile] = useState(null);
  const [rightFile, setRightFile] = useState(null);

  // ทั่วไป
  const { setMsg, Toast } = useToast();

  useEffect(() => {
    try {
      setClients(JSON.parse(localStorage.getItem("clients") || "[]"));
    } catch {}
  }, []);

  // เด็คไพ่ (เมเจอร์ 22)
  const deck = [
    "The Fool",
    "The Magician",
    "The High Priestess",
    "The Empress",
    "The Emperor",
    "The Hierophant",
    "The Lovers",
    "The Chariot",
    "Strength",
    "The Hermit",
    "Wheel of Fortune",
    "Justice",
    "The Hanged Man",
    "Death",
    "Temperance",
    "The Devil",
    "The Tower",
    "The Star",
    "The Moon",
    "The Sun",
    "Judgement",
    "The World",
  ];

  function draw(n) {
    const pool = [...deck];
    const picks = [];
    for (let i = 0; i < n && pool.length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const name = pool.splice(idx, 1)[0];
      const reversed = Math.random() < 0.48;
      picks.push({ name, reversed });
    }
    return picks;
  }

  const previewTarot = () => {
    const count = tarotType === "ask-3" ? 3 : tarotType === "weigh-1v1" ? 2 : 10;
    setCards(draw(count));
  };

  // ใช้ได้เมื่อมีหัวข้ออย่างน้อย 1 หรือมีรายละเอียด
  const canSendTarot = topics.length > 0 || details.trim().length > 0;

  // เซฟประวัติรวม
  const history = () => JSON.parse(localStorage.getItem("history") || "[]");
  const saveHistory = (obj) => {
    const h = history();
    h.unshift(obj);
    localStorage.setItem("history", JSON.stringify(h));
  };

  async function start() {
    if (!selected) return setMsg("กรุณาเลือกลูกดวง");

    let payload = { basic: selected };
    let modeLabel = "";

    if (method === "tarot") {
      if (!canSendTarot)
        return setMsg("เลือกหัวข้ออย่างน้อย 1 เรื่อง หรือกรอกรายละเอียดคำถาม");

      modeLabel =
        tarotType === "ask-3"
          ? "ถามทั่วไป (3 ใบ)"
          : tarotType === "weigh-1v1"
          ? "ชั่งน้ำหนัก A vs B (1+1 ใบ)"
          : "Celtic Cross (10)";
      const count = tarotType === "ask-3" ? 3 : tarotType === "weigh-1v1" ? 2 : 10;
      const useCards = cards.length ? cards : draw(count);

      payload = {
        ...payload,
        topic: {
          focus_list: topics,
          focus: topics.join(", "),
          details,
        },
        reading: {
          method: "Tarot",
          mode: modeLabel,
          deck: "Major Arcana (22)",
          result: useCards,
        },
      };
    }

    if (method === "astrology") {
      modeLabel =
        astroSystem === "western"
          ? "ดูพื้นดวงโหราศาสตร์ตะวันตก"
          : "ดูพื้นดวงโหราศาสตร์ไทย";
      payload = {
        ...payload,
        topic: { focus: "พื้นดวง", details: "" },
        reading: { method: "Astrology", mode: modeLabel, system: astroSystem },
      };
    }

    if (method === "palm") {
      if (!leftFile || !rightFile)
        return setMsg("อัปโหลดรูปมือซ้ายและขวาก่อน");
      modeLabel = "ดูลายมือ (ซ้าย/ขวา)";
      const leftId = uid();
      const rightId = uid();
      const [lbuf, rbuf] = await Promise.all([
        fileToBlob(leftFile),
        fileToBlob(rightFile),
      ]);
      await idbPutImage({
        id: leftId,
        clientId: selected.id,
        side: "left",
        blob: lbuf,
        createdAt: new Date().toISOString(),
      });
      await idbPutImage({
        id: rightId,
        clientId: selected.id,
        side: "right",
        blob: rbuf,
        createdAt: new Date().toISOString(),
      });
      payload = {
        ...payload,
        topic: { focus: "ดูลายมือ", details: "" },
        reading: {
          method: "Palmistry",
          mode: modeLabel,
          images: { leftId, rightId },
        },
      };
    }

    try {
      const res = await fetch("/api/see-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error("see failed");

      const base = {
        id: uid(),
        date: new Date().toISOString(),
        clientId: selected.id,
        clientName: selected.name,
        topic:
          method === "tarot"
            ? payload.topic.focus || ""
            : payload.topic?.focus || "",
        mode: payload.reading?.mode || "",
      };

      if (method === "tarot") {
        saveHistory({
          ...base,
          cards: payload.reading.result,
          per_card: json.result.per_card,
          summary: json.result.summary,
          advices: json.result.advices,
        });
      } else if (method === "astrology") {
        saveHistory({
          ...base,
          astrology: json.result.astrology,
          summary: json.result.summary,
          advices: json.result.advices,
        });
      } else {
        saveHistory({
          ...base,
          palm:
            json.result.palm || {
              leftImageId: payload.reading.images.leftId,
              rightImageId: payload.reading.images.rightId,
              sections: json.result.sections,
            },
          summary: json.result.summary,
          advices: json.result.advices,
        });
      }

      setMsg("บันทึกผลการดูเรียบร้อย");
    } catch (e) {
      console.error(e);
      setMsg("ส่งให้ซีไม่สำเร็จ");
    }
  }

  return (
    <>
      <Shell title="เริ่มการดูดวง" subtitle="เลือกวิธี แล้วกรอก/อัปโหลดตามประเภท">
        {/* เลือกลูกดวง + วิธี */}
        <Section title="เลือกลูกดวง & วิธีการดู">
          <div className="grid sm:grid-cols-2 gap-3">
            <SearchableSelect
              label="ลูกดวง (ค้นหาได้)"
              items={clients}
              getLabel={(c) =>
                c ? `${c.name}${c.nickname ? ` (${c.nickname})` : ""}` : ""
              }
              value={selected}
              onChange={setSelected}
            />
            <div className="grid sm:grid-cols-3 gap-3">
              <button
                className={`px-3 py-2 rounded-xl border ${
                  method === "tarot" ? "bg-sky-50 border-sky-200" : ""
                }`}
                onClick={() => setMethod("tarot")}
              >
                ไพ่ยิปซี
              </button>
              <button
                className={`px-3 py-2 rounded-xl border ${
                  method === "astrology" ? "bg-sky-50 border-sky-200" : ""
                }`}
                onClick={() => setMethod("astrology")}
              >
                ดูพื้นดวง
              </button>
              <button
                className={`px-3 py-2 rounded-xl border ${
                  method === "palm" ? "bg-sky-50 border-sky-200" : ""
                }`}
                onClick={() => setMethod("palm")}
              >
                ดูลายมือ
              </button>
            </div>
          </div>
        </Section>

        {/* -------- TAROT -------- */}
        {method === "tarot" && (
          <>
            <Section title="ประเภทไพ่ยิปซี">
              <div className="grid sm:grid-cols-2 gap-3">
                <select
                  className="px-3 py-2 rounded-xl border bg-white"
                  value={tarotType}
                  onChange={(e) => {
                    setTarotType(e.target.value);
                    setCards([]);
                  }}
                >
                  <option value="ask-3">ถามเรื่องต่าง ๆ (3 ใบ)</option>
                  <option value="weigh-1v1">ชั่งน้ำหนักตัดสินใจ (1 ใบ/ตัวเลือก)</option>
                  <option value="celtic-10">คลาสสิค Celtic Cross (10 ใบ)</option>
                </select>
              </div>
            </Section>

            <Section title="เลือกหัวข้อที่อยากดู (ติ๊กได้หลายข้อ)">
              <div className="grid sm:grid-cols-3 gap-2">
                {TOPIC_OPTIONS.map((opt) => {
                  const checked = topics.includes(opt);
                  return (
                    <label
                      key={opt}
                      className="text-sm inline-flex items-center gap-2 px-3 py-2 rounded-xl border bg-white hover:bg-sky-50"
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4"
                        checked={checked}
                        onChange={(e) => {
                          setTopics((prev) =>
                            e.target.checked
                              ? [...prev, opt]
                              : prev.filter((x) => x !== opt)
                          );
                        }}
                      />
                      <span>{opt}</span>
                    </label>
                  );
                })}
              </div>

              <TextArea
                label="รายละเอียดคำถาม (ถ้ามีหัวข้ออื่น ๆ หรืออยากเจาะจง)"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="พิมพ์รายละเอียดเพิ่มเติม เช่น เปรียบเทียบงาน A/B หรือบริบทคำถาม"
              />
            </Section>

            <Section title="ไพ่ที่สุ่มได้ (พรีวิว)">
              <div className="flex flex-wrap gap-2">
                {cards.map((c, i) => (
                  <Badge key={i}>
                    {c.name}
                    {c.reversed ? " (กลับหัว)" : ""}
                  </Badge>
                ))}
                {!cards.length && (
                  <div className="text-slate-500 text-sm">ยังไม่สุ่มไพ่</div>
                )}
              </div>

              <div className="mt-3 flex gap-2">
                <Button variant="ghost" onClick={previewTarot}>
                  สุ่มไพ่ใหม่
                </Button>
                <Button
                  onClick={start}
                  disabled={!selected || !canSendTarot}
                >
                  ส่งให้ซีวิเคราะห์ & บันทึก
                </Button>
              </div>
            </Section>
          </>
        )}

        {/* -------- ASTROLOGY -------- */}
        {method === "astrology" && (
          <Section title="เลือกระบบโหราศาสตร์">
            <div className="flex gap-2">
              <button
                className={`px-3 py-2 rounded-xl border ${
                  astroSystem === "thai" ? "bg-sky-50 border-sky-200" : ""
                }`}
                onClick={() => setAstroSystem("thai")}
              >
                ไทย
              </button>
              <button
                className={`px-3 py-2 rounded-xl border ${
                  astroSystem === "western" ? "bg-sky-50 border-sky-200" : ""
                }`}
                onClick={() => setAstroSystem("western")}
              >
                ตะวันตก
              </button>
            </div>
            <div className="mt-3">
              <Button onClick={start} disabled={!selected}>
                ให้ซีสรุปพื้นดวง & บันทึก
              </Button>
            </div>
          </Section>
        )}

        {/* -------- PALM -------- */}
        {method === "palm" && (
          <Section title="อัปโหลดรูปมือ">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm grid gap-1">
                <span className="text-slate-700">มือซ้าย (จำเป็น)</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setLeftFile(e.target.files?.[0] || null)}
                />
              </label>
              <label className="text-sm grid gap-1">
                <span className="text-slate-700">มือขวา (จำเป็น)</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setRightFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>
            <div className="mt-3">
              <Button
                onClick={start}
                disabled={!selected || !leftFile || !rightFile}
              >
                ส่งรูปให้ซีวิเคราะห์ & บันทึก
              </Button>
            </div>
          </Section>
        )}
      </Shell>
      <Toast />
    </>
  );
}

function fileToBlob(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Blob([r.result]));
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}
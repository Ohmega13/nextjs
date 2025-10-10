"use client";
import React, { useMemo, useState } from "react";

/**
 * TarotUI.tsx – คอมโพเนนต์ฟอร์มหลักสำหรับหน้า Tarot
 * รองรับ 3 โหมด:
 *  1) threeCards      – ถามเรื่องเดียวแบบ 3 ใบ
 *  2) weighOptions    – เปรียบเทียบ/ชั่งน้ำหนักตัวเลือก (1 ใบ/ตัวเลือก สูงสุด 3 ตัวเลือก)
 *  3) classic10       – แบบคลาสสิก 10 ใบ (ไม่มีช่องคำถาม แต่แสดงตำแหน่งทั้ง 10)
 *
 * การใช้งาน: <TarotUI onSubmit={(payload)=>{...}} />
 * payload ที่ส่งออก:
 *  - mode: 'threeCards' | 'weighOptions' | 'classic10'
 *  - question?: string
 *  - options?: string[]
 */

export type TarotMode = "threeCards" | "weighOptions" | "classic10";

export type TarotPayload = {
  mode: TarotMode;
  question?: string;
  options?: string[]; // สำหรับ weighOptions เท่านั้น
};

export function TarotUI({
  defaultMode = "threeCards",
  onSubmit,
  isSubmitting = false,
}: {
  defaultMode?: TarotMode;
  onSubmit: (payload: TarotPayload) => void | Promise<void>;
  isSubmitting?: boolean;
}) {
  const [mode, setMode] = useState<TarotMode>(defaultMode);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", "", ""]);

  const classic10Slots = useMemo(
    () => [
      { no: 1, th: "สถานการณ์ปัจจุบัน", en: "Present" },
      { no: 2, th: "อุปสรรค/สิ่งท้าทาย", en: "Challenge" },
      { no: 3, th: "รากฐาน", en: "Foundation" },
      { no: 4, th: "อดีต", en: "Past" },
      { no: 5, th: "ความหวัง/เป้าหมาย", en: "Goal" },
      { no: 6, th: "อนาคตอันใกล้", en: "Near Future" },
      { no: 7, th: "ตัวตน", en: "Self" },
      { no: 8, th: "สิ่งแวดล้อม", en: "External Influences" },
      { no: 9, th: "ความหวังและความกลัว", en: "Hopes and Fears" },
      { no: 10, th: "ผลลัพธ์", en: "Outcome" },
    ],
    []
  );

  function updateOption(idx: number, value: string) {
    setOptions((prev) => prev.map((v, i) => (i === idx ? value : v)));
  }

  function buildPayload(): TarotPayload {
    if (mode === "threeCards") return { mode, question: question.trim() };
    if (mode === "weighOptions")
      return { mode, options: options.map((o) => o.trim()).filter(Boolean) };
    return { mode }; // classic10
  }

  function canSubmit(): boolean {
    if (mode === "threeCards") return question.trim().length > 0;
    if (mode === "weighOptions")
      return options.map((o) => o.trim()).filter(Boolean).length >= 2; // อย่างน้อย 2 ตัวเลือก
    return true; // classic10 ไม่มีเงื่อนไข
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit()) return;
    const payload = buildPayload();
    await onSubmit?.(payload);
  }

  return (
    <div className="w-full max-w-3xl mx-auto p-4">
      {/* เลือกโหมด */}
      <div className="mb-4">
        <label className="block mb-2 font-medium">เลือกโหมดดูดวง</label>
        <div className="inline-flex gap-2">
          <button
            type="button"
            className={`px-3 py-2 rounded-2xl border ${
              mode === "threeCards" ? "bg-indigo-600 text-white" : "bg-white"
            }`}
            onClick={() => setMode("threeCards")}
          >
            ถามเรื่องเดียว 3 ใบ
          </button>
          <button
            type="button"
            className={`px-3 py-2 rounded-2xl border ${
              mode === "weighOptions" ? "bg-indigo-600 text-white" : "bg-white"
            }`}
            onClick={() => setMode("weighOptions")}
          >
            เปรียบเทียบ/ชั่งน้ำหนัก (1 ใบ/ตัวเลือก)
          </button>
          <button
            type="button"
            className={`px-3 py-2 rounded-2xl border ${
              mode === "classic10" ? "bg-indigo-600 text-white" : "bg-white"
            }`}
            onClick={() => setMode("classic10")}
          >
            แบบคลาสสิก 10 ใบ
          </button>
        </div>
      </div>

      {/* ฟอร์ม */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {mode === "threeCards" && (
          <div>
            <label className="block mb-2 font-medium">พิมพ์คำถาม</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              placeholder="พิมพ์สิ่งที่อยากถาม..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <p className="text-sm text-gray-500 mt-2">
              ระบบจะเปิดไพ่ 3 ใบ และตีความตามคำถามนี้
            </p>
          </div>
        )}

        {mode === "weighOptions" && (
          <div>
            <label className="block mb-2 font-medium">
              ใส่ตัวเลือก 2–3 ทาง (1 ใบ/ตัวเลือก)
            </label>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {options.map((opt, idx) => (
                <input
                  key={idx}
                  className="rounded-xl border px-3 py-2"
                  placeholder={`ตัวเลือกที่ ${idx + 1}`}
                  value={opt}
                  onChange={(e) => updateOption(idx, e.target.value)}
                />
              ))}
            </div>
            <p className="text-sm text-gray-500 mt-2">
              อย่างน้อย 2 ตัวเลือก ระบบจะสุ่มเปิดไพ่ 1 ใบต่อ 1 ตัวเลือก แล้วสรุปว่า &quot;ควรเลือกอันไหน เพราะอะไร&quot;
            </p>
          </div>
        )}

        {mode === "classic10" && (
          <div className="rounded-2xl border p-4">
            <p className="font-medium mb-3">เปิดไพ่ 10 ใบแบบคลาสสิก</p>
            <ol className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {classic10Slots.map((s) => (
                <li key={s.no} className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full border text-sm">
                    {s.no}
                  </span>
                  <span>
                    {s.th} <span className="text-gray-500">({s.en})</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-sm text-gray-500 mt-3">
              โหมดนี้จะเปิดไพ่ตามตำแหน่งทั้ง 10 โดยไม่ต้องกรอกคำถาม
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit() || isSubmitting}
            className="px-4 py-2 rounded-2xl bg-indigo-600 text-white disabled:opacity-50"
          >
            {isSubmitting ? "กำลังดูดวง..." : "ดูดวง"}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * ตัวอย่างการใช้งานในหน้า app/tarot/page.tsx
 *
 * import { TarotUI, TarotPayload } from "@/components/TarotUI";
 *
 * export default function Page() {
 *   async function handleSubmit(payload: TarotPayload) {
 *     // TODO: call API ของโอห์ม เช่น /api/tarot
 *     // await fetch("/api/tarot", { method: "POST", body: JSON.stringify(payload) });
 *     console.log("Tarot payload =>", payload);
 *   }
 *   return <TarotUI onSubmit={handleSubmit} />;
 * }
 */



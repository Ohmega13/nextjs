"use client";

import React, { useMemo, useState } from "react";

type TarotMode = "threeCards" | "weighOptions" | "classic10";

type ApiResponse =
  | {
      ok: true;
      reading: {
        id: string;
        created_at?: string;
        type: string;
        mode?: TarotMode;
        topic?: string | null;
        title?: string | null;
        payload?: any;
        content?: string | null;
      };
      content?: string;
      analysis?: string;
      debug?: any;
    }
  | {
      ok: false;
      error: string;
      details?: any;
      hint?: any;
      debug?: any;
    };

const MODES: { value: TarotMode; label: string; needQuestion?: boolean; needOptions?: boolean }[] = [
  { value: "threeCards", label: "ดู 3 ใบ (1 คำถาม)", needQuestion: true },
  { value: "weighOptions", label: "ชั่งน้ำหนักตัวเลือก", needOptions: true },
  { value: "classic10", label: "Celtic Cross 10 ใบ" },
];

export default function TarotReadingPage() {
  const [mode, setMode] = useState<TarotMode>("threeCards");
  const [question, setQuestion] = useState("");
  const [optionsText, setOptionsText] = useState(""); // พิมพ์ตัวเลือกทีละบรรทัด
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [raw, setRaw] = useState<any>(null);

  const needsQuestion = useMemo(() => MODES.find((m) => m.value === mode)?.needQuestion, [mode]);
  const needsOptions = useMemo(() => MODES.find((m) => m.value === mode)?.needOptions, [mode]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult("");
    setError("");
    setRaw(null);

    const payload: any = { mode };
    if (needsQuestion) payload.question = question.trim();
    if (needsOptions) {
      const opts = optionsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      payload.options = opts;
    }

    try {
      const res = await fetch("/api/tarot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data: ApiResponse;
      try {
        data = (await res.json()) as ApiResponse;
      } catch {
        const t = await res.text();
        throw new Error(`Invalid JSON: ${t?.slice(0, 200)}`);
      }

      setRaw(data);
      if (!("ok" in data) || data.ok !== true) {
        const msg =
          (data as any)?.error ||
          `ขออภัย ระบบไม่สามารถทำรายการได้ (HTTP ${res.status})`;
        setError(msg);
        return;
      }

      const text =
        data.content?.trim() ||
        data.analysis?.trim() ||
        data.reading?.content?.trim() ||
        "";
      if (!text) {
        setError("ยังไม่ได้รับผลคำทำนายจากเซิร์ฟเวอร์");
      } else {
        setResult(text);
      }
    } catch (err: any) {
      setError(err?.message || "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">ดูดวงไพ่ยิปซี</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">โหมดการดู</label>
          <select
            className="w-full border rounded px-3 py-2"
            value={mode}
            onChange={(e) => setMode(e.target.value as TarotMode)}
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {needsQuestion && (
          <div>
            <label className="block text-sm font-medium mb-1">
              คำถาม (สำหรับโหมด 3 ใบ)
            </label>
            <input
              className="w-full border rounded px-3 py-2"
              placeholder="พิมพ์คำถามของคุณ"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>
        )}

        {needsOptions && (
          <div>
            <label className="block text-sm font-medium mb-1">
              ตัวเลือก (พิมพ์ทีละบรรทัด อย่างน้อย 2 บรรทัด)
            </label>
            <textarea
              className="w-full border rounded px-3 py-2 h-28"
              placeholder={"ตัวอย่าง:\nย้ายงานใหม่\nอยู่บริษัทเดิม"}
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        >
          {loading ? "กำลังประมวลผล..." : "ดูดวง"}
        </button>
      </form>

      <div className="mt-8 space-y-4">
        {error && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="rounded border p-4 whitespace-pre-wrap">
            {result}
          </div>
        )}

        {raw?.debug && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-gray-500">
              Debug (admin)
            </summary>
            <pre className="text-xs overflow-auto bg-gray-50 p-2 rounded border">
              {JSON.stringify(raw.debug, null, 2)}
            </pre>
          </details>
        )}
      </div>

      <p className="mt-10 text-xs text-gray-400">
        หมายเหตุ: ระบบจะสุ่มไพ่ฝั่งเซิร์ฟเวอร์ และบันทึกผลลงฐานข้อมูลโดยอัตโนมัติ
      </p>
    </div>
  );
}
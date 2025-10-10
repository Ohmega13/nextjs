// app/reading/page.tsx
import Link from "next/link";
import WhatsNewBar from "@/components/WhatsNewBar";

export default function ReadingHome() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">เลือกประเภทการดูดวง</h1>
        <p className="text-slate-500">เลือกแบบที่ต้องการ แล้วเริ่มดูดวงได้เลย</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Tarot */}
        <Link
          href="/reading/tarot"
          className="group rounded-2xl border bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md"
        >
          <div className="mb-2 text-lg font-semibold">ไพ่ยิปซี (Tarot)</div>
          <p className="text-sm text-slate-600">
            ตั้งคำถาม เลือกกระบวนท่า แล้วให้ไพ่เป็นคนบอกใบ้เส้นทาง
          </p>
          <div className="mt-4 inline-flex items-center gap-2 text-indigo-600">
            ไปหน้า Tarot →
          </div>
        </Link>

        {/* Natal */}
        <Link
          href="/reading/natal"
          className="group rounded-2xl border bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md"
        >
          <div className="mb-2 text-lg font-semibold">ดวงกำเนิด (Natal)</div>
          <p className="text-sm text-slate-600">
            วิเคราะห์พื้นดวงจาก วัน/เวลา/สถานที่เกิด
          </p>
          <div className="mt-4 inline-flex items-center gap-2 text-indigo-600">
            ไปหน้า Natal →
          </div>
        </Link>

        {/* Palm */}
        <Link
          href="/reading/palm"
          className="group rounded-2xl border bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md"
        >
          <div className="mb-2 text-lg font-semibold">ลายมือ (Palm)</div>
          <p className="text-sm text-slate-600">
            อัปโหลดรูปลายมือซ้าย/ขวา เพื่อดูแนวโน้มชีวิต
          </p>
          <div className="mt-4 inline-flex items-center gap-2 text-indigo-600">
            ไปหน้า Palm →
          </div>
        </Link>
      </div>

      <WhatsNewBar /> {/* เพิ่มส่วนแสดง What's new */}
    </div>
  );
}
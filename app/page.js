import Link from "next/link";

function Card({ href, icon, title, subtitle }) {
  return (
    <Link href={href} className="block rounded-2xl border bg-white hover:shadow-md transition">
      <div className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-sky-100 text-sky-700 grid place-items-center text-xl">
          {icon}
        </div>
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-xs text-slate-500">{subtitle}</div>
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Destiny Decode Tarot</h1>
        <p className="text-sm text-slate-600">เวิร์กโฟลว์ดูดวงฉับไวในเว็บเดียว</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card href="/clients" icon="👤" title="ลงทะเบียนลูกดวง" subtitle="เก็บข้อมูลพื้นฐาน" />
        <Card href="/reading" icon="🔮" title="เริ่มดูดวง" subtitle="สุ่มไพ่ + ให้ซีสรุปอัตโนมัติ" />
        <Card href="/history" icon="🗂️" title="ประวัติ" subtitle="ดูย้อนหลังรายคน/เวลา" />
      </div>
    </div>
  );
}
// app/page.js
import Link from 'next/link';

export default function Home() {
  const menus = [
    { href: "/clients", title: "ลงทะเบียนลูกดวง", desc: "บันทึกข้อมูลลูกดวงใหม่", emoji: "📝" },
    { href: "/reading", title: "เริ่มดูดวง", desc: "เลือกศาสตร์/หัวข้อแล้วเริ่มอ่านทันที", emoji: "🔮" },
    { href: "/history", title: "ประวัติการดูดวง", desc: "ค้นหาประวัติย้อนหลังแบบละเอียด", emoji: "📜" },
    { href: "/clients-manage", title: "ประวัติลูกดวง", desc: "ดู/แก้ไข/ลบข้อมูลลูกดวง", emoji: "👤" },
    { href: "/backup", title: "สำรอง/กู้คืนข้อมูล", desc: "ส่งออก & นำเข้าข้อมูลทั้งหมด", emoji: "💾" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      {/* Navbar */}
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <Link href="/" className="font-semibold text-lg tracking-wide">
            Destiny Decode <span className="text-indigo-600">Tarot</span>
          </Link>
          <nav className="hidden md:flex gap-6 text-sm">
            <Link href="/clients" className="hover:text-indigo-600">ลงทะเบียนลูกดวง</Link>
            <Link href="/reading" className="hover:text-indigo-600">เริ่มดูดวง</Link>
            <Link href="/history" className="hover:text-indigo-600">ประวัติ</Link>
            <Link href="/clients-manage" className="hover:text-indigo-600">ประวัติลูกดวง</Link>
            <Link href="/backup" className="hover:text-indigo-600">Backup</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 md:p-12 shadow-sm">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            ศูนย์ควบคุมการดูดวง <span className="text-indigo-600">ครบวงจร</span>
          </h1>
          <p className="mt-3 text-slate-600">
            ลงทะเบียนลูกดวง • เริ่มดูดวง • บันทึกประวัติ • สำรองข้อมูล — ทั้งหมดในที่เดียว
          </p>
          <div className="mt-6 flex gap-3">
            <Link
              href="/reading"
              className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2.5 text-white font-medium hover:bg-indigo-700"
            >
              เริ่มดูดวงเลย
            </Link>
            <Link
              href="/clients"
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-700 font-medium hover:bg-slate-50"
            >
              เพิ่มลูกดวงใหม่
            </Link>
          </div>
        </div>
      </section>

      {/* Menu cards */}
      <section className="mx-auto max-w-6xl px-4 pb-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {menus.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="text-3xl">{m.emoji}</div>
            <h3 className="mt-3 font-semibold text-slate-900 group-hover:text-indigo-600">
              {m.title}
            </h3>
            <p className="mt-1 text-sm text-slate-600">{m.desc}</p>
            <div className="mt-4 text-sm font-medium text-indigo-600">
              ไปที่หน้า {m.title} →
            </div>
          </Link>
        ))}
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between text-sm text-slate-500">
          <span>© 2025 Destiny Decode Tarot</span>
          <span>ข้อมูลเก็บในอุปกรณ์ของคุณ</span>
        </div>
      </footer>
    </div>
  );
}
// app/layout.js
import "./globals.css";
import Link from "next/link";
import { Noto_Sans_Thai } from "next/font/google";

const noto = Noto_Sans_Thai({
  subsets: ["thai"],
  weight: ["400", "500", "700"],
});

export const metadata = {
  title: "Destiny Decode Tarot",
  description: "ศูนย์ควบคุมการดูดวง ไพ่ยิปซี พื้นดวง ลายมือ และประวัติ",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body className={`${noto.className} min-h-screen bg-white text-slate-800`}>
        {/* Topbar */}
        <header className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white grid place-items-center font-semibold">
                DD
              </div>
              <div className="font-semibold">
                Destiny Decode <span className="text-indigo-600">Tarot</span>
              </div>
            </Link>

            {/* Simple static nav (ยังไม่ผูกสถานะล็อกอินใน layout ฝั่ง server) */}
            <nav className="flex items-center gap-1 text-sm">
              <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/clients">
                ลงทะเบียนลูกดวง
              </Link>
              <span className="text-slate-300 px-1">|</span>
              <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/reading">
                เริ่มดูดวง
              </Link>
              <span className="text-slate-300 px-1">|</span>
              <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/history">
                ประวัติ
              </Link>
              <span className="text-slate-300 px-1">|</span>
              <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/clients-manage">
                ประวัติลูกดวง
              </Link>
              <span className="text-slate-300 px-1">|</span>
              <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/backup">
                Backup
              </Link>
              <span className="text-slate-300 px-1">|</span>
              {/* Auth links */}
              <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/login">
                เข้าสู่ระบบ
              </Link>
              <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/signup">
                สมัครสมาชิก
              </Link>
            </nav>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>

        {/* Footer */}
        <footer className="border-t bg-indigo-50/60">
          <div className="max-w-6xl mx-auto px-4 py-6 text-xs text-slate-600 flex justify-between">
            <div>© {new Date().getFullYear()} Destiny Decode Tarot</div>
            <div>ข้อมูลเก็บในอุปกรณ์ของคุณ</div>
          </div>
        </footer>
      </body>
    </html>
  );
}
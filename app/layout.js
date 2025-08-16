// app/layout.js
import "./globals.css";
import { Noto_Sans_Thai } from "next/font/google";
import TopNav from "@/components/TopNav";

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
            {/* logo */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white grid place-items-center font-semibold">
                DD
              </div>
              <div className="font-semibold">
                Destiny Decode <span className="text-indigo-600">Tarot</span>
              </div>
            </div>

            {/* navigation */}
            <TopNav />
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
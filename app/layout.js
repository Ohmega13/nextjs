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
        {/* Navbar แบบไดนามิก: แสดงชื่อผู้ใช้+Logout เมื่อ login แล้ว */}
        <TopNav />

        {/* Main content */}
        <main className="max-w-6xl mx-auto px-4 py-8">
          {children}
        </main>

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
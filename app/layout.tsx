// app/layout.tsx
import "./globals.css";
import { Noto_Sans_Thai } from "next/font/google";
import TopNav from "./components/TopNav";
import type { Metadata } from "next";

const noto = Noto_Sans_Thai({
  subsets: ["thai"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Destiny Decode Tarot",
  description: "ศูนย์ควบคุมการดูดวง ไพ่ยิปซี พื้นดวง ลายมือ และประวัติ",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className={`${noto.className} min-h-screen bg-white text-slate-800`}>
        {/* Topbar */}
        <header className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
            <div className="w-full sm:w-auto">
              <TopNav />
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-6xl mx-auto px-4 py-4 sm:py-8">{children}</main>

        {/* Footer */}
        <footer className="border-t bg-indigo-50/60">
          <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6 text-xs text-slate-600 flex justify-between">
            <div>© {new Date().getFullYear()} Destiny Decode Tarot</div>
            <div>ข้อมูลถูกจัดเก็บอย่างปลอดภัยด้วย Supabase</div>
          </div>
        </footer>
      </body>
    </html>
  );
}
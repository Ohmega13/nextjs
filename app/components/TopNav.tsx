"use client";

import Link from "next/link";
import { useSupabase } from "@/app/supabase-provider";

export default function TopNav() {
  const { session, supabase } = useSupabase();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/"; // redirect หน้าแรก
  };

  return (
    <nav className="flex items-center gap-1 text-sm">
      {/* main menu */}
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

      {/* auth menu */}
      {session ? (
        <>
          <span className="px-3 py-2">สวัสดี, {session.user.email}</span>
          <button
            onClick={handleLogout}
            className="px-3 py-2 rounded-xl hover:bg-indigo-50"
          >
            Logout
          </button>
        </>
      ) : (
        <>
          <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/login">
            เข้าสู่ระบบ
          </Link>
          <Link className="px-3 py-2 rounded-xl hover:bg-indigo-50" href="/signup">
            สมัครสมาชิก
          </Link>
        </>
      )}
    </nav>
  );
}
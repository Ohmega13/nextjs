"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams?.get("returnTo") || "/reading";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setErr(error.message || "เข้าสู่ระบบไม่สำเร็จ");
      return;
    }

    setMsg("เข้าสู่ระบบสำเร็จ กำลังพาไปหน้าแรก…");

    // พาไปหน้า /reading
    router.replace(returnTo);

    // กันไม่ไปจริง — บังคับ reload
    setTimeout(() => {
      if (typeof window !== "undefined" && window.location.pathname === "/login") {
        window.location.href = returnTo;
      }
    }, 500);
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-100">
      <div className="w-full max-w-md rounded bg-white p-8 shadow">
        <h1 className="mb-6 text-center text-2xl font-bold">เข้าสู่ระบบ</h1>

        <form onSubmit={signIn} className="space-y-4">
          <input
            type="email"
            placeholder="อีเมล"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border px-3 py-2"
            required
          />
          <input
            type="password"
            placeholder="รหัสผ่าน"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border px-3 py-2"
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-blue-600 py-2 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>

        {err && <p className="mt-4 text-center text-red-500">{err}</p>}
        {msg && <p className="mt-4 text-center text-green-600">{msg}</p>}

        <div className="mt-6 text-center">
          <a href="/signup" className="text-blue-600 hover:underline">
            สมัครสมาชิก
          </a>
        </div>
      </div>
    </div>
  );
}
// app/admin/prompts/page.tsx (Server Component)
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

async function getSupabase() {
  const c = cookies(); const h = headers();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => c.get(n)?.value,
        set(n, v, o) { c.set({ name: n, value: v, ...o }); },
        remove(n, o) { c.set({ name: n, value: "", ...o, maxAge: 0 }); },
      },
      headers: { "x-forwarded-host": h.get("x-forwarded-host") ?? "" },
    }
  );
}

export default async function AdminPromptsPage() {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/"); // ไม่ล็อกอินออกไปก่อน

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") redirect("/"); // กัน non-admin

  // ... UI จัดการพรอมป์ของแอดมิน
  return <div>Admin Prompt Manager</div>;
}
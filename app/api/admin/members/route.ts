// app/api/admin/members/route.ts
import { NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js"; // ⬅️ เพิ่ม type User

// ... (โค้ดส่วนอื่นเหมือนเดิม)

export async function GET(req: Request) {
  try {
    const authz = req.headers.get("authorization") || undefined;
    const { supa } = await assertAdmin(authz);

    const { data: profiles, error } = await supa
      .from("profiles")
      .select("user_id, role, status, display_name, permissions")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const users: Record<string, string> = {};
    let page = 1;
    for (let i = 0; i < 2; i++) {
      const pageRes = await supa.auth.admin.listUsers({ page, perPage: 100 });

      // 👇 ใส่ type ให้ list ชัดเจน ป้องกัน u: never
      const list = (pageRes.data?.users ?? []) as unknown as User[];
      for (const u of list) {
        users[u.id] = u.email ?? "";
      }

      if (list.length < 100) break;
      page++;
    }

    const rows = profiles.map((p: any) => ({
      user_id: p.user_id,
      email: users[p.user_id] || "",
      role: p.role,
      status: p.status,
      display_name: p.display_name,
      permissions: p.permissions ?? {},
    }));

    return NextResponse.json({ rows });
  } catch (err: any) {
    const code =
      err?.message === "forbidden" ? 403 :
      err?.message === "invalid_token" || err?.message === "missing_token" ? 401 : 500;
    return NextResponse.json({ error: err?.message ?? "error" }, { status: code });
  }
}
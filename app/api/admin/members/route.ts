// app/api/admin/members/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// helper – ตรวจว่า requester เป็น admin จาก access token
async function assertAdmin(bearer?: string) {
  if (!bearer?.startsWith("Bearer ")) throw new Error("missing_token");
  const token = bearer.slice("Bearer ".length);

  const supa = createClient(url, serviceKey);
  const { data: userRes, error: e1 } = await supa.auth.getUser(token);
  if (e1 || !userRes.user) throw new Error("invalid_token");

  const userId = userRes.user.id;
  const { data: prof, error: e2 } = await supa
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (e2 || !prof || prof.role !== "admin") throw new Error("forbidden");
  return { supa, adminId: userId };
}

export async function GET(req: Request) {
  try {
    const authz = req.headers.get("authorization") || undefined;
    const { supa } = await assertAdmin(authz);

    // ดึง profiles ทั้งหมด
    const { data: profiles, error } = await supa
      .from("profiles")
      .select("user_id, role, status, display_name, permissions")
      .order("created_at", { ascending: false });
    if (error) throw error;

    // ดึงรายชื่อ users (email) ด้วย admin API
    // หมายเหตุ: listUsers เป็นแบบหน้า ๆ; สำหรับจำนวนไม่มากโอเค
    const users: Record<string, string> = {};
    let page = 1;
    // ดึง 1–2 หน้าแรกพอ (100 ผู้ใช้แรก); ปรับได้ตามจริง
    for (let i = 0; i < 2; i++) {
      const res = await supa.auth.admin.listUsers({ page, perPage: 100 });
      res.data.users.forEach((u) => (users[u.id] = u.email ?? ""));
      if (res.data.users.length < 100) break;
      page++;
    }

    const rows = profiles.map((p) => ({
      user_id: p.user_id,
      email: users[p.user_id] || "",
      role: p.role,
      status: p.status,
      display_name: p.display_name,
      permissions: (p as any).permissions ?? {},
    }));

    return NextResponse.json({ rows });
  } catch (err: any) {
    const code =
      err?.message === "forbidden" ? 403 :
      err?.message === "invalid_token" || err?.message === "missing_token" ? 401 : 500;
    return NextResponse.json({ error: err?.message ?? "error" }, { status: code });
  }
}
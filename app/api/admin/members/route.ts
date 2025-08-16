// app/api/admin/members/route.ts
import { NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";

// ---- Helper: สร้าง service client (ฝั่ง server เท่านั้น) ----
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, svc, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---- Helper: ตรวจสิทธิ์ admin จาก Bearer token ----
async function assertAdmin(authz?: string) {
  if (!authz || !authz.toLowerCase().startsWith("bearer "))
    throw new Error("missing_token");

  const token = authz.split(" ")[1];
  const supa = serviceClient();

  // ดึง user จาก access token
  const ures = await supa.auth.getUser(token);
  const uid = ures.data.user?.id;
  if (!uid) throw new Error("invalid_token");

  // เช็ก role = 'admin' ใน public.profiles
  const { data: prof, error } = await supa
    .from("profiles")
    .select("role")
    .eq("user_id", uid)
      // ถ้า schema คุณเก็บ role = 'admin' ตามที่เราตั้งไว้ จะผ่านได้
    .single();

  if (error || !prof || prof.role !== "admin") throw new Error("forbidden");

  return { supa, uid };
}

// ---- GET /api/admin/members ----
export async function GET(req: Request) {
  try {
    const authz = req.headers.get("authorization") || undefined;
    const { supa } = await assertAdmin(authz);

    // 1) ดึง profiles ทั้งหมด
    const { data: profiles, error } = await supa
      .from("profiles")
      .select("user_id, role, status, display_name, permissions, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // 2) map user_id -> email โดยเรียก auth.admin.listUsers
    const users: Record<string, string> = {};
    let page = 1;
    // ส่วนใหญ่พอแค่ 1–2 หน้า; ปรับได้ตามขนาดฐาน
    for (let i = 0; i < 2; i++) {
      const pageRes = await supa.auth.admin.listUsers({ page, perPage: 100 });
      const list = (pageRes.data?.users ?? []) as unknown as User[];
      for (const u of list) {
        users[u.id] = u.email ?? "";
      }
      if (list.length < 100) break;
      page++;
    }

    // 3) รวมข้อมูล
    const rows = (profiles ?? []).map((p: any) => ({
      user_id: p.user_id,
      email: users[p.user_id] || "",
      role: p.role,
      status: p.status,
      display_name: p.display_name,
      permissions: p.permissions ?? {},
      created_at: p.created_at,
    }));

    return NextResponse.json({ rows });
  } catch (err: any) {
    const msg = String(err?.message || err);
    const code =
      msg === "missing_token" || msg === "invalid_token" ? 401 :
      msg === "forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}
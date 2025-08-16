// app/api/admin/members/permissions/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
  return supa;
}

export async function POST(req: Request) {
  try {
    const authz = req.headers.get("authorization") || undefined;
    const supa = await assertAdmin(authz);

    const body = await req.json();
    const { user_id, key, value } = body as {
      user_id: string;
      key: "tarot" | "natal" | "palm";
      value: boolean;
    };
    if (!user_id || !key) throw new Error("bad_request");

    // อัปเดต jsonb: permissions = permissions || {key: value}
    const { error } = await supa.rpc("update_permission", {
      uid: user_id,
      perm_key: key,
      perm_value: value,
    });
    // ถ้าไม่มีฟังก์ชัน ให้ fallback เป็น update ตรง
    if (error) {
      await supa
        .from("profiles")
        .update({
          permissions: {
            [key]: value,
          } as any,
        })
        .eq("user_id", user_id);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const code =
      err?.message === "forbidden" ? 403 :
      err?.message === "invalid_token" || err?.message === "missing_token" ? 401 :
      err?.message === "bad_request" ? 400 : 500;
    return NextResponse.json({ error: err?.message ?? "error" }, { status: code });
  }
}
// app/lib/supabaseServer.ts
import { createServerClient } from '@supabase/ssr';
import { cookies as nextCookies } from 'next/headers';

/**
 * บาง runtime ของ Next 15 พิมพ์ `cookies()` เป็น Promise
 * เราห่อไว้ด้วย helper แล้ว cast ให้เรียก sync ได้
 */
function getCookieStore(): any {
  const store = (nextCookies as unknown as () => any)();
  return store;
}

export function createSupabaseServerClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return getCookieStore().get(name)?.value;
        },
        // ไม่ต้องพิมพ์ CookieOptions — เราไม่ได้ใช้
        set(name: string, value: string, _options?: any) {
          try {
            getCookieStore().set(name, value);
          } catch {
            // no-op (กรณี cookie store เป็น immutable)
          }
        },
        remove(name: string, _options?: any) {
          try {
            getCookieStore().delete(name);
          } catch {
            // no-op
          }
        },
      },
    }
  );
}

export default createSupabaseServerClient;
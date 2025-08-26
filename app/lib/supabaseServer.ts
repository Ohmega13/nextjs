// app/lib/supabaseServer.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createSupabaseServerClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          // เรียก cookies() ตรง ๆ ทุกครั้ง
          return cookies().get(name)?.value;
        },
        set(name: string, value: string, _options: CookieOptions) {
          // ไม่ส่ง options เข้า next/headers เพื่อเลี่ยงชน type
          try {
            cookies().set(name, value);
          } catch {
            // no-op
          }
        },
        remove(name: string, _options: CookieOptions) {
          try {
            cookies().delete(name);
          } catch {
            // no-op
          }
        },
      },
    }
  );
}

export default createSupabaseServerClient;
// app/lib/supabaseServer.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies as nextCookies } from 'next/headers';

/**
 * In Next.js 15, `cookies()` can be typed as returning either
 * `ReadonlyRequestCookies` (Node runtime) or `Promise<ReadonlyRequestCookies>` (Edge).
 * Supabase's SSR cookie adapter expects sync methods, so we cast to `any`
 * and call it synchronously. At runtime on Node this is fine; on Edge you
 * should prefer Node runtime for routes that use this client.
 */
function getCookieStore(): any {
  // Cast to any to avoid TS complaining about Promise-returning overload
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
          const store = getCookieStore();
          return store.get(name)?.value;
        },
        set(name: string, value: string, _options: CookieOptions) {
          try {
            const store = getCookieStore();
            // Do not forward CookieOptions to Next's cookies API to avoid type mismatch
            store.set(name, value);
          } catch {
            // no-op on immutable cookie store (Edge / static)
          }
        },
        remove(name: string, _options: CookieOptions) {
          try {
            const store = getCookieStore();
            store.delete(name);
          } catch {
            // no-op on immutable cookie store (Edge / static)
          }
        },
      },
    }
  );
}

export default createSupabaseServerClient;
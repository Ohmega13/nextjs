// app/lib/supabaseServer.ts
import { createServerClient as createSSRClient, type CookieOptions } from '@supabase/ssr';
import { cookies as nextCookies } from 'next/headers';

/**
 * In Next.js 15, `cookies()` may be typed as Promise on Edge runtime.
 * We cast to `any` and call it synchronously. Prefer Node runtime for
 * routes using this client.
 */
function getCookieStore(): any {
  return (nextCookies as unknown as () => any)();
}

export function createSupabaseServerClient() {
  return createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return getCookieStore().get(name)?.value;
        },
        set(name: string, value: string, _options: CookieOptions) {
          try {
            getCookieStore().set(name, value);
          } catch {
            // ignore on immutable cookie store (Edge/static)
          }
        },
        remove(name: string, _options: CookieOptions) {
          try {
            getCookieStore().delete(name);
          } catch {
            // ignore on immutable cookie store (Edge/static)
          }
        },
      },
    }
  );
}

export default createSupabaseServerClient;
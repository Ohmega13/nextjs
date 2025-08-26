// app/lib/supabaseServer.ts
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export function supabaseServer() {
  const cookieStore = cookies();

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // Next.js cookies() on server is immutable per request; swallow set/remove
          // Ifคุณอยากให้ refresh token ทำงาน across requests ให้ทำใน middleware แยก
        },
        remove(name: string, options: CookieOptions) {
          // no-op (อธิบายเหมือนด้านบน)
        },
      },
    }
  );

  return client;
}
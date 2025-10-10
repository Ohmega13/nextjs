'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type WhatsNew = {
  content: string;
  is_active?: boolean;
  updated_at?: string;
};

export default function WhatsNewBar() {
  const [data, setData] = useState<WhatsNew | null>(null);

  useEffect(() => {
    (async () => {
      // อ่านจาก site_settings.key = 'announcement'
      const { data, error } = await supabase
        .from('site_settings')
        .select('value, updated_at')
        .eq('key', 'announcement')
        .maybeSingle();

      if (!error) {
        const v = (data?.value as any) || {};
        if (v?.content && (v?.is_active ?? true)) {
          setData({ content: v.content, is_active: v.is_active, updated_at: data?.updated_at });
        }
      }
    })();
  }, []);

  if (!data?.content) return null;

  return (
    <div className="mt-8">
      <div className="mx-auto w-full rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 text-indigo-900">
        <div className="flex items-start gap-3">
          <div className="mt-1 text-indigo-700">🆕</div>
          <div className="min-w-0 flex-1">
            <div className="font-medium">What’s new</div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed">
              {data.content}
            </div>
            {data.updated_at && (
              <div className="mt-1 text-xs text-indigo-700/70">
                อัปเดตล่าสุด: {new Date(data.updated_at).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
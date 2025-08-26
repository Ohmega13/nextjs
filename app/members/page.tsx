// app/members/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// **อย่าใส่ 'use client' ในไฟล์นี้**
import MembersClient from './MembersClient';

export default function MembersPage() {
  return (
    <div className="container mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold mb-4 text-center sm:text-left">
        จัดการสมาชิก
      </h1>
      <MembersClient />
    </div>
  );
}
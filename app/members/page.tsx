// app/members/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// **อย่าใส่ 'use client' ในไฟล์นี้**
import MembersClient from './MembersClient';

export default function MembersPage() {
  return <MembersClient />;
}
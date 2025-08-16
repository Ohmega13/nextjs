// app/members/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import MembersClient from './MembersClient';

export default function MembersPage() {
  return <MembersClient />;
}
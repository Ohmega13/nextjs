// app/members/page.tsx  (SERVER)
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import MembersClient from './MembersClient';

export default function MembersPage() {
  return <MembersClient />;
}
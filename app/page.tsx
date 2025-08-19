// app/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import ClientDashboard from './components/ClientDashboard';

export default function Home() {
  return <ClientDashboard />;
}
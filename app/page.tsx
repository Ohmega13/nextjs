// app/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import ClientDashboard from './components/ClientDashboard';

export default function Home() {
  return (
    <div className="flex flex-col w-full max-w-7xl mx-auto px-2 sm:px-4 md:px-6 lg:px-8">
      <ClientDashboard />
    </div>
  );
}
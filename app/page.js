// app/page.tsx
import { redirect } from 'next/navigation';

export default function Home() {
  // เปิดเว็บที่ "/" จะถูกพาไปหน้า /login เสมอ
  redirect('/login');
}
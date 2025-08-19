'use client';
import PermissionGate from '../../components/PermissionGate';

export default function PalmPage() {
  return (
    <PermissionGate requirePerms={['palm']}>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">ลายมือ (Palm)</h1>
        <p className="text-slate-600">หน้านี้สำหรับดูดวงด้วยลายมือ กำลังพัฒนา ✋✨</p>
      </div>
    </PermissionGate>
  );
}
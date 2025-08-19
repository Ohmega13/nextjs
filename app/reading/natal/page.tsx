'use client';
import PermissionGate from '../../components/PermissionGate';

export default function NatalPage() {
  return (
    <PermissionGate requirePerms={['natal']}>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">พื้นดวง (Natal)</h1>
        <p className="text-slate-600">อยู่ระหว่างการปรับปรุงฟีเจอร์ ✨</p>
      </div>
    </PermissionGate>
  );
}
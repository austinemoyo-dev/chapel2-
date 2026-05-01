import RoleLoginForm from '@/components/auth/RoleLoginForm';
import { ROLES } from '@/lib/utils/constants';

export default function AdminLoginPage() {
  return (
    <RoleLoginForm
      title="Admin Login"
      subtitle="Chapel Attendance Management"
      emailPlaceholder="admin@chapel.edu"
      allowedRoles={[ROLES.SUPERADMIN, ROLES.ADMIN]}
      redirectTo="/admin/dashboard"
    />
  );
}

import RoleLoginForm from '@/components/auth/RoleLoginForm';
import { ROLES } from '@/lib/utils/constants';

export default function ProtocolAdminLoginPage() {
  return (
    <RoleLoginForm
      title="Protocol Admin Login"
      subtitle="Live attendance monitoring"
      emailPlaceholder="protocol.admin@chapel.edu"
      accent="accent"
      allowedRoles={[ROLES.PROTOCOL_ADMIN]}
      redirectTo="/monitor"
    />
  );
}

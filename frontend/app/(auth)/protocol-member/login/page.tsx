import RoleLoginForm from '@/components/auth/RoleLoginForm';
import { ROLES } from '@/lib/utils/constants';

export default function ProtocolMemberLoginPage() {
  return (
    <RoleLoginForm
      title="Protocol Member Login"
      subtitle="Attendance scanner access"
      emailPlaceholder="protocol.member@chapel.edu"
      accent="accent"
      allowedRoles={[ROLES.PROTOCOL_MEMBER]}
      redirectTo="/scan"
    />
  );
}

"""
Permission Classes — Role-based access control for all API endpoints.

Each permission class checks the authenticated user's role against
the required access level for the endpoint.
"""
from rest_framework.permissions import BasePermission


class IsSuperadmin(BasePermission):
    """
    Allows access only to users with the Superadmin role.
    Used for: user management, service configuration, geo-fence,
    registration window, student deletion, manual edits, backdating.
    """
    message = 'Superadmin access required.'

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == 'superadmin'
        )


class IsAdminOrAbove(BasePermission):
    """
    Allows access to Superadmin and Admin roles.
    Used for: viewing students, reports, services.
    """
    message = 'Admin or Superadmin access required.'

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in ('superadmin', 'admin')
        )


class IsProtocolAdmin(BasePermission):
    """
    Allows access to Protocol Admin role (and Superadmin).
    Used for: live attendance monitoring dashboard.
    """
    message = 'Protocol Admin or Superadmin access required.'

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in ('superadmin', 'protocol_admin')
        )


class IsProtocolMember(BasePermission):
    """
    Allows access only to Protocol Member role.
    Used for: attendance marking (sign-in/out), offline sync, embedding download.
    """
    message = 'Protocol Member access required.'

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == 'protocol_member'
        )


class IsProtocolMemberOrAbove(BasePermission):
    """
    Allows access to Protocol Members, Admins, and Superadmin.
    Used for endpoints accessible by multiple roles.
    """
    message = 'Authenticated staff access required.'

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in ('superadmin', 'admin', 'protocol_admin', 'protocol_member')
        )


class HasAdminPermission(BasePermission):
    """
    Checks if an Admin-role user has a specific granular permission.
    Superadmin always passes. Other roles fail.
    
    Usage:
        class MyView(APIView):
            permission_classes = [HasAdminPermission]
            required_permission = 'can_view_students'
    """
    message = 'You do not have the required permission for this action.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        # Superadmin always has all permissions
        if request.user.role == 'superadmin':
            return True

        # Check specific permission for Admin role
        if request.user.role == 'admin':
            perm_key = getattr(view, 'required_permission', None)
            if perm_key:
                return request.user.has_admin_permission(perm_key)
            return False

        return False

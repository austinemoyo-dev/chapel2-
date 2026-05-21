"""
Accounts URL Configuration — Auth and admin user management endpoints.
"""
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    LoginView,
    LogoutView,
    AdminUserListCreateView,
    AdminUserDetailView,
    DeviceBindView,
    VapidPublicKeyView,
    PushSubscribeView,
)

urlpatterns = [
    # Authentication
    path('login/', LoginView.as_view(), name='auth-login'),
    path('login/refresh/', TokenRefreshView.as_view(), name='auth-token-refresh'),
    path('logout/', LogoutView.as_view(), name='auth-logout'),

    # Admin user management (Superadmin only)
    path('users/', AdminUserListCreateView.as_view(), name='auth-users-list'),
    path('users/<uuid:id>/', AdminUserDetailView.as_view(), name='auth-users-detail'),

    # Device binding
    path('bind-device/', DeviceBindView.as_view(), name='auth-bind-device'),

    # Web Push
    path('push/vapid-key/', VapidPublicKeyView.as_view(), name='push-vapid-key'),
    path('push/subscribe/', PushSubscribeView.as_view(), name='push-subscribe'),
]

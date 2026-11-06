from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import *

router = DefaultRouter()
router.register(r'auth-api', AuthViewSet, basename='auth')
router.register(r'logout-api', LogoutViewSet, basename='logout')
router.register(r'users-api', UsersViewSet, basename='users')
router.register(r'profile-api', ProfileViewSet, basename='profile')
router.register(r'change-password-api', ChangePasswordViewSet, basename='change-password')

urlpatterns = [
    path('', include(router.urls)),
]

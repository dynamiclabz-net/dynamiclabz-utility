from django.urls import path, include
from django.views.generic import RedirectView
from rest_framework.routers import DefaultRouter
from .views import *

router = DefaultRouter()
router.include_root_view = False
router.register(r'app', AppViewSet, basename='fe-app')
router.register(r'login', LoginViewSet, basename='fe-login')
router.register(r'dashboard', DashboardViewSet, basename='fe-dashboard')
router.register(r'prospects', ProspectsViewSet, basename='fe-prospects')
router.register(r'prospect-detail', ProspectDetailViewSet, basename='fe-prospect-detail')
router.register(r'follow-ups', FollowUpsViewSet, basename='fe-follow-ups')
router.register(r'leads', LeadsViewSet, basename='fe-leads')
router.register(r'lead-detail', LeadDetailViewSet, basename='fe-lead-detail')
router.register(r'clients', ClientsViewSet, basename='fe-clients')
router.register(r'client-detail', ClientDetailViewSet, basename='fe-client-detail')
router.register(r'invoices', InvoicesViewSet, basename='fe-invoices')
router.register(r'tasks', TasksViewSet, basename='fe-tasks')
router.register(r'attendance', AttendanceViewSet, basename='fe-attendance')
router.register(r'targets', TargetsViewSet, basename='fe-targets')
router.register(r'team', TeamViewSet, basename='fe-team')
router.register(r'profile', ProfileViewSet, basename='fe-profile')

urlpatterns = [
    path('', RedirectView.as_view(pattern_name='fe-app-list', permanent=False)),
    path('', include(router.urls)),
]

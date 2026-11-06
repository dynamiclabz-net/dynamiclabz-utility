from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import *

router = DefaultRouter()
router.register(r'attendance-api', AttendanceViewSet, basename='attendance')
router.register(r'attendance-report-api', AttendanceReportViewSet, basename='attendance-report')

urlpatterns = [
    path('', include(router.urls)),
]

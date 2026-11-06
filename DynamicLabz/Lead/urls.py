from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import *

router = DefaultRouter()
router.register(r'lead-api', LeadViewSet, basename='lead')
router.register(r'meeting-api', MeetingViewSet, basename='meeting')
router.register(r'lead-document-api', LeadDocumentViewSet, basename='lead-document')

urlpatterns = [
    path('', include(router.urls)),
]

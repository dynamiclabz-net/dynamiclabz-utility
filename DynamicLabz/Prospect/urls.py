from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import *

router = DefaultRouter()
router.register(r'prospect-api', ProspectViewSet, basename='prospect')
router.register(r'call-log-api', CallLogViewSet, basename='call-log')
router.register(r'follow-up-api', FollowUpViewSet, basename='follow-up')

urlpatterns = [
    path('', include(router.urls)),
]

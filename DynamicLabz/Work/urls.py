from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import *

router = DefaultRouter()
router.register(r'project-api', ProjectViewSet, basename='project')
router.register(r'task-api', TaskViewSet, basename='task')

urlpatterns = [
    path('', include(router.urls)),
]

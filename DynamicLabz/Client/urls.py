from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import *

router = DefaultRouter()
router.register(r'client-api', ClientViewSet, basename='client')
router.register(r'invoice-api', InvoiceViewSet, basename='invoice')
router.register(r'client-document-api', ClientDocumentViewSet, basename='client-document')

urlpatterns = [
    path('', include(router.urls)),
]

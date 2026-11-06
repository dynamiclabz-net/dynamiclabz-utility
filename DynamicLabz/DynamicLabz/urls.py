from django.contrib import admin
from django.conf import settings
from django.urls import path, include
from django.conf.urls.static import static

admin.site.site_header = 'Dynamic Labz Administration'
admin.site.site_title = 'Dynamic Labz'
admin.site.index_title = 'Agency Utility'

urlpatterns = [
    path('admin/', admin.site.urls),

    path('', include('FrontEnd.urls')),
    path('user-api/', include('UserDetail.urls')),
    path('prospect-api/', include('Prospect.urls')),
    path('lead-api/', include('Lead.urls')),
    path('client-api/', include('Client.urls')),
    path('work-api/', include('Work.urls')),
    path('attendance-api/', include('Attendance.urls')),
    path('target-api/', include('Target.urls')),
    path('dashboard-api/', include('Dashboard.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

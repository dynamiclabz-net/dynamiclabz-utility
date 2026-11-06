from django.contrib import admin
from .models import *


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ('user', 'date', 'status', 'work_mode', 'check_in', 'check_out', 'hours')
    search_fields = ('user__first_name', 'user__last_name', 'user__email', 'timesheet')
    list_filter = ('status', 'work_mode', 'date', 'user')

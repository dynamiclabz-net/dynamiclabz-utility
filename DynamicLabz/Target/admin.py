from django.contrib import admin
from .models import *


@admin.register(Target)
class TargetAdmin(admin.ModelAdmin):
    list_display = ('user', 'metric', 'target_value', 'month', 'set_by')
    search_fields = ('user__first_name', 'user__last_name', 'user__email')
    list_filter = ('metric', 'month', 'user')

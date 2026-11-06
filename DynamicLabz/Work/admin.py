from django.contrib import admin
from .models import *


class TaskInline(admin.TabularInline):
    model = Task
    extra = 0


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('name', 'client', 'project_type', 'status', 'deadline', 'created_at')
    search_fields = ('name', 'client__company_name')
    list_filter = ('status', 'project_type', 'deadline')
    filter_horizontal = ('team',)
    inlines = [TaskInline]


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'project', 'assigned_to', 'priority', 'status', 'deadline')
    search_fields = ('title', 'project__name')
    list_filter = ('status', 'priority', 'deadline')

from django.contrib import admin
from .models import *


class MeetingInline(admin.TabularInline):
    model = Meeting
    extra = 0


class LeadDocumentInline(admin.TabularInline):
    model = LeadDocument
    extra = 0


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = ('title', 'prospect', 'status', 'expected_value', 'owner', 'created_at')
    search_fields = ('title', 'prospect__company_name')
    list_filter = ('status', 'owner', 'created_at')
    inlines = [MeetingInline, LeadDocumentInline]


@admin.register(Meeting)
class MeetingAdmin(admin.ModelAdmin):
    list_display = ('lead', 'scheduled_at', 'mode', 'conducted', 'created_by')
    list_filter = ('mode', 'conducted', 'scheduled_at')
    search_fields = ('lead__title', 'lead__prospect__company_name', 'minutes')


@admin.register(LeadDocument)
class LeadDocumentAdmin(admin.ModelAdmin):
    list_display = ('title', 'doc_type', 'lead', 'uploaded_by', 'created_at')
    list_filter = ('doc_type', 'created_at')
    search_fields = ('title', 'lead__title')

from django.contrib import admin
from .models import *


class CallLogInline(admin.TabularInline):
    model = CallLog
    extra = 0


class FollowUpInline(admin.TabularInline):
    model = FollowUp
    extra = 0
    fk_name = 'prospect'


@admin.register(Prospect)
class ProspectAdmin(admin.ModelAdmin):
    list_display = ('company_name', 'contact_person', 'contact_number', 'place', 'status', 'owner', 'created_at')
    search_fields = ('company_name', 'contact_person', 'contact_number', 'place')
    list_filter = ('status', 'source', 'owner', 'created_at')
    inlines = [CallLogInline, FollowUpInline]


@admin.register(CallLog)
class CallLogAdmin(admin.ModelAdmin):
    list_display = ('prospect', 'outcome', 'connected', 'called_by', 'called_at')
    search_fields = ('prospect__company_name', 'summary')
    list_filter = ('outcome', 'connected', 'called_at')


@admin.register(FollowUp)
class FollowUpAdmin(admin.ModelAdmin):
    list_display = ('prospect', 'follow_type', 'due_at', 'status', 'assigned_to')
    search_fields = ('prospect__company_name', 'notes')
    list_filter = ('status', 'follow_type', 'due_at')

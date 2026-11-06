from django.contrib import admin
from .models import *


class InvoiceInline(admin.TabularInline):
    model = Invoice
    extra = 0


class ClientDocumentInline(admin.TabularInline):
    model = ClientDocument
    extra = 0


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ('company_name', 'contact_person', 'contact_number', 'status', 'owner', 'onboarded_on')
    search_fields = ('company_name', 'contact_person', 'contact_number')
    list_filter = ('status', 'owner', 'onboarded_on')
    inlines = [InvoiceInline, ClientDocumentInline]


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ('invoice_number', 'client', 'amount', 'status', 'issue_date', 'due_date', 'paid_on')
    search_fields = ('invoice_number', 'client__company_name', 'title')
    list_filter = ('status', 'issue_date')


@admin.register(ClientDocument)
class ClientDocumentAdmin(admin.ModelAdmin):
    list_display = ('title', 'doc_type', 'client', 'uploaded_by', 'created_at')
    search_fields = ('title', 'client__company_name')
    list_filter = ('doc_type', 'created_at')

import os

from django.utils import timezone
from rest_framework import serializers
from .models import *


class ClientSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source='owner.full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    projects_count = serializers.SerializerMethodField()
    open_tasks_count = serializers.SerializerMethodField()
    next_deadline = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = '__all__'

    def get_projects_count(self, obj):
        return len(obj.projects.all())

    def get_open_tasks_count(self, obj):
        return sum(1 for project in obj.projects.all() for task in project.tasks.all() if task.status != 'done')

    def get_next_deadline(self, obj):
        deadlines = [p.deadline for p in obj.projects.all() if p.deadline and p.status != 'completed']
        return min(deadlines) if deadlines else None


class InvoiceSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.company_name', read_only=True)
    status_display = serializers.SerializerMethodField()
    display_status = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)

    class Meta:
        model = Invoice
        fields = '__all__'

    def get_display_status(self, obj):
        if obj.status == 'sent' and obj.due_date and obj.due_date < timezone.localdate():
            return 'overdue'
        return obj.status

    def get_status_display(self, obj):
        return 'Overdue' if self.get_display_status(obj) == 'overdue' else obj.get_status_display()

    def get_file_url(self, obj):
        return obj.file.url if obj.file else None


class ClientDocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.full_name', read_only=True)
    doc_type_display = serializers.CharField(source='get_doc_type_display', read_only=True)
    file_url = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()

    class Meta:
        model = ClientDocument
        fields = '__all__'

    def get_file_url(self, obj):
        return obj.file.url if obj.file else None

    def get_file_name(self, obj):
        return os.path.basename(obj.file.name) if obj.file else None

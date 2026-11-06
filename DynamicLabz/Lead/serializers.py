import os

from rest_framework import serializers
from .models import *


class MeetingSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)
    mode_display = serializers.CharField(source='get_mode_display', read_only=True)

    class Meta:
        model = Meeting
        fields = '__all__'


class LeadDocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.full_name', read_only=True)
    doc_type_display = serializers.CharField(source='get_doc_type_display', read_only=True)
    file_url = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()
    file_size = serializers.SerializerMethodField()

    class Meta:
        model = LeadDocument
        fields = '__all__'

    def get_file_url(self, obj):
        return obj.file.url if obj.file else None

    def get_file_name(self, obj):
        return os.path.basename(obj.file.name) if obj.file else None

    def get_file_size(self, obj):
        try:
            return obj.file.size
        except (OSError, ValueError):
            return None


class LeadSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source='owner.full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    company_name = serializers.CharField(source='prospect.company_name', read_only=True)
    place = serializers.CharField(source='prospect.place', read_only=True)
    website = serializers.CharField(source='prospect.website', read_only=True)
    contact_person = serializers.CharField(source='prospect.contact_person', read_only=True)
    contact_number = serializers.CharField(source='prospect.contact_number', read_only=True)
    email = serializers.CharField(source='prospect.email', read_only=True)
    client_id = serializers.SerializerMethodField()
    meetings_count = serializers.SerializerMethodField()
    documents_count = serializers.SerializerMethodField()
    last_meeting_at = serializers.SerializerMethodField()

    class Meta:
        model = Lead
        fields = '__all__'

    def get_client_id(self, obj):
        client = getattr(obj, 'client', None)
        return client.id if client else None

    def get_meetings_count(self, obj):
        return len(obj.meetings.all())

    def get_documents_count(self, obj):
        return len(obj.documents.all())

    def get_last_meeting_at(self, obj):
        meetings = list(obj.meetings.all())
        return meetings[0].scheduled_at if meetings else None

from rest_framework import serializers
from .models import *


class CallLogSerializer(serializers.ModelSerializer):
    called_by_name = serializers.CharField(source='called_by.full_name', read_only=True)
    outcome_display = serializers.CharField(source='get_outcome_display', read_only=True)
    company_name = serializers.CharField(source='prospect.company_name', read_only=True)

    class Meta:
        model = CallLog
        fields = '__all__'


class FollowUpSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.CharField(source='assigned_to.full_name', read_only=True)
    follow_type_display = serializers.CharField(source='get_follow_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    company_name = serializers.CharField(source='prospect.company_name', read_only=True)
    contact_person = serializers.CharField(source='prospect.contact_person', read_only=True)
    contact_number = serializers.CharField(source='prospect.contact_number', read_only=True)
    prospect_status = serializers.CharField(source='prospect.status', read_only=True)
    lead_id = serializers.SerializerMethodField()

    class Meta:
        model = FollowUp
        fields = '__all__'

    def get_lead_id(self, obj):
        lead = getattr(obj.prospect, 'lead', None)
        return lead.id if lead else None


class ProspectSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source='owner.full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    lead_id = serializers.SerializerMethodField()
    calls_count = serializers.SerializerMethodField()
    last_call_at = serializers.SerializerMethodField()
    last_call_outcome = serializers.SerializerMethodField()
    next_follow_up = serializers.SerializerMethodField()

    class Meta:
        model = Prospect
        fields = '__all__'

    def get_lead_id(self, obj):
        lead = getattr(obj, 'lead', None)
        return lead.id if lead else None

    def _logs(self, obj):
        return list(obj.call_logs.all())

    def get_calls_count(self, obj):
        return len(self._logs(obj))

    def get_last_call_at(self, obj):
        logs = self._logs(obj)
        return logs[0].called_at if logs else None

    def get_last_call_outcome(self, obj):
        logs = self._logs(obj)
        return logs[0].get_outcome_display() if logs else None

    def get_next_follow_up(self, obj):
        pending = sorted((f for f in obj.follow_ups.all() if f.status == 'pending'), key=lambda f: f.due_at)
        return pending[0].due_at if pending else None

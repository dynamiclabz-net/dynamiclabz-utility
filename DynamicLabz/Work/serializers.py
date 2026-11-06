from django.utils import timezone
from rest_framework import serializers
from .models import *


class TaskSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)
    client_id = serializers.IntegerField(source='project.client_id', read_only=True)
    client_name = serializers.CharField(source='project.client.company_name', read_only=True)
    assigned_to_name = serializers.SerializerMethodField()
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    is_overdue = serializers.SerializerMethodField()
    days_left = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = '__all__'

    def get_assigned_to_name(self, obj):
        return obj.assigned_to.full_name if obj.assigned_to else None

    def get_is_overdue(self, obj):
        return bool(obj.deadline and obj.status != 'done' and obj.deadline < timezone.localdate())

    def get_days_left(self, obj):
        if not obj.deadline:
            return None
        return (obj.deadline - timezone.localdate()).days


class ProjectSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.company_name', read_only=True)
    project_type_display = serializers.CharField(source='get_project_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    team_members = serializers.SerializerMethodField()
    tasks_total = serializers.SerializerMethodField()
    tasks_done = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    days_left = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = '__all__'

    def get_team_members(self, obj):
        return [{'id': u.id, 'full_name': u.full_name} for u in obj.team.all()]

    def get_tasks_total(self, obj):
        return len(obj.tasks.all())

    def get_tasks_done(self, obj):
        return sum(1 for t in obj.tasks.all() if t.status == 'done')

    def get_progress(self, obj):
        total = self.get_tasks_total(obj)
        if obj.status == 'completed':
            return 100
        return round(self.get_tasks_done(obj) * 100 / total) if total else 0

    def get_is_overdue(self, obj):
        return bool(obj.deadline and obj.status != 'completed' and obj.deadline < timezone.localdate())

    def get_days_left(self, obj):
        if not obj.deadline:
            return None
        return (obj.deadline - timezone.localdate()).days

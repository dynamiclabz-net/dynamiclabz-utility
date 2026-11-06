from rest_framework import serializers
from .models import *


class AttendanceSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    user_role = serializers.CharField(source='user.role', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    work_mode_display = serializers.CharField(source='get_work_mode_display', read_only=True)
    hours = serializers.FloatField(read_only=True)
    is_open = serializers.SerializerMethodField()

    class Meta:
        model = Attendance
        fields = '__all__'

    def get_is_open(self, obj):
        return bool(obj.check_in and not obj.check_out)

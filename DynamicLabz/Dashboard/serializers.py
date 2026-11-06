from rest_framework import serializers
from .models import *


class DashboardKpiSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    value = serializers.FloatField()
    unit = serializers.CharField(default='count')
    hint = serializers.CharField(required=False, allow_blank=True)

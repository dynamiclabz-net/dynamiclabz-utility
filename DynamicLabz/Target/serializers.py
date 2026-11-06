from rest_framework import serializers
from .models import *

from utils.access import month_bounds
from utils.metrics import METRICS, compute_metric


class TargetSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    user_role = serializers.CharField(source='user.role', read_only=True)
    metric_label = serializers.CharField(source='get_metric_display', read_only=True)

    class Meta:
        model = Target
        fields = '__all__'

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        start, end = month_bounds(instance.month)
        achieved = compute_metric(instance.user, instance.metric, start, end)
        target_value = float(instance.target_value)

        representation['target_value'] = target_value
        representation['achieved'] = achieved
        representation['unit'] = METRICS.get(instance.metric, {}).get('unit', 'count')
        representation['percent'] = round(achieved * 100 / target_value) if target_value else 0
        return representation

from django.conf import settings
from django.db import models
from django.utils import timezone

from utils.metrics import METRICS


class Target(models.Model):
    METRIC_CHOICES = [(key, value['label']) for key, value in METRICS.items()]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='targets')
    month = models.DateField(help_text='First day of the target month.')
    metric = models.CharField(max_length=25, choices=METRIC_CHOICES)
    target_value = models.DecimalField(max_digits=12, decimal_places=2)
    note = models.CharField(max_length=255, null=True, blank=True)

    set_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='targets_set')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-month', 'user__first_name', 'metric']
        unique_together = ('user', 'month', 'metric')

    def __str__(self):
        return f"{self.user.full_name} - {self.get_metric_display()} ({self.month:%b %Y})"

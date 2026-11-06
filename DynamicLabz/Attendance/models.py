from django.conf import settings
from django.db import models
from django.utils import timezone


class Attendance(models.Model):
    STATUS_CHOICES = [
        ('present', 'Present'),
        ('half_day', 'Half Day'),
        ('leave', 'On Leave'),
    ]
    MODE_CHOICES = [
        ('office', 'Office'),
        ('remote', 'Remote'),
        ('client_site', 'Client Site'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='attendances')
    date = models.DateField(default=timezone.localdate)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='present')
    work_mode = models.CharField(max_length=12, choices=MODE_CHOICES, default='office')

    check_in = models.DateTimeField(null=True, blank=True)
    check_out = models.DateTimeField(null=True, blank=True)
    timesheet = models.TextField(null=True, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date']
        unique_together = ('user', 'date')

    @property
    def hours(self):
        if self.check_in and self.check_out:
            return round((self.check_out - self.check_in).total_seconds() / 3600, 2)
        return None

    def __str__(self):
        return f"{self.user.full_name} - {self.date}"

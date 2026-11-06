from django.conf import settings
from django.db import models
from django.utils import timezone


class Prospect(models.Model):
    STATUS_CHOICES = [
        ('new', 'New'),
        ('contacted', 'Contacted'),
        ('interested', 'Interested'),
        ('follow_up', 'Follow-up Pending'),
        ('not_interested', 'Not Interested'),
        ('converted', 'Converted to Lead'),
    ]
    SOURCE_CHOICES = [
        ('cold_call', 'Cold Call'),
        ('referral', 'Referral'),
        ('website', 'Website'),
        ('linkedin', 'LinkedIn'),
        ('event', 'Event'),
        ('other', 'Other'),
    ]

    company_name = models.CharField(max_length=255)
    place = models.CharField(max_length=150, null=True, blank=True)
    website = models.CharField(max_length=255, null=True, blank=True)
    industry = models.CharField(max_length=150, null=True, blank=True)

    contact_person = models.CharField(max_length=150)
    designation = models.CharField(max_length=100, null=True, blank=True)
    contact_number = models.CharField(max_length=20)
    alternate_number = models.CharField(max_length=20, null=True, blank=True)
    email = models.EmailField(null=True, blank=True)

    requirement = models.TextField(null=True, blank=True)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='cold_call')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new')
    first_connected_at = models.DateTimeField(null=True, blank=True)

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='prospects')

    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f"{self.company_name} - {self.contact_person}"


class CallLog(models.Model):
    OUTCOME_CHOICES = [
        ('connected_interested', 'Connected - Interested'),
        ('connected_brief_given', 'Connected - Brief Given'),
        ('meeting_fixed', 'Meeting Fixed'),
        ('call_later', 'Call Later'),
        ('not_available', 'Currently Not Available'),
        ('no_answer', 'No Answer'),
        ('wrong_number', 'Wrong Number'),
        ('not_interested', 'Not Interested'),
    ]
    CONNECTED_OUTCOMES = ['connected_interested', 'connected_brief_given', 'meeting_fixed', 'call_later', 'not_interested']

    prospect = models.ForeignKey(Prospect, on_delete=models.CASCADE, related_name='call_logs')
    called_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='call_logs')
    called_at = models.DateTimeField(default=timezone.now)
    outcome = models.CharField(max_length=30, choices=OUTCOME_CHOICES)
    connected = models.BooleanField(default=False)
    duration_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    summary = models.TextField(null=True, blank=True)

    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-called_at']

    def __str__(self):
        return f"{self.prospect.company_name} - {self.get_outcome_display()}"


class FollowUp(models.Model):
    TYPE_CHOICES = [
        ('call', 'Call'),
        ('meeting', 'Meeting'),
        ('email', 'Email'),
        ('whatsapp', 'WhatsApp'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('done', 'Done'),
        ('cancelled', 'Cancelled'),
    ]

    prospect = models.ForeignKey(Prospect, on_delete=models.CASCADE, related_name='follow_ups')
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='follow_ups')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='follow_ups_created')
    call_log = models.ForeignKey(CallLog, on_delete=models.SET_NULL, null=True, blank=True, related_name='follow_ups')

    due_at = models.DateTimeField()
    follow_type = models.CharField(max_length=10, choices=TYPE_CHOICES, default='call')
    notes = models.CharField(max_length=500, null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    completed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['due_at']

    def __str__(self):
        return f"{self.prospect.company_name} - {self.due_at:%d %b %Y %H:%M}"

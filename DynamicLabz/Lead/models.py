from django.conf import settings
from django.db import models
from django.utils import timezone

from Prospect.models import Prospect


class Lead(models.Model):
    STATUS_CHOICES = [
        ('meeting_done', 'Meeting Done'),
        ('proposal_in_progress', 'Proposal In Progress'),
        ('proposal_submitted', 'Proposal Submitted'),
        ('negotiation', 'Negotiation'),
        ('won', 'Won - Client'),
        ('lost', 'Lost'),
    ]
    OPEN_STATUSES = ['meeting_done', 'proposal_in_progress', 'proposal_submitted', 'negotiation']

    prospect = models.OneToOneField(Prospect, on_delete=models.PROTECT, related_name='lead')
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='leads')

    title = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    expected_value = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    expected_closure_date = models.DateField(null=True, blank=True)

    status = models.CharField(max_length=25, choices=STATUS_CHOICES, default='meeting_done')
    proposal_submitted_on = models.DateField(null=True, blank=True)
    lost_reason = models.TextField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f"{self.prospect.company_name} - {self.title}"


class Meeting(models.Model):
    MODE_CHOICES = [
        ('in_person', 'In Person'),
        ('video', 'Video Call'),
        ('phone', 'Phone Call'),
    ]

    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name='meetings')
    scheduled_at = models.DateTimeField()
    mode = models.CharField(max_length=10, choices=MODE_CHOICES, default='video')
    location = models.CharField(max_length=255, null=True, blank=True)
    attendees = models.CharField(max_length=500, null=True, blank=True)
    agenda = models.CharField(max_length=500, null=True, blank=True)
    minutes = models.TextField(null=True, blank=True)
    next_steps = models.TextField(null=True, blank=True)
    conducted = models.BooleanField(default=True)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='meetings')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-scheduled_at']

    def __str__(self):
        return f"{self.lead.prospect.company_name} - {self.scheduled_at:%d %b %Y}"


class LeadDocument(models.Model):
    TYPE_CHOICES = [
        ('proposal', 'Proposal'),
        ('quotation', 'Quotation'),
        ('requirements', 'Requirements'),
        ('nda', 'NDA'),
        ('other', 'Other'),
    ]

    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name='documents')
    title = models.CharField(max_length=255)
    doc_type = models.CharField(max_length=15, choices=TYPE_CHOICES, default='proposal')
    version = models.CharField(max_length=20, null=True, blank=True)
    file = models.FileField(upload_to='lead_documents/%Y/%m/')

    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='lead_documents')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} ({self.get_doc_type_display()})"

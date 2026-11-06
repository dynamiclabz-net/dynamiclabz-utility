from django.conf import settings
from django.db import models
from django.utils import timezone

from Lead.models import Lead


class Client(models.Model):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('on_hold', 'On Hold'),
        ('completed', 'Completed'),
        ('churned', 'Churned'),
    ]

    lead = models.OneToOneField(Lead, on_delete=models.PROTECT, null=True, blank=True, related_name='client')
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='clients')

    company_name = models.CharField(max_length=255)
    place = models.CharField(max_length=150, null=True, blank=True)
    website = models.CharField(max_length=255, null=True, blank=True)
    contact_person = models.CharField(max_length=150)
    designation = models.CharField(max_length=100, null=True, blank=True)
    contact_number = models.CharField(max_length=20)
    email = models.EmailField(null=True, blank=True)
    address = models.TextField(null=True, blank=True)
    gst_number = models.CharField(max_length=30, null=True, blank=True)
    notes = models.TextField(null=True, blank=True)

    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='active')
    onboarded_on = models.DateField(default=timezone.localdate)

    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.company_name


class Invoice(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('sent', 'Sent'),
        ('paid', 'Paid'),
        ('cancelled', 'Cancelled'),
    ]

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='invoices')
    invoice_number = models.CharField(max_length=40, unique=True)
    title = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    issue_date = models.DateField(default=timezone.localdate)
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='sent')
    paid_on = models.DateField(null=True, blank=True)
    file = models.FileField(upload_to='invoices/%Y/%m/', null=True, blank=True)
    notes = models.CharField(max_length=500, null=True, blank=True)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='invoices_created')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-issue_date', '-id']

    def __str__(self):
        return f"{self.invoice_number} - {self.client.company_name}"


class ClientDocument(models.Model):
    TYPE_CHOICES = [
        ('contract', 'Contract'),
        ('sow', 'Scope of Work'),
        ('nda', 'NDA'),
        ('credentials', 'Credentials / Access'),
        ('design', 'Design Assets'),
        ('other', 'Other'),
    ]

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='documents')
    title = models.CharField(max_length=255)
    doc_type = models.CharField(max_length=15, choices=TYPE_CHOICES, default='other')
    file = models.FileField(upload_to='client_documents/%Y/%m/')

    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='client_documents')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} - {self.client.company_name}"

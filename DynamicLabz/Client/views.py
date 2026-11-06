from decimal import Decimal, InvalidOperation
from math import ceil

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import viewsets, status

from .models import Client, Invoice, ClientDocument
from .serializers import ClientSerializer, InvoiceSerializer, ClientDocumentSerializer

from Lead.models import Lead
from Lead.serializers import MeetingSerializer
from Work.models import Project
from Work.serializers import ProjectSerializer, TaskSerializer
from Work.views import _projects_for, _tasks_for
from UserDetail.models import User

from utils.access import is_admin, scope_by_owner, can_access
from utils.decorators import handle_exceptions, check_authentication
from utils.responses import api_success, api_error, not_found, forbidden
from utils.uploads import validate_upload

ALL_ROLES = ['admin', 'sales', 'dev']
SALES_ROLES = ['admin', 'sales']


def _clients_for(user):
    clients = Client.objects.filter(active=True).select_related('owner').prefetch_related('projects', 'projects__tasks')
    if is_admin(user):
        return clients
    if user.role == 'sales':
        return clients.filter(owner=user)
    return clients.filter(projects__team=user).distinct()


def _finance_summary(client_qs_invoices):
    today = timezone.localdate()
    billed = client_qs_invoices.exclude(status__in=['draft', 'cancelled']).aggregate(total=Sum('amount'))['total'] or 0
    paid = client_qs_invoices.filter(status='paid').aggregate(total=Sum('amount'))['total'] or 0
    overdue = client_qs_invoices.filter(status='sent', due_date__lt=today).aggregate(total=Sum('amount'))['total'] or 0
    return {
        'billed': float(billed),
        'paid': float(paid),
        'outstanding': float(billed - paid),
        'overdue': float(overdue),
    }


def _next_invoice_number():
    year = timezone.localdate().year
    prefix = f'DL-{year}-'
    last = Invoice.objects.filter(invoice_number__startswith=prefix).order_by('-invoice_number').first()
    sequence = int(last.invoice_number.split('-')[-1]) + 1 if last and last.invoice_number.split('-')[-1].isdigit() else 1
    return f'{prefix}{sequence:04d}'


class ClientViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role=ALL_ROLES)
    def list(self, request):
        clients = _clients_for(request.user)

        client_id = request.query_params.get('id')
        if client_id:
            client = clients.filter(id=client_id).first()
            if not client:
                return not_found('Client')

            projects = _projects_for(request.user).filter(client=client)
            tasks = _tasks_for(request.user).filter(project__client=client)
            data = {
                'client': ClientSerializer(client).data,
                'projects': ProjectSerializer(projects, many=True).data,
                'tasks': TaskSerializer(tasks, many=True).data,
                'can_manage': is_admin(request.user) or client.owner_id == request.user.id,
            }

            if request.user.role != 'dev':
                invoices = client.invoices.select_related('client', 'created_by')
                data['invoices'] = InvoiceSerializer(invoices, many=True).data
                data['documents'] = ClientDocumentSerializer(client.documents.select_related('uploaded_by'), many=True).data
                data['finance'] = _finance_summary(client.invoices.all())

                journey = None
                if client.lead_id:
                    lead = Lead.objects.select_related('prospect').get(id=client.lead_id)
                    prospect = lead.prospect
                    journey = {
                        'prospect_id': prospect.id,
                        'lead_id': lead.id,
                        'prospect_added_on': prospect.created_at,
                        'first_connected_at': prospect.first_connected_at,
                        'calls_count': prospect.call_logs.count(),
                        'lead_created_at': lead.created_at,
                        'meetings': MeetingSerializer(lead.meetings.select_related('created_by'), many=True).data,
                        'proposal_submitted_on': lead.proposal_submitted_on,
                        'expected_value': float(lead.expected_value) if lead.expected_value is not None else None,
                        'onboarded_on': client.onboarded_on,
                    }
                data['journey'] = journey
            return api_success(data)

        search = request.query_params.get('search')
        if search:
            clients = clients.filter(
                Q(company_name__icontains=search) | Q(contact_person__icontains=search) | Q(place__icontains=search)
            )
        status_filter = request.query_params.get('status')
        if status_filter:
            clients = clients.filter(status=status_filter)
        owner = request.query_params.get('owner')
        if owner and is_admin(request.user):
            clients = clients.filter(owner_id=owner)

        return api_success({'clients': ClientSerializer(clients, many=True).data})

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def create(self, request):
        """Creates a client, either by converting a lead or directly. Optionally creates the first project."""
        lead = None
        lead_id = request.data.get('lead')
        if lead_id:
            lead = Lead.objects.select_related('prospect').filter(id=lead_id, active=True).first()
            if not lead:
                return not_found('Lead')
            if not can_access(request.user, lead.owner_id):
                return forbidden()
            if lead.status in ('won', 'lost') or hasattr(lead, 'client'):
                return api_error('This lead is already closed.')

        def pick(field, from_lead=None):
            value = request.data.get(field)
            if value in (None, '') and from_lead is not None:
                value = from_lead
            return (value or '').strip() if isinstance(value, str) else value

        prospect = lead.prospect if lead else None
        company_name = pick('company_name', prospect.company_name if prospect else None)
        contact_person = pick('contact_person', prospect.contact_person if prospect else None)
        contact_number = pick('contact_number', prospect.contact_number if prospect else None)
        if not company_name or not contact_person or not contact_number:
            return api_error('company_name, contact_person and contact_number are required.')

        owner = lead.owner if lead else request.user
        if not lead and is_admin(request.user) and request.data.get('owner'):
            owner = User.objects.filter(id=request.data.get('owner'), is_active=True).first()
            if not owner:
                return not_found('Owner')

        project_data = request.data.get('project') or {}
        project_name = (project_data.get('name') or '').strip() if isinstance(project_data, dict) else ''

        with transaction.atomic():
            client = Client.objects.create(
                lead=lead,
                owner=owner,
                company_name=company_name,
                place=pick('place', prospect.place if prospect else None) or None,
                website=pick('website', prospect.website if prospect else None) or None,
                contact_person=contact_person,
                designation=pick('designation', prospect.designation if prospect else None) or None,
                contact_number=contact_number,
                email=pick('email', prospect.email if prospect else None) or None,
                address=pick('address') or None,
                gst_number=pick('gst_number') or None,
                notes=pick('notes') or None,
            )

            if lead:
                lead.status = 'won'
                lead.closed_at = timezone.now()
                lead.save()

            if project_name:
                deadline = parse_date(str(project_data.get('deadline'))) if project_data.get('deadline') else None
                start_date = parse_date(str(project_data.get('start_date'))) if project_data.get('start_date') else None
                try:
                    budget = Decimal(str(project_data['budget'])) if project_data.get('budget') not in (None, '') else (
                        lead.expected_value if lead else None
                    )
                except InvalidOperation:
                    raise ValueError('Project budget must be a number.')
                project_type = project_data.get('project_type') or 'web'
                project = Project.objects.create(
                    client=client, name=project_name, project_type=project_type if project_type in dict(Project.TYPE_CHOICES) else 'web',
                    description=(project_data.get('description') or '').strip() or (lead.description if lead else None),
                    start_date=start_date, deadline=deadline, budget=budget,
                    status='planning', created_by=request.user,
                )
                team_ids = project_data.get('team') or []
                if isinstance(team_ids, (list, tuple)) and team_ids:
                    project.team.set(User.objects.filter(id__in=team_ids, is_active=True))

        client = _clients_for(request.user).get(id=client.id)
        return api_success({'client': ClientSerializer(client).data}, status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def update(self, request, pk):
        client = Client.objects.filter(id=pk, active=True).first()
        if not client:
            return not_found('Client')
        if not can_access(request.user, client.owner_id):
            return forbidden()

        for field in ['company_name', 'contact_person', 'contact_number']:
            if field in request.data and not (request.data.get(field) or '').strip():
                return api_error(f'{field} cannot be empty.')

        for field in ['company_name', 'place', 'website', 'contact_person', 'designation', 'contact_number',
                      'email', 'address', 'gst_number', 'notes']:
            if field in request.data:
                setattr(client, field, (request.data.get(field) or '').strip() or None)

        if 'status' in request.data:
            if request.data['status'] not in dict(Client.STATUS_CHOICES):
                return api_error('Invalid status.')
            client.status = request.data['status']

        if is_admin(request.user) and request.data.get('owner'):
            owner = User.objects.filter(id=request.data['owner'], is_active=True).first()
            if not owner:
                return not_found('Owner')
            client.owner = owner

        client.save()
        client = _clients_for(request.user).get(id=client.id)
        return api_success({'client': ClientSerializer(client).data})

    @handle_exceptions
    @check_authentication(required_role='admin')
    def destroy(self, request, pk):
        """Archives a client (all history is retained)."""
        client = Client.objects.filter(id=pk, active=True).first()
        if not client:
            return not_found('Client')

        client.active = False
        client.status = 'churned'
        client.save()
        return api_success({'id': int(pk), 'deleted': True})


def _client_for_manage(request, client_id):
    client = Client.objects.filter(id=client_id, active=True).first()
    if not client:
        return None, not_found('Client')
    if not can_access(request.user, client.owner_id):
        return None, forbidden()
    return client, None


class InvoiceViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def list(self, request):
        invoices = Invoice.objects.select_related('client', 'created_by')
        invoices = scope_by_owner(invoices, request.user, 'client__owner')

        client_id = request.query_params.get('client')
        if client_id:
            invoices = invoices.filter(client_id=client_id)

        status_filter = request.query_params.get('status')
        today = timezone.localdate()
        if status_filter == 'overdue':
            invoices = invoices.filter(status='sent', due_date__lt=today)
        elif status_filter:
            invoices = invoices.filter(status=status_filter)

        return api_success({
            'invoices': InvoiceSerializer(invoices[:300], many=True).data,
            'finance': _finance_summary(scope_by_owner(Invoice.objects.all(), request.user, 'client__owner')),
        })

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def create(self, request):
        client, error = _client_for_manage(request, request.data.get('client'))
        if error:
            return error

        title = (request.data.get('title') or '').strip()
        if not title:
            return api_error('Invoice title is required.')
        try:
            amount = Decimal(str(request.data.get('amount')))
        except (InvalidOperation, TypeError):
            return api_error('A valid amount is required.')
        if amount <= 0:
            return api_error('Amount must be greater than zero.')

        invoice_status = request.data.get('status') or 'sent'
        if invoice_status not in dict(Invoice.STATUS_CHOICES):
            return api_error('Invalid invoice status.')

        invoice_number = (request.data.get('invoice_number') or '').strip() or _next_invoice_number()
        if Invoice.objects.filter(invoice_number=invoice_number).exists():
            return api_error('An invoice with this number already exists.')

        issue_date = parse_date(str(request.data.get('issue_date'))) if request.data.get('issue_date') else timezone.localdate()
        due_date = parse_date(str(request.data.get('due_date'))) if request.data.get('due_date') else None
        if not issue_date or (request.data.get('due_date') and not due_date):
            return api_error('Issue date or due date is invalid.')

        uploaded_file = request.FILES.get('file')
        if uploaded_file:
            error_message = validate_upload(uploaded_file)
            if error_message:
                return api_error(error_message)

        invoice = Invoice.objects.create(
            client=client, invoice_number=invoice_number, title=title, amount=amount,
            issue_date=issue_date, due_date=due_date, status=invoice_status,
            paid_on=timezone.localdate() if invoice_status == 'paid' else None,
            file=uploaded_file, notes=(request.data.get('notes') or '').strip() or None,
            created_by=request.user,
        )
        return api_success({'invoice': InvoiceSerializer(invoice).data}, status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def update(self, request, pk):
        invoice = Invoice.objects.select_related('client').filter(id=pk).first()
        if not invoice:
            return not_found('Invoice')
        if not can_access(request.user, invoice.client.owner_id):
            return forbidden()

        if 'title' in request.data:
            title = (request.data.get('title') or '').strip()
            if not title:
                return api_error('Invoice title cannot be empty.')
            invoice.title = title
        if 'amount' in request.data:
            try:
                amount = Decimal(str(request.data.get('amount')))
            except (InvalidOperation, TypeError):
                return api_error('A valid amount is required.')
            if amount <= 0:
                return api_error('Amount must be greater than zero.')
            invoice.amount = amount
        if 'due_date' in request.data:
            invoice.due_date = parse_date(str(request.data['due_date'])) if request.data['due_date'] else None
        if 'notes' in request.data:
            invoice.notes = (request.data.get('notes') or '').strip() or None
        if 'status' in request.data:
            if request.data['status'] not in dict(Invoice.STATUS_CHOICES):
                return api_error('Invalid invoice status.')
            invoice.status = request.data['status']
            if invoice.status == 'paid':
                paid_on = parse_date(str(request.data.get('paid_on'))) if request.data.get('paid_on') else None
                invoice.paid_on = paid_on or invoice.paid_on or timezone.localdate()
            else:
                invoice.paid_on = None

        uploaded_file = request.FILES.get('file')
        if uploaded_file:
            error_message = validate_upload(uploaded_file)
            if error_message:
                return api_error(error_message)
            invoice.file = uploaded_file

        invoice.save()
        return api_success({'invoice': InvoiceSerializer(invoice).data})

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def destroy(self, request, pk):
        invoice = Invoice.objects.select_related('client').filter(id=pk).first()
        if not invoice:
            return not_found('Invoice')
        if not can_access(request.user, invoice.client.owner_id):
            return forbidden()

        if invoice.file:
            invoice.file.delete(save=False)
        invoice.delete()
        return api_success({'id': int(pk), 'deleted': True})


class ClientDocumentViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def list(self, request):
        documents = ClientDocument.objects.select_related('uploaded_by', 'client')
        documents = scope_by_owner(documents, request.user, 'client__owner')
        client_id = request.query_params.get('client')
        if client_id:
            documents = documents.filter(client_id=client_id)
        return api_success({'documents': ClientDocumentSerializer(documents[:200], many=True).data})

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def create(self, request):
        client, error = _client_for_manage(request, request.data.get('client'))
        if error:
            return error

        uploaded_file = request.FILES.get('file')
        error_message = validate_upload(uploaded_file)
        if error_message:
            return api_error(error_message)

        doc_type = request.data.get('doc_type') or 'other'
        if doc_type not in dict(ClientDocument.TYPE_CHOICES):
            return api_error('Invalid document type.')

        document = ClientDocument.objects.create(
            client=client,
            title=(request.data.get('title') or '').strip() or uploaded_file.name,
            doc_type=doc_type, file=uploaded_file, uploaded_by=request.user,
        )
        return api_success({'document': ClientDocumentSerializer(document).data}, status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def destroy(self, request, pk):
        document = ClientDocument.objects.select_related('client').filter(id=pk).first()
        if not document:
            return not_found('Document')
        if not can_access(request.user, document.client.owner_id):
            return forbidden()

        document.file.delete(save=False)
        document.delete()
        return api_success({'id': int(pk), 'deleted': True})

from decimal import Decimal, InvalidOperation

from django.db.models import Count, Q, Sum
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import viewsets, status

from .models import Lead, Meeting, LeadDocument
from .serializers import LeadSerializer, MeetingSerializer, LeadDocumentSerializer

from Prospect.models import Prospect
from Prospect.serializers import CallLogSerializer, FollowUpSerializer

from utils.access import is_admin, scope_by_owner, can_access, parse_dt
from utils.decorators import handle_exceptions, check_authentication
from utils.responses import api_success, api_error, not_found, forbidden
from utils.uploads import validate_upload

SALES_ROLES = ['admin', 'sales']


def _leads_for(user):
    return scope_by_owner(
        Lead.objects.filter(active=True)
        .select_related('prospect', 'owner')
        .prefetch_related('meetings', 'documents'),
        user,
    )


def _to_decimal(value):
    if value in (None, ''):
        return None
    try:
        amount = Decimal(str(value))
    except InvalidOperation:
        raise ValueError('Expected value must be a number.')
    if amount < 0:
        raise ValueError('Expected value cannot be negative.')
    return amount


class LeadViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def list(self, request):
        lead_id = request.query_params.get('id')
        if lead_id:
            lead = _leads_for(request.user).filter(id=lead_id).first()
            if not lead:
                return not_found('Lead')

            prospect = lead.prospect
            data = {
                'lead': LeadSerializer(lead).data,
                'meetings': MeetingSerializer(lead.meetings.select_related('created_by'), many=True).data,
                'documents': LeadDocumentSerializer(lead.documents.select_related('uploaded_by'), many=True).data,
                'call_logs': CallLogSerializer(prospect.call_logs.select_related('called_by'), many=True).data,
                'follow_ups': FollowUpSerializer(
                    prospect.follow_ups.select_related('assigned_to', 'prospect').order_by('-due_at'), many=True
                ).data,
                'prospect_id': prospect.id,
                'prospect_source': prospect.get_source_display(),
                'prospect_requirement': prospect.requirement,
                'prospect_created_at': prospect.created_at,
                'first_connected_at': prospect.first_connected_at,
            }
            return api_success(data)

        leads = _leads_for(request.user)

        search = request.query_params.get('search')
        if search:
            leads = leads.filter(
                Q(title__icontains=search) | Q(prospect__company_name__icontains=search)
                | Q(prospect__contact_person__icontains=search)
            )

        owner = request.query_params.get('owner')
        if owner and is_admin(request.user):
            leads = leads.filter(owner_id=owner)

        summary_rows = leads.order_by().values('status').annotate(total=Count('id'), value=Sum('expected_value'))
        status_counts = {row['status']: row['total'] for row in summary_rows}
        status_values = {row['status']: float(row['value'] or 0) for row in summary_rows}

        status_filter = request.query_params.get('status')
        if status_filter == 'open':
            leads = leads.filter(status__in=Lead.OPEN_STATUSES)
        elif status_filter:
            leads = leads.filter(status=status_filter)

        data = {
            'leads': LeadSerializer(leads[:300], many=True).data,
            'status_counts': status_counts,
            'status_values': status_values,
        }
        return api_success(data)

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def create(self, request):
        """Moves a prospect to lead once a meeting has happened, recording the meeting."""
        prospect = Prospect.objects.filter(id=request.data.get('prospect'), active=True).first()
        if not prospect:
            return not_found('Prospect')
        if not can_access(request.user, prospect.owner_id):
            return forbidden()
        if hasattr(prospect, 'lead'):
            return api_error('This prospect is already a lead.')

        title = (request.data.get('title') or '').strip()
        minutes = (request.data.get('minutes') or '').strip()
        scheduled_at = parse_dt(request.data.get('scheduled_at'))
        if not title:
            return api_error('Lead title (what they need) is required.')
        if not scheduled_at:
            return api_error('Meeting date and time is required.')
        if not minutes:
            return api_error('Please record what happened in the meeting.')

        mode = request.data.get('mode') or 'video'
        if mode not in dict(Meeting.MODE_CHOICES):
            return api_error('Invalid meeting mode.')

        try:
            expected_value = _to_decimal(request.data.get('expected_value'))
        except ValueError as err:
            return api_error(str(err))

        closure = request.data.get('expected_closure_date')
        closure_date = parse_date(closure) if closure else None
        if closure and not closure_date:
            return api_error('Expected closure date is invalid.')

        with transaction.atomic():
            lead = Lead.objects.create(
                prospect=prospect,
                owner=prospect.owner,
                title=title,
                description=(request.data.get('description') or '').strip() or None,
                expected_value=expected_value,
                expected_closure_date=closure_date,
            )
            Meeting.objects.create(
                lead=lead,
                scheduled_at=scheduled_at,
                mode=mode,
                location=(request.data.get('location') or '').strip() or None,
                attendees=(request.data.get('attendees') or '').strip() or None,
                agenda=(request.data.get('agenda') or '').strip() or None,
                minutes=minutes,
                next_steps=(request.data.get('next_steps') or '').strip() or None,
                created_by=request.user,
            )
            prospect.status = 'converted'
            prospect.save()

        lead = _leads_for(request.user).get(id=lead.id)
        return api_success({'lead': LeadSerializer(lead).data}, status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def update(self, request, pk):
        lead = Lead.objects.select_related('prospect').filter(id=pk, active=True).first()
        if not lead:
            return not_found('Lead')
        if not can_access(request.user, lead.owner_id):
            return forbidden()

        if 'title' in request.data:
            title = (request.data.get('title') or '').strip()
            if not title:
                return api_error('Lead title cannot be empty.')
            lead.title = title
        if 'description' in request.data:
            lead.description = (request.data.get('description') or '').strip() or None
        if 'expected_value' in request.data:
            try:
                lead.expected_value = _to_decimal(request.data.get('expected_value'))
            except ValueError as err:
                return api_error(str(err))
        if 'expected_closure_date' in request.data:
            closure = request.data.get('expected_closure_date')
            lead.expected_closure_date = parse_date(closure) if closure else None
            if closure and not lead.expected_closure_date:
                return api_error('Expected closure date is invalid.')

        if 'status' in request.data and request.data['status'] != lead.status:
            new_status = request.data['status']
            if new_status not in dict(Lead.STATUS_CHOICES):
                return api_error('Invalid status.')
            if lead.status == 'won':
                return api_error('A won lead is already a client and its stage cannot be changed.')
            if new_status == 'won':
                return api_error('Convert the lead to a client to mark it as won.')
            if new_status == 'lost':
                reason = (request.data.get('lost_reason') or '').strip()
                if not reason:
                    return api_error('Please add the reason for losing this lead.')
                lead.lost_reason = reason
                lead.closed_at = timezone.now()
            else:
                lead.lost_reason = None
                lead.closed_at = None
            if new_status == 'proposal_submitted' and not lead.proposal_submitted_on:
                lead.proposal_submitted_on = timezone.localdate()
            lead.status = new_status

        lead.save()
        return api_success({'lead': LeadSerializer(_leads_for(request.user).get(id=lead.id)).data})

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def destroy(self, request, pk):
        """Deletes a lead and sends the prospect back to the prospect pipeline."""
        lead = Lead.objects.select_related('prospect').filter(id=pk, active=True).first()
        if not lead:
            return not_found('Lead')
        if not can_access(request.user, lead.owner_id):
            return forbidden()
        if hasattr(lead, 'client'):
            return api_error('This lead has been converted to a client and cannot be deleted.')

        with transaction.atomic():
            prospect = lead.prospect
            lead.delete()
            prospect.status = 'interested'
            prospect.save()
        return api_success({'id': int(pk), 'deleted': True})


class MeetingViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def list(self, request):
        meetings = Meeting.objects.select_related('created_by', 'lead', 'lead__prospect')
        meetings = scope_by_owner(meetings, request.user, 'lead__owner')
        lead_id = request.query_params.get('lead')
        if lead_id:
            meetings = meetings.filter(lead_id=lead_id)
        return api_success({'meetings': MeetingSerializer(meetings[:200], many=True).data})

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def create(self, request):
        lead = Lead.objects.filter(id=request.data.get('lead'), active=True).first()
        if not lead:
            return not_found('Lead')
        if not can_access(request.user, lead.owner_id):
            return forbidden()

        scheduled_at = parse_dt(request.data.get('scheduled_at'))
        if not scheduled_at:
            return api_error('Meeting date and time is required.')
        mode = request.data.get('mode') or 'video'
        if mode not in dict(Meeting.MODE_CHOICES):
            return api_error('Invalid meeting mode.')

        meeting = Meeting.objects.create(
            lead=lead,
            scheduled_at=scheduled_at,
            mode=mode,
            location=(request.data.get('location') or '').strip() or None,
            attendees=(request.data.get('attendees') or '').strip() or None,
            agenda=(request.data.get('agenda') or '').strip() or None,
            minutes=(request.data.get('minutes') or '').strip() or None,
            next_steps=(request.data.get('next_steps') or '').strip() or None,
            conducted=request.data.get('conducted') not in (False, 'false', 'False', '0', 0),
            created_by=request.user,
        )
        return api_success({'meeting': MeetingSerializer(meeting).data}, status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def update(self, request, pk):
        meeting = Meeting.objects.select_related('lead').filter(id=pk).first()
        if not meeting:
            return not_found('Meeting')
        if not can_access(request.user, meeting.lead.owner_id):
            return forbidden()

        if 'scheduled_at' in request.data:
            scheduled_at = parse_dt(request.data.get('scheduled_at'))
            if not scheduled_at:
                return api_error('Meeting date and time is invalid.')
            meeting.scheduled_at = scheduled_at
        if 'mode' in request.data:
            if request.data['mode'] not in dict(Meeting.MODE_CHOICES):
                return api_error('Invalid meeting mode.')
            meeting.mode = request.data['mode']
        for field in ['location', 'attendees', 'agenda', 'minutes', 'next_steps']:
            if field in request.data:
                setattr(meeting, field, (request.data.get(field) or '').strip() or None)
        if 'conducted' in request.data:
            meeting.conducted = request.data['conducted'] not in (False, 'false', 'False', '0', 0)

        meeting.save()
        return api_success({'meeting': MeetingSerializer(meeting).data})

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def destroy(self, request, pk):
        meeting = Meeting.objects.select_related('lead').filter(id=pk).first()
        if not meeting:
            return not_found('Meeting')
        if not can_access(request.user, meeting.lead.owner_id):
            return forbidden()

        meeting.delete()
        return api_success({'id': int(pk), 'deleted': True})


class LeadDocumentViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def list(self, request):
        documents = LeadDocument.objects.select_related('uploaded_by', 'lead')
        documents = scope_by_owner(documents, request.user, 'lead__owner')
        lead_id = request.query_params.get('lead')
        if lead_id:
            documents = documents.filter(lead_id=lead_id)
        return api_success({'documents': LeadDocumentSerializer(documents[:200], many=True).data})

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def create(self, request):
        lead = Lead.objects.filter(id=request.data.get('lead'), active=True).first()
        if not lead:
            return not_found('Lead')
        if not can_access(request.user, lead.owner_id):
            return forbidden()

        uploaded_file = request.FILES.get('file')
        error = validate_upload(uploaded_file)
        if error:
            return api_error(error)

        doc_type = request.data.get('doc_type') or 'proposal'
        if doc_type not in dict(LeadDocument.TYPE_CHOICES):
            return api_error('Invalid document type.')

        document = LeadDocument.objects.create(
            lead=lead,
            title=(request.data.get('title') or '').strip() or uploaded_file.name,
            doc_type=doc_type,
            version=(request.data.get('version') or '').strip() or None,
            file=uploaded_file,
            uploaded_by=request.user,
        )

        if doc_type == 'proposal' and lead.status in ('meeting_done',):
            lead.status = 'proposal_in_progress'
            lead.save()

        return api_success({'document': LeadDocumentSerializer(document).data}, status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def destroy(self, request, pk):
        document = LeadDocument.objects.select_related('lead').filter(id=pk).first()
        if not document:
            return not_found('Document')
        if not can_access(request.user, document.lead.owner_id):
            return forbidden()

        document.file.delete(save=False)
        document.delete()
        return api_success({'id': int(pk), 'deleted': True})

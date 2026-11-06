from math import ceil

from django.db.models import Case, Count, IntegerField, Q, When
from django.utils import timezone
from rest_framework import viewsets, status

from .models import Prospect, CallLog, FollowUp
from .serializers import ProspectSerializer, CallLogSerializer, FollowUpSerializer

from UserDetail.models import User

from utils.access import is_admin, scope_by_owner, can_access, parse_dt, local_day_range
from utils.decorators import handle_exceptions, check_authentication
from utils.responses import api_success, api_error, not_found, forbidden

ALL_ROLES = ['admin', 'sales', 'dev']
SALES_ROLES = ['admin', 'sales']

OUTCOME_TO_STATUS = {
    'connected_interested': 'interested',
    'connected_brief_given': 'contacted',
    'meeting_fixed': 'interested',
    'call_later': 'follow_up',
    'not_available': 'contacted',
    'no_answer': 'contacted',
    'wrong_number': 'contacted',
    'not_interested': 'not_interested',
}


def _prospects_for(user):
    return scope_by_owner(
        Prospect.objects.filter(active=True).select_related('owner', 'lead').prefetch_related('call_logs', 'follow_ups'),
        user,
    )


class ProspectViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def list(self, request):
        prospect_id = request.query_params.get('id')
        if prospect_id:
            prospect = _prospects_for(request.user).filter(id=prospect_id).first()
            if not prospect:
                return not_found('Prospect')

            call_logs = prospect.call_logs.select_related('called_by').all()
            follow_ups = prospect.follow_ups.select_related('assigned_to', 'prospect').all().order_by('-due_at')
            data = {
                'prospect': ProspectSerializer(prospect).data,
                'call_logs': CallLogSerializer(call_logs, many=True).data,
                'follow_ups': FollowUpSerializer(follow_ups, many=True).data,
            }
            return api_success(data)

        prospects = _prospects_for(request.user)

        search = request.query_params.get('search')
        if search:
            prospects = prospects.filter(
                Q(company_name__icontains=search) | Q(contact_person__icontains=search)
                | Q(contact_number__icontains=search) | Q(place__icontains=search)
            )

        status_filter = request.query_params.get('status')
        if status_filter:
            prospects = prospects.filter(status=status_filter)

        source = request.query_params.get('source')
        if source:
            prospects = prospects.filter(source=source)

        owner = request.query_params.get('owner')
        if owner and is_admin(request.user):
            prospects = prospects.filter(owner_id=owner)

        status_counts = {row['status']: row['total'] for row in prospects.order_by().values('status').annotate(total=Count('id'))}

        if not status_filter:
            prospects = prospects.annotate(
                is_lead=Case(When(status='converted', then=1), default=0, output_field=IntegerField())
            ).order_by('is_lead', '-updated_at')

        page = max(int(request.query_params.get('page', 1) or 1), 1)
        page_size = min(max(int(request.query_params.get('page_size', 20) or 20), 1), 100)
        total = prospects.count()
        start = (page - 1) * page_size
        page_items = prospects[start:start + page_size]

        data = {
            'prospects': ProspectSerializer(page_items, many=True).data,
            'total': total,
            'page': page,
            'pages': max(ceil(total / page_size), 1),
            'status_counts': status_counts,
        }
        return api_success(data)

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def create(self, request):
        company_name = (request.data.get('company_name') or '').strip()
        contact_person = (request.data.get('contact_person') or '').strip()
        contact_number = (request.data.get('contact_number') or '').strip()
        if not company_name or not contact_person or not contact_number:
            return api_error('company_name, contact_person and contact_number are required.')

        owner = request.user
        if is_admin(request.user) and request.data.get('owner'):
            owner = User.objects.filter(id=request.data.get('owner'), is_active=True).first()
            if not owner:
                return not_found('Owner')

        source = request.data.get('source') or 'cold_call'
        if source not in dict(Prospect.SOURCE_CHOICES):
            return api_error('Invalid source.')

        prospect = Prospect.objects.create(
            company_name=company_name,
            place=(request.data.get('place') or '').strip() or None,
            website=(request.data.get('website') or '').strip() or None,
            industry=(request.data.get('industry') or '').strip() or None,
            contact_person=contact_person,
            designation=(request.data.get('designation') or '').strip() or None,
            contact_number=contact_number,
            alternate_number=(request.data.get('alternate_number') or '').strip() or None,
            email=(request.data.get('email') or '').strip() or None,
            requirement=(request.data.get('requirement') or '').strip() or None,
            source=source,
            owner=owner,
        )
        return api_success({'prospect': ProspectSerializer(prospect).data}, status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def update(self, request, pk):
        prospect = Prospect.objects.filter(id=pk, active=True).first()
        if not prospect:
            return not_found('Prospect')
        if not can_access(request.user, prospect.owner_id):
            return forbidden()

        for field in ['company_name', 'contact_person', 'contact_number']:
            if field in request.data and not (request.data.get(field) or '').strip():
                return api_error(f'{field} cannot be empty.')

        editable = [
            'company_name', 'place', 'website', 'industry', 'contact_person', 'designation',
            'contact_number', 'alternate_number', 'email', 'requirement',
        ]
        for field in editable:
            if field in request.data:
                value = (request.data.get(field) or '').strip()
                setattr(prospect, field, value or None)

        if 'source' in request.data:
            if request.data['source'] not in dict(Prospect.SOURCE_CHOICES):
                return api_error('Invalid source.')
            prospect.source = request.data['source']

        if 'status' in request.data and prospect.status != 'converted':
            if request.data['status'] not in dict(Prospect.STATUS_CHOICES) or request.data['status'] == 'converted':
                return api_error('Invalid status.')
            prospect.status = request.data['status']

        if is_admin(request.user) and request.data.get('owner'):
            new_owner = User.objects.filter(id=request.data.get('owner'), is_active=True).first()
            if not new_owner:
                return not_found('Owner')
            prospect.owner = new_owner

        prospect.save()
        return api_success({'prospect': ProspectSerializer(prospect).data})

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def destroy(self, request, pk):
        prospect = Prospect.objects.filter(id=pk, active=True).first()
        if not prospect:
            return not_found('Prospect')
        if not can_access(request.user, prospect.owner_id):
            return forbidden()
        if hasattr(prospect, 'lead'):
            return api_error('This prospect has already been converted to a lead and cannot be deleted.')

        prospect.delete()
        return api_success({'id': int(pk), 'deleted': True})


class CallLogViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def list(self, request):
        prospect_id = request.query_params.get('prospect')
        logs = CallLog.objects.select_related('called_by', 'prospect')
        logs = scope_by_owner(logs, request.user, 'prospect__owner')
        if prospect_id:
            logs = logs.filter(prospect_id=prospect_id)
        return api_success({'call_logs': CallLogSerializer(logs[:200], many=True).data})

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def create(self, request):
        prospect = Prospect.objects.filter(id=request.data.get('prospect'), active=True).first()
        if not prospect:
            return not_found('Prospect')
        if not can_access(request.user, prospect.owner_id):
            return forbidden()

        outcome = request.data.get('outcome')
        if outcome not in dict(CallLog.OUTCOME_CHOICES):
            return api_error('A valid call outcome is required.')

        called_at = parse_dt(request.data.get('called_at')) or timezone.now()
        follow_up_at = parse_dt(request.data.get('follow_up_at'))
        if request.data.get('follow_up_at') and not follow_up_at:
            return api_error('Follow-up date is invalid.')

        duration = request.data.get('duration_minutes')
        call_log = CallLog.objects.create(
            prospect=prospect,
            called_by=request.user,
            called_at=called_at,
            outcome=outcome,
            connected=outcome in CallLog.CONNECTED_OUTCOMES,
            duration_minutes=int(duration) if str(duration or '').isdigit() else None,
            summary=(request.data.get('summary') or '').strip() or None,
        )

        completed_id = request.data.get('complete_follow_up_id')
        if completed_id:
            FollowUp.objects.filter(id=completed_id, prospect=prospect, status='pending').update(
                status='done', completed_at=timezone.now()
            )

        if follow_up_at:
            FollowUp.objects.create(
                prospect=prospect,
                assigned_to=prospect.owner,
                created_by=request.user,
                call_log=call_log,
                due_at=follow_up_at,
                follow_type=request.data.get('follow_type') if request.data.get('follow_type') in dict(FollowUp.TYPE_CHOICES) else 'call',
                notes=(request.data.get('follow_up_note') or '').strip() or None,
            )

        if prospect.status != 'converted':
            new_status = OUTCOME_TO_STATUS[outcome]
            if follow_up_at and new_status not in ('not_interested', 'interested'):
                new_status = 'follow_up'
            prospect.status = new_status
        if call_log.connected and not prospect.first_connected_at:
            prospect.first_connected_at = called_at
        prospect.save()

        return api_success({
            'call_log': CallLogSerializer(call_log).data,
            'prospect': ProspectSerializer(Prospect.objects.get(id=prospect.id)).data,
        }, status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def update(self, request, pk):
        call_log = CallLog.objects.select_related('prospect').filter(id=pk).first()
        if not call_log:
            return not_found('Call log')
        if not can_access(request.user, call_log.prospect.owner_id):
            return forbidden()

        if 'outcome' in request.data:
            if request.data['outcome'] not in dict(CallLog.OUTCOME_CHOICES):
                return api_error('Invalid call outcome.')
            call_log.outcome = request.data['outcome']
            call_log.connected = call_log.outcome in CallLog.CONNECTED_OUTCOMES
        if 'summary' in request.data:
            call_log.summary = (request.data.get('summary') or '').strip() or None
        if request.data.get('called_at'):
            parsed = parse_dt(request.data.get('called_at'))
            if not parsed:
                return api_error('Call date is invalid.')
            call_log.called_at = parsed
        call_log.save()
        return api_success({'call_log': CallLogSerializer(call_log).data})

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def destroy(self, request, pk):
        call_log = CallLog.objects.select_related('prospect').filter(id=pk).first()
        if not call_log:
            return not_found('Call log')
        if not can_access(request.user, call_log.prospect.owner_id):
            return forbidden()

        call_log.delete()
        return api_success({'id': int(pk), 'deleted': True})


class FollowUpViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def list(self, request):
        follow_ups = FollowUp.objects.select_related('prospect', 'assigned_to', 'prospect__owner').filter(prospect__active=True)
        follow_ups = scope_by_owner(follow_ups, request.user, 'assigned_to')

        owner = request.query_params.get('owner')
        if owner and is_admin(request.user):
            follow_ups = follow_ups.filter(assigned_to_id=owner)

        prospect_id = request.query_params.get('prospect')
        if prospect_id:
            follow_ups = follow_ups.filter(prospect_id=prospect_id)

        today_start, today_end = local_day_range(timezone.localdate())
        counts = {
            'today': follow_ups.filter(status='pending', due_at__gte=today_start, due_at__lt=today_end).count(),
            'overdue': follow_ups.filter(status='pending', due_at__lt=today_start).count(),
            'upcoming': follow_ups.filter(status='pending', due_at__gte=today_end).count(),
            'done': follow_ups.filter(status='done').count(),
        }

        scope = request.query_params.get('scope', 'pending')
        if scope == 'today':
            follow_ups = follow_ups.filter(status='pending', due_at__gte=today_start, due_at__lt=today_end)
        elif scope == 'overdue':
            follow_ups = follow_ups.filter(status='pending', due_at__lt=today_start)
        elif scope == 'upcoming':
            follow_ups = follow_ups.filter(status='pending', due_at__gte=today_end)
        elif scope == 'done':
            follow_ups = follow_ups.filter(status='done').order_by('-completed_at')
        elif scope == 'pending':
            follow_ups = follow_ups.filter(status='pending')
        elif scope == 'none':
            follow_ups = follow_ups.none()

        return api_success({'follow_ups': FollowUpSerializer(follow_ups[:300], many=True).data, 'counts': counts})

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def create(self, request):
        prospect = Prospect.objects.filter(id=request.data.get('prospect'), active=True).first()
        if not prospect:
            return not_found('Prospect')
        if not can_access(request.user, prospect.owner_id):
            return forbidden()

        due_at = parse_dt(request.data.get('due_at'))
        if not due_at:
            return api_error('A valid follow-up date and time is required.')

        follow_type = request.data.get('follow_type') or 'call'
        if follow_type not in dict(FollowUp.TYPE_CHOICES):
            return api_error('Invalid follow-up type.')

        follow_up = FollowUp.objects.create(
            prospect=prospect,
            assigned_to=prospect.owner,
            created_by=request.user,
            due_at=due_at,
            follow_type=follow_type,
            notes=(request.data.get('notes') or '').strip() or None,
        )
        if prospect.status in ('new', 'contacted'):
            prospect.status = 'follow_up'
            prospect.save()
        return api_success({'follow_up': FollowUpSerializer(follow_up).data}, status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def update(self, request, pk):
        follow_up = FollowUp.objects.select_related('prospect').filter(id=pk).first()
        if not follow_up:
            return not_found('Follow-up')
        if not can_access(request.user, follow_up.assigned_to_id) and not can_access(request.user, follow_up.prospect.owner_id):
            return forbidden()

        if 'due_at' in request.data:
            due_at = parse_dt(request.data.get('due_at'))
            if not due_at:
                return api_error('A valid follow-up date and time is required.')
            follow_up.due_at = due_at
        if 'notes' in request.data:
            follow_up.notes = (request.data.get('notes') or '').strip() or None
        if 'follow_type' in request.data:
            if request.data['follow_type'] not in dict(FollowUp.TYPE_CHOICES):
                return api_error('Invalid follow-up type.')
            follow_up.follow_type = request.data['follow_type']
        if 'status' in request.data:
            if request.data['status'] not in dict(FollowUp.STATUS_CHOICES):
                return api_error('Invalid status.')
            follow_up.status = request.data['status']
            follow_up.completed_at = timezone.now() if follow_up.status == 'done' else None

        follow_up.save()
        return api_success({'follow_up': FollowUpSerializer(follow_up).data})

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def destroy(self, request, pk):
        follow_up = FollowUp.objects.select_related('prospect').filter(id=pk).first()
        if not follow_up:
            return not_found('Follow-up')
        if not can_access(request.user, follow_up.prospect.owner_id):
            return forbidden()

        follow_up.delete()
        return api_success({'id': int(pk), 'deleted': True})

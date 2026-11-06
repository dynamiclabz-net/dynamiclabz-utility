from datetime import timedelta

from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework import viewsets

from .serializers import DashboardKpiSerializer

from Attendance.models import Attendance
from Attendance.serializers import AttendanceSerializer
from Client.models import Client, Invoice
from Lead.models import Lead, Meeting
from Lead.serializers import MeetingSerializer
from Prospect.models import Prospect, CallLog, FollowUp
from Prospect.serializers import CallLogSerializer, FollowUpSerializer
from Target.models import Target
from Target.serializers import TargetSerializer
from UserDetail.models import User
from Work.models import Project, Task
from Work.serializers import ProjectSerializer, TaskSerializer

from utils.access import month_bounds, local_day_range
from utils.decorators import handle_exceptions, check_authentication
from utils.metrics import compute_metric
from utils.responses import api_success

ALL_ROLES = ['admin', 'sales', 'dev']


def _kpi(key, label, value, unit='count', hint=''):
    return DashboardKpiSerializer({'key': key, 'label': label, 'value': value, 'unit': unit, 'hint': hint}).data


def _month_range():
    today = timezone.localdate()
    return month_bounds(today.replace(day=1))


def _my_targets(user, month_start):
    targets = Target.objects.filter(user=user, month=month_start).select_related('user')
    return TargetSerializer(targets, many=True).data


def _follow_up_groups(follow_ups):
    today_start, today_end = local_day_range(timezone.localdate())
    pending = follow_ups.filter(status='pending').select_related('prospect', 'assigned_to', 'prospect__owner')
    return {
        'today': FollowUpSerializer(pending.filter(due_at__gte=today_start, due_at__lt=today_end), many=True).data,
        'overdue': FollowUpSerializer(pending.filter(due_at__lt=today_start).order_by('due_at')[:15], many=True).data,
        'upcoming': FollowUpSerializer(pending.filter(due_at__gte=today_end)[:6], many=True).data,
    }


def _admin_dashboard(user, month_start, month_end):
    today = timezone.localdate()
    today_start, today_end = local_day_range(today)

    paid_this_month = Invoice.objects.filter(
        status='paid', paid_on__gte=month_start, paid_on__lt=month_end
    ).aggregate(total=Sum('amount'))['total'] or 0
    outstanding = Invoice.objects.filter(status='sent').aggregate(total=Sum('amount'))['total'] or 0
    overdue_invoices = Invoice.objects.filter(status='sent', due_date__lt=today)
    pipeline_value = Lead.objects.filter(status__in=Lead.OPEN_STATUSES).aggregate(total=Sum('expected_value'))['total'] or 0
    overdue_tasks = Task.objects.exclude(status='done').filter(deadline__lt=today)

    kpis = [
        _kpi('prospects', 'Active prospects', Prospect.objects.filter(active=True).exclude(status__in=['converted', 'not_interested']).count()),
        _kpi('leads', 'Open leads', Lead.objects.filter(status__in=Lead.OPEN_STATUSES).count(), hint=f'{float(pipeline_value):.0f}'),
        _kpi('clients', 'Active clients', Client.objects.filter(active=True, status='active').count()),
        _kpi('projects', 'Projects in flight', Project.objects.exclude(status='completed').count()),
        _kpi('revenue', 'Collected this month', float(paid_this_month), 'currency'),
        _kpi('outstanding', 'Outstanding invoices', float(outstanding), 'currency', hint=f'{overdue_invoices.count()} overdue'),
    ]

    funnel = {
        'prospects': Prospect.objects.filter(active=True).count(),
        'connected': Prospect.objects.filter(active=True, first_connected_at__isnull=False).count(),
        'leads': Lead.objects.count(),
        'proposals': Lead.objects.filter(proposal_submitted_on__isnull=False).count(),
        'clients': Client.objects.filter(active=True).count(),
    }

    team_today = []
    todays = {r.user_id: r for r in Attendance.objects.filter(date=today).select_related('user')}
    for member in User.objects.filter(is_active=True):
        record = todays.get(member.id)
        team_today.append({
            'id': member.id,
            'full_name': member.full_name,
            'role': member.role,
            'status': record.status if record else 'absent',
            'check_in': record.check_in if record else None,
            'check_out': record.check_out if record else None,
            'work_mode': record.work_mode if record else None,
        })

    sales_board = []
    for member in User.objects.filter(is_active=True, role='sales'):
        targets = list(Target.objects.filter(user=member, month=month_start))
        percents = [TargetSerializer(t).data['percent'] for t in targets]
        sales_board.append({
            'id': member.id,
            'full_name': member.full_name,
            'prospects': compute_metric(member, 'prospects_added', month_start, month_end),
            'calls': compute_metric(member, 'calls_made', month_start, month_end),
            'meetings': compute_metric(member, 'meetings_held', month_start, month_end),
            'clients_won': compute_metric(member, 'clients_won', month_start, month_end),
            'revenue': compute_metric(member, 'revenue', month_start, month_end),
            'target_percent': round(sum(percents) / len(percents)) if percents else None,
        })

    dev_board = []
    for member in User.objects.filter(is_active=True, role='dev'):
        dev_board.append({
            'id': member.id,
            'full_name': member.full_name,
            'open_tasks': Task.objects.filter(assigned_to=member).exclude(status='done').count(),
            'overdue_tasks': Task.objects.filter(assigned_to=member, deadline__lt=today).exclude(status='done').count(),
            'completed': compute_metric(member, 'tasks_completed', month_start, month_end),
            'hours': compute_metric(member, 'hours_logged', month_start, month_end),
        })

    deadlines = Project.objects.exclude(status='completed').filter(
        deadline__isnull=False, deadline__lte=today + timedelta(days=21)
    ).select_related('client').prefetch_related('tasks', 'team').order_by('deadline')[:8]

    return {
        'kpis': kpis,
        'funnel': funnel,
        'follow_ups': _follow_up_groups(FollowUp.objects.all()),
        'team_today': team_today,
        'sales_board': sales_board,
        'dev_board': dev_board,
        'deadlines': ProjectSerializer(deadlines, many=True).data,
        'overdue_tasks': TaskSerializer(
            overdue_tasks.select_related('project', 'project__client', 'assigned_to').order_by('deadline')[:8], many=True
        ).data,
        'recent_calls': CallLogSerializer(CallLog.objects.select_related('called_by', 'prospect')[:8], many=True).data,
        'targets': TargetSerializer(Target.objects.filter(month=month_start).select_related('user'), many=True).data,
    }


def _sales_dashboard(user, month_start, month_end):
    today = timezone.localdate()
    my_leads = Lead.objects.filter(owner=user)
    pipeline_value = my_leads.filter(status__in=Lead.OPEN_STATUSES).aggregate(total=Sum('expected_value'))['total'] or 0
    revenue = compute_metric(user, 'revenue', month_start, month_end)

    kpis = [
        _kpi('prospects', 'Active prospects', Prospect.objects.filter(owner=user, active=True).exclude(status__in=['converted', 'not_interested']).count()),
        _kpi('leads', 'Open leads', my_leads.filter(status__in=Lead.OPEN_STATUSES).count(), hint=f'{float(pipeline_value):.0f}'),
        _kpi('clients', 'My clients', Client.objects.filter(owner=user, active=True).count()),
        _kpi('calls', 'Calls this month', compute_metric(user, 'calls_made', month_start, month_end)),
        _kpi('revenue', 'Collected this month', revenue, 'currency'),
    ]

    stage_counts = {row['status']: row['total'] for row in my_leads.values('status').annotate(total=Count('id'))}
    prospect_counts = {
        row['status']: row['total']
        for row in Prospect.objects.filter(owner=user, active=True).values('status').annotate(total=Count('id'))
    }

    upcoming_meetings = Meeting.objects.filter(
        lead__owner=user, scheduled_at__gte=timezone.now() - timedelta(hours=1),
        scheduled_at__lte=timezone.now() + timedelta(days=14),
    ).select_related('lead', 'lead__prospect', 'created_by').order_by('scheduled_at')[:6]

    recent_calls = CallLog.objects.filter(called_by=user).select_related('called_by', 'prospect')[:8]
    my_projects = Project.objects.filter(client__owner=user).exclude(status='completed').select_related('client').prefetch_related('tasks', 'team')[:6]

    return {
        'kpis': kpis,
        'follow_ups': _follow_up_groups(FollowUp.objects.filter(assigned_to=user)),
        'prospect_counts': prospect_counts,
        'lead_counts': stage_counts,
        'upcoming_meetings': [
            {**MeetingSerializer(m).data, 'company_name': m.lead.prospect.company_name, 'lead_title': m.lead.title}
            for m in upcoming_meetings
        ],
        'recent_calls': CallLogSerializer(recent_calls, many=True).data,
        'projects': ProjectSerializer(my_projects, many=True).data,
        'targets': _my_targets(user, month_start),
        'today': today,
    }


def _dev_dashboard(user, month_start, month_end):
    today = timezone.localdate()
    my_tasks = Task.objects.filter(assigned_to=user).select_related('project', 'project__client', 'assigned_to')
    open_tasks = my_tasks.exclude(status='done')

    kpis = [
        _kpi('open', 'Open tasks', open_tasks.count()),
        _kpi('overdue', 'Overdue', open_tasks.filter(deadline__lt=today).count()),
        _kpi('due_soon', 'Due in 3 days', open_tasks.filter(deadline__gte=today, deadline__lte=today + timedelta(days=3)).count()),
        _kpi('done', 'Completed this month', compute_metric(user, 'tasks_completed', month_start, month_end)),
        _kpi('hours', 'Hours this month', compute_metric(user, 'hours_logged', month_start, month_end), 'hours'),
    ]

    status_counts = {row['status']: row['total'] for row in my_tasks.values('status').annotate(total=Count('id'))}
    projects = Project.objects.filter(team=user).exclude(status='completed').select_related('client').prefetch_related('tasks', 'team').distinct()[:6]

    return {
        'kpis': kpis,
        'task_status_counts': status_counts,
        'tasks': TaskSerializer(open_tasks.order_by('deadline')[:10], many=True).data,
        'projects': ProjectSerializer(projects, many=True).data,
        'targets': _my_targets(user, month_start),
    }


class DashboardViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role=ALL_ROLES)
    def list(self, request):
        user = request.user
        month_start, month_end = _month_range()

        builders = {'admin': _admin_dashboard, 'sales': _sales_dashboard, 'dev': _dev_dashboard}
        data = builders[user.role](user, month_start, month_end)

        today_record = Attendance.objects.filter(user=user, date=timezone.localdate()).select_related('user').first()
        data['role'] = user.role
        data['attendance_today'] = AttendanceSerializer(today_record).data if today_record else None
        data['month'] = month_start.strftime('%B %Y')
        return api_success(data)

from django.db.models import Sum

from utils.access import local_day_range

METRICS = {
    'prospects_added': {'label': 'Prospects Added', 'unit': 'count', 'roles': ['sales', 'admin']},
    'calls_made': {'label': 'Calls Made', 'unit': 'count', 'roles': ['sales', 'admin']},
    'calls_connected': {'label': 'Calls Connected', 'unit': 'count', 'roles': ['sales', 'admin']},
    'meetings_held': {'label': 'Meetings Held', 'unit': 'count', 'roles': ['sales', 'admin']},
    'leads_created': {'label': 'Leads Created', 'unit': 'count', 'roles': ['sales', 'admin']},
    'proposals_submitted': {'label': 'Proposals Submitted', 'unit': 'count', 'roles': ['sales', 'admin']},
    'clients_won': {'label': 'Clients Won', 'unit': 'count', 'roles': ['sales', 'admin']},
    'revenue': {'label': 'Revenue Collected', 'unit': 'currency', 'roles': ['sales', 'admin']},
    'tasks_completed': {'label': 'Tasks Completed', 'unit': 'count', 'roles': ['dev', 'admin']},
    'hours_logged': {'label': 'Hours Logged', 'unit': 'hours', 'roles': ['dev', 'sales', 'admin']},
    'days_present': {'label': 'Days Present', 'unit': 'count', 'roles': ['dev', 'sales', 'admin']},
}


def compute_metric(user, metric, start_date, end_date):
    """Actual value of `metric` for `user` within [start_date, end_date)."""
    from Prospect.models import Prospect, CallLog
    from Lead.models import Lead, Meeting
    from Client.models import Client, Invoice
    from Work.models import Task
    from Attendance.models import Attendance

    start_dt, _ = local_day_range(start_date)
    end_dt, _ = local_day_range(end_date)

    if metric == 'prospects_added':
        return Prospect.objects.filter(owner=user, created_at__gte=start_dt, created_at__lt=end_dt).count()
    if metric == 'calls_made':
        return CallLog.objects.filter(called_by=user, called_at__gte=start_dt, called_at__lt=end_dt).count()
    if metric == 'calls_connected':
        return CallLog.objects.filter(called_by=user, connected=True, called_at__gte=start_dt, called_at__lt=end_dt).count()
    if metric == 'meetings_held':
        return Meeting.objects.filter(
            created_by=user, conducted=True, scheduled_at__gte=start_dt, scheduled_at__lt=end_dt
        ).count()
    if metric == 'leads_created':
        return Lead.objects.filter(owner=user, created_at__gte=start_dt, created_at__lt=end_dt).count()
    if metric == 'proposals_submitted':
        return Lead.objects.filter(owner=user, proposal_submitted_on__gte=start_date, proposal_submitted_on__lt=end_date).count()
    if metric == 'clients_won':
        return Client.objects.filter(owner=user, onboarded_on__gte=start_date, onboarded_on__lt=end_date).count()
    if metric == 'revenue':
        total = Invoice.objects.filter(
            client__owner=user, status='paid', paid_on__gte=start_date, paid_on__lt=end_date
        ).aggregate(total=Sum('amount'))['total']
        return float(total or 0)
    if metric == 'tasks_completed':
        return Task.objects.filter(assigned_to=user, status='done', completed_at__gte=start_dt, completed_at__lt=end_dt).count()
    if metric == 'hours_logged':
        records = Attendance.objects.filter(user=user, date__gte=start_date, date__lt=end_date)
        return round(sum(r.hours or 0 for r in records), 1)
    if metric == 'days_present':
        return Attendance.objects.filter(
            user=user, date__gte=start_date, date__lt=end_date, status__in=['present', 'half_day']
        ).count()
    return 0

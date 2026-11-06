from datetime import timedelta

from django.db import IntegrityError
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import viewsets, status

from .models import Attendance
from .serializers import AttendanceSerializer

from UserDetail.models import User

from utils.access import is_admin, parse_month, month_bounds
from utils.decorators import handle_exceptions, check_authentication
from utils.responses import api_success, api_error, not_found, forbidden

ALL_ROLES = ['admin', 'sales', 'dev']


def _summarise(records):
    records = list(records)
    present = [r for r in records if r.status in ('present', 'half_day')]
    hours = [r.hours for r in records if r.hours is not None]
    return {
        'days_present': sum(1 for r in records if r.status == 'present'),
        'half_days': sum(1 for r in records if r.status == 'half_day'),
        'leaves': sum(1 for r in records if r.status == 'leave'),
        'total_hours': round(sum(hours), 2),
        'avg_hours': round(sum(hours) / len(hours), 2) if hours else 0,
        'logged_days': len(present),
    }


def _working_days(first_day, last_day_exclusive):
    """Working days (Mon-Sat) in the month up to today."""
    today = timezone.localdate()
    end = min(last_day_exclusive, today + timedelta(days=1))
    day, count = first_day, 0
    while day < end:
        if day.weekday() != 6:
            count += 1
        day += timedelta(days=1)
    return count


class AttendanceViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role=ALL_ROLES)
    def list(self, request):
        target_user = request.user
        requested_user = request.query_params.get('user')
        if requested_user and is_admin(request.user):
            target_user = User.objects.filter(id=requested_user).first()
            if not target_user:
                return not_found('User')

        today = timezone.localdate()
        today_record = Attendance.objects.filter(user=target_user, date=today).select_related('user').first()

        first_day = parse_month(request.query_params.get('month'))
        start, end = month_bounds(first_day)
        records = Attendance.objects.filter(user=target_user, date__gte=start, date__lt=end).select_related('user')

        data = {
            'today': AttendanceSerializer(today_record).data if today_record else None,
            'records': AttendanceSerializer(records, many=True).data,
            'summary': _summarise(records),
            'working_days': _working_days(start, end),
            'month': first_day.strftime('%Y-%m'),
            'user': {'id': target_user.id, 'full_name': target_user.full_name, 'role': target_user.role},
            'server_time': timezone.now(),
        }
        return api_success(data)

    @handle_exceptions
    @check_authentication(required_role=ALL_ROLES)
    def create(self, request):
        """Check in for today. Admins can also mark attendance for a teammate (e.g. a leave)."""
        target_user = request.user
        day = timezone.localdate()

        if is_admin(request.user) and request.data.get('user') and str(request.data.get('user')) != str(request.user.id):
            target_user = User.objects.filter(id=request.data.get('user')).first()
            if not target_user:
                return not_found('User')
            day = parse_date(str(request.data.get('date') or '')) or day
            record_status = request.data.get('status') or 'leave'
            if record_status not in dict(Attendance.STATUS_CHOICES):
                return api_error('Invalid status.')
            record, created = Attendance.objects.get_or_create(
                user=target_user, date=day, defaults={'status': record_status}
            )
            if not created:
                record.status = record_status
                record.save()
            return api_success({'attendance': AttendanceSerializer(record).data}, status.HTTP_201_CREATED)

        if Attendance.objects.filter(user=target_user, date=day).exists():
            return api_error('You have already checked in today.')

        work_mode = request.data.get('work_mode') or 'office'
        if work_mode not in dict(Attendance.MODE_CHOICES):
            return api_error('Invalid work mode.')

        try:
            record = Attendance.objects.create(
                user=target_user, date=day, check_in=timezone.now(), work_mode=work_mode,
                timesheet=(request.data.get('plan') or '').strip() or None,
            )
        except IntegrityError:
            return api_error('You have already checked in today.')
        return api_success({'attendance': AttendanceSerializer(record).data}, status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role=ALL_ROLES)
    def update(self, request, pk):
        """action=check_out (needs the timesheet) or action=timesheet (edit the work summary)."""
        record = Attendance.objects.select_related('user').filter(id=pk).first()
        if not record:
            return not_found('Attendance record')
        if record.user_id != request.user.id and not is_admin(request.user):
            return forbidden()

        action = request.data.get('action')
        timesheet = (request.data.get('timesheet') or '').strip()

        if action == 'check_out':
            if not record.check_in:
                return api_error('You have not checked in for this day.')
            if record.check_out:
                return api_error('You have already checked out.')
            if not timesheet:
                return api_error('Please add your timesheet (what you worked on today) before checking out.')
            record.check_out = timezone.now()
            record.timesheet = timesheet
            hours = record.hours or 0
            if record.status == 'present' and hours < 4:
                record.status = 'half_day'
        elif action == 'timesheet':
            if not timesheet:
                return api_error('Timesheet cannot be empty.')
            record.timesheet = timesheet
        else:
            return api_error("action must be 'check_out' or 'timesheet'.")

        record.save()
        return api_success({'attendance': AttendanceSerializer(record).data})


class AttendanceReportViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role='admin')
    def list(self, request):
        """Monthly team report: one row per teammate with totals and a per-day map."""
        first_day = parse_month(request.query_params.get('month'))
        start, end = month_bounds(first_day)

        records = Attendance.objects.filter(date__gte=start, date__lt=end).select_related('user')
        by_user = {}
        for record in records:
            by_user.setdefault(record.user_id, []).append(record)

        today = timezone.localdate()
        todays_records = {r.user_id: r for r in Attendance.objects.filter(date=today).select_related('user')}

        team = User.objects.filter(is_active=True)
        if request.query_params.get('exclude_admin') == '1':
            team = team.exclude(role='admin')

        rows = []
        for user in team:
            user_records = by_user.get(user.id, [])
            days = {
                r.date.day: {
                    'status': r.status,
                    'hours': r.hours,
                    'check_in': r.check_in,
                    'check_out': r.check_out,
                    'open': bool(r.check_in and not r.check_out),
                }
                for r in user_records
            }
            today_record = todays_records.get(user.id)
            rows.append({
                'user': {'id': user.id, 'full_name': user.full_name, 'role': user.role, 'designation': user.designation},
                'summary': _summarise(user_records),
                'days': days,
                'today': {
                    'status': today_record.status if today_record else 'absent',
                    'check_in': today_record.check_in if today_record else None,
                    'check_out': today_record.check_out if today_record else None,
                    'work_mode': today_record.work_mode if today_record else None,
                },
            })

        days_in_month = (end - start).days
        data = {
            'month': first_day.strftime('%Y-%m'),
            'days_in_month': days_in_month,
            'working_days': _working_days(start, end),
            'rows': rows,
            'sundays': [d for d in range(1, days_in_month + 1) if (start + timedelta(days=d - 1)).weekday() == 6],
        }
        return api_success(data)

from datetime import date, datetime, timedelta

from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime


def is_admin(user):
    return getattr(user, 'role', None) == 'admin'


def scope_by_owner(queryset, user, field='owner'):
    """Admins see everything, everyone else only the records they own."""
    if is_admin(user):
        return queryset
    return queryset.filter(**{field: user})


def can_access(user, owner_id):
    return is_admin(user) or user.id == owner_id


def parse_month(value):
    """Return the first day of the month for a `YYYY-MM` string (defaults to the current month)."""
    today = timezone.localdate()
    if value:
        try:
            parsed = datetime.strptime(value, '%Y-%m')
            return date(parsed.year, parsed.month, 1)
        except ValueError:
            pass
    return date(today.year, today.month, 1)


def month_bounds(first_day):
    """Return (start, end_exclusive) dates for the month starting at `first_day`."""
    if first_day.month == 12:
        return first_day, date(first_day.year + 1, 1, 1)
    return first_day, date(first_day.year, first_day.month + 1, 1)


def parse_dt(value):
    """Parse an ISO date-time (naive values are treated as local time). Returns None on failure."""
    if not value:
        return None
    parsed = parse_datetime(str(value))
    if parsed is None:
        day = parse_date(str(value))
        if day is None:
            return None
        parsed = datetime.combine(day, datetime.min.time())
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed)
    return parsed


def local_day_range(day):
    """Aware datetime range [start, end) for a local calendar day."""
    start = timezone.make_aware(datetime.combine(day, datetime.min.time()))
    return start, start + timedelta(days=1)

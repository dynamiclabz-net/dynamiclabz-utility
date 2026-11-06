from decimal import Decimal, InvalidOperation

from rest_framework import viewsets, status

from .models import Target
from .serializers import TargetSerializer

from UserDetail.models import User

from utils.access import is_admin, parse_month
from utils.decorators import handle_exceptions, check_authentication
from utils.metrics import METRICS
from utils.responses import api_success, api_error, not_found

ALL_ROLES = ['admin', 'sales', 'dev']


def _decimal(value):
    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError):
        return None
    return number if number > 0 else None


class TargetViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role=ALL_ROLES)
    def list(self, request):
        month = parse_month(request.query_params.get('month'))
        targets = Target.objects.filter(month=month).select_related('user')

        if is_admin(request.user):
            user_id = request.query_params.get('user')
            if user_id:
                targets = targets.filter(user_id=user_id)
        else:
            targets = targets.filter(user=request.user)

        metrics = [{'key': key, **value} for key, value in METRICS.items()]
        return api_success({
            'month': month.strftime('%Y-%m'),
            'targets': TargetSerializer(targets, many=True).data,
            'metrics': metrics,
        })

    @handle_exceptions
    @check_authentication(required_role='admin')
    def create(self, request):
        """Sets (or updates) a monthly target. Pass copy_from_month to clone all targets from another month."""
        month = parse_month(request.data.get('month'))

        copy_from = request.data.get('copy_from_month')
        if copy_from:
            source = parse_month(copy_from)
            copied = 0
            for target in Target.objects.filter(month=source, user__is_active=True):
                _, created = Target.objects.get_or_create(
                    user=target.user, month=month, metric=target.metric,
                    defaults={'target_value': target.target_value, 'note': target.note, 'set_by': request.user},
                )
                copied += int(created)
            return api_success({'copied': copied}, status.HTTP_201_CREATED)

        user = User.objects.filter(id=request.data.get('user'), is_active=True).first()
        if not user:
            return not_found('User')
        metric = request.data.get('metric')
        if metric not in METRICS:
            return api_error('Invalid metric.')
        target_value = _decimal(request.data.get('target_value'))
        if target_value is None:
            return api_error('Target value must be a number greater than zero.')

        target, created = Target.objects.update_or_create(
            user=user, month=month, metric=metric,
            defaults={
                'target_value': target_value,
                'note': (request.data.get('note') or '').strip() or None,
                'set_by': request.user,
            },
        )
        return api_success({'target': TargetSerializer(target).data}, status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication(required_role='admin')
    def update(self, request, pk):
        target = Target.objects.select_related('user').filter(id=pk).first()
        if not target:
            return not_found('Target')

        if 'target_value' in request.data:
            target_value = _decimal(request.data.get('target_value'))
            if target_value is None:
                return api_error('Target value must be a number greater than zero.')
            target.target_value = target_value
        if 'note' in request.data:
            target.note = (request.data.get('note') or '').strip() or None

        target.set_by = request.user
        target.save()
        return api_success({'target': TargetSerializer(target).data})

    @handle_exceptions
    @check_authentication(required_role='admin')
    def destroy(self, request, pk):
        target = Target.objects.filter(id=pk).first()
        if not target:
            return not_found('Target')

        target.delete()
        return api_success({'id': int(pk), 'deleted': True})

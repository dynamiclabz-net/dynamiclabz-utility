from rest_framework import viewsets

from django.shortcuts import render, redirect

from utils.decorators import handle_exceptions

from functools import wraps


def check_authentication(required_role=None):
    '''Checks if user is logged in or not (redirects to the login page when not).
    If required_role is passed (as str or list), users with another role are sent back to their dashboard.'''
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(self, request, *args, **kwargs):
            user = request.user
            if not user.is_authenticated:
                return redirect('fe-login-list')

            if required_role:
                allowed_roles = required_role if isinstance(required_role, (list, tuple, set)) else [required_role]

                if getattr(user, "role", None) not in allowed_roles:
                    return redirect('fe-dashboard-list')

            return view_func(self, request, *args, **kwargs)

        return _wrapped_view
    return decorator


SALES_ROLES = ['admin', 'sales']


def safe_id(pk):
    """Detail ids are echoed into inline JS, so only plain integers are allowed through."""
    return int(pk) if str(pk).isdigit() else 0


class AppViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication()
    def list(self, request):
        return redirect("fe-dashboard-list")


class LoginViewSet(viewsets.ViewSet):

    @handle_exceptions
    def list(self, request):
        if request.user.is_authenticated:
            return redirect('fe-dashboard-list')
        return render(request, 'login.html')


class DashboardViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication()
    def list(self, request):
        return render(request, 'dashboard.html')


class ProspectsViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def list(self, request):
        return render(request, 'prospects.html')


class ProspectDetailViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def retrieve(self, request, pk):
        return render(request, 'prospect-detail.html', {"prospect_id": safe_id(pk)})


class FollowUpsViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def list(self, request):
        return render(request, 'follow-ups.html')


class LeadsViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def list(self, request):
        return render(request, 'leads.html')


class LeadDetailViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def retrieve(self, request, pk):
        return render(request, 'lead-detail.html', {"lead_id": safe_id(pk)})


class ClientsViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication()
    def list(self, request):
        return render(request, 'clients.html')


class ClientDetailViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication()
    def retrieve(self, request, pk):
        return render(request, 'client-detail.html', {"client_id": safe_id(pk)})


class InvoicesViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def list(self, request):
        return render(request, 'invoices.html')


class TasksViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication()
    def list(self, request):
        return render(request, 'tasks.html')


class AttendanceViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication()
    def list(self, request):
        return render(request, 'attendance.html')


class TargetsViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication()
    def list(self, request):
        return render(request, 'targets.html')


class TeamViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role='admin')
    def list(self, request):
        return render(request, 'team.html')


class ProfileViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication()
    def list(self, request):
        return render(request, 'profile.html')

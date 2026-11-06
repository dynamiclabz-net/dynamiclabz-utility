from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db.models import Q
from rest_framework import viewsets, status

from .models import User
from .serializers import UserSerializer, TeamMemberSerializer

from utils.decorators import handle_exceptions, check_authentication
from utils.responses import api_success, api_error, not_found


def _clean(value):
    return value.strip() if isinstance(value, str) else value


class AuthViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication()
    def list(self, request):
        """Returns the logged in user."""
        return api_success({'user': UserSerializer(request.user).data})

    @handle_exceptions
    def create(self, request):
        """Login with email and password."""
        email = (_clean(request.data.get('email')) or '').lower()
        password = request.data.get('password')
        if not email or not password:
            return api_error('Email and password are required.')

        user = authenticate(request, email=email, password=password)
        if user is None:
            return api_error('Invalid email or password.', status.HTTP_401_UNAUTHORIZED)
        if not user.is_active:
            return api_error('This account has been deactivated. Contact your admin.', status.HTTP_403_FORBIDDEN)

        login(request, user)
        return api_success({'role': user.role, 'user': UserSerializer(user).data})


class LogoutViewSet(viewsets.ViewSet):

    @handle_exceptions
    def create(self, request):
        logout(request)
        return api_success({'logged_out': True})


class UsersViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication()
    def list(self, request):
        """Admin gets full records, everyone else gets the minimal team directory."""
        users = User.objects.all()

        include_inactive = request.query_params.get('include_inactive') == '1'
        if request.user.role != 'admin' or not include_inactive:
            users = users.filter(is_active=True)

        role = request.query_params.get('role')
        if role:
            users = users.filter(role__in=role.split(','))

        search = request.query_params.get('search')
        if search:
            users = users.filter(
                Q(first_name__icontains=search) | Q(last_name__icontains=search) | Q(email__icontains=search)
            )

        serializer_class = UserSerializer if request.user.role == 'admin' else TeamMemberSerializer
        return api_success({'users': serializer_class(users, many=True).data})

    @handle_exceptions
    @check_authentication(required_role='admin')
    def create(self, request):
        email = (_clean(request.data.get('email')) or '').lower()
        password = request.data.get('password')
        first_name = _clean(request.data.get('first_name'))
        role = request.data.get('role')

        if not email or not password or not first_name or not role:
            return api_error('first_name, email, password and role are required.')
        if role not in dict(User.ROLE_CHOICES):
            return api_error('Invalid role.')
        if User.objects.filter(email__iexact=email).exists():
            return api_error('A user with this email already exists.')
        try:
            validate_password(password)
        except ValidationError as err:
            return api_error(' '.join(err.messages))

        user = User.objects.create_user(
            email=email, password=password, first_name=first_name,
            last_name=_clean(request.data.get('last_name')) or '',
            role=role,
            contact_number=_clean(request.data.get('contact_number')) or None,
            designation=_clean(request.data.get('designation')) or None,
            date_of_joining=request.data.get('date_of_joining') or None,
            is_staff=(role == 'admin'),
        )
        return api_success({'user': UserSerializer(user).data}, status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role='admin')
    def update(self, request, pk):
        user = User.objects.filter(id=pk).first()
        if not user:
            return not_found('User')

        for field in ['first_name', 'last_name', 'contact_number', 'designation']:
            if field in request.data:
                setattr(user, field, _clean(request.data.get(field)) or (None if field in ('contact_number', 'designation') else ''))

        if 'date_of_joining' in request.data:
            user.date_of_joining = request.data.get('date_of_joining') or None

        if 'email' in request.data:
            email = (_clean(request.data.get('email')) or '').lower()
            if not email:
                return api_error('Email cannot be empty.')
            if User.objects.filter(email__iexact=email).exclude(id=user.id).exists():
                return api_error('A user with this email already exists.')
            user.email = email

        if 'role' in request.data:
            if request.data['role'] not in dict(User.ROLE_CHOICES):
                return api_error('Invalid role.')
            if user.id == request.user.id and request.data['role'] != 'admin':
                return api_error('You cannot remove your own admin access.')
            user.role = request.data['role']
            user.is_staff = user.role == 'admin'

        if 'is_active' in request.data:
            is_active = request.data['is_active'] in (True, 'true', 'True', '1', 1)
            if user.id == request.user.id and not is_active:
                return api_error('You cannot deactivate your own account.')
            user.is_active = is_active

        new_password = request.data.get('password')
        if new_password:
            try:
                validate_password(new_password, user)
            except ValidationError as err:
                return api_error(' '.join(err.messages))
            user.set_password(new_password)

        user.save()
        return api_success({'user': UserSerializer(user).data})

    @handle_exceptions
    @check_authentication(required_role='admin')
    def destroy(self, request, pk):
        """Deactivates a user (history is preserved)."""
        user = User.objects.filter(id=pk).first()
        if not user:
            return not_found('User')
        if user.id == request.user.id:
            return api_error('You cannot deactivate your own account.')

        user.is_active = False
        user.save(update_fields=['is_active'])
        return api_success({'id': user.id, 'deactivated': True})


class ProfileViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication()
    def list(self, request):
        return api_success({'user': UserSerializer(request.user).data})

    @handle_exceptions
    @check_authentication()
    def create(self, request):
        """Update own profile details (multipart supported for the profile image)."""
        user = request.user
        for field in ['first_name', 'last_name', 'contact_number', 'designation']:
            if field in request.data:
                setattr(user, field, _clean(request.data.get(field)) or (None if field in ('contact_number', 'designation') else ''))

        if not user.first_name:
            return api_error('First name is required.')

        image = request.FILES.get('profile_image')
        if image:
            if not (image.content_type or '').startswith('image/'):
                return api_error('Profile image must be an image file.')
            user.profile_image = image

        user.save()
        return api_success({'user': UserSerializer(user).data})


class ChangePasswordViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication()
    def create(self, request):
        current_password = request.data.get('current_password')
        new_password = request.data.get('new_password')
        if not current_password or not new_password:
            return api_error('current_password and new_password are required.')
        if not request.user.check_password(current_password):
            return api_error('Current password is incorrect.')
        try:
            validate_password(new_password, request.user)
        except ValidationError as err:
            return api_error(' '.join(err.messages))

        request.user.set_password(new_password)
        request.user.save()
        login(request, request.user)
        return api_success({'password_changed': True})

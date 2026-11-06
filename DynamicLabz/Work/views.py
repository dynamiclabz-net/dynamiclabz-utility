from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import viewsets, status

from .models import Project, Task
from .serializers import ProjectSerializer, TaskSerializer

from Client.models import Client
from UserDetail.models import User

from utils.access import is_admin
from utils.decorators import handle_exceptions, check_authentication
from utils.responses import api_success, api_error, not_found, forbidden

ALL_ROLES = ['admin', 'sales', 'dev']
SALES_ROLES = ['admin', 'sales']


def _projects_for(user):
    projects = Project.objects.select_related('client', 'client__owner').prefetch_related('tasks', 'team')
    if is_admin(user):
        return projects
    if user.role == 'sales':
        return projects.filter(client__owner=user)
    return projects.filter(team=user).distinct()


def _tasks_for(user):
    tasks = Task.objects.select_related('project', 'project__client', 'assigned_to')
    if is_admin(user):
        return tasks
    if user.role == 'sales':
        return tasks.filter(project__client__owner=user)
    return tasks.filter(Q(assigned_to=user) | Q(project__team=user)).distinct()


def _can_manage(user, project):
    return is_admin(user) or project.client.owner_id == user.id


def _parse_optional_date(value):
    if not value:
        return None, None
    parsed = parse_date(str(value))
    return (parsed, None) if parsed else (None, 'Invalid date.')


class ProjectViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role=ALL_ROLES)
    def list(self, request):
        projects = _projects_for(request.user)

        project_id = request.query_params.get('id')
        if project_id:
            project = projects.filter(id=project_id).first()
            if not project:
                return not_found('Project')
            tasks = _tasks_for(request.user).filter(project=project)
            return api_success({
                'project': ProjectSerializer(project).data,
                'tasks': TaskSerializer(tasks, many=True).data,
            })

        client_id = request.query_params.get('client')
        if client_id:
            projects = projects.filter(client_id=client_id)

        status_filter = request.query_params.get('status')
        if status_filter == 'open':
            projects = projects.exclude(status='completed')
        elif status_filter:
            projects = projects.filter(status=status_filter)

        return api_success({'projects': ProjectSerializer(projects, many=True).data})

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def create(self, request):
        client = Client.objects.filter(id=request.data.get('client'), active=True).first()
        if not client:
            return not_found('Client')
        if not (is_admin(request.user) or client.owner_id == request.user.id):
            return forbidden()

        name = (request.data.get('name') or '').strip()
        if not name:
            return api_error('Project name is required.')

        project_type = request.data.get('project_type') or 'web'
        if project_type not in dict(Project.TYPE_CHOICES):
            return api_error('Invalid project type.')
        project_status = request.data.get('status') or 'planning'
        if project_status not in dict(Project.STATUS_CHOICES):
            return api_error('Invalid project status.')

        start_date, err1 = _parse_optional_date(request.data.get('start_date'))
        deadline, err2 = _parse_optional_date(request.data.get('deadline'))
        if err1 or err2:
            return api_error('Start date or deadline is invalid.')
        if start_date and deadline and deadline < start_date:
            return api_error('Deadline cannot be before the start date.')

        try:
            budget = Decimal(str(request.data['budget'])) if request.data.get('budget') not in (None, '') else None
        except InvalidOperation:
            return api_error('Budget must be a number.')

        project = Project.objects.create(
            client=client, name=name, project_type=project_type, status=project_status,
            description=(request.data.get('description') or '').strip() or None,
            start_date=start_date, deadline=deadline, budget=budget, created_by=request.user,
        )

        team_ids = request.data.get('team') or []
        if isinstance(team_ids, (list, tuple)) and team_ids:
            project.team.set(User.objects.filter(id__in=team_ids, is_active=True))

        project = _projects_for(request.user).get(id=project.id)
        return api_success({'project': ProjectSerializer(project).data}, status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def update(self, request, pk):
        project = _projects_for(request.user).filter(id=pk).first()
        if not project:
            return not_found('Project')
        if not _can_manage(request.user, project):
            return forbidden()

        if 'name' in request.data:
            name = (request.data.get('name') or '').strip()
            if not name:
                return api_error('Project name cannot be empty.')
            project.name = name
        if 'description' in request.data:
            project.description = (request.data.get('description') or '').strip() or None
        if 'project_type' in request.data:
            if request.data['project_type'] not in dict(Project.TYPE_CHOICES):
                return api_error('Invalid project type.')
            project.project_type = request.data['project_type']
        if 'status' in request.data:
            if request.data['status'] not in dict(Project.STATUS_CHOICES):
                return api_error('Invalid project status.')
            project.status = request.data['status']
        for field in ['start_date', 'deadline']:
            if field in request.data:
                parsed, err = _parse_optional_date(request.data.get(field))
                if err:
                    return api_error(f'{field} is invalid.')
                setattr(project, field, parsed)
        if project.start_date and project.deadline and project.deadline < project.start_date:
            return api_error('Deadline cannot be before the start date.')
        if 'budget' in request.data:
            try:
                project.budget = Decimal(str(request.data['budget'])) if request.data['budget'] not in (None, '') else None
            except InvalidOperation:
                return api_error('Budget must be a number.')

        project.save()
        if 'team' in request.data and isinstance(request.data['team'], (list, tuple)):
            project.team.set(User.objects.filter(id__in=request.data['team'], is_active=True))

        project = _projects_for(request.user).get(id=project.id)
        return api_success({'project': ProjectSerializer(project).data})

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def destroy(self, request, pk):
        project = _projects_for(request.user).filter(id=pk).first()
        if not project:
            return not_found('Project')
        if not _can_manage(request.user, project):
            return forbidden()

        project.delete()
        return api_success({'id': int(pk), 'deleted': True})


class TaskViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role=ALL_ROLES)
    def list(self, request):
        base = _tasks_for(request.user)
        tasks = base

        project_id = request.query_params.get('project')
        if project_id:
            tasks = tasks.filter(project_id=project_id)

        client_id = request.query_params.get('client')
        if client_id:
            tasks = tasks.filter(project__client_id=client_id)

        assigned_to = request.query_params.get('assigned_to')
        if assigned_to == 'me':
            tasks = tasks.filter(assigned_to=request.user)
        elif assigned_to:
            tasks = tasks.filter(assigned_to_id=assigned_to)

        priority = request.query_params.get('priority')
        if priority:
            tasks = tasks.filter(priority=priority)

        search = request.query_params.get('search')
        if search:
            tasks = tasks.filter(Q(title__icontains=search) | Q(project__name__icontains=search))

        today = timezone.localdate()
        scope = request.query_params.get('scope')
        if scope == 'open':
            tasks = tasks.exclude(status='done')
        elif scope == 'overdue':
            tasks = tasks.exclude(status='done').filter(deadline__lt=today)
        elif scope == 'due_soon':
            tasks = tasks.exclude(status='done').filter(deadline__gte=today, deadline__lte=today + timedelta(days=3))

        status_filter = request.query_params.get('status')
        if status_filter:
            tasks = tasks.filter(status=status_filter)

        counts_source = base
        if assigned_to == 'me':
            counts_source = counts_source.filter(assigned_to=request.user)
        counts = {
            'total': counts_source.count(),
            'open': counts_source.exclude(status='done').count(),
            'overdue': counts_source.exclude(status='done').filter(deadline__lt=today).count(),
            'done': counts_source.filter(status='done').count(),
        }

        return api_success({'tasks': TaskSerializer(tasks[:500], many=True).data, 'counts': counts})

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def create(self, request):
        project = _projects_for(request.user).filter(id=request.data.get('project')).first()
        if not project:
            return not_found('Project')
        if not _can_manage(request.user, project):
            return forbidden()

        title = (request.data.get('title') or '').strip()
        if not title:
            return api_error('Task title is required.')

        priority = request.data.get('priority') or 'medium'
        task_status = request.data.get('status') or 'todo'
        if priority not in dict(Task.PRIORITY_CHOICES):
            return api_error('Invalid priority.')
        if task_status not in dict(Task.STATUS_CHOICES):
            return api_error('Invalid status.')

        deadline, err = _parse_optional_date(request.data.get('deadline'))
        if err:
            return api_error('Deadline is invalid.')

        assignee = None
        if request.data.get('assigned_to'):
            assignee = User.objects.filter(id=request.data.get('assigned_to'), is_active=True).first()
            if not assignee:
                return not_found('Assignee')

        task = Task.objects.create(
            project=project, title=title, priority=priority, status=task_status, deadline=deadline,
            description=(request.data.get('description') or '').strip() or None,
            assigned_to=assignee, created_by=request.user,
            completed_at=timezone.now() if task_status == 'done' else None,
        )
        if assignee:
            project.team.add(assignee)

        return api_success({'task': TaskSerializer(task).data}, status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role=ALL_ROLES)
    def update(self, request, pk):
        task = _tasks_for(request.user).filter(id=pk).first()
        if not task:
            return not_found('Task')

        manager = _can_manage(request.user, task.project)
        if not manager and task.assigned_to_id != request.user.id:
            return forbidden('You can only update tasks assigned to you.')

        if 'status' in request.data:
            if request.data['status'] not in dict(Task.STATUS_CHOICES):
                return api_error('Invalid status.')
            task.status = request.data['status']
            task.completed_at = timezone.now() if task.status == 'done' else None

        if manager:
            if 'title' in request.data:
                title = (request.data.get('title') or '').strip()
                if not title:
                    return api_error('Task title cannot be empty.')
                task.title = title
            if 'description' in request.data:
                task.description = (request.data.get('description') or '').strip() or None
            if 'priority' in request.data:
                if request.data['priority'] not in dict(Task.PRIORITY_CHOICES):
                    return api_error('Invalid priority.')
                task.priority = request.data['priority']
            if 'deadline' in request.data:
                deadline, err = _parse_optional_date(request.data.get('deadline'))
                if err:
                    return api_error('Deadline is invalid.')
                task.deadline = deadline
            if 'assigned_to' in request.data:
                if request.data['assigned_to']:
                    assignee = User.objects.filter(id=request.data['assigned_to'], is_active=True).first()
                    if not assignee:
                        return not_found('Assignee')
                    task.assigned_to = assignee
                    task.project.team.add(assignee)
                else:
                    task.assigned_to = None

        task.save()
        return api_success({'task': TaskSerializer(task).data})

    @handle_exceptions
    @check_authentication(required_role=SALES_ROLES)
    def destroy(self, request, pk):
        task = _tasks_for(request.user).filter(id=pk).first()
        if not task:
            return not_found('Task')
        if not _can_manage(request.user, task.project):
            return forbidden()

        task.delete()
        return api_success({'id': int(pk), 'deleted': True})

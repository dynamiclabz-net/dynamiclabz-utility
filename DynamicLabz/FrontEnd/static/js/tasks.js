let _csrf = null;
let _urlTask = null;
let _urlProject = null;
let _userId = null;
let _role = null;
let _tasks = [];
let _projects = [];
const taskState = { scope: 'open', search: '', assignee: '', priority: '' };

function TasksInit(csrf, urlTask, urlProject, urlUsers, userId, role) {
    _csrf = csrf;
    _urlTask = urlTask;
    _urlProject = urlProject;
    _userId = userId;
    _role = role;
    DL.csrf = csrf;
    taskState.assignee = role === 'dev' ? 'me' : '';

    TaskModalInit({ task: urlTask, users: urlUsers }, () => loadTasks());

    document.getElementById('flt-search').addEventListener('input', debounce(e => { taskState.search = e.target.value.trim(); loadTasks(); }, 300));
    setupSegmented('flt-scope', value => { taskState.scope = value; loadTasks(); });
    document.getElementById('flt-priority').addEventListener('change', e => { taskState.priority = e.target.value; loadTasks(); });

    const assigneeSelect = document.getElementById('flt-assignee');
    assigneeSelect.addEventListener('change', e => { taskState.assignee = e.target.value; loadTasks(); });
    api('GET', `${urlUsers}?role=dev,sales,admin`).then(res => {
        const people = res.ok ? res.data.users : [];
        const options = [{ id: '', full_name: 'Everyone' }, { id: 'me', full_name: 'Assigned to me' }, ...people.map(u => ({ id: u.id, full_name: u.full_name }))];
        fillSelect(assigneeSelect, options, { selected: taskState.assignee });
    });

    const addButton = document.getElementById('btn-add-task');
    if (addButton) {
        addButton.addEventListener('click', async () => {
            if (!_projects.length) {
                const res = await api('GET', `${_urlProject}?status=open`);
                if (res.ok) _projects = res.data.projects;
            }
            if (!_projects.length) { toast('Create a client project first to add tasks.', 'error'); return; }
            openTaskModal({ projects: _projects });
        });
    }

    const rows = document.getElementById('task-rows');
    rows.addEventListener('change', onStatusChange);
    rows.addEventListener('click', onRowClick);
    loadTasks();
}

async function loadTasks() {
    const scope = ['open', 'overdue', 'due_soon'].includes(taskState.scope) ? taskState.scope : '';
    const query = toQueryString({
        scope, status: taskState.scope === 'done' ? 'done' : '', search: taskState.search,
        assigned_to: taskState.assignee, priority: taskState.priority,
    });
    const res = await api('GET', `${_urlTask}?${query}`);
    const body = document.getElementById('task-rows');
    const cols = _role === 'dev' ? 5 : 6;
    if (!res.ok) {
        body.innerHTML = `<tr><td colspan="${cols}">${emptyState('bi-exclamation-triangle', 'Could not load tasks', res.error)}</td></tr>`;
        return;
    }
    _tasks = res.data.tasks;
    renderKpis(res.data.counts);

    if (!_tasks.length) {
        body.innerHTML = `<tr><td colspan="${cols}">${emptyState('bi-check2-square', 'No tasks here', taskState.scope === 'open' ? 'Nothing open right now.' : 'Try another filter.')}</td></tr>`;
        return;
    }
    body.innerHTML = _tasks.map(rowHtml).join('');
}

function renderKpis(counts) {
    const tiles = [
        ['Open', counts.open, 'bi-list-task', ''],
        ['Overdue', counts.overdue, 'bi-exclamation-triangle', counts.overdue ? 'bad' : ''],
        ['Completed', counts.done, 'bi-check2-circle', ''],
        ['Total', counts.total, 'bi-collection', ''],
    ];
    document.getElementById('task-kpis').innerHTML = tiles.map(([label, value, icon, tone]) => `
      <div class="col-6 col-lg-3"><div class="dl-card stat"><span class="ico"><i class="bi ${icon}"></i></span><span class="label">${label}</span><span class="value ${tone === 'bad' ? 'text-danger' : ''}">${value}</span></div></div>`).join('');
}

function rowHtml(t) {
    const manage = _role !== 'dev';
    const canUpdate = manage || t.assigned_to === _userId;
    const deadlineTone = t.status === 'done' ? '' : t.is_overdue ? 'text-danger fw-600' : t.days_left !== null && t.days_left <= 2 ? 'text-warning fw-600' : '';
    return `<tr data-id="${t.id}">
        <td><span class="cell-title">${esc(t.title)}</span><span class="cell-sub"><a class="text-muted" href="${pageUrl('client', t.client_id)}">${esc(t.project_name)} &middot; ${esc(t.client_name)}</a></span></td>
        <td>${t.assigned_to_name ? `<span class="d-flex align-items-center gap-2">${avatar(t.assigned_to_name, 'sm')}<span>${esc(t.assigned_to_name)}</span></span>` : '<span class="text-muted">Unassigned</span>'}</td>
        <td>${toneBadge('priority', t.priority, t.priority_display)}</td>
        <td class="${deadlineTone}">${t.deadline ? `${esc(fmtDate(t.deadline))}<span class="cell-sub ${deadlineTone}">${esc(t.status === 'done' ? 'Completed' : daysLabel(t.days_left))}</span>` : '<span class="text-muted">None</span>'}</td>
        <td>${taskStatusSelect(t, canUpdate)}</td>
        ${manage ? `<td class="text-end text-nowrap">
          <button class="btn btn-sm btn-ghost btn-icon" data-edit="${t.id}" aria-label="Edit task"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-ghost btn-icon" data-del="${t.id}" aria-label="Delete task"><i class="bi bi-trash"></i></button></td>` : ''}
      </tr>`;
}

async function onStatusChange(e) {
    const select = e.target.closest('[data-task-status]');
    if (!select) return;
    const ok = await updateTaskStatus(_urlTask, select.dataset.taskStatus, select.value);
    loadTasks();
    if (!ok) return;
}

async function onRowClick(e) {
    const edit = e.target.closest('[data-edit]');
    if (edit) {
        const task = _tasks.find(t => t.id === Number(edit.dataset.edit));
        openTaskModal({ task });
        return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
        const ok = await confirmAction({ title: 'Delete this task?', message: 'This cannot be undone.', confirmText: 'Delete', danger: true });
        if (!ok) return;
        const res = await api('DELETE', withId(_urlTask, del.dataset.del));
        if (!res.ok) { toast(res.error, 'error'); return; }
        toast('Task deleted');
        loadTasks();
    }
}

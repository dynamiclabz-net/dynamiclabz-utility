/* Create / edit task modal shared by the Tasks and Client detail pages. */

const TM = { urlTask: '', urlUsers: '', onSaved: () => {}, editId: null, projectId: null, users: [] };

function TaskModalInit(urls, onSaved) {
    TM.urlTask = urls.task;
    TM.urlUsers = urls.users;
    TM.onSaved = onSaved || (() => {});
    document.getElementById('taskForm').addEventListener('submit', e => { e.preventDefault(); saveTask(); });
}

async function openTaskModal({ task = null, projectId = null, projects = [] } = {}) {
    TM.editId = task ? task.id : null;
    TM.projectId = task ? task.project : projectId;
    document.getElementById('taskModalTitle').textContent = task ? 'Edit task' : 'Add task';
    showFormError('tk-error', '');

    if (!TM.users.length) {
        const res = await api('GET', TM.urlUsers);
        if (res.ok) TM.users = res.data.users;
    }
    const roleOrder = { dev: 0, sales: 1, admin: 2 };
    const sorted = [...TM.users].sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
    fillSelect('tk-assignee', sorted, { label: u => `${u.full_name} (${u.role_display})`, placeholder: 'Unassigned' });

    const projectWrap = document.getElementById('tk-project-wrap');
    const needsProject = !TM.projectId;
    projectWrap.classList.toggle('d-none', !needsProject);
    if (needsProject) fillSelect('tk-project', projects, { label: p => `${p.name} - ${p.client_name}`, placeholder: 'Choose a project' });

    document.getElementById('tk-title').value = task?.title || '';
    document.getElementById('tk-desc').value = task?.description || '';
    document.getElementById('tk-assignee').value = task?.assigned_to || '';
    document.getElementById('tk-deadline').value = task?.deadline || '';
    document.getElementById('tk-priority').value = task?.priority || 'medium';
    document.getElementById('tk-status').value = task?.status || 'todo';
    modalShow('taskModal');
}

async function saveTask() {
    const title = document.getElementById('tk-title').value.trim();
    const project = TM.projectId || document.getElementById('tk-project').value;
    if (!project) { showFormError('tk-error', 'Choose a project for this task.'); return; }
    if (!title) { showFormError('tk-error', 'Task title is required.'); return; }

    const payload = {
        title,
        description: document.getElementById('tk-desc').value,
        assigned_to: document.getElementById('tk-assignee').value,
        deadline: document.getElementById('tk-deadline').value,
        priority: document.getElementById('tk-priority').value,
        status: document.getElementById('tk-status').value,
    };
    const button = document.getElementById('tk-save');
    setBusy(button, true);
    const res = TM.editId ? await api('PUT', withId(TM.urlTask, TM.editId), payload) : await api('POST', TM.urlTask, { ...payload, project });
    setBusy(button, false);
    if (!res.ok) { showFormError('tk-error', res.error); return; }
    modalHide('taskModal');
    toast(TM.editId ? 'Task updated' : 'Task added');
    TM.onSaved(res.data.task);
}

async function updateTaskStatus(url, id, status) {
    const res = await api('PUT', withId(url, id), { status });
    if (!res.ok) { toast(res.error, 'error'); return false; }
    toast(status === 'done' ? 'Task completed' : 'Status updated');
    return true;
}

function taskStatusSelect(task, enabled) {
    const options = [['todo', 'To do'], ['in_progress', 'In progress'], ['review', 'In review'], ['blocked', 'Blocked'], ['done', 'Done']];
    return `<select class="form-select form-select-sm" data-task-status="${task.id}" aria-label="Status for ${esc(task.title)}" style="min-width:128px" ${enabled ? '' : 'disabled'}>
        ${options.map(([v, l]) => `<option value="${v}" ${task.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
}

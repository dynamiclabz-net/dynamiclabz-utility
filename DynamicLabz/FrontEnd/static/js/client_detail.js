let _csrf = null;
const CD = { id: null, urls: {}, data: null, tab: 'work', userId: null, role: '', devs: [], editProjectId: null, editInvoiceId: null };

const DOC_ICON = { contract: 'bi-file-earmark-text', sow: 'bi-list-check', nda: 'bi-shield-lock', credentials: 'bi-key', design: 'bi-palette', other: 'bi-file-earmark' };

function ClientDetailInit(csrf, clientId, urls, userId, role) {
    _csrf = csrf;
    CD.id = clientId;
    CD.urls = urls;
    CD.userId = userId;
    CD.role = role;
    DL.csrf = csrf;

    TaskModalInit({ task: urls.task, users: urls.users }, () => loadClient());

    if (role !== 'dev') {
        document.getElementById('clientEditForm').addEventListener('submit', e => { e.preventDefault(); saveClientEdit(); });
        document.getElementById('projectForm').addEventListener('submit', e => { e.preventDefault(); saveProject(); });
        document.getElementById('invoiceForm').addEventListener('submit', e => { e.preventDefault(); saveInvoice(); });
        document.getElementById('docForm').addEventListener('submit', e => { e.preventDefault(); saveDocument(); });
    }
    const root = document.getElementById('detail-root');
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    loadClient();
}

async function loadClient() {
    const res = await api('GET', `${CD.urls.client}?id=${CD.id}`);
    const root = document.getElementById('detail-root');
    if (!res.ok) {
        root.innerHTML = emptyState('bi-exclamation-triangle', 'Client not available', res.error);
        return;
    }
    CD.data = res.data;
    document.title = `${CD.data.client.company_name} - Dynamic Labz`;
    render();
}

function render() {
    const { client, projects, tasks, can_manage: manage } = CD.data;
    const dev = CD.role === 'dev';
    const openTasks = tasks.filter(t => t.status !== 'done');
    const finance = CD.data.finance;

    const tiles = dev
        ? [['Projects', projects.length, 'bi-kanban'], ['Open tasks', openTasks.length, 'bi-list-task'], ['Overdue', openTasks.filter(t => t.is_overdue).length, 'bi-exclamation-triangle']]
        : [['Projects', projects.length, 'bi-kanban'], ['Open tasks', openTasks.length, 'bi-list-task'], ['Billed', fmtMoney(finance.billed), 'bi-receipt'], ['Outstanding', fmtMoney(finance.outstanding), 'bi-hourglass-split', finance.overdue ? `${fmtMoney(finance.overdue)} overdue` : '']];

    const tabs = dev ? [['work', 'Work']] : [['work', `Work (${projects.length})`], ['invoices', `Invoices (${CD.data.invoices.length})`], ['documents', `Documents (${CD.data.documents.length})`], ['details', 'Details and journey']];
    const panels = { work: workHtml, invoices: invoicesHtml, documents: documentsHtml, details: detailsHtml };

    document.getElementById('detail-root').innerHTML = `
      <div class="page-head">
        <div>
          <h2 class="d-flex flex-wrap align-items-center gap-2">${esc(client.company_name)} ${toneBadge('client', client.status, client.status_display)}</h2>
          <p>${esc(client.contact_person)}${dev ? '' : ' &middot; ' + esc(client.contact_number)}${client.place ? ' &middot; ' + esc(client.place) : ''}${dev ? '' : ' &middot; Account owner ' + esc(client.owner_name)}</p>
        </div>
        ${manage ? `<div class="actions">
          <button class="btn btn-primary" data-act="project"><i class="bi bi-plus-lg"></i>Add project</button>
          <button class="btn btn-ghost" data-act="task"><i class="bi bi-check2-square"></i>Add task</button>
          <button class="btn btn-ghost" data-act="invoice"><i class="bi bi-receipt"></i>Add invoice</button>
          <button class="btn btn-ghost" data-act="doc"><i class="bi bi-upload"></i>Upload</button>
          <button class="btn btn-ghost btn-icon" data-act="edit" aria-label="Edit client" title="Edit client"><i class="bi bi-pencil"></i></button>
          ${CD.role === 'admin' ? '<button class="btn btn-danger-soft btn-icon" data-act="archive" aria-label="Archive client" title="Archive client"><i class="bi bi-archive"></i></button>' : ''}
        </div>` : ''}
      </div>

      <div class="row g-3 mb-3">${tiles.map(([label, value, icon, hint]) => `<div class="col-6 col-lg-3"><div class="dl-card stat"><span class="ico"><i class="bi ${icon}"></i></span><span class="label">${label}</span><span class="value">${value}</span>${hint ? `<span class="hint bad">${hint}</span>` : ''}</div></div>`).join('')}</div>

      ${tabs.length > 1 ? `<div class="nav-tabs-dl" role="tablist">${tabs.map(([key, label]) => `<button role="tab" aria-selected="${CD.tab === key}" class="${CD.tab === key ? 'active' : ''}" data-tab="${key}">${label}</button>`).join('')}</div>` : ''}
      ${panels[tabs.some(t => t[0] === CD.tab) ? CD.tab : 'work']()}`;
}

/* ---------- Work ---------- */
function workHtml() {
    const { projects, tasks, can_manage: manage } = CD.data;
    if (!projects.length) {
        return `<div class="dl-card">${emptyState('bi-kanban', 'No projects yet', manage ? 'Add the first project to start tracking tasks and deadlines.' : 'Nothing assigned to you here yet.')}</div>`;
    }
    return `<div class="d-grid gap-3">${projects.map(p => projectCard(p, tasks.filter(t => t.project === p.id))).join('')}</div>`;
}

function projectCard(p, tasks) {
    const manage = CD.data.can_manage;
    const dev = CD.role === 'dev';
    const deadlineTone = p.is_overdue ? 'text-danger fw-600' : '';
    const statusControl = manage
        ? `<select class="form-select form-select-sm" style="width:auto" data-project-status="${p.id}" aria-label="Project status">${[['planning', 'Planning'], ['in_progress', 'In progress'], ['review', 'In review'], ['completed', 'Completed'], ['on_hold', 'On hold']].map(([v, l]) => `<option value="${v}" ${p.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`
        : toneBadge('project', p.status, p.status_display);

    return `<section class="dl-card">
      <div class="dl-card-body">
        <div class="d-flex flex-wrap align-items-start gap-3">
          <div class="flex-grow-1" style="min-width:220px">
            <div class="d-flex flex-wrap align-items-center gap-2 mb-1"><h3 class="fs-6 fw-bold m-0">${esc(p.name)}</h3>${badge(p.project_type_display, 'neutral', true)}</div>
            <div class="small text-muted ${deadlineTone}">${p.deadline ? `<i class="bi bi-calendar-event"></i> Deadline ${esc(fmtDate(p.deadline))} &middot; ${esc(daysLabel(p.days_left))}` : 'No deadline set'}${!dev && p.budget ? ` &middot; Budget ${esc(fmtMoney(p.budget))}` : ''}</div>
            ${p.description ? `<p class="small mt-2 mb-0 text-pre">${esc(p.description)}</p>` : ''}
          </div>
          <div class="d-flex flex-wrap align-items-center gap-2">
            <span class="avatar-stack">${p.team_members.map(m => avatar(m.full_name, 'sm')).join('') || '<span class="small text-muted">No team</span>'}</span>
            ${statusControl}
            ${manage ? `<button class="btn btn-sm btn-ghost btn-icon" data-edit-project="${p.id}" aria-label="Edit project"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-ghost btn-icon" data-del-project="${p.id}" aria-label="Delete project"><i class="bi bi-trash"></i></button>` : ''}
          </div>
        </div>
        <div class="d-flex align-items-center gap-3 mt-3">
          <div class="dl-progress flex-grow-1 ${p.is_overdue ? 'bad' : p.progress >= 100 ? 'ok' : ''}"><span style="width:${p.progress}%"></span></div>
          <span class="small tabular text-muted">${p.tasks_done}/${p.tasks_total} tasks &middot; ${p.progress}%</span>
        </div>
      </div>
      <div class="border-top" style="border-color:var(--dl-border)!important">
        ${tasks.length ? taskTable(tasks) : '<div class="p-3 small text-muted">No tasks in this project yet.</div>'}
        ${manage ? `<div class="p-2 border-top" style="border-color:var(--dl-border)!important"><button class="btn btn-sm btn-ghost" data-add-task="${p.id}"><i class="bi bi-plus-lg"></i>Add task</button></div>` : ''}
      </div></section>`;
}

function taskTable(tasks) {
    const manage = CD.data.can_manage;
    return `<div class="table-wrap"><table class="table dl-table"><thead><tr><th>Task</th><th>Assignee</th><th>Priority</th><th>Deadline</th><th style="min-width:150px">Status</th>${manage ? '<th></th>' : ''}</tr></thead><tbody>
      ${tasks.map(t => {
        const canUpdate = manage || t.assigned_to === CD.userId;
        const tone = t.status === 'done' ? '' : t.is_overdue ? 'text-danger fw-600' : '';
        return `<tr><td><span class="cell-title ${t.status === 'done' ? 'text-decoration-line-through text-muted' : ''}">${esc(t.title)}</span>${t.description ? `<span class="cell-sub">${esc(t.description.slice(0, 90))}</span>` : ''}</td>
          <td>${t.assigned_to_name ? `<span class="d-flex align-items-center gap-2">${avatar(t.assigned_to_name, 'sm')}${esc(t.assigned_to_name)}</span>` : '<span class="text-muted">Unassigned</span>'}</td>
          <td>${toneBadge('priority', t.priority, t.priority_display)}</td>
          <td class="${tone}">${t.deadline ? `${esc(fmtDate(t.deadline))}<span class="cell-sub ${tone}">${esc(t.status === 'done' ? 'Completed' : daysLabel(t.days_left))}</span>` : '<span class="text-muted">None</span>'}</td>
          <td>${taskStatusSelect(t, canUpdate)}</td>
          ${manage ? `<td class="text-end text-nowrap"><button class="btn btn-sm btn-ghost btn-icon" data-edit-task="${t.id}" aria-label="Edit task"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-ghost btn-icon" data-del-task="${t.id}" aria-label="Delete task"><i class="bi bi-trash"></i></button></td>` : ''}</tr>`;
    }).join('')}</tbody></table></div>`;
}

/* ---------- Invoices ---------- */
function invoicesHtml() {
    const { invoices, finance } = CD.data;
    const summary = `<div class="row g-3 mb-3">${[['Billed', finance.billed], ['Paid', finance.paid], ['Outstanding', finance.outstanding], ['Overdue', finance.overdue]].map(([l, v]) =>
        `<div class="col-6 col-lg-3"><div class="dl-card stat"><span class="label">${l}</span><span class="value ${l === 'Overdue' && v ? 'text-danger' : ''}">${fmtMoney(v)}</span></div></div>`).join('')}</div>`;
    if (!invoices.length) return `${summary}<div class="dl-card">${emptyState('bi-receipt', 'No invoices yet', 'Add invoices to keep billing in one place.')}</div>`;
    return `${summary}<div class="dl-card"><div class="table-wrap"><table class="table dl-table"><thead><tr><th>Invoice</th><th>Amount</th><th>Issued</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>
      ${invoices.map(i => `<tr><td><span class="cell-title">${esc(i.invoice_number)}</span><span class="cell-sub">${esc(i.title)}</span></td>
        <td class="tabular fw-600">${esc(fmtMoneyFull(i.amount))}</td><td>${esc(fmtDate(i.issue_date))}</td><td>${i.due_date ? esc(fmtDate(i.due_date)) : '-'}</td>
        <td>${toneBadge('invoice', i.display_status, i.status_display)}${i.paid_on ? `<span class="cell-sub">Paid ${esc(fmtDate(i.paid_on))}</span>` : ''}</td>
        <td class="text-end text-nowrap">
          ${i.file_url ? `<a class="btn btn-sm btn-ghost btn-icon" href="${esc(i.file_url)}" target="_blank" rel="noopener noreferrer" aria-label="Open invoice file"><i class="bi bi-file-earmark-pdf"></i></a>` : ''}
          ${i.status === 'sent' || i.status === 'draft' ? `<button class="btn btn-sm btn-success-soft" data-pay-invoice="${i.id}"><i class="bi bi-check2"></i>Mark paid</button>` : ''}
          <button class="btn btn-sm btn-ghost btn-icon" data-edit-invoice="${i.id}" aria-label="Edit invoice"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-ghost btn-icon" data-del-invoice="${i.id}" aria-label="Delete invoice"><i class="bi bi-trash"></i></button></td></tr>`).join('')}
      </tbody></table></div></div>`;
}

/* ---------- Documents ---------- */
function documentsHtml() {
    const docs = CD.data.documents;
    if (!docs.length) return `<div class="dl-card">${emptyState('bi-folder2-open', 'No documents', 'Store contracts, scope documents and assets for this client.')}</div>`;
    return `<div class="dl-card"><div class="row-list">${docs.map(d => `
      <div class="doc-row"><span class="doc-ico"><i class="bi ${DOC_ICON[d.doc_type] || 'bi-file-earmark'}"></i></span>
        <div class="flex-grow-1" style="min-width:0"><a class="fw-600 text-body" href="${esc(d.file_url)}" target="_blank" rel="noopener noreferrer">${esc(d.title)}</a>
          <div class="small text-muted">${esc(d.doc_type_display)} &middot; ${esc(d.uploaded_by_name)} &middot; ${esc(fmtDate(d.created_at))}</div></div>
        <a class="btn btn-sm btn-ghost btn-icon" href="${esc(d.file_url)}" download aria-label="Download ${esc(d.title)}"><i class="bi bi-download"></i></a>
        <button class="btn btn-sm btn-ghost btn-icon" data-del-doc="${d.id}" aria-label="Delete ${esc(d.title)}"><i class="bi bi-trash"></i></button></div>`).join('')}</div></div>`;
}

/* ---------- Details and journey ---------- */
function detailsHtml() {
    const { client, journey } = CD.data;
    const timeline = journey ? `<ul class="timeline">
        <li class="t-muted"><strong>Prospect added</strong><div class="when">${esc(fmtDate(journey.prospect_added_on))}</div></li>
        ${journey.first_connected_at ? `<li class="t-success"><strong>First connected</strong><div class="when">${esc(fmtDate(journey.first_connected_at))} &middot; ${journey.calls_count} call${journey.calls_count === 1 ? '' : 's'} logged</div></li>` : ''}
        ${journey.meetings.map(m => `<li><strong>Meeting (${esc(m.mode_display)})</strong><div class="when">${esc(fmtDate(m.scheduled_at))}</div>${m.minutes ? `<div class="small text-pre mt-1">${esc(m.minutes.slice(0, 220))}${m.minutes.length > 220 ? '...' : ''}</div>` : ''}</li>`).join('')}
        ${journey.proposal_submitted_on ? `<li class="t-warning"><strong>Proposal submitted</strong><div class="when">${esc(fmtDate(journey.proposal_submitted_on))}${journey.expected_value ? ' &middot; ' + esc(fmtMoney(journey.expected_value)) : ''}</div></li>` : ''}
        <li class="t-success"><strong>Became a client</strong><div class="when">${esc(fmtDate(journey.onboarded_on))}</div></li>
      </ul><div class="mt-3"><a class="link-more" href="${pageUrl('lead', journey.lead_id)}">Open the original lead <i class="bi bi-arrow-right"></i></a></div>`
        : '<span class="text-muted">This client was added directly, so there is no prospect history.</span>';

    return `<div class="row g-3">
      <div class="col-lg-7"><section class="dl-card"><div class="dl-card-head"><h3>Client details</h3></div><div class="dl-card-body"><dl class="info-grid mb-0">
        <div><dt>Contact person</dt><dd>${esc(client.contact_person)}${client.designation ? ` <span class="text-muted">&middot; ${esc(client.designation)}</span>` : ''}</dd></div>
        <div><dt>Phone</dt><dd>${telLink(client.contact_number)}</dd></div>
        <div><dt>Email</dt><dd>${client.email ? `<a class="text-primary-dl" href="mailto:${esc(client.email)}">${esc(client.email)}</a>` : '-'}</dd></div>
        <div><dt>Website</dt><dd>${webLink(client.website)}</dd></div>
        <div><dt>GST number</dt><dd>${esc(client.gst_number || '-')}</dd></div>
        <div><dt>Client since</dt><dd>${esc(fmtDate(client.onboarded_on))}</dd></div>
        <div style="grid-column:1/-1"><dt>Billing address</dt><dd class="text-pre">${esc(client.address || '-')}</dd></div>
        <div style="grid-column:1/-1"><dt>Internal notes</dt><dd class="text-pre">${esc(client.notes || '-')}</dd></div>
      </dl></div></section></div>
      <div class="col-lg-5"><section class="dl-card"><div class="dl-card-head"><h3>Journey from prospect</h3></div><div class="dl-card-body">${timeline}</div></section></div></div>`;
}

/* ---------- Events ---------- */
async function onClick(e) {
    const tab = e.target.closest('[data-tab]');
    if (tab) { CD.tab = tab.dataset.tab; render(); return; }

    const act = e.target.closest('[data-act]');
    if (act) {
        const name = act.dataset.act;
        if (name === 'project') openProject();
        if (name === 'task') openTaskFromHeader();
        if (name === 'invoice') openInvoice();
        if (name === 'doc') { document.getElementById('docForm').reset(); showFormError('dc-error', ''); modalShow('docModal'); }
        if (name === 'edit') openClientEdit();
        if (name === 'archive') archiveClient();
        return;
    }

    const addTask = e.target.closest('[data-add-task]');
    if (addTask) { openTaskModal({ projectId: Number(addTask.dataset.addTask) }); return; }
    const editTask = e.target.closest('[data-edit-task]');
    if (editTask) { openTaskModal({ task: CD.data.tasks.find(t => t.id === Number(editTask.dataset.editTask)) }); return; }
    const delTask = e.target.closest('[data-del-task]');
    if (delTask) { removeItem(CD.urls.task, delTask.dataset.delTask, 'Delete this task?'); return; }
    const editProject = e.target.closest('[data-edit-project]');
    if (editProject) { openProject(CD.data.projects.find(p => p.id === Number(editProject.dataset.editProject))); return; }
    const delProject = e.target.closest('[data-del-project]');
    if (delProject) { removeItem(CD.urls.project, delProject.dataset.delProject, 'Delete this project?', 'All its tasks are removed too.'); return; }
    const editInvoice = e.target.closest('[data-edit-invoice]');
    if (editInvoice) { openInvoice(CD.data.invoices.find(i => i.id === Number(editInvoice.dataset.editInvoice))); return; }
    const payInvoice = e.target.closest('[data-pay-invoice]');
    if (payInvoice) { markPaid(payInvoice.dataset.payInvoice); return; }
    const delInvoice = e.target.closest('[data-del-invoice]');
    if (delInvoice) { removeItem(CD.urls.invoice, delInvoice.dataset.delInvoice, 'Delete this invoice?'); return; }
    const delDoc = e.target.closest('[data-del-doc]');
    if (delDoc) removeItem(CD.urls.document, delDoc.dataset.delDoc, 'Delete this document?');
}

async function onChange(e) {
    const taskSelect = e.target.closest('[data-task-status]');
    if (taskSelect) {
        await updateTaskStatus(CD.urls.task, taskSelect.dataset.taskStatus, taskSelect.value);
        loadClient();
        return;
    }
    const projectSelect = e.target.closest('[data-project-status]');
    if (projectSelect) {
        const res = await api('PUT', withId(CD.urls.project, projectSelect.dataset.projectStatus), { status: projectSelect.value });
        if (!res.ok) toast(res.error, 'error'); else toast('Project status updated');
        loadClient();
    }
}

async function removeItem(url, id, title, message = 'This cannot be undone.') {
    const ok = await confirmAction({ title, message, confirmText: 'Delete', danger: true });
    if (!ok) return;
    const res = await api('DELETE', withId(url, id));
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast('Deleted');
    loadClient();
}

function openTaskFromHeader() {
    const projects = CD.data.projects;
    if (!projects.length) { toast('Add a project first, then add tasks to it.', 'error'); return; }
    if (projects.length === 1) { openTaskModal({ projectId: projects[0].id }); return; }
    openTaskModal({ projects });
}

/* ---------- Client edit ---------- */
function openClientEdit() {
    const c = CD.data.client;
    const fields = { company: 'company_name', place: 'place', person: 'contact_person', designation: 'designation', number: 'contact_number', email: 'email', website: 'website', gst: 'gst_number', status: 'status', address: 'address', notes: 'notes' };
    Object.entries(fields).forEach(([id, key]) => { document.getElementById(`ce-${id}`).value = c[key] || ''; });
    showFormError('ce-error', '');
    modalShow('clientEditModal');
}

async function saveClientEdit() {
    const v = id => document.getElementById(id).value.trim();
    if (!v('ce-company') || !v('ce-person') || !v('ce-number')) { showFormError('ce-error', 'Company name, contact person and contact number are required.'); return; }
    const button = document.getElementById('ce-save');
    setBusy(button, true);
    const res = await api('PUT', withId(CD.urls.client, CD.id), {
        company_name: v('ce-company'), place: v('ce-place'), contact_person: v('ce-person'), designation: v('ce-designation'), contact_number: v('ce-number'),
        email: v('ce-email'), website: v('ce-website'), gst_number: v('ce-gst'), status: v('ce-status'), address: v('ce-address'), notes: v('ce-notes'),
    });
    setBusy(button, false);
    if (!res.ok) { showFormError('ce-error', res.error); return; }
    modalHide('clientEditModal');
    toast('Client updated');
    loadClient();
}

async function archiveClient() {
    const ok = await confirmAction({ title: 'Archive this client?', message: 'The client is hidden from lists. Projects, tasks and invoices are kept.', confirmText: 'Archive', danger: true });
    if (!ok) return;
    const res = await api('DELETE', withId(CD.urls.client, CD.id));
    if (!res.ok) { toast(res.error, 'error'); return; }
    window.location.href = CD.urls.clients;
}

/* ---------- Project ---------- */
async function loadDevs() {
    if (CD.devs.length) return;
    const res = await api('GET', `${CD.urls.users}?role=dev`);
    if (res.ok) CD.devs = res.data.users;
}

async function openProject(project = null) {
    CD.editProjectId = project ? project.id : null;
    document.getElementById('projectModalTitle').textContent = project ? 'Edit project' : 'Add project';
    document.getElementById('pr-name').value = project?.name || '';
    document.getElementById('pr-type').value = project?.project_type || 'web';
    document.getElementById('pr-status').value = project?.status || 'planning';
    document.getElementById('pr-start').value = project?.start_date || toDateInput(new Date());
    document.getElementById('pr-deadline').value = project?.deadline || '';
    document.getElementById('pr-budget').value = project?.budget ? Math.round(project.budget) : '';
    document.getElementById('pr-desc').value = project?.description || '';
    showFormError('pr-error', '');
    await loadDevs();
    const selected = new Set((project?.team_members || []).map(m => m.id));
    document.getElementById('pr-team').innerHTML = CD.devs.length
        ? CD.devs.map(d => `<div><input type="checkbox" class="btn-check" id="pr-dev-${d.id}" value="${d.id}" ${selected.has(d.id) ? 'checked' : ''}><label class="btn btn-sm btn-ghost" for="pr-dev-${d.id}">${esc(d.full_name)}</label></div>`).join('')
        : '<span class="text-muted small">No developers added yet.</span>';
    modalShow('projectModal');
}

async function saveProject() {
    const name = document.getElementById('pr-name').value.trim();
    if (!name) { showFormError('pr-error', 'Project name is required.'); return; }
    const payload = {
        name, project_type: document.getElementById('pr-type').value, status: document.getElementById('pr-status').value,
        start_date: document.getElementById('pr-start').value, deadline: document.getElementById('pr-deadline').value,
        budget: document.getElementById('pr-budget').value, description: document.getElementById('pr-desc').value,
        team: [...document.querySelectorAll('#pr-team input:checked')].map(i => Number(i.value)),
    };
    const button = document.getElementById('pr-save');
    setBusy(button, true);
    const res = CD.editProjectId ? await api('PUT', withId(CD.urls.project, CD.editProjectId), payload) : await api('POST', CD.urls.project, { ...payload, client: CD.id });
    setBusy(button, false);
    if (!res.ok) { showFormError('pr-error', res.error); return; }
    modalHide('projectModal');
    toast('Project saved');
    CD.tab = 'work';
    loadClient();
}

/* ---------- Invoice ---------- */
function openInvoice(invoice = null) {
    CD.editInvoiceId = invoice ? invoice.id : null;
    document.getElementById('invoiceModalTitle').textContent = invoice ? 'Edit invoice' : 'Add invoice';
    document.getElementById('iv-title').value = invoice?.title || '';
    document.getElementById('iv-amount').value = invoice ? invoice.amount : '';
    document.getElementById('iv-number').value = invoice?.invoice_number || '';
    document.getElementById('iv-number').disabled = !!invoice;
    document.getElementById('iv-issue').value = invoice?.issue_date || toDateInput(new Date());
    document.getElementById('iv-issue').disabled = !!invoice;
    document.getElementById('iv-due').value = invoice?.due_date || addDays(14).slice(0, 10);
    document.getElementById('iv-status').value = invoice?.status || 'sent';
    document.getElementById('iv-notes').value = invoice?.notes || '';
    document.getElementById('iv-file').value = '';
    showFormError('iv-error', '');
    modalShow('invoiceModal');
}

async function saveInvoice() {
    const title = document.getElementById('iv-title').value.trim();
    const amount = document.getElementById('iv-amount').value;
    if (!title || !amount || Number(amount) <= 0) { showFormError('iv-error', 'Description and a valid amount are required.'); return; }
    const form = new FormData();
    form.append('title', title);
    form.append('amount', amount);
    form.append('due_date', document.getElementById('iv-due').value);
    form.append('status', document.getElementById('iv-status').value);
    form.append('notes', document.getElementById('iv-notes').value.trim());
    if (!CD.editInvoiceId) {
        form.append('client', CD.id);
        form.append('invoice_number', document.getElementById('iv-number').value.trim());
        form.append('issue_date', document.getElementById('iv-issue').value);
    }
    const file = document.getElementById('iv-file').files[0];
    if (file) form.append('file', file);

    const button = document.getElementById('iv-save');
    setBusy(button, true);
    const res = CD.editInvoiceId ? await api('PUT', withId(CD.urls.invoice, CD.editInvoiceId), form, true) : await api('POST', CD.urls.invoice, form, true);
    setBusy(button, false);
    if (!res.ok) { showFormError('iv-error', res.error); return; }
    modalHide('invoiceModal');
    toast('Invoice saved');
    CD.tab = 'invoices';
    loadClient();
}

async function markPaid(id) {
    const res = await api('PUT', withId(CD.urls.invoice, id), { status: 'paid' });
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast('Invoice marked as paid');
    loadClient();
}

/* ---------- Documents ---------- */
async function saveDocument() {
    const file = document.getElementById('dc-file').files[0];
    if (!file) { showFormError('dc-error', 'Choose a file to upload.'); return; }
    if (file.size > 20 * 1024 * 1024) { showFormError('dc-error', 'File is too large. Maximum size is 20 MB.'); return; }
    const form = new FormData();
    form.append('client', CD.id);
    form.append('title', document.getElementById('dc-title').value.trim());
    form.append('doc_type', document.getElementById('dc-type').value);
    form.append('file', file);
    const button = document.getElementById('dc-save');
    setBusy(button, true, 'Uploading...');
    const res = await api('POST', CD.urls.document, form, true);
    setBusy(button, false);
    if (!res.ok) { showFormError('dc-error', res.error); return; }
    modalHide('docModal');
    toast('Document uploaded');
    CD.tab = 'documents';
    loadClient();
}

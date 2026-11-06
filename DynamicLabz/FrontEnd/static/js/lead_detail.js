let _csrf = null;
const LD = { id: null, urls: {}, data: null, tab: 'meetings', editMeetingId: null, devs: [] };

const STAGES = [
    ['meeting_done', 'Meeting done'],
    ['proposal_in_progress', 'Drafting proposal'],
    ['proposal_submitted', 'Proposal submitted'],
    ['negotiation', 'Negotiation'],
];
const DOC_ICONS = { proposal: 'bi-file-earmark-text', quotation: 'bi-file-earmark-ruled', requirements: 'bi-list-check', nda: 'bi-shield-lock', other: 'bi-file-earmark' };

function LeadDetailInit(csrf, leadId, urls) {
    _csrf = csrf;
    LD.id = leadId;
    LD.urls = urls;
    DL.csrf = csrf;

    ProspectModalsInit({ prospect: urls.prospect, callLog: urls.callLog, followUp: urls.followUp, users: urls.users }, () => loadLead());

    document.getElementById('meetingForm').addEventListener('submit', e => { e.preventDefault(); saveMeeting(); });
    document.getElementById('docForm').addEventListener('submit', e => { e.preventDefault(); saveDocument(); });
    document.getElementById('lostForm').addEventListener('submit', e => { e.preventDefault(); saveLost(); });
    document.getElementById('leadForm').addEventListener('submit', e => { e.preventDefault(); saveLeadEdit(); });
    document.getElementById('clientForm').addEventListener('submit', e => { e.preventDefault(); saveClient(); });
    document.getElementById('detail-root').addEventListener('click', onClick);
    loadLead();
}

async function loadLead() {
    const res = await api('GET', `${LD.urls.lead}?id=${LD.id}`);
    const root = document.getElementById('detail-root');
    if (!res.ok) {
        root.innerHTML = emptyState('bi-exclamation-triangle', 'Lead not available', res.error);
        return;
    }
    LD.data = res.data;
    document.title = `${LD.data.lead.title} - Dynamic Labz`;
    render();
}

function isOpen(lead) {
    return !['won', 'lost'].includes(lead.status);
}

function render() {
    const { lead, meetings, documents, call_logs, follow_ups } = LD.data;
    const open = isOpen(lead);
    const pending = follow_ups.filter(f => f.status === 'pending');

    const stageButtons = open ? `<div class="seg" id="stage-seg" role="group" aria-label="Lead stage">${STAGES.map(([key, label]) =>
        `<button data-stage="${key}" class="${lead.status === key ? 'active' : ''}">${label}</button>`).join('')}</div>` : '';

    let banner = '';
    if (lead.status === 'won') banner = `<div class="dl-card mb-3"><div class="dl-card-body py-3 d-flex flex-wrap align-items-center gap-3"><span class="doc-ico" style="background:var(--dl-success-soft);color:var(--dl-success)"><i class="bi bi-trophy"></i></span><div class="flex-grow-1"><strong>Won - this lead is now a client</strong><div class="text-muted small">Closed ${esc(fmtDate(lead.closed_at))}</div></div><a class="btn btn-primary btn-sm" href="${pageUrl('client', lead.client_id)}">Open client</a></div></div>`;
    if (lead.status === 'lost') banner = `<div class="dl-card mb-3"><div class="dl-card-body py-3 d-flex gap-3"><span class="doc-ico" style="background:var(--dl-danger-soft);color:var(--dl-danger)"><i class="bi bi-x-circle"></i></span><div><strong>Lost</strong><div class="text-muted small text-pre">${esc(lead.lost_reason || '')}</div></div></div></div>`;

    const tabs = [['meetings', `Meetings (${meetings.length})`], ['documents', `Documents (${documents.length})`], ['activity', `Call history (${call_logs.length})`]];
    const panel = { meetings: meetingsHtml(meetings, open), documents: documentsHtml(documents, open), activity: activityHtml(call_logs, pending) }[LD.tab];

    document.getElementById('detail-root').innerHTML = `
      <div class="page-head">
        <div>
          <h2 class="d-flex flex-wrap align-items-center gap-2">${esc(lead.title)} ${toneBadge('lead', lead.status, lead.status_display)}</h2>
          <p><a class="text-primary-dl" href="${pageUrl('prospect', LD.data.prospect_id)}">${esc(lead.company_name)}</a>${lead.place ? ' &middot; ' + esc(lead.place) : ''} &middot; Owned by ${esc(lead.owner_name)}</p>
        </div>
        <div class="actions">
          ${open ? `<button class="btn btn-primary" data-act="client"><i class="bi bi-buildings"></i>Convert to client</button>
          <button class="btn btn-ghost" data-act="meeting"><i class="bi bi-people"></i>Add meeting</button>
          <button class="btn btn-ghost" data-act="doc"><i class="bi bi-upload"></i>Upload</button>
          <button class="btn btn-ghost btn-icon" data-act="edit" aria-label="Edit lead" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-danger-soft" data-act="lost"><i class="bi bi-x-circle"></i>Mark lost</button>` : ''}
          ${lead.status !== 'won' ? '<button class="btn btn-ghost btn-icon" data-act="delete" aria-label="Delete lead" title="Delete lead"><i class="bi bi-trash"></i></button>' : ''}
        </div>
      </div>
      ${banner}
      <div class="dl-card mb-3"><div class="dl-card-body py-3 d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div class="journey" aria-label="Pipeline stage">
          <span class="step done"><i class="bi bi-telephone-outbound"></i>Prospect</span><span class="bar done"></span>
          <span class="step ${lead.status === 'won' ? 'done' : 'current'}"><i class="bi bi-funnel"></i>Lead</span><span class="bar ${lead.status === 'won' ? 'done' : ''}"></span>
          <span class="step ${lead.status === 'won' ? 'current' : ''}"><i class="bi bi-buildings"></i>Client</span>
        </div>
        ${stageButtons}
      </div></div>

      <div class="row g-3">
        <div class="col-lg-8">
          <div class="nav-tabs-dl" role="tablist">${tabs.map(([key, label]) => `<button role="tab" aria-selected="${LD.tab === key}" class="${LD.tab === key ? 'active' : ''}" data-tab="${key}">${label}</button>`).join('')}</div>
          ${panel}
        </div>
        <div class="col-lg-4 d-grid gap-3 align-content-start">
          <section class="dl-card"><div class="dl-card-head"><h3>Deal</h3></div><div class="dl-card-body"><dl class="info-grid mb-0" style="grid-template-columns:1fr 1fr">
            <div><dt>Expected value</dt><dd class="fw-600">${lead.expected_value ? fmtMoneyFull(lead.expected_value) : '-'}</dd></div>
            <div><dt>Close by</dt><dd>${lead.expected_closure_date ? esc(fmtDate(lead.expected_closure_date)) : '-'}</dd></div>
            <div><dt>Proposal sent</dt><dd>${lead.proposal_submitted_on ? esc(fmtDate(lead.proposal_submitted_on)) : 'Not yet'}</dd></div>
            <div><dt>Lead since</dt><dd>${esc(fmtDate(lead.created_at))}</dd></div>
          </dl>${lead.description ? `<hr><p class="mb-0 text-pre small">${esc(lead.description)}</p>` : ''}</div></section>
          <section class="dl-card"><div class="dl-card-head"><h3>Contact</h3></div><div class="dl-card-body"><dl class="info-grid mb-0" style="grid-template-columns:1fr">
            <div><dt>Contact person</dt><dd>${esc(lead.contact_person)}</dd></div>
            <div><dt>Phone</dt><dd>${telLink(lead.contact_number)}</dd></div>
            <div><dt>Email</dt><dd>${lead.email ? `<a class="text-primary-dl" href="mailto:${esc(lead.email)}">${esc(lead.email)}</a>` : '-'}</dd></div>
            <div><dt>Website</dt><dd>${webLink(lead.website)}</dd></div>
          </dl></div></section>
          <section class="dl-card"><div class="dl-card-head"><h3>Journey so far</h3></div><div class="dl-card-body"><ul class="timeline">
            <li class="t-muted"><strong>Prospect added</strong><div class="when">${esc(fmtDate(LD.data.prospect_created_at))} &middot; ${esc(LD.data.prospect_source)}</div></li>
            ${LD.data.first_connected_at ? `<li class="t-success"><strong>First connected</strong><div class="when">${esc(fmtDate(LD.data.first_connected_at))}</div></li>` : ''}
            <li><strong>Moved to leads</strong><div class="when">${esc(fmtDate(lead.created_at))}</div></li>
            ${lead.proposal_submitted_on ? `<li class="t-warning"><strong>Proposal submitted</strong><div class="when">${esc(fmtDate(lead.proposal_submitted_on))}</div></li>` : ''}
            ${lead.closed_at ? `<li class="${lead.status === 'won' ? 't-success' : 't-danger'}"><strong>${lead.status === 'won' ? 'Won' : 'Lost'}</strong><div class="when">${esc(fmtDate(lead.closed_at))}</div></li>` : ''}
          </ul></div></section>
        </div>
      </div>`;
}

function meetingsHtml(meetings, open) {
    if (!meetings.length) return `<div class="dl-card">${emptyState('bi-people', 'No meetings recorded', 'Add a meeting to capture what was discussed.')}</div>`;
    return `<div class="d-grid gap-3">${meetings.map(m => `
      <section class="dl-card"><div class="dl-card-body">
        <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
          <strong>${esc(fmtDateTime(m.scheduled_at))}</strong>
          ${badge(m.mode_display, 'info', true)}
          ${badge(m.conducted ? 'Held' : 'Scheduled', m.conducted ? 'success' : 'warning')}
          <span class="ms-auto d-flex gap-1">
            <button class="btn btn-sm btn-ghost btn-icon" data-edit-meeting="${m.id}" aria-label="Edit meeting"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-ghost btn-icon" data-del-meeting="${m.id}" aria-label="Delete meeting"><i class="bi bi-trash"></i></button>
          </span>
        </div>
        ${m.agenda ? `<div class="mb-2"><span class="xs text-muted text-uppercase fw-600">Agenda</span><div>${esc(m.agenda)}</div></div>` : ''}
        ${m.minutes ? `<div class="mb-2"><span class="xs text-muted text-uppercase fw-600">What happened</span><div class="text-pre">${esc(m.minutes)}</div></div>` : ''}
        ${m.next_steps ? `<div class="mb-2"><span class="xs text-muted text-uppercase fw-600">Next steps</span><div class="text-pre">${esc(m.next_steps)}</div></div>` : ''}
        <div class="xs text-muted">${m.attendees ? 'With ' + esc(m.attendees) + ' &middot; ' : ''}${m.location ? esc(m.location) + ' &middot; ' : ''}Logged by ${esc(m.created_by_name)}</div>
      </div></section>`).join('')}</div>`;
}

function documentsHtml(documents, open) {
    if (!documents.length) return `<div class="dl-card">${emptyState('bi-file-earmark-arrow-up', 'No documents yet', 'Upload the proposal, quotation or requirement docs here.')}${open ? '<div class="text-center pb-4"><button class="btn btn-primary btn-sm" data-act="doc"><i class="bi bi-upload"></i>Upload document</button></div>' : ''}</div>`;
    return `<div class="dl-card"><div class="row-list">${documents.map(d => `
      <div class="doc-row">
        <span class="doc-ico"><i class="bi ${DOC_ICONS[d.doc_type] || 'bi-file-earmark'}"></i></span>
        <div class="flex-grow-1" style="min-width:0">
          <a class="fw-600 text-body" href="${esc(d.file_url)}" target="_blank" rel="noopener noreferrer">${esc(d.title)}</a>
          <div class="small text-muted">${esc(d.doc_type_display)}${d.version ? ' &middot; ' + esc(d.version) : ''} &middot; ${esc(d.uploaded_by_name)} &middot; ${esc(fmtDate(d.created_at))}${d.file_size ? ' &middot; ' + bytes(d.file_size) : ''}</div>
        </div>
        <a class="btn btn-sm btn-ghost btn-icon" href="${esc(d.file_url)}" download aria-label="Download ${esc(d.title)}"><i class="bi bi-download"></i></a>
        <button class="btn btn-sm btn-ghost btn-icon" data-del-doc="${d.id}" aria-label="Delete ${esc(d.title)}"><i class="bi bi-trash"></i></button>
      </div>`).join('')}</div></div>`;
}

function activityHtml(callLogs, pending) {
    const calls = callLogs.length ? `<ul class="timeline">${callLogs.map(c => `<li class="${{ success: 't-success', warning: 't-warning', danger: 't-danger' }[TONES.outcome[c.outcome]] || 't-muted'}">
        ${toneBadge('outcome', c.outcome, c.outcome_display)}
        ${c.summary ? `<p class="mb-1 mt-2 text-pre">${esc(c.summary)}</p>` : ''}
        <div class="when">${esc(c.called_by_name)} &middot; ${esc(fmtDateTime(c.called_at))}</div></li>`).join('')}</ul>` : emptyState('bi-telephone', 'No calls logged');
    return `<div class="d-grid gap-3">
      <section class="dl-card"><div class="dl-card-head"><h3>Follow-ups</h3>
        <div class="d-flex gap-2"><button class="btn btn-sm btn-ghost" data-act="call"><i class="bi bi-telephone"></i>Log call</button><button class="btn btn-sm btn-ghost" data-act="followup"><i class="bi bi-bell"></i>Add</button></div></div>
        <div class="dl-card-body flush">${pending.length ? `<div class="row-list">${pending.map(f => followUpRowHtml(f, true)).join('')}</div>` : emptyState('bi-bell-slash', 'No pending follow-ups')}</div></section>
      <section class="dl-card"><div class="dl-card-head"><h3>Call history from the prospect stage</h3></div><div class="dl-card-body">${calls}</div></section></div>`;
}

function prospectStub() {
    const { lead } = LD.data;
    return { id: LD.data.prospect_id, company_name: lead.company_name, contact_person: lead.contact_person, contact_number: lead.contact_number };
}

async function onClick(e) {
    const tab = e.target.closest('[data-tab]');
    if (tab) { LD.tab = tab.dataset.tab; render(); return; }

    const stage = e.target.closest('[data-stage]');
    if (stage) { changeStage(stage.dataset.stage); return; }

    const act = e.target.closest('[data-act]');
    if (act) {
        const name = act.dataset.act;
        if (name === 'meeting') openMeeting();
        if (name === 'doc') openDocument();
        if (name === 'lost') { document.getElementById('lostForm').reset(); showFormError('ls-error', ''); modalShow('lostModal'); }
        if (name === 'edit') openLeadEdit();
        if (name === 'client') openClientModal();
        if (name === 'call') openCallModal(prospectStub());
        if (name === 'followup') openFollowUpModal({ prospect: prospectStub() });
        if (name === 'delete') deleteLead();
        return;
    }

    const editMeeting = e.target.closest('[data-edit-meeting]');
    if (editMeeting) { openMeeting(LD.data.meetings.find(m => m.id === Number(editMeeting.dataset.editMeeting))); return; }
    const delMeeting = e.target.closest('[data-del-meeting]');
    if (delMeeting) { removeItem(LD.urls.meeting, delMeeting.dataset.delMeeting, 'Delete this meeting?'); return; }
    const delDoc = e.target.closest('[data-del-doc]');
    if (delDoc) { removeItem(LD.urls.document, delDoc.dataset.delDoc, 'Delete this document?'); return; }

    const done = e.target.closest('[data-fu-done]');
    if (done) { markFollowUpDone(done.dataset.fuDone); return; }
    const call = e.target.closest('[data-fu-call]');
    if (call) { openCallModal(prospectStub(), { followUpId: Number(call.dataset.fuCall) }); return; }
    const resched = e.target.closest('[data-fu-resched]');
    if (resched) openFollowUpModal({ prospect: prospectStub(), followUp: LD.data.follow_ups.find(f => f.id === Number(resched.dataset.fuResched)) });
}

async function removeItem(url, id, title) {
    const ok = await confirmAction({ title, message: 'This cannot be undone.', confirmText: 'Delete', danger: true });
    if (!ok) return;
    const res = await api('DELETE', withId(url, id));
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast('Deleted');
    loadLead();
}

async function changeStage(stage) {
    if (stage === LD.data.lead.status) return;
    const res = await api('PUT', withId(LD.urls.lead, LD.id), { status: stage });
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast('Stage updated');
    loadLead();
}

/* ---------- Meetings ---------- */
function openMeeting(meeting = null) {
    LD.editMeetingId = meeting ? meeting.id : null;
    document.getElementById('meetingModalTitle').textContent = meeting ? 'Edit meeting' : 'Add meeting';
    document.getElementById('mt-when').value = toLocalInput(meeting ? meeting.scheduled_at : new Date());
    document.getElementById('mt-mode').value = meeting ? meeting.mode : 'video';
    document.getElementById('mt-location').value = meeting?.location || '';
    document.getElementById('mt-attendees').value = meeting?.attendees || LD.data.lead.contact_person || '';
    document.getElementById('mt-agenda').value = meeting?.agenda || '';
    document.getElementById('mt-minutes').value = meeting?.minutes || '';
    document.getElementById('mt-next').value = meeting?.next_steps || '';
    document.getElementById('mt-conducted').checked = meeting ? meeting.conducted : true;
    showFormError('mt-error', '');
    modalShow('meetingModal');
}

async function saveMeeting() {
    const when = document.getElementById('mt-when').value;
    if (!when) { showFormError('mt-error', 'Meeting date and time is required.'); return; }
    const payload = {
        lead: LD.id, scheduled_at: when, mode: document.getElementById('mt-mode').value,
        location: document.getElementById('mt-location').value, attendees: document.getElementById('mt-attendees').value,
        agenda: document.getElementById('mt-agenda').value, minutes: document.getElementById('mt-minutes').value,
        next_steps: document.getElementById('mt-next').value, conducted: document.getElementById('mt-conducted').checked,
    };
    const button = document.getElementById('mt-save');
    setBusy(button, true);
    const res = LD.editMeetingId ? await api('PUT', withId(LD.urls.meeting, LD.editMeetingId), payload) : await api('POST', LD.urls.meeting, payload);
    setBusy(button, false);
    if (!res.ok) { showFormError('mt-error', res.error); return; }
    modalHide('meetingModal');
    toast('Meeting saved');
    LD.tab = 'meetings';
    loadLead();
}

/* ---------- Documents ---------- */
function openDocument() {
    document.getElementById('docForm').reset();
    showFormError('dc-error', '');
    modalShow('docModal');
}

async function saveDocument() {
    const file = document.getElementById('dc-file').files[0];
    if (!file) { showFormError('dc-error', 'Choose a file to upload.'); return; }
    if (file.size > 20 * 1024 * 1024) { showFormError('dc-error', 'File is too large. Maximum size is 20 MB.'); return; }
    const form = new FormData();
    form.append('lead', LD.id);
    form.append('title', document.getElementById('dc-title').value.trim());
    form.append('doc_type', document.getElementById('dc-type').value);
    form.append('version', document.getElementById('dc-version').value.trim());
    form.append('file', file);
    const button = document.getElementById('dc-save');
    setBusy(button, true, 'Uploading...');
    const res = await api('POST', LD.urls.document, form, true);
    setBusy(button, false);
    if (!res.ok) { showFormError('dc-error', res.error); return; }
    modalHide('docModal');
    toast('Document uploaded');
    LD.tab = 'documents';
    loadLead();
}

/* ---------- Lost / edit / delete ---------- */
async function saveLost() {
    const reason = document.getElementById('ls-reason').value.trim();
    if (!reason) { showFormError('ls-error', 'Please add the reason.'); return; }
    const button = document.getElementById('ls-save');
    setBusy(button, true);
    const res = await api('PUT', withId(LD.urls.lead, LD.id), { status: 'lost', lost_reason: reason });
    setBusy(button, false);
    if (!res.ok) { showFormError('ls-error', res.error); return; }
    modalHide('lostModal');
    toast('Lead marked as lost');
    loadLead();
}

function openLeadEdit() {
    const { lead } = LD.data;
    document.getElementById('ld-title').value = lead.title;
    document.getElementById('ld-value').value = lead.expected_value ? Math.round(lead.expected_value) : '';
    document.getElementById('ld-closure').value = lead.expected_closure_date || '';
    document.getElementById('ld-desc').value = lead.description || '';
    showFormError('ld-error', '');
    modalShow('leadModal');
}

async function saveLeadEdit() {
    const title = document.getElementById('ld-title').value.trim();
    if (!title) { showFormError('ld-error', 'Title is required.'); return; }
    const button = document.getElementById('ld-save');
    setBusy(button, true);
    const res = await api('PUT', withId(LD.urls.lead, LD.id), {
        title, expected_value: document.getElementById('ld-value').value,
        expected_closure_date: document.getElementById('ld-closure').value, description: document.getElementById('ld-desc').value,
    });
    setBusy(button, false);
    if (!res.ok) { showFormError('ld-error', res.error); return; }
    modalHide('leadModal');
    toast('Lead updated');
    loadLead();
}

async function deleteLead() {
    const ok = await confirmAction({ title: 'Delete this lead?', message: 'The prospect goes back to the prospect list. Meetings and documents on this lead are removed.', confirmText: 'Delete lead', danger: true });
    if (!ok) return;
    const res = await api('DELETE', withId(LD.urls.lead, LD.id));
    if (!res.ok) { toast(res.error, 'error'); return; }
    window.location.href = pageUrl('leads');
}

/* ---------- Convert to client ---------- */
async function openClientModal() {
    const { lead } = LD.data;
    document.getElementById('clientForm').reset();
    document.getElementById('pj-name').value = lead.title;
    document.getElementById('pj-desc').value = lead.description || '';
    document.getElementById('pj-budget').value = lead.expected_value ? Math.round(lead.expected_value) : '';
    document.getElementById('pj-start').value = toDateInput(new Date());
    showFormError('cc-error', '');

    const team = document.getElementById('pj-team');
    if (!LD.devs.length) {
        const res = await api('GET', `${LD.urls.users}?role=dev`);
        if (res.ok) LD.devs = res.data.users;
    }
    team.innerHTML = LD.devs.length ? LD.devs.map(d => `
        <div><input type="checkbox" class="btn-check" id="dev-${d.id}" value="${d.id}"><label class="btn btn-sm btn-ghost" for="dev-${d.id}">${esc(d.full_name)}</label></div>`).join('')
        : '<span class="text-muted small">No developers added yet. You can assign them later.</span>';
    modalShow('clientModal');
}

async function saveClient() {
    const name = document.getElementById('pj-name').value.trim();
    if (!name) { showFormError('cc-error', 'Project name is required.'); return; }
    const team = [...document.querySelectorAll('#pj-team input:checked')].map(i => Number(i.value));
    const button = document.getElementById('cc-save');
    setBusy(button, true, 'Creating...');
    const res = await api('POST', LD.urls.client, {
        lead: LD.id,
        address: document.getElementById('cc-address').value,
        gst_number: document.getElementById('cc-gst').value,
        notes: document.getElementById('cc-notes').value,
        project: {
            name, project_type: document.getElementById('pj-type').value, description: document.getElementById('pj-desc').value,
            start_date: document.getElementById('pj-start').value, deadline: document.getElementById('pj-deadline').value,
            budget: document.getElementById('pj-budget').value, team,
        },
    });
    setBusy(button, false);
    if (!res.ok) { showFormError('cc-error', res.error); return; }
    modalHide('clientModal');
    toast('Client created');
    window.location.href = pageUrl('client', res.data.client.id);
}

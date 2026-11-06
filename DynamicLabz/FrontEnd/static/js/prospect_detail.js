let _csrf = null;
let _prospectId = null;
let _urlProspect = null;
let _urlCallLog = null;
let _urlFollowUp = null;
let _urlLead = null;
let _urlList = null;
let _state = null;

function ProspectDetailInit(csrf, prospectId, urlProspect, urlCallLog, urlFollowUp, urlLead, urlUsers, urlList) {
    _csrf = csrf;
    _prospectId = prospectId;
    _urlProspect = urlProspect;
    _urlCallLog = urlCallLog;
    _urlFollowUp = urlFollowUp;
    _urlLead = urlLead;
    _urlList = urlList;
    DL.csrf = csrf;

    ProspectModalsInit({ prospect: urlProspect, callLog: urlCallLog, followUp: urlFollowUp, users: urlUsers }, (kind, data) => {
        if (kind === 'delete') return;
        loadDetail();
    });
    document.getElementById('convertForm').addEventListener('submit', e => { e.preventDefault(); saveConversion(); });
    document.getElementById('detail-root').addEventListener('click', onDetailClick);
    loadDetail();
}

async function loadDetail() {
    const res = await api('GET', `${_urlProspect}?id=${_prospectId}`);
    const root = document.getElementById('detail-root');
    if (!res.ok) {
        root.innerHTML = emptyState('bi-exclamation-triangle', 'Prospect not available', res.error);
        return;
    }
    _state = res.data;
    document.title = `${_state.prospect.company_name} - Dynamic Labz`;
    root.innerHTML = render(_state);
}

function journeyHtml(p) {
    const isLead = p.status === 'converted';
    return `<div class="journey" aria-label="Pipeline stage">
        <span class="step ${isLead ? 'done' : 'current'}"><i class="bi bi-telephone-outbound"></i>Prospect</span><span class="bar ${isLead ? 'done' : ''}"></span>
        <span class="step ${isLead ? 'current' : ''}"><i class="bi bi-funnel"></i>Lead</span><span class="bar"></span>
        <span class="step"><i class="bi bi-buildings"></i>Client</span>
      </div>`;
}

function callTimelineHtml(logs) {
    if (!logs.length) return emptyState('bi-telephone', 'No calls logged yet', 'Log your first call to start the history.');
    const toneClass = { success: 't-success', warning: 't-warning', danger: 't-danger', neutral: 't-muted', info: '', primary: '' };
    return `<ul class="timeline">${logs.map(c => {
        const tone = TONES.outcome[c.outcome] || 'neutral';
        return `<li class="${toneClass[tone] || ''}">
            <div class="d-flex flex-wrap align-items-center gap-2">
              ${toneBadge('outcome', c.outcome, c.outcome_display)}
              ${c.connected ? '<span class="xs text-muted"><i class="bi bi-telephone-inbound"></i> Connected</span>' : ''}
              ${c.duration_minutes ? `<span class="xs text-muted">${c.duration_minutes} min</span>` : ''}
              <button class="btn btn-sm btn-ghost btn-icon ms-auto" style="width:28px;height:28px" data-del-call="${c.id}" aria-label="Delete this call log" title="Delete"><i class="bi bi-trash"></i></button>
            </div>
            ${c.summary ? `<p class="mb-1 mt-2 text-pre">${esc(c.summary)}</p>` : ''}
            <div class="when">${esc(c.called_by_name)} &middot; ${esc(fmtDateTime(c.called_at))} &middot; ${esc(timeAgo(c.called_at))}</div>
          </li>`;
    }).join('')}</ul>`;
}

function render(data) {
    const p = data.prospect;
    const converted = p.status === 'converted';
    const pending = data.follow_ups.filter(f => f.status === 'pending');
    const done = data.follow_ups.filter(f => f.status === 'done').slice(0, 3);

    const pendingHtml = pending.length
        ? `<div class="row-list">${pending.map(f => followUpRowHtml(f, true)).join('')}</div>`
        : emptyState('bi-bell-slash', 'No pending follow-ups');

    return `
      <div class="page-head">
        <div>
          <h2 class="d-flex flex-wrap align-items-center gap-2">${esc(p.company_name)} ${toneBadge('prospect', p.status, p.status_display)}</h2>
          <p>${esc([p.place, p.industry].filter(Boolean).join(' \u00B7 ') || 'No location added')} &middot; Owned by ${esc(p.owner_name)}</p>
        </div>
        <div class="actions">
          ${converted ? `<a class="btn btn-primary" href="${pageUrl('lead', p.lead_id)}"><i class="bi bi-funnel"></i>Open lead</a>` : `
            <button class="btn btn-primary" data-act="call"><i class="bi bi-telephone"></i>Log call</button>
            <button class="btn btn-ghost" data-act="followup"><i class="bi bi-bell"></i>Follow-up</button>
            <button class="btn btn-success-soft" data-act="convert"><i class="bi bi-funnel"></i>Move to leads</button>`}
          <button class="btn btn-ghost btn-icon" data-act="edit" aria-label="Edit prospect" title="Edit"><i class="bi bi-pencil"></i></button>
          ${converted ? '' : '<button class="btn btn-danger-soft btn-icon" data-act="delete" aria-label="Delete prospect" title="Delete"><i class="bi bi-trash"></i></button>'}
        </div>
      </div>

      <div class="dl-card mb-3"><div class="dl-card-body py-3 d-flex flex-wrap align-items-center justify-content-between gap-3">
        ${journeyHtml(p)}
        <div class="small text-muted">${p.first_connected_at ? `First connected ${esc(fmtDate(p.first_connected_at))}` : 'Not connected yet'} &middot; Added ${esc(fmtDate(p.created_at))}</div>
      </div></div>

      <div class="row g-3">
        <div class="col-lg-8">
          <section class="dl-card">
            <div class="dl-card-head"><h3>Call history <span class="text-muted fw-normal">(${data.call_logs.length})</span></h3>
              ${converted ? '' : '<button class="btn btn-sm btn-primary" data-act="call"><i class="bi bi-plus-lg"></i>Log call</button>'}</div>
            <div class="dl-card-body">${callTimelineHtml(data.call_logs)}</div>
          </section>
        </div>
        <div class="col-lg-4 d-grid gap-3 align-content-start">
          <section class="dl-card">
            <div class="dl-card-head"><h3>Contact</h3></div>
            <div class="dl-card-body"><dl class="info-grid mb-0" style="grid-template-columns:1fr">
              <div><dt>Contact person</dt><dd>${esc(p.contact_person)}${p.designation ? ` <span class="text-muted">&middot; ${esc(p.designation)}</span>` : ''}</dd></div>
              <div><dt>Phone</dt><dd>${telLink(p.contact_number)}${p.alternate_number ? ` &middot; ${telLink(p.alternate_number)}` : ''}</dd></div>
              <div><dt>Email</dt><dd>${p.email ? `<a class="text-primary-dl" href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : '-'}</dd></div>
              <div><dt>Website</dt><dd>${webLink(p.website)}</dd></div>
              <div><dt>Source</dt><dd>${esc(p.source_display)}</dd></div>
            </dl></div>
          </section>
          <section class="dl-card">
            <div class="dl-card-head"><h3>Follow-ups</h3>${converted ? '' : '<button class="btn btn-sm btn-ghost" data-act="followup"><i class="bi bi-plus-lg"></i>Add</button>'}</div>
            <div class="dl-card-body flush">${pendingHtml}${done.length ? `<div class="px-3 pt-2 pb-3 xs text-muted">Recently done: ${done.map(f => esc(fmtDate(f.due_at, false))).join(', ')}</div>` : ''}</div>
          </section>
          <section class="dl-card">
            <div class="dl-card-head"><h3>What they need</h3></div>
            <div class="dl-card-body">${p.requirement ? `<p class="mb-0 text-pre">${esc(p.requirement)}</p>` : '<span class="text-muted">Nothing noted yet. Edit the prospect to add requirements.</span>'}</div>
          </section>
        </div>
      </div>`;
}

async function onDetailClick(e) {
    const actionEl = e.target.closest('[data-act]');
    if (actionEl) {
        const act = actionEl.dataset.act;
        const p = _state.prospect;
        if (act === 'call') openCallModal(p);
        if (act === 'followup') openFollowUpModal({ prospect: p });
        if (act === 'edit') openProspectForm(p);
        if (act === 'convert') openConvert();
        if (act === 'delete') deleteProspect();
        return;
    }
    const doneBtn = e.target.closest('[data-fu-done]');
    if (doneBtn) { markFollowUpDone(doneBtn.dataset.fuDone); return; }
    const reschedBtn = e.target.closest('[data-fu-resched]');
    if (reschedBtn) {
        const followUp = _state.follow_ups.find(f => f.id === Number(reschedBtn.dataset.fuResched));
        openFollowUpModal({ prospect: _state.prospect, followUp });
        return;
    }
    const delCall = e.target.closest('[data-del-call]');
    if (delCall) {
        const ok = await confirmAction({ title: 'Delete this call log?', message: 'This removes the entry from the history.', confirmText: 'Delete', danger: true });
        if (!ok) return;
        const res = await api('DELETE', withId(_urlCallLog, delCall.dataset.delCall));
        if (!res.ok) { toast(res.error, 'error'); return; }
        toast('Call log deleted');
        loadDetail();
    }
}

async function deleteProspect() {
    const ok = await confirmAction({ title: 'Delete prospect?', message: `${_state.prospect.company_name} and all its call logs will be removed permanently.`, confirmText: 'Delete prospect', danger: true });
    if (!ok) return;
    const res = await api('DELETE', withId(_urlProspect, _prospectId));
    if (!res.ok) { toast(res.error, 'error'); return; }
    window.location.href = _urlList;
}

function openConvert() {
    const p = _state.prospect;
    document.getElementById('convertForm').reset();
    document.getElementById('cv-title').value = p.requirement ? p.requirement.split(/[.\n]/)[0].slice(0, 120) : `${p.company_name} project`;
    document.getElementById('cv-when').value = toLocalInput(new Date());
    document.getElementById('cv-attendees').value = p.contact_person;
    showFormError('cv-error', '');
    modalShow('convertModal');
}

async function saveConversion() {
    const title = document.getElementById('cv-title').value.trim();
    const minutes = document.getElementById('cv-minutes').value.trim();
    const when = document.getElementById('cv-when').value;
    if (!title || !when || !minutes) {
        showFormError('cv-error', 'Lead title, meeting time and what happened in the meeting are required.');
        return;
    }
    const button = document.getElementById('cv-save');
    setBusy(button, true, 'Moving...');
    const res = await api('POST', _urlLead, {
        prospect: _prospectId,
        title,
        description: _state.prospect.requirement || '',
        expected_value: document.getElementById('cv-value').value,
        expected_closure_date: document.getElementById('cv-closure').value,
        scheduled_at: when,
        mode: document.getElementById('cv-mode').value,
        location: document.getElementById('cv-location').value,
        attendees: document.getElementById('cv-attendees').value,
        minutes,
        next_steps: document.getElementById('cv-next').value,
    });
    setBusy(button, false);
    if (!res.ok) { showFormError('cv-error', res.error); return; }
    modalHide('convertModal');
    toast('Moved to leads');
    window.location.href = pageUrl('lead', res.data.lead.id);
}

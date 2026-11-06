let _csrf = null;
let _urlLead = null;
let _leads = [];
let _counts = {};
let _values = {};
const leadState = { view: 'open', search: '', owner: '' };

const OPEN_STAGES = [
    ['meeting_done', 'Meeting done', 'bi-people'],
    ['proposal_in_progress', 'Drafting proposal', 'bi-pencil-square'],
    ['proposal_submitted', 'Proposal submitted', 'bi-send-check'],
    ['negotiation', 'Negotiation', 'bi-chat-left-dots'],
];

function LeadsInit(csrf, urlLead, urlUsers) {
    _csrf = csrf;
    _urlLead = urlLead;
    DL.csrf = csrf;

    document.getElementById('flt-search').addEventListener('input', debounce(e => { leadState.search = e.target.value.trim().toLowerCase(); render(); }, 200));
    setupSegmented('flt-view', value => { leadState.view = value; render(); });

    const ownerSelect = document.getElementById('flt-owner');
    if (ownerSelect) {
        ownerSelect.addEventListener('change', () => { leadState.owner = ownerSelect.value; loadLeads(); });
        api('GET', `${urlUsers}?role=sales,admin`).then(res => { if (res.ok) fillSelect(ownerSelect, res.data.users, { placeholder: 'All owners' }); });
    }
    loadLeads();
}

async function loadLeads() {
    const res = await api('GET', `${_urlLead}?${toQueryString({ owner: leadState.owner })}`);
    const board = document.getElementById('lead-board');
    if (!res.ok) {
        board.innerHTML = emptyState('bi-exclamation-triangle', 'Could not load leads', res.error);
        return;
    }
    _leads = res.data.leads;
    _counts = res.data.status_counts;
    _values = res.data.status_values;
    render();
}

function matches(lead) {
    if (!leadState.search) return true;
    return [lead.title, lead.company_name, lead.contact_person].some(v => String(v || '').toLowerCase().includes(leadState.search));
}

function render() {
    const open = ['meeting_done', 'proposal_in_progress', 'proposal_submitted', 'negotiation'];
    const openCount = open.reduce((n, s) => n + (_counts[s] || 0), 0);
    const openValue = open.reduce((n, s) => n + (_values[s] || 0), 0);
    updateSegmentCounts('flt-view', { open: openCount, won: _counts.won || 0, lost: _counts.lost || 0 });

    document.getElementById('lead-kpis').innerHTML = [
        ['Open leads', openCount, 'bi-funnel', ''],
        ['Pipeline value', fmtMoney(openValue), 'bi-graph-up-arrow', 'Open leads combined'],
        ['Proposals out', (_counts.proposal_submitted || 0) + (_counts.negotiation || 0), 'bi-send-check', 'Awaiting a decision'],
        ['Won', _counts.won || 0, 'bi-trophy', fmtMoney(_values.won || 0) + ' total value'],
    ].map(([label, value, icon, hint]) => `<div class="col-6 col-lg-3"><div class="dl-card stat"><span class="ico"><i class="bi ${icon}"></i></span><span class="label">${label}</span><span class="value">${value}</span>${hint ? `<span class="hint">${hint}</span>` : ''}</div></div>`).join('');

    const board = document.getElementById('lead-board');
    const visible = _leads.filter(matches);

    if (leadState.view === 'open') {
        board.innerHTML = `<div class="lanes">${OPEN_STAGES.map(([key, label, icon]) => {
            const items = visible.filter(l => l.status === key);
            const total = items.reduce((n, l) => n + Number(l.expected_value || 0), 0);
            return `<section class="lane" aria-label="${label}">
                <div class="lane-head"><span><i class="bi ${icon} me-1"></i>${label} <span class="text-muted">(${items.length})</span></span><span class="sum">${total ? fmtMoney(total) : ''}</span></div>
                ${items.length ? items.map(cardHtml).join('') : '<div class="text-muted small text-center py-4">Nothing here</div>'}
              </section>`;
        }).join('')}</div>`;
        return;
    }

    const items = visible.filter(l => l.status === leadState.view);
    if (!items.length) {
        board.innerHTML = `<div class="dl-card">${emptyState(leadState.view === 'won' ? 'bi-trophy' : 'bi-x-circle', `No ${leadState.view} leads`, '')}</div>`;
        return;
    }
    board.innerHTML = `<div class="dl-card"><div class="table-wrap"><table class="table dl-table"><thead><tr><th>Lead</th><th>Contact</th><th>Value</th><th>Closed</th><th>${leadState.view === 'lost' ? 'Reason' : 'Client'}</th></tr></thead><tbody>
      ${items.map(l => `<tr class="clickable" data-id="${l.id}" tabindex="0">
        <td><span class="cell-title">${esc(l.title)}</span><span class="cell-sub">${esc(l.company_name)}</span></td>
        <td><span class="cell-title">${esc(l.contact_person)}</span><span class="cell-sub">${esc(l.contact_number)}</span></td>
        <td class="tabular">${l.expected_value ? fmtMoney(l.expected_value) : '-'}</td>
        <td>${l.closed_at ? esc(fmtDate(l.closed_at)) : '-'}</td>
        <td>${leadState.view === 'lost' ? esc(l.lost_reason || '-') : (l.client_id ? `<a class="text-primary-dl" href="${pageUrl('client', l.client_id)}">Open client</a>` : '-')}</td>
      </tr>`).join('')}</tbody></table></div></div>`;
}

function cardHtml(l) {
    const meetingAgo = l.last_meeting_at ? `Met ${timeAgo(l.last_meeting_at)}` : 'No meeting yet';
    return `<a class="lead-card text-decoration-none" href="${pageUrl('lead', l.id)}">
        <div class="t">${esc(l.title)}</div>
        <div class="small text-muted mb-2">${esc(l.company_name)}${l.place ? ' \u00B7 ' + esc(l.place) : ''}</div>
        <div class="d-flex justify-content-between align-items-center">
          <span class="fw-600 tabular">${l.expected_value ? fmtMoney(l.expected_value) : '<span class="text-muted fw-normal">No value</span>'}</span>
          <span class="xs text-muted"><i class="bi bi-paperclip"></i> ${l.documents_count} &middot; <i class="bi bi-people"></i> ${l.meetings_count}</span>
        </div>
        <div class="xs text-muted mt-2">${esc(meetingAgo)}${l.expected_closure_date ? ' \u00B7 Close by ' + esc(fmtDate(l.expected_closure_date, false)) : ''}</div>
        ${document.getElementById('flt-owner') ? `<div class="xs mt-2">${avatar(l.owner_name, 'sm')} <span class="text-muted ms-1">${esc(l.owner_name)}</span></div>` : ''}
      </a>`;
}

document.addEventListener('click', e => {
    const row = e.target.closest('tr.clickable[data-id]');
    if (row) window.location.href = pageUrl('lead', row.dataset.id);
});

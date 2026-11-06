let _csrf = null;
let _urlProspect = null;
let _isAdmin = false;

const listState = { page: 1, status: '', search: '', owner: '', pageSize: 15, items: [] };

function ProspectsInit(csrf, urlProspect, urlCallLog, urlFollowUp, urlUsers, isAdmin) {
    _csrf = csrf;
    _urlProspect = urlProspect;
    _isAdmin = isAdmin;
    DL.csrf = csrf;

    ProspectModalsInit({ prospect: urlProspect, callLog: urlCallLog, followUp: urlFollowUp, users: urlUsers }, () => loadProspects());

    document.getElementById('btn-add-prospect').addEventListener('click', () => openProspectForm());
    document.getElementById('flt-search').addEventListener('input', debounce(e => {
        listState.search = e.target.value.trim();
        listState.page = 1;
        loadProspects();
    }, 300));
    setupSegmented('flt-status', value => { listState.status = value; listState.page = 1; loadProspects(); });

    const ownerSelect = document.getElementById('flt-owner');
    if (ownerSelect) {
        ownerSelect.addEventListener('change', () => { listState.owner = ownerSelect.value; listState.page = 1; loadProspects(); });
        api('GET', `${urlUsers}?role=sales,admin`).then(res => {
            if (res.ok) fillSelect(ownerSelect, res.data.users, { placeholder: 'All owners' });
        });
    }

    document.getElementById('prospect-rows').addEventListener('click', onRowClick);
    document.getElementById('pager').addEventListener('click', e => {
        const b = e.target.closest('button[data-page]');
        if (b) { listState.page = Number(b.dataset.page); loadProspects(); }
    });

    loadProspects();
}

async function loadProspects() {
    const query = toQueryString({ page: listState.page, page_size: listState.pageSize, status: listState.status, search: listState.search, owner: listState.owner });
    const res = await api('GET', `${_urlProspect}?${query}`);
    const body = document.getElementById('prospect-rows');
    const cols = _isAdmin ? 7 : 6;
    if (!res.ok) {
        body.innerHTML = `<tr><td colspan="${cols}">${emptyState('bi-exclamation-triangle', 'Could not load prospects', res.error)}</td></tr>`;
        return;
    }
    const { prospects, total, page, pages, status_counts } = res.data;
    listState.items = prospects;

    const counts = { ...status_counts };
    counts[''] = Object.values(status_counts).reduce((a, b) => a + b, 0);
    if (!listState.status && !listState.search) updateSegmentCounts('flt-status', counts);

    if (!prospects.length) {
        body.innerHTML = `<tr><td colspan="${cols}">${emptyState('bi-telephone-outbound', listState.search || listState.status ? 'No prospects match these filters' : 'No prospects yet', listState.search || listState.status ? 'Try clearing the search or filter.' : 'Add your first prospect to start logging calls.')}</td></tr>`;
    } else {
        body.innerHTML = prospects.map(rowHtml).join('');
    }
    renderPager(total, page, pages);
}

function rowHtml(p) {
    const nextFollow = p.next_follow_up
        ? `<span class="${dayKey(p.next_follow_up) < todayKey() ? 'text-danger fw-600' : ''}">${esc(fmtDateTime(p.next_follow_up))}</span>`
        : '<span class="text-muted">-</span>';
    const converted = p.status === 'converted';
    return `<tr class="clickable" data-id="${p.id}" tabindex="0">
        <td><span class="cell-title">${esc(p.company_name)}</span><span class="cell-sub">${esc([p.place, p.industry].filter(Boolean).join(' \u00B7 ') || 'No location')}</span></td>
        <td><span class="cell-title">${esc(p.contact_person)}</span><span class="cell-sub">${esc(p.contact_number)}</span></td>
        <td>${toneBadge('prospect', p.status, p.status_display)}</td>
        <td>${p.last_call_at ? `<span class="cell-title">${esc(p.last_call_outcome)}</span><span class="cell-sub">${esc(timeAgo(p.last_call_at))} \u00B7 ${p.calls_count} call${p.calls_count === 1 ? '' : 's'}</span>` : '<span class="text-muted">Not called yet</span>'}</td>
        <td>${nextFollow}</td>
        ${_isAdmin ? `<td>${esc(p.owner_name)}</td>` : ''}
        <td class="text-end text-nowrap">
          ${converted ? `<a class="btn btn-sm btn-ghost" href="${pageUrl('lead', p.lead_id)}">View lead</a>`
            : `<button class="btn btn-sm btn-primary" data-act="call" data-id="${p.id}"><i class="bi bi-telephone"></i>Log call</button>`}
        </td>
      </tr>`;
}

function onRowClick(e) {
    const callBtn = e.target.closest('[data-act="call"]');
    if (callBtn) {
        e.stopPropagation();
        const prospect = listState.items.find(p => p.id === Number(callBtn.dataset.id));
        if (prospect) openCallModal(prospect);
        return;
    }
    if (e.target.closest('a')) return;
    const row = e.target.closest('tr[data-id]');
    if (row) window.location.href = pageUrl('prospect', row.dataset.id);
}

function renderPager(total, page, pages) {
    const pager = document.getElementById('pager');
    if (!total) { pager.innerHTML = ''; return; }
    const from = (page - 1) * listState.pageSize + 1;
    const to = Math.min(page * listState.pageSize, total);
    pager.innerHTML = `<span class="text-muted small">Showing ${from}-${to} of ${total}</span>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-ghost" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i>Previous</button>
        <button class="btn btn-sm btn-ghost" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next<i class="bi bi-chevron-right"></i></button>
      </div>`;
}

document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('tr.clickable')) window.location.href = pageUrl('prospect', e.target.dataset.id);
});

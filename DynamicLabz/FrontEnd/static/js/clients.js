let _csrf = null;
let _urlClient = null;
let _role = null;
const clientState = { search: '', status: '', owner: '' };

function ClientsInit(csrf, urlClient, urlUsers, role) {
    _csrf = csrf;
    _urlClient = urlClient;
    _role = role;
    DL.csrf = csrf;

    document.getElementById('flt-search').addEventListener('input', debounce(e => { clientState.search = e.target.value.trim(); loadClients(); }, 300));
    setupSegmented('flt-status', value => { clientState.status = value; loadClients(); });

    const ownerSelect = document.getElementById('flt-owner');
    if (ownerSelect) {
        ownerSelect.addEventListener('change', () => { clientState.owner = ownerSelect.value; loadClients(); });
        api('GET', `${urlUsers}?role=sales,admin`).then(res => { if (res.ok) fillSelect(ownerSelect, res.data.users, { placeholder: 'All owners' }); });
    }

    const addButton = document.getElementById('btn-add-client');
    if (addButton) {
        addButton.addEventListener('click', () => {
            document.getElementById('clientForm').reset();
            showFormError('cl-error', '');
            modalShow('clientModal');
        });
        document.getElementById('clientForm').addEventListener('submit', e => { e.preventDefault(); saveClient(); });
    }
    loadClients();
}

async function loadClients() {
    const res = await api('GET', `${_urlClient}?${toQueryString(clientState)}`);
    const grid = document.getElementById('client-grid');
    if (!res.ok) {
        grid.innerHTML = `<div class="col-12">${emptyState('bi-exclamation-triangle', 'Could not load clients', res.error)}</div>`;
        return;
    }
    const clients = res.data.clients;
    if (!clients.length) {
        const dev = _role === 'dev';
        grid.innerHTML = `<div class="col-12"><div class="dl-card">${emptyState('bi-buildings', dev ? 'No projects assigned yet' : 'No clients found', dev ? 'Projects you are added to will appear here.' : 'Convert a won lead or add a client directly.')}</div></div>`;
        return;
    }
    grid.innerHTML = clients.map(cardHtml).join('');
}

function cardHtml(c) {
    const deadline = c.next_deadline;
    const overdue = deadline && dayKey(deadline) < todayKey();
    return `<div class="col-md-6 col-xl-4"><a class="dl-card d-block h-100 text-decoration-none text-body lead-card" style="padding:0;margin:0" href="${pageUrl('client', c.id)}">
        <div class="dl-card-body">
          <div class="d-flex align-items-start gap-3 mb-3">
            <span class="avatar lg" style="border-radius:14px">${esc(initials(c.company_name))}</span>
            <div class="flex-grow-1" style="min-width:0">
              <div class="fw-600 fs-6 text-truncate">${esc(c.company_name)}</div>
              <div class="small text-muted text-truncate">${esc(c.contact_person)}${c.place ? ' &middot; ' + esc(c.place) : ''}</div>
            </div>
            ${toneBadge('client', c.status, c.status_display)}
          </div>
          <div class="row text-center g-2 mb-3">
            <div class="col-4"><div class="fw-600 font-display fs-5">${c.projects_count}</div><div class="xs text-muted">Projects</div></div>
            <div class="col-4"><div class="fw-600 font-display fs-5">${c.open_tasks_count}</div><div class="xs text-muted">Open tasks</div></div>
            <div class="col-4"><div class="fw-600 font-display fs-6 pt-1 ${overdue ? 'text-danger' : ''}">${deadline ? esc(fmtDate(deadline, false)) : '-'}</div><div class="xs text-muted">Next deadline</div></div>
          </div>
          <div class="d-flex justify-content-between align-items-center small text-muted border-top pt-3" style="border-color:var(--dl-border)!important">
            <span>${_role === 'dev' ? '' : `${avatar(c.owner_name, 'sm')} <span class="ms-1">${esc(c.owner_name)}</span>`}</span>
            <span>Since ${esc(fmtDate(c.onboarded_on))}</span>
          </div>
        </div></a></div>`;
}

async function saveClient() {
    const value = id => document.getElementById(id).value.trim();
    if (!value('cl-company') || !value('cl-person') || !value('cl-number')) {
        showFormError('cl-error', 'Company name, contact person and contact number are required.');
        return;
    }
    const button = document.getElementById('cl-save');
    setBusy(button, true);
    const res = await api('POST', _urlClient, {
        company_name: value('cl-company'), place: value('cl-place'), contact_person: value('cl-person'), designation: value('cl-designation'),
        contact_number: value('cl-number'), email: value('cl-email'), website: value('cl-website'), gst_number: value('cl-gst'), address: value('cl-address'),
    });
    setBusy(button, false);
    if (!res.ok) { showFormError('cl-error', res.error); return; }
    modalHide('clientModal');
    toast('Client added');
    window.location.href = pageUrl('client', res.data.client.id);
}

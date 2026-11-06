let _csrf = null;
const TG = { url: '', urlUsers: '', isAdmin: false, month: '', data: null, users: [], editId: null };

function TargetsInit(csrf, urlTarget, urlUsers, isAdmin) {
    _csrf = csrf;
    TG.url = urlTarget;
    TG.urlUsers = urlUsers;
    TG.isAdmin = isAdmin;
    DL.csrf = csrf;
    TG.month = toDateInput(new Date()).slice(0, 7);

    const pick = document.getElementById('month-pick');
    pick.value = TG.month;
    pick.addEventListener('change', () => { if (pick.value) { TG.month = pick.value; loadTargets(); } });
    document.getElementById('month-prev').addEventListener('click', () => shiftMonth(-1));
    document.getElementById('month-next').addEventListener('click', () => shiftMonth(1));

    if (isAdmin) {
        document.getElementById('btn-add-target').addEventListener('click', () => openTarget());
        document.getElementById('btn-copy').addEventListener('click', copyFromPrevious);
        document.getElementById('targetForm').addEventListener('submit', e => { e.preventDefault(); saveTarget(); });
        document.getElementById('tg-user').addEventListener('change', syncMetricOptions);
        document.getElementById('tg-metric').addEventListener('change', syncValueLabel);
        document.getElementById('target-root').addEventListener('click', onClick);
    }
    loadTargets();
}

function monthShift(month, delta) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(delta) {
    TG.month = monthShift(TG.month, delta);
    document.getElementById('month-pick').value = TG.month;
    loadTargets();
}

async function loadTargets() {
    const res = await api('GET', `${TG.url}?month=${TG.month}`);
    const root = document.getElementById('target-root');
    if (!res.ok) { root.innerHTML = emptyState('bi-exclamation-triangle', 'Could not load targets', res.error); return; }
    TG.data = res.data;
    const { targets } = res.data;

    if (!targets.length) {
        root.innerHTML = `<div class="dl-card">${emptyState('bi-bullseye', 'No targets for this month', TG.isAdmin ? 'Set a target for a teammate or copy last month\'s targets.' : 'Your admin has not set targets for this month yet.')}</div>`;
        return;
    }

    const groups = {};
    targets.forEach(t => { (groups[t.user] = groups[t.user] || { name: t.user_name, role: t.user_role, items: [] }).items.push(t); });

    root.innerHTML = `<div class="row g-3">${Object.values(groups).map(g => {
        const avg = Math.round(g.items.reduce((n, t) => n + Math.min(t.percent, 100), 0) / g.items.length);
        return `<div class="col-lg-6"><section class="dl-card h-100">
          <div class="dl-card-head"><span class="d-flex align-items-center gap-2">${avatar(g.name)}<span><h3>${esc(g.name)}</h3><span class="xs text-muted text-capitalize">${esc(g.role)}</span></span></span>
            <div class="target-ring ${avg >= 100 ? 'ok' : ''}" style="--p:${avg}" role="img" aria-label="${avg}% overall"><span>${avg}%</span></div></div>
          <div class="dl-card-body">${g.items.map(t => `
            <div class="mb-3">${targetRowHtml(t)}${t.note ? `<div class="xs text-muted mt-n2">${esc(t.note)}</div>` : ''}
              ${TG.isAdmin ? `<div class="d-flex gap-1 justify-content-end"><button class="btn btn-sm btn-ghost btn-icon" data-edit="${t.id}" aria-label="Edit target"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-ghost btn-icon" data-del="${t.id}" aria-label="Delete target"><i class="bi bi-trash"></i></button></div>` : ''}</div>`).join('')}</div>
        </section></div>`;
    }).join('')}</div>`;
}

/* ---------- Admin ---------- */
async function loadUsers() {
    if (TG.users.length) return;
    const res = await api('GET', TG.urlUsers);
    if (res.ok) TG.users = res.data.users;
}

function syncMetricOptions() {
    const user = TG.users.find(u => u.id === Number(document.getElementById('tg-user').value));
    const metrics = TG.data.metrics.filter(m => !user || m.roles.includes(user.role));
    fillSelect('tg-metric', metrics, { value: 'key', label: 'label' });
    syncValueLabel();
}

function syncValueLabel() {
    const metric = TG.data.metrics.find(m => m.key === document.getElementById('tg-metric').value);
    const unit = { currency: 'in INR', hours: 'in hours', count: 'count' }[metric?.unit || 'count'];
    document.getElementById('tg-value-label').textContent = `Target for the month (${unit})`;
}

async function openTarget(target = null) {
    await loadUsers();
    TG.editId = target ? target.id : null;
    document.getElementById('targetModalTitle').textContent = target ? 'Edit target' : 'Set target';
    fillSelect('tg-user', TG.users.filter(u => u.role !== undefined), { label: u => `${u.full_name} (${u.role_display})` });
    if (target) document.getElementById('tg-user').value = target.user;
    syncMetricOptions();
    if (target) document.getElementById('tg-metric').value = target.metric;
    syncValueLabel();
    document.getElementById('tg-user').disabled = !!target;
    document.getElementById('tg-metric').disabled = !!target;
    document.getElementById('tg-value').value = target ? target.target_value : '';
    document.getElementById('tg-note').value = target?.note || '';
    showFormError('tg-error', '');
    modalShow('targetModal');
}

async function saveTarget() {
    const value = document.getElementById('tg-value').value;
    if (!value || Number(value) <= 0) { showFormError('tg-error', 'Enter a target greater than zero.'); return; }
    const button = document.getElementById('tg-save');
    setBusy(button, true);
    const payload = { target_value: value, note: document.getElementById('tg-note').value };
    const res = TG.editId
        ? await api('PUT', withId(TG.url, TG.editId), payload)
        : await api('POST', TG.url, { ...payload, user: document.getElementById('tg-user').value, metric: document.getElementById('tg-metric').value, month: TG.month });
    setBusy(button, false);
    if (!res.ok) { showFormError('tg-error', res.error); return; }
    modalHide('targetModal');
    toast('Target saved');
    loadTargets();
}

async function copyFromPrevious() {
    const previous = monthShift(TG.month, -1);
    const ok = await confirmAction({ title: `Copy targets from ${previous}?`, message: 'Only targets that do not exist yet this month are added.', confirmText: 'Copy targets' });
    if (!ok) return;
    const res = await api('POST', TG.url, { month: TG.month, copy_from_month: previous });
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast(`${res.data.copied} target${res.data.copied === 1 ? '' : 's'} copied`);
    loadTargets();
}

async function onClick(e) {
    const edit = e.target.closest('[data-edit]');
    if (edit) { openTarget(TG.data.targets.find(t => t.id === Number(edit.dataset.edit))); return; }
    const del = e.target.closest('[data-del]');
    if (del) {
        const ok = await confirmAction({ title: 'Delete this target?', message: 'Progress history is not stored separately.', confirmText: 'Delete', danger: true });
        if (!ok) return;
        const res = await api('DELETE', withId(TG.url, del.dataset.del));
        if (!res.ok) { toast(res.error, 'error'); return; }
        toast('Target deleted');
        loadTargets();
    }
}

let _csrf = null;
const TM_STATE = { url: '', me: null, users: [], editId: null, role: '', search: '', inactive: false };

function TeamInit(csrf, urlUsers, me) {
    _csrf = csrf;
    TM_STATE.url = urlUsers;
    TM_STATE.me = me;
    DL.csrf = csrf;

    document.getElementById('btn-add-user').addEventListener('click', () => openUser());
    document.getElementById('userForm').addEventListener('submit', e => { e.preventDefault(); saveUser(); });
    document.getElementById('flt-search').addEventListener('input', debounce(e => { TM_STATE.search = e.target.value.trim(); loadUsers(); }, 300));
    document.getElementById('flt-inactive').addEventListener('change', e => { TM_STATE.inactive = e.target.checked; loadUsers(); });
    setupSegmented('flt-role', value => { TM_STATE.role = value; loadUsers(); });
    document.getElementById('user-rows').addEventListener('click', onClick);
    loadUsers();
}

async function loadUsers() {
    const res = await api('GET', `${TM_STATE.url}?${toQueryString({ role: TM_STATE.role, search: TM_STATE.search, include_inactive: TM_STATE.inactive ? 1 : '' })}`);
    const body = document.getElementById('user-rows');
    if (!res.ok) { body.innerHTML = `<tr><td colspan="7">${emptyState('bi-exclamation-triangle', 'Could not load the team', res.error)}</td></tr>`; return; }
    TM_STATE.users = res.data.users;
    if (!TM_STATE.users.length) { body.innerHTML = `<tr><td colspan="7">${emptyState('bi-people', 'No teammates match')}</td></tr>`; return; }

    const roleTone = { admin: 'primary', sales: 'info', dev: 'success' };
    body.innerHTML = TM_STATE.users.map(u => `<tr class="${u.is_active ? '' : 'opacity-50'}">
        <td><span class="d-flex align-items-center gap-2">${avatar(u.full_name)}<span><span class="cell-title">${esc(u.full_name)}</span><span class="cell-sub">${esc(u.email)}</span></span></span></td>
        <td>${badge(u.role_display, roleTone[u.role], true)}<span class="cell-sub">${esc(u.designation || '')}</span></td>
        <td>${u.contact_number ? telLink(u.contact_number) : '-'}</td>
        <td>${u.date_of_joining ? esc(fmtDate(u.date_of_joining)) : '-'}</td>
        <td>${u.last_login ? esc(timeAgo(u.last_login)) : 'Never'}</td>
        <td>${badge(u.is_active ? 'Active' : 'Deactivated', u.is_active ? 'success' : 'neutral')}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-sm btn-ghost btn-icon" data-edit="${u.id}" aria-label="Edit ${esc(u.full_name)}"><i class="bi bi-pencil"></i></button>
          ${u.id === TM_STATE.me ? '' : (u.is_active
            ? `<button class="btn btn-sm btn-danger-soft btn-icon" data-deactivate="${u.id}" aria-label="Deactivate ${esc(u.full_name)}"><i class="bi bi-person-dash"></i></button>`
            : `<button class="btn btn-sm btn-success-soft btn-icon" data-activate="${u.id}" aria-label="Reactivate ${esc(u.full_name)}"><i class="bi bi-person-check"></i></button>`)}
        </td></tr>`).join('');
}

function openUser(user = null) {
    TM_STATE.editId = user ? user.id : null;
    document.getElementById('userModalTitle').textContent = user ? 'Edit teammate' : 'Add teammate';
    document.getElementById('us-first').value = user?.first_name || '';
    document.getElementById('us-last').value = user?.last_name || '';
    document.getElementById('us-email').value = user?.email || '';
    document.getElementById('us-role').value = user?.role || 'sales';
    document.getElementById('us-designation').value = user?.designation || '';
    document.getElementById('us-phone').value = user?.contact_number || '';
    document.getElementById('us-joined').value = user?.date_of_joining || '';
    document.getElementById('us-password').value = '';
    document.getElementById('us-password-label').textContent = user ? 'Reset password' : 'Password *';
    document.getElementById('us-password-help').textContent = user ? 'Leave empty to keep the current password.' : 'Share this with the teammate. They can change it from their profile.';
    showFormError('us-error', '');
    modalShow('userModal');
}

async function saveUser() {
    const v = id => document.getElementById(id).value.trim();
    if (!v('us-first') || !v('us-email')) { showFormError('us-error', 'First name and email are required.'); return; }
    if (!TM_STATE.editId && v('us-password').length < 8) { showFormError('us-error', 'Password must be at least 8 characters.'); return; }
    const payload = {
        first_name: v('us-first'), last_name: v('us-last'), email: v('us-email'), role: v('us-role'),
        designation: v('us-designation'), contact_number: v('us-phone'), date_of_joining: v('us-joined'),
    };
    if (v('us-password')) payload.password = document.getElementById('us-password').value;

    const button = document.getElementById('us-save');
    setBusy(button, true);
    const res = TM_STATE.editId ? await api('PUT', withId(TM_STATE.url, TM_STATE.editId), payload) : await api('POST', TM_STATE.url, payload);
    setBusy(button, false);
    if (!res.ok) { showFormError('us-error', res.error); return; }
    modalHide('userModal');
    toast(TM_STATE.editId ? 'Teammate updated' : 'Teammate added');
    loadUsers();
}

async function onClick(e) {
    const edit = e.target.closest('[data-edit]');
    if (edit) { openUser(TM_STATE.users.find(u => u.id === Number(edit.dataset.edit))); return; }

    const deactivate = e.target.closest('[data-deactivate]');
    if (deactivate) {
        const user = TM_STATE.users.find(u => u.id === Number(deactivate.dataset.deactivate));
        const ok = await confirmAction({ title: `Deactivate ${user.full_name}?`, message: 'They can no longer sign in. Their history stays intact.', confirmText: 'Deactivate', danger: true });
        if (!ok) return;
        const res = await api('DELETE', withId(TM_STATE.url, user.id));
        if (!res.ok) { toast(res.error, 'error'); return; }
        toast('Teammate deactivated');
        loadUsers();
        return;
    }

    const activate = e.target.closest('[data-activate]');
    if (activate) {
        const res = await api('PUT', withId(TM_STATE.url, activate.dataset.activate), { is_active: true });
        if (!res.ok) { toast(res.error, 'error'); return; }
        toast('Teammate reactivated');
        loadUsers();
    }
}

/* Shared helpers for every Dynamic Labz page. Loaded after api_caller.js and bootstrap. */

const DL = { csrf: '', loginUrl: '/login/', logoutUrl: '', followUpsUrl: '', role: '' };

/* ---------- Formatting ---------- */
function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* All timestamps are shown in the agency timezone (matches Django TIME_ZONE) so "today" agrees with the server. */
const DL_TZ = 'Asia/Kolkata';
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (DATE_ONLY.test(value)) {
        const [y, m, d] = value.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d, 12));
    }
    return new Date(value);
}

function tzOptions(value) {
    return typeof value === 'string' && DATE_ONLY.test(value) ? { timeZone: 'UTC' } : { timeZone: DL_TZ };
}

function dayKey(value) {
    const d = toDate(value);
    return d.toLocaleDateString('en-CA', tzOptions(value));
}

function zonedParts(date) {
    const parts = {};
    new Intl.DateTimeFormat('en-CA', {
        timeZone: DL_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).forEach(p => { parts[p.type] = p.value; });
    return parts;
}

function fmtDate(value, withYear = true) {
    const d = toDate(value);
    if (!d || isNaN(d)) return '-';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}), ...tzOptions(value) });
}

function fmtTime(value) {
    const d = toDate(value);
    if (!d || isNaN(d)) return '-';
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: DL_TZ });
}

function fmtDateTime(value) {
    const d = toDate(value);
    if (!d || isNaN(d)) return '-';
    const sameYear = zonedParts(d).year === zonedParts(new Date()).year;
    return `${fmtDate(d, !sameYear)}, ${fmtTime(d)}`;
}

function fmtMoney(value) {
    const n = Number(value || 0);
    if (n >= 10000000) return `\u20B9${(n / 10000000).toFixed(2).replace(/\.?0+$/, '')} Cr`;
    if (n >= 100000) return `\u20B9${(n / 100000).toFixed(2).replace(/\.?0+$/, '')} L`;
    return '\u20B9' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function fmtMoneyFull(value) {
    return '\u20B9' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function fmtHours(value) {
    if (value === null || value === undefined) return '-';
    const h = Math.floor(value);
    const m = Math.round((value - h) * 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
}

function timeAgo(value) {
    const d = toDate(value);
    if (!d || isNaN(d)) return '';
    const seconds = Math.round((Date.now() - d.getTime()) / 1000);
    const abs = Math.abs(seconds);
    const units = [[86400, 'day'], [3600, 'hour'], [60, 'minute']];
    for (const [size, label] of units) {
        if (abs >= size) {
            const n = Math.floor(abs / size);
            return seconds > 0 ? `${n} ${label}${n > 1 ? 's' : ''} ago` : `in ${n} ${label}${n > 1 ? 's' : ''}`;
        }
    }
    return 'just now';
}

function daysLabel(daysLeft) {
    if (daysLeft === null || daysLeft === undefined) return '';
    if (daysLeft < 0) return `${Math.abs(daysLeft)}d overdue`;
    if (daysLeft === 0) return 'Due today';
    if (daysLeft === 1) return 'Due tomorrow';
    return `${daysLeft}d left`;
}

function toLocalInput(date = new Date()) {
    const p = zonedParts(toDate(date));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function toDateInput(date = new Date()) {
    return toLocalInput(date).slice(0, 10);
}

function addDays(days, hour = 10) {
    const d = new Date(Date.now() + days * 86400000);
    return `${toDateInput(d)}T${String(hour).padStart(2, '0')}:00`;
}

function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function avatar(name, size = '') {
    return `<span class="avatar ${size}" title="${esc(name)}">${esc(initials(name))}</span>`;
}

function bytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1048576).toFixed(1)} MB`;
}

/* ---------- Status tones ---------- */
const TONES = {
    prospect: { new: 'neutral', contacted: 'info', interested: 'success', follow_up: 'warning', not_interested: 'danger', converted: 'primary' },
    lead: { meeting_done: 'info', proposal_in_progress: 'warning', proposal_submitted: 'primary', negotiation: 'warning', won: 'success', lost: 'danger' },
    client: { active: 'success', on_hold: 'warning', completed: 'primary', churned: 'neutral' },
    project: { planning: 'neutral', in_progress: 'info', review: 'warning', completed: 'success', on_hold: 'neutral' },
    task: { todo: 'neutral', in_progress: 'info', review: 'warning', blocked: 'danger', done: 'success' },
    priority: { low: 'neutral', medium: 'info', high: 'warning', urgent: 'danger' },
    invoice: { draft: 'neutral', sent: 'info', paid: 'success', cancelled: 'neutral', overdue: 'danger' },
    attendance: { present: 'success', half_day: 'warning', leave: 'info', absent: 'neutral' },
    outcome: { connected_interested: 'success', connected_brief_given: 'info', meeting_fixed: 'success', call_later: 'warning', not_available: 'neutral', no_answer: 'neutral', wrong_number: 'danger', not_interested: 'danger' },
};

function badge(label, tone = 'neutral', noDot = false) {
    return `<span class="dl-badge tone-${tone}${noDot ? ' no-dot' : ''}">${esc(label)}</span>`;
}

function toneBadge(kind, value, label) {
    return badge(label || String(value || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()), (TONES[kind] || {})[value] || 'neutral');
}

function emptyState(icon, title, text = '') {
    return `<div class="empty"><i class="bi ${icon}"></i><strong>${esc(title)}</strong><span>${esc(text)}</span></div>`;
}

function skeletonRows(count = 4) {
    return Array.from({ length: count }, () => '<div class="skeleton mb-3" style="height:44px"></div>').join('');
}

function debounce(fn, wait = 300) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
}

/* ---------- API wrapper ---------- */
async function api(method, url, body = null, media = false) {
    const [ok, res] = await callApi(method, url, body, DL.csrf, media);
    if (!ok) {
        return { ok: false, data: null, error: typeof res === 'string' ? res : 'Something went wrong. Please try again.' };
    }
    if (res.user_not_logged_in) {
        window.location.href = DL.loginUrl;
        return { ok: false, data: null, error: 'Please sign in again.' };
    }
    if (!res.success) {
        return { ok: false, data: null, error: res.error || 'Something went wrong. Please try again.' };
    }
    return { ok: true, data: res.data, error: null };
}

function withId(url, id, query = '') {
    return `${url}${id}/${query}`;
}

function pageUrl(key, id) {
    const base = (window.DL_PAGES || {})[key] || '#';
    return id === undefined ? base : base.replace(/0\/$/, `${id}/`);
}

/* ---------- UI helpers ---------- */
function toast(message, type = 'success') {
    let stack = document.getElementById('toast-stack');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'toast-stack';
        stack.className = 'toast-stack';
        stack.setAttribute('role', 'status');
        stack.setAttribute('aria-live', 'polite');
        document.body.appendChild(stack);
    }
    const icon = type === 'error' ? 'bi-exclamation-octagon-fill text-danger' : 'bi-check-circle-fill text-success';
    const el = document.createElement('div');
    el.className = `toast-dl ${type}`;
    el.innerHTML = `<i class="bi ${icon}"></i><span>${esc(message)}</span>`;
    stack.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 4200);
}

function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
        button.dataset.label = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> ${esc(label || 'Saving...')}`;
    } else {
        button.disabled = false;
        if (button.dataset.label) button.innerHTML = button.dataset.label;
    }
}

function showFormError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('show', !!message);
}

function modalShow(id) {
    const el = document.getElementById(id);
    if (el) bootstrap.Modal.getOrCreateInstance(el).show();
}

function modalHide(id) {
    const el = document.getElementById(id);
    if (el) bootstrap.Modal.getOrCreateInstance(el).hide();
}

function formValues(form) {
    const out = {};
    new FormData(form).forEach((value, key) => {
        if (value instanceof File) return;
        out[key] = typeof value === 'string' ? value.trim() : value;
    });
    return out;
}

function confirmAction({ title = 'Are you sure?', message = '', confirmText = 'Confirm', danger = false } = {}) {
    return new Promise(resolve => {
        let modalEl = document.getElementById('dl-confirm');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.className = 'modal fade';
            modalEl.id = 'dl-confirm';
            modalEl.tabIndex = -1;
            modalEl.innerHTML = `<div class="modal-dialog modal-dialog-centered modal-sm"><div class="modal-content">
                <div class="modal-body p-4"><h5 class="modal-title mb-2" id="dl-confirm-title"></h5><p class="text-muted mb-4" id="dl-confirm-msg"></p>
                <div class="d-flex gap-2 justify-content-end"><button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button><button class="btn" id="dl-confirm-ok"></button></div></div></div></div>`;
            document.body.appendChild(modalEl);
        }
        modalEl.querySelector('#dl-confirm-title').textContent = title;
        modalEl.querySelector('#dl-confirm-msg').textContent = message;
        const ok = modalEl.querySelector('#dl-confirm-ok');
        ok.textContent = confirmText;
        ok.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        let answered = false;
        const onOk = () => { answered = true; modal.hide(); };
        const onHidden = () => { ok.removeEventListener('click', onOk); resolve(answered); };
        ok.addEventListener('click', onOk, { once: true });
        modalEl.addEventListener('hidden.bs.modal', onHidden, { once: true });
        modal.show();
    });
}

function fillSelect(select, items, { value = 'id', label = 'full_name', placeholder = null, selected = null } = {}) {
    const el = typeof select === 'string' ? document.getElementById(select) : select;
    if (!el) return;
    const options = (placeholder !== null ? [`<option value="">${esc(placeholder)}</option>`] : [])
        .concat(items.map(item => `<option value="${esc(item[value])}">${esc(typeof label === 'function' ? label(item) : item[label])}</option>`));
    el.innerHTML = options.join('');
    if (selected !== null && selected !== undefined) el.value = String(selected);
}

function setupSegmented(containerId, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.addEventListener('click', event => {
        const button = event.target.closest('button[data-value]');
        if (!button) return;
        container.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === button));
        onChange(button.dataset.value);
    });
}

function updateSegmentCounts(containerId, counts) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('button[data-value]').forEach(button => {
        const n = button.querySelector('.n');
        if (n && counts[button.dataset.value] !== undefined) n.textContent = counts[button.dataset.value];
    });
}

function telLink(number) {
    return number ? `<a href="tel:${esc(String(number).replace(/\s+/g, ''))}" class="text-primary-dl">${esc(number)}</a>` : '-';
}

function webLink(site) {
    if (!site) return '-';
    const url = /^https?:\/\//i.test(site) ? site : `https://${site}`;
    return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="text-primary-dl">${esc(site.replace(/^https?:\/\//i, ''))}</a>`;
}

/* ---------- Shared components ---------- */
function todayKey() {
    return dayKey(new Date());
}

function followUpRowHtml(f, withActions = false, showOwner = false) {
    const due = toDate(f.due_at);
    const isToday = dayKey(due) === todayKey();
    const overdue = f.status === 'pending' && dayKey(due) < todayKey();
    const target = f.lead_id ? pageUrl('lead', f.lead_id) : pageUrl('prospect', f.prospect);
    const pillText = isToday ? fmtTime(due) : fmtDate(due, false);
    const pillLabel = f.status === 'done' ? 'done' : overdue ? 'overdue' : isToday ? 'today' : 'due';
    const typeIcon = { call: 'bi-telephone', meeting: 'bi-people', email: 'bi-envelope', whatsapp: 'bi-whatsapp' }[f.follow_type] || 'bi-telephone';
    const actions = withActions && f.status === 'pending' ? `
        <div class="d-flex gap-1 flex-shrink-0">
          <button class="btn btn-sm btn-primary" data-fu-call="${f.id}" title="Log a call"><i class="bi bi-telephone"></i><span class="d-none d-md-inline">Log call</span></button>
          <button class="btn btn-sm btn-success-soft" data-fu-done="${f.id}" title="Mark done"><i class="bi bi-check2"></i><span class="d-none d-md-inline">Done</span></button>
          <button class="btn btn-sm btn-ghost btn-icon" data-fu-resched="${f.id}" title="Reschedule" aria-label="Reschedule"><i class="bi bi-calendar-event"></i></button>
        </div>` : '';
    return `<div class="row-item" data-fu="${f.id}">
        <div class="time-pill ${overdue ? 'late' : ''}">${esc(pillText)}<small>${pillLabel}</small></div>
        <div class="grow">
          <a class="title" href="${target}">${esc(f.company_name)}</a>
          <span class="sub"><i class="bi ${typeIcon}"></i> ${esc(f.follow_type_display)} &middot; ${esc(f.contact_person)}${f.notes ? ' &middot; ' + esc(f.notes) : ''}${showOwner ? ' &middot; ' + esc(f.assigned_to_name) : ''}</span>
        </div>
        ${f.contact_number ? `<a class="btn btn-sm btn-ghost btn-icon d-none d-sm-inline-flex" href="tel:${esc(String(f.contact_number).replace(/\s+/g, ''))}" aria-label="Call ${esc(f.contact_person)}"><i class="bi bi-telephone"></i></a>` : ''}
        ${actions}
      </div>`;
}

function formatMetric(value, unit) {
    if (unit === 'currency') return fmtMoney(value);
    if (unit === 'hours') return `${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 1 })}h`;
    return Number(value).toLocaleString('en-IN', { maximumFractionDigits: 1 });
}

function progressTone(percent) {
    return percent >= 100 ? 'ok' : percent >= 55 ? '' : 'warn';
}

function targetRowHtml(t, showUser = false) {
    const pct = Math.min(t.percent, 100);
    return `<div class="mb-3">
        <div class="d-flex justify-content-between align-items-baseline small mb-1">
          <span class="fw-600">${showUser ? `${esc(t.user_name)} &middot; ` : ''}${esc(t.metric_label)}</span>
          <span class="tabular text-muted"><b class="text-body">${formatMetric(t.achieved, t.unit)}</b> / ${formatMetric(t.target_value, t.unit)} <span class="ms-1">${t.percent}%</span></span>
        </div>
        <div class="dl-progress ${progressTone(t.percent)}" role="progressbar" aria-valuenow="${t.percent}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(t.metric_label)} progress"><span style="width:${pct}%"></span></div>
      </div>`;
}

function projectRowHtml(p, showClient = true) {
    const tone = p.is_overdue ? 'bad' : p.progress >= 100 ? 'ok' : '';
    return `<a class="row-item text-decoration-none text-body" href="${pageUrl('client', p.client)}">
        <div class="grow">
          <span class="title">${esc(p.name)}</span>
          <span class="sub">${showClient ? esc(p.client_name) + ' &middot; ' : ''}${p.deadline ? esc(fmtDate(p.deadline)) + ' &middot; ' + esc(daysLabel(p.days_left)) : 'No deadline'}</span>
          <div class="dl-progress mt-2 ${tone}"><span style="width:${p.progress}%"></span></div>
        </div>
        <div class="text-end flex-shrink-0">${toneBadge('project', p.status, p.status_display)}<span class="sub tabular mt-1">${p.progress}%</span></div>
      </a>`;
}

function taskRowHtml(t, opts = {}) {
    const dueTone = t.is_overdue ? 'danger' : t.days_left !== null && t.days_left <= 2 ? 'warning' : 'neutral';
    return `<div class="row-item" data-task="${t.id}">
        <div class="grow">
          <span class="title">${esc(t.title)}</span>
          <span class="sub">${esc(t.project_name)} &middot; ${esc(t.client_name)}${opts.showAssignee && t.assigned_to_name ? ' &middot; ' + esc(t.assigned_to_name) : ''}</span>
        </div>
        ${toneBadge('priority', t.priority, t.priority_display)}
        ${t.deadline ? badge(`${fmtDate(t.deadline, false)} \u00B7 ${daysLabel(t.days_left)}`, t.status === 'done' ? 'success' : dueTone, true) : ''}
        ${toneBadge('task', t.status, t.status_display)}
      </div>`;
}

/* ---------- App shell ---------- */
async function loadFollowUpBadge() {
    const badgeEl = document.getElementById('navFollowCount');
    if (!badgeEl || !DL.followUpsUrl) return;
    const res = await api('GET', `${DL.followUpsUrl}?scope=none`);
    if (!res.ok) return;
    const due = (res.data.counts.today || 0) + (res.data.counts.overdue || 0);
    if (due > 0) {
        badgeEl.textContent = due;
        badgeEl.classList.add('show');
    }
}

function initShell() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    DL.csrf = sidebar.dataset.csrf || '';
    DL.loginUrl = sidebar.dataset.loginUrl || DL.loginUrl;
    DL.logoutUrl = sidebar.dataset.logoutUrl || '';
    DL.followUpsUrl = sidebar.dataset.followupsUrl || '';
    DL.role = sidebar.dataset.role || '';

    const backdrop = document.getElementById('sidebarBackdrop');
    const toggle = document.getElementById('sidebarToggle');
    const closeSidebar = () => { sidebar.classList.remove('open'); backdrop?.classList.remove('show'); toggle?.setAttribute('aria-expanded', 'false'); };
    toggle?.addEventListener('click', () => {
        const open = sidebar.classList.toggle('open');
        backdrop?.classList.toggle('show', open);
        toggle.setAttribute('aria-expanded', String(open));
    });
    backdrop?.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSidebar(); });

    document.querySelectorAll('[data-action="logout"]').forEach(btn => btn.addEventListener('click', async () => {
        await api('POST', DL.logoutUrl, {});
        window.location.href = DL.loginUrl;
    }));

    loadFollowUpBadge();
}

document.addEventListener('DOMContentLoaded', initShell);

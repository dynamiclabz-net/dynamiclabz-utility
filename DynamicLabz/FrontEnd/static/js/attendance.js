let _csrf = null;
const AT = { urlAttendance: '', urlReport: '', isAdmin: false, month: '', data: null, view: 'mine', tsRecordId: null, memberId: null, timer: null };

const MODE_LABEL = { office: 'Office', remote: 'Remote', client_site: 'Client site' };

function AttendanceInit(csrf, urlAttendance, urlReport, isAdmin) {
    _csrf = csrf;
    AT.urlAttendance = urlAttendance;
    AT.urlReport = urlReport;
    AT.isAdmin = isAdmin;
    DL.csrf = csrf;
    AT.month = toDateInput(new Date()).slice(0, 7);

    const pick = document.getElementById('month-pick');
    pick.value = AT.month;
    pick.addEventListener('change', () => { if (pick.value) { AT.month = pick.value; reload(); } });
    document.getElementById('month-prev').addEventListener('click', () => shiftMonth(-1));
    document.getElementById('month-next').addEventListener('click', () => shiftMonth(1));

    document.getElementById('punch-card').addEventListener('click', onPunchClick);
    document.getElementById('log-rows').addEventListener('click', onLogClick);
    document.getElementById('cal').addEventListener('click', e => {
        const day = e.target.closest('[data-rec]');
        if (day) document.getElementById(`row-${day.dataset.rec}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    document.getElementById('timesheetForm').addEventListener('submit', e => { e.preventDefault(); saveTimesheet(); });

    if (isAdmin) {
        document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
        document.getElementById('team-matrix').addEventListener('click', e => {
            const row = e.target.closest('[data-member]');
            if (row) openMember(Number(row.dataset.member), row.dataset.name);
        });
        document.getElementById('markForm').addEventListener('submit', e => { e.preventDefault(); markDay(); });
    }
    loadMine();
}

function shiftMonth(delta) {
    const [y, m] = AT.month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    AT.month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    document.getElementById('month-pick').value = AT.month;
    reload();
}

function reload() {
    if (AT.view === 'team') loadTeam(); else loadMine();
}

function switchView(view) {
    AT.view = view;
    document.querySelectorAll('[data-view]').forEach(b => { const on = b.dataset.view === view; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    document.getElementById('view-mine').classList.toggle('d-none', view !== 'mine');
    document.getElementById('view-team').classList.toggle('d-none', view !== 'team');
    reload();
}

/* ---------- My attendance ---------- */
async function loadMine() {
    const res = await api('GET', `${AT.urlAttendance}?month=${AT.month}`);
    if (!res.ok) {
        document.getElementById('punch-card').innerHTML = `<div class="dl-card-body">${emptyState('bi-exclamation-triangle', 'Could not load attendance', res.error)}</div>`;
        return;
    }
    AT.data = res.data;
    renderPunch();
    renderCalendar();
    renderLog();
}

function renderPunch() {
    clearInterval(AT.timer);
    const today = AT.data.today;
    const card = document.getElementById('punch-card');
    const head = `<div class="d-flex align-items-center justify-content-between mb-3"><span class="xs text-muted text-uppercase fw-600">Today</span><span class="small text-muted">${esc(fmtDate(new Date()))}</span></div>`;

    if (!today || (!today.check_in && today.status === 'leave')) {
        card.innerHTML = `<div class="dl-card-body">${head}
          <div class="clock" id="clock">--:--</div><div class="text-muted small mb-3">${today ? 'You are marked on leave today.' : 'You have not checked in yet.'}</div>
          ${today ? '' : `<label class="form-label" for="pn-mode">Where are you working from?</label>
          <select class="form-select mb-3" id="pn-mode"><option value="office">Office</option><option value="remote">Remote</option><option value="client_site">Client site</option></select>
          <label class="form-label" for="pn-plan">Plan for today (optional)</label>
          <textarea class="form-control mb-3" id="pn-plan" rows="2" placeholder="What are you planning to work on?"></textarea>
          <button class="btn btn-primary w-100" data-punch="in"><i class="bi bi-box-arrow-in-right"></i>Check in</button>`}</div>`;
        startClock();
        return;
    }

    if (today.is_open) {
        card.innerHTML = `<div class="dl-card-body">${head}
          <div class="d-flex align-items-center gap-2 mb-1"><span class="pulse-dot"></span><strong>Working</strong><span class="text-muted small">since ${esc(fmtTime(today.check_in))} &middot; ${esc(MODE_LABEL[today.work_mode] || '')}</span></div>
          <div class="clock mb-1" id="clock">0h 00m</div><div class="text-muted small mb-3">Time worked so far</div>
          <label class="form-label" for="pn-timesheet">Timesheet - what did you work on today? *</label>
          <textarea class="form-control mb-3" id="pn-timesheet" rows="4" placeholder="e.g. Built the audit trail model, fixed login redirect bug, reviewed 2 PRs">${esc(today.timesheet || '')}</textarea>
          <div id="pn-error" class="alert-dl" role="alert"></div>
          <button class="btn btn-danger w-100" data-punch="out"><i class="bi bi-box-arrow-right"></i>Check out</button></div>`;
        const start = new Date(today.check_in).getTime();
        const tick = () => { const el = document.getElementById('clock'); if (el) el.textContent = fmtHours((Date.now() - start) / 3600000); };
        tick();
        AT.timer = setInterval(tick, 30000);
        return;
    }

    card.innerHTML = `<div class="dl-card-body">${head}
      <div class="d-flex align-items-center gap-2 mb-1"><i class="bi bi-check-circle-fill text-success"></i><strong>Day complete</strong></div>
      <div class="clock mb-1">${esc(fmtHours(today.hours))}</div>
      <div class="text-muted small mb-3">${esc(fmtTime(today.check_in))} to ${esc(fmtTime(today.check_out))} &middot; ${esc(MODE_LABEL[today.work_mode] || '')}</div>
      <div class="xs text-muted text-uppercase fw-600 mb-1">Timesheet</div><p class="text-pre mb-3">${esc(today.timesheet || '')}</p>
      <button class="btn btn-ghost btn-sm" data-edit-ts="${today.id}"><i class="bi bi-pencil"></i>Edit timesheet</button></div>`;
}

function startClock() {
    const tick = () => { const el = document.getElementById('clock'); if (el) el.textContent = fmtTime(new Date()); };
    tick();
    AT.timer = setInterval(tick, 15000);
}

async function onPunchClick(e) {
    const punch = e.target.closest('[data-punch]');
    if (punch) {
        const button = punch;
        if (punch.dataset.punch === 'in') {
            setBusy(button, true, 'Checking in...');
            const res = await api('POST', AT.urlAttendance, { work_mode: document.getElementById('pn-mode').value, plan: document.getElementById('pn-plan').value });
            setBusy(button, false);
            if (!res.ok) { toast(res.error, 'error'); return; }
            toast('Checked in. Have a productive day.');
            loadMine();
        } else {
            const timesheet = document.getElementById('pn-timesheet').value.trim();
            if (!timesheet) { showFormError('pn-error', 'Please add your timesheet before checking out.'); return; }
            const ok = await confirmAction({ title: 'Check out for today?', message: 'Your timesheet will be saved and visible to your admin.', confirmText: 'Check out' });
            if (!ok) return;
            setBusy(button, true, 'Checking out...');
            const res = await api('PUT', withId(AT.urlAttendance, AT.data.today.id), { action: 'check_out', timesheet });
            setBusy(button, false);
            if (!res.ok) { showFormError('pn-error', res.error); return; }
            toast('Checked out. See you tomorrow.');
            loadMine();
        }
        return;
    }
    const edit = e.target.closest('[data-edit-ts]');
    if (edit) openTimesheet(Number(edit.dataset.editTs), AT.data.today?.timesheet);
}

function renderCalendar() {
    const { records, summary, working_days: working } = AT.data;
    const [y, m] = AT.month.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const offset = (first.getUTCDay() + 6) % 7;
    const byDay = Object.fromEntries(records.map(r => [Number(r.date.slice(8)), r]));
    const todayParts = toDateInput(new Date());

    document.getElementById('cal-title').textContent = first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    document.getElementById('month-summary').innerHTML = `
      <span><b class="text-body">${summary.days_present + summary.half_days}</b> / ${working} days</span>
      <span><b class="text-body">${summary.total_hours}</b> hrs</span>
      <span><b class="text-body">${summary.avg_hours}</b> avg/day</span>`;

    let cells = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="dow">${d}</div>`).join('');
    cells += '<div class="att-day empty"></div>'.repeat(offset);
    for (let d = 1; d <= daysInMonth; d++) {
        const rec = byDay[d];
        const dateStr = `${AT.month}-${String(d).padStart(2, '0')}`;
        const isSunday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
        const classes = ['att-day', rec ? rec.status : '', isSunday && !rec ? 'off' : '', dateStr === todayParts ? 'today' : '', rec ? 'clickable' : ''].filter(Boolean).join(' ');
        const label = rec ? (rec.hours ? `${rec.hours}h` : rec.is_open ? 'In' : rec.status === 'leave' ? 'Leave' : '') : '';
        cells += `<div class="${classes}" ${rec ? `data-rec="${rec.id}" role="button" tabindex="0" aria-label="${esc(rec.status_display)} on ${dateStr}"` : ''}><span class="d">${d}</span><span class="h">${label}</span></div>`;
    }
    document.getElementById('cal').innerHTML = `<div class="att-grid">${cells}</div>`;
}

function renderLog() {
    const { records } = AT.data;
    const body = document.getElementById('log-rows');
    if (!records.length) {
        body.innerHTML = `<tr><td colspan="7">${emptyState('bi-clock-history', 'No attendance this month', 'Check in to start your log.')}</td></tr>`;
        return;
    }
    body.innerHTML = records.map(r => `<tr id="row-${r.id}">
        <td><span class="cell-title">${esc(fmtDate(r.date))}</span>${badge(r.status_display, TONES.attendance[r.status])}</td>
        <td>${r.check_in ? esc(fmtTime(r.check_in)) : '-'}</td>
        <td>${r.check_out ? esc(fmtTime(r.check_out)) : (r.is_open ? '<span class="text-success fw-600">Working</span>' : '-')}</td>
        <td class="tabular">${r.hours ? esc(fmtHours(r.hours)) : '-'}</td>
        <td>${esc(MODE_LABEL[r.work_mode] || '-')}</td>
        <td class="text-pre small">${r.timesheet ? esc(r.timesheet) : '<span class="text-muted">No timesheet</span>'}</td>
        <td class="text-end">${r.status !== 'leave' ? `<button class="btn btn-sm btn-ghost btn-icon" data-edit-ts="${r.id}" aria-label="Edit timesheet"><i class="bi bi-pencil"></i></button>` : ''}</td></tr>`).join('');
}

function onLogClick(e) {
    const edit = e.target.closest('[data-edit-ts]');
    if (!edit) return;
    const record = AT.data.records.find(r => r.id === Number(edit.dataset.editTs));
    openTimesheet(record.id, record.timesheet);
}

function openTimesheet(id, text) {
    AT.tsRecordId = id;
    document.getElementById('ts-text').value = text || '';
    showFormError('ts-error', '');
    modalShow('timesheetModal');
}

async function saveTimesheet() {
    const text = document.getElementById('ts-text').value.trim();
    if (!text) { showFormError('ts-error', 'Timesheet cannot be empty.'); return; }
    const button = document.getElementById('ts-save');
    setBusy(button, true);
    const res = await api('PUT', withId(AT.urlAttendance, AT.tsRecordId), { action: 'timesheet', timesheet: text });
    setBusy(button, false);
    if (!res.ok) { showFormError('ts-error', res.error); return; }
    modalHide('timesheetModal');
    toast('Timesheet saved');
    if (AT.memberId) openMember(AT.memberId, document.getElementById('memberModalTitle').dataset.name, true); else loadMine();
}

/* ---------- Team report (admin) ---------- */
async function loadTeam() {
    const res = await api('GET', `${AT.urlReport}?month=${AT.month}`);
    const holder = document.getElementById('team-matrix');
    if (!res.ok) { holder.innerHTML = emptyState('bi-exclamation-triangle', 'Could not load the report', res.error); return; }
    const { rows, days_in_month: days, working_days: working, sundays } = res.data;

    const totalHours = rows.reduce((n, r) => n + r.summary.total_hours, 0);
    const checkedInToday = rows.filter(r => r.today.check_in).length;
    document.getElementById('team-kpis').innerHTML = [
        ['Team members', rows.length, 'bi-people'], ['Working days so far', working, 'bi-calendar-check'],
        ['Checked in today', `${checkedInToday}/${rows.length}`, 'bi-box-arrow-in-right'], ['Hours logged', Math.round(totalHours), 'bi-clock'],
    ].map(([l, v, i]) => `<div class="col-6 col-lg-3"><div class="dl-card stat"><span class="ico"><i class="bi ${i}"></i></span><span class="label">${l}</span><span class="value">${v}</span></div></div>`).join('');

    const head = Array.from({ length: days }, (_, i) => `<th scope="col">${i + 1}</th>`).join('');
    const body = rows.map(r => {
        const cells = Array.from({ length: days }, (_, i) => {
            const day = i + 1;
            const rec = r.days[day];
            const cls = rec ? rec.status : sundays.includes(day) ? 'off' : '';
            return `<td><span class="cell ${cls}" title="${rec ? `${day}: ${rec.status.replace('_', ' ')}${rec.hours ? ' - ' + rec.hours + 'h' : ''}` : ''}"></span></td>`;
        }).join('');
        const s = r.summary;
        return `<tr data-member="${r.user.id}" data-name="${esc(r.user.full_name)}" style="cursor:pointer"><td class="name">${esc(r.user.full_name)}<div class="xs text-muted fw-normal text-capitalize">${esc(r.user.role)}</div></td>${cells}
          <td class="tot">${s.days_present + s.half_days}<span class="text-muted fw-normal">/${working}</span><div class="xs text-muted fw-normal">${s.total_hours}h</div></td></tr>`;
    }).join('');
    holder.innerHTML = `<table class="matrix"><thead><tr><th scope="col" class="text-start">Team</th>${head}<th scope="col">Days</th></tr></thead><tbody>${body}</tbody></table>
      <p class="small text-muted mt-3 mb-0">Click a person to read their daily timesheets or mark leave.</p>`;
}

async function openMember(userId, name, keepOpen = false) {
    AT.memberId = userId;
    const res = await api('GET', `${AT.urlAttendance}?user=${userId}&month=${AT.month}`);
    if (!res.ok) { toast(res.error, 'error'); return; }
    const { records, summary } = res.data;
    const title = document.getElementById('memberModalTitle');
    title.textContent = `${name} - timesheets`;
    title.dataset.name = name;
    document.getElementById('member-sub').textContent = `${AT.month} - ${summary.days_present + summary.half_days} days present, ${summary.leaves} leave, ${summary.total_hours} hours`;
    document.getElementById('mk-date').value = toDateInput(new Date());
    document.getElementById('member-list').innerHTML = records.length ? `<div class="row-list" style="margin:0 -1rem">${records.map(r => `
        <div><div class="d-flex flex-wrap align-items-center gap-2 mb-1"><strong>${esc(fmtDate(r.date))}</strong>${badge(r.status_display, TONES.attendance[r.status])}
          <span class="small text-muted">${r.check_in ? esc(fmtTime(r.check_in)) : ''}${r.check_out ? ' - ' + esc(fmtTime(r.check_out)) : ''}${r.hours ? ' &middot; ' + esc(fmtHours(r.hours)) : ''}</span></div>
          <div class="text-pre small">${r.timesheet ? esc(r.timesheet) : '<span class="text-muted">No timesheet</span>'}</div></div>`).join('')}</div>`
        : emptyState('bi-clock-history', 'No records this month');
    if (!keepOpen) modalShow('memberModal');
    document.getElementById('memberModal').addEventListener('hidden.bs.modal', () => { AT.memberId = null; }, { once: true });
}

async function markDay() {
    const date = document.getElementById('mk-date').value;
    if (!date) return;
    const res = await api('POST', AT.urlAttendance, { user: AT.memberId, date, status: document.getElementById('mk-status').value });
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast('Attendance updated');
    openMember(AT.memberId, document.getElementById('memberModalTitle').dataset.name, true);
    loadTeam();
}

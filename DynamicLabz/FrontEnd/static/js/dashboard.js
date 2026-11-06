let _csrf = null;
let _urlDashboard = null;
let _firstName = '';

const KPI_ICONS = {
    prospects: 'bi-telephone-outbound', leads: 'bi-funnel', clients: 'bi-buildings', projects: 'bi-kanban',
    revenue: 'bi-cash-stack', outstanding: 'bi-hourglass-split', calls: 'bi-telephone',
    open: 'bi-list-task', overdue: 'bi-exclamation-triangle', due_soon: 'bi-alarm', done: 'bi-check2-circle', hours: 'bi-clock',
};

function DashboardInit(csrf, urlDashboard, firstName) {
    _csrf = csrf;
    _urlDashboard = urlDashboard;
    _firstName = firstName;
    DL.csrf = csrf;
    loadDashboard();
}

function greeting() {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

async function loadDashboard() {
    document.getElementById('greeting').textContent = `${greeting()}, ${_firstName || 'there'}`;
    const res = await api('GET', _urlDashboard);
    const root = document.getElementById('dashboard-root');
    if (!res.ok) {
        root.innerHTML = emptyState('bi-exclamation-triangle', 'Could not load the dashboard', res.error);
        return;
    }
    const data = res.data;
    renderAttendanceBanner(data.attendance_today);

    const renderers = { admin: renderAdmin, sales: renderSales, dev: renderDev };
    const subtitles = {
        admin: `Agency overview for ${data.month}`,
        sales: `Your pipeline and follow-ups for ${data.month}`,
        dev: `Your workload and deadlines for ${data.month}`,
    };
    document.getElementById('greeting-sub').textContent = subtitles[data.role];
    root.innerHTML = renderers[data.role](data);
    bindDashboardActions();
    animateBars();
}

function renderAttendanceBanner(record) {
    const el = document.getElementById('attendance-banner');
    if (record && record.check_out) {
        el.innerHTML = '';
        return;
    }
    const checkedIn = record && record.check_in;
    el.innerHTML = `
      <div class="dl-card mb-3">
        <div class="dl-card-body d-flex flex-wrap align-items-center gap-3 py-3">
          <span class="doc-ico"><i class="bi ${checkedIn ? 'bi-stopwatch' : 'bi-clock-history'}"></i></span>
          <div class="flex-grow-1">
            <strong>${checkedIn ? `You checked in at ${fmtTime(record.check_in)}` : 'You have not checked in today'}</strong>
            <div class="text-muted small">${checkedIn ? 'Remember to add your timesheet when you check out.' : 'Mark your attendance to start the day.'}</div>
          </div>
          <a class="btn btn-primary btn-sm" href="${pageUrl('attendance')}"><i class="bi ${checkedIn ? 'bi-box-arrow-right' : 'bi-box-arrow-in-right'}"></i>${checkedIn ? 'Check out' : 'Check in'}</a>
        </div>
      </div>`;
}

function kpiCards(kpis) {
    return `<div class="row g-3 mb-3">${kpis.map(k => {
        const isBad = k.key === 'overdue' && k.value > 0;
        let hint = k.hint || '';
        if (k.key === 'leads' && hint) hint = `Pipeline ${fmtMoney(hint)}`;
        const value = k.unit === 'currency' ? fmtMoney(k.value) : k.unit === 'hours' ? `${k.value}h` : Number(k.value).toLocaleString('en-IN');
        return `<div class="col-6 col-md-4 col-xl"><div class="dl-card stat">
            <span class="ico"><i class="bi ${KPI_ICONS[k.key] || 'bi-graph-up'}"></i></span>
            <span class="label">${esc(k.label)}</span>
            <span class="value ${isBad ? 'text-danger' : ''}">${value}</span>
            ${hint ? `<span class="hint ${/overdue/.test(hint) && !/^0 /.test(hint) ? 'bad' : ''}">${esc(hint)}</span>` : ''}
          </div></div>`;
    }).join('')}</div>`;
}

function card(title, body, { link = null, linkText = 'View all', flush = true, id = '' } = {}) {
    return `<section class="dl-card h-100" ${id ? `id="${id}"` : ''}>
        <div class="dl-card-head"><h3>${esc(title)}</h3>${link ? `<a class="link-more" href="${link}">${esc(linkText)} <i class="bi bi-arrow-right"></i></a>` : ''}</div>
        <div class="dl-card-body ${flush ? 'flush' : ''}">${body}</div>
      </section>`;
}

function followUpCard(groups) {
    const today = groups.today || [];
    const overdue = groups.overdue || [];
    const upcoming = groups.upcoming || [];
    let body = '';
    if (overdue.length) {
        body += `<div class="px-3 pt-3 xs text-danger fw-600 text-uppercase">Overdue (${overdue.length})</div><div class="row-list">${overdue.slice(0, 4).map(f => followUpRowHtml(f)).join('')}</div>`;
    }
    if (today.length) {
        body += `<div class="px-3 pt-3 xs text-muted fw-600 text-uppercase">Today (${today.length})</div><div class="row-list">${today.map(f => followUpRowHtml(f)).join('')}</div>`;
    }
    if (!overdue.length && !today.length) {
        body += emptyState('bi-check2-all', 'Nothing due today', 'No follow-ups waiting. Great work.');
        if (upcoming.length) {
            body += `<div class="px-3 pb-1 xs text-muted fw-600 text-uppercase">Coming up</div><div class="row-list">${upcoming.slice(0, 3).map(f => followUpRowHtml(f)).join('')}</div>`;
        }
    }
    return card("Today's follow-ups", body, { link: pageUrl('followUps') });
}

function recentCallsCard(calls) {
    const body = calls.length
        ? `<div class="row-list">${calls.map(c => `
            <div class="row-item">
              <div class="grow"><a class="title" href="${pageUrl('prospect', c.prospect)}">${esc(c.company_name)}</a>
              <span class="sub">${esc(c.called_by_name)} &middot; ${esc(timeAgo(c.called_at))}${c.summary ? ' &middot; ' + esc(c.summary.slice(0, 60)) : ''}</span></div>
              ${toneBadge('outcome', c.outcome, c.outcome_display)}
            </div>`).join('')}</div>`
        : emptyState('bi-telephone', 'No calls logged yet');
    return card('Recent calls', body);
}

/* ---------- Admin ---------- */
function renderAdmin(d) {
    const f = d.funnel;
    const max = Math.max(f.prospects, 1);
    const funnelRows = [
        ['Prospects', f.prospects], ['Connected', f.connected], ['Leads', f.leads], ['Proposals', f.proposals], ['Clients', f.clients],
    ].map(([label, n]) => `<div class="funnel-row"><span class="text-muted">${label}</span><div class="bar"><span data-w="${Math.round(n * 100 / max)}" style="width:0"></span></div><span class="num">${n}</span></div>`).join('');

    const attendanceDot = { present: 'success', half_day: 'warning', leave: 'info', absent: 'neutral' };
    const team = d.team_today.map(m => `
        <div class="row-item">
          ${avatar(m.full_name, 'sm')}
          <div class="grow"><span class="title">${esc(m.full_name)}</span><span class="sub text-capitalize">${esc(m.role)}${m.work_mode ? ' &middot; ' + esc(m.work_mode.replace('_', ' ')) : ''}</span></div>
          <span class="small text-muted tabular">${m.check_in ? fmtTime(m.check_in) + (m.check_out ? ' - ' + fmtTime(m.check_out) : '') : ''}</span>
          ${badge(m.status === 'absent' ? 'Not in yet' : m.check_out ? 'Done' : m.status === 'present' ? 'Working' : m.status.replace('_', ' '), m.check_in && !m.check_out ? 'success' : attendanceDot[m.status])}
        </div>`).join('');

    const sales = d.sales_board.length ? `
        <div class="table-wrap"><table class="table dl-table"><thead><tr><th>Sales</th><th>Prospects</th><th>Calls</th><th>Meetings</th><th>Won</th><th>Revenue</th><th style="min-width:130px">Target</th></tr></thead><tbody>
        ${d.sales_board.map(s => `<tr><td><span class="d-flex align-items-center gap-2">${avatar(s.full_name, 'sm')}<span class="cell-title">${esc(s.full_name)}</span></span></td>
          <td class="tabular">${s.prospects}</td><td class="tabular">${s.calls}</td><td class="tabular">${s.meetings}</td><td class="tabular">${s.clients_won}</td><td class="tabular">${fmtMoney(s.revenue)}</td>
          <td>${s.target_percent === null ? '<span class="text-muted small">No targets</span>' : `<div class="d-flex align-items-center gap-2"><div class="dl-progress flex-grow-1 ${progressTone(s.target_percent)}"><span data-w="${Math.min(s.target_percent, 100)}" style="width:0"></span></div><span class="small tabular">${s.target_percent}%</span></div>`}</td></tr>`).join('')}
        </tbody></table></div>` : emptyState('bi-people', 'No sales members yet');

    const dev = d.dev_board.length ? `
        <div class="table-wrap"><table class="table dl-table"><thead><tr><th>Developer</th><th>Open</th><th>Overdue</th><th>Done (month)</th><th>Hours</th></tr></thead><tbody>
        ${d.dev_board.map(s => `<tr><td><span class="d-flex align-items-center gap-2">${avatar(s.full_name, 'sm')}<span class="cell-title">${esc(s.full_name)}</span></span></td>
          <td class="tabular">${s.open_tasks}</td><td class="tabular ${s.overdue_tasks ? 'text-danger fw-600' : ''}">${s.overdue_tasks}</td><td class="tabular">${s.completed}</td><td class="tabular">${s.hours}h</td></tr>`).join('')}
        </tbody></table></div>` : emptyState('bi-code-slash', 'No developers yet');

    const deadlines = d.deadlines.length
        ? `<div class="row-list">${d.deadlines.map(p => projectRowHtml(p)).join('')}</div>`
        : emptyState('bi-calendar-check', 'No deadlines in the next 3 weeks');

    const overdueTasks = d.overdue_tasks.length
        ? `<div class="row-list">${d.overdue_tasks.map(t => taskRowHtml(t, { showAssignee: true })).join('')}</div>`
        : emptyState('bi-emoji-smile', 'No overdue tasks');

    return `
      ${kpiCards(d.kpis)}
      <div class="row g-3 mb-3">
        <div class="col-lg-7">${card('Pipeline funnel', `<div class="p-3 pt-4">${funnelRows}</div>`, { flush: true })}</div>
        <div class="col-lg-5">${followUpCard(d.follow_ups)}</div>
      </div>
      <div class="row g-3 mb-3">
        <div class="col-lg-7">${card('Sales performance', sales, { link: pageUrl('targets'), linkText: 'Targets' })}</div>
        <div class="col-lg-5">${card('Team today', `<div class="row-list">${team}</div>`, { link: pageUrl('attendance'), linkText: 'Attendance' })}</div>
      </div>
      <div class="row g-3 mb-3">
        <div class="col-lg-7">${card('Developer workload', dev, { link: pageUrl('tasks'), linkText: 'All tasks' })}</div>
        <div class="col-lg-5">${card('Upcoming deadlines', deadlines, { link: pageUrl('clients'), linkText: 'Clients' })}</div>
      </div>
      <div class="row g-3">
        <div class="col-lg-7">${card('Overdue tasks', overdueTasks, { link: pageUrl('tasks') })}</div>
        <div class="col-lg-5">${recentCallsCard(d.recent_calls)}</div>
      </div>`;
}

/* ---------- Sales ---------- */
function renderSales(d) {
    const stageLabels = [['meeting_done', 'Meeting done'], ['proposal_in_progress', 'Drafting proposal'], ['proposal_submitted', 'Proposal sent'], ['negotiation', 'Negotiation']];
    const prospectLabels = [['new', 'New'], ['contacted', 'Contacted'], ['interested', 'Interested'], ['follow_up', 'Follow-up'], ['not_interested', 'Not interested']];

    const chips = (labels, counts, kind, link) => labels.map(([key, label]) => `
        <a href="${link}" class="d-flex justify-content-between align-items-center py-2 text-decoration-none text-body">
          ${toneBadge(kind, key, label)}<span class="fw-600 tabular">${counts[key] || 0}</span></a>`).join('');

    const meetings = d.upcoming_meetings.length
        ? `<div class="row-list">${d.upcoming_meetings.map(m => `
            <div class="row-item">
              <div class="time-pill">${esc(fmtDate(m.scheduled_at, false))}<small>${esc(fmtTime(m.scheduled_at))}</small></div>
              <div class="grow"><a class="title" href="${pageUrl('lead', m.lead)}">${esc(m.company_name)}</a><span class="sub">${esc(m.mode_display)} &middot; ${esc(m.agenda || m.lead_title)}</span></div>
              ${badge(m.conducted ? 'Held' : 'Scheduled', m.conducted ? 'success' : 'info')}
            </div>`).join('')}</div>`
        : emptyState('bi-calendar2', 'No meetings in the next 2 weeks');

    const targets = d.targets.length
        ? `<div class="p-3 pb-1">${d.targets.map(t => targetRowHtml(t)).join('')}</div>`
        : emptyState('bi-bullseye', 'No targets set', 'Your admin sets monthly targets.');

    const projects = d.projects.length
        ? `<div class="row-list">${d.projects.map(p => projectRowHtml(p)).join('')}</div>`
        : emptyState('bi-kanban', 'No active projects');

    return `
      ${kpiCards(d.kpis)}
      <div class="row g-3 mb-3">
        <div class="col-lg-7">${followUpCard(d.follow_ups)}</div>
        <div class="col-lg-5">${card('My targets this month', targets, { link: pageUrl('targets'), linkText: 'Details' })}</div>
      </div>
      <div class="row g-3 mb-3">
        <div class="col-md-6 col-lg-3">${card('Prospects', `<div class="px-3 py-2">${chips(prospectLabels, d.prospect_counts, 'prospect', pageUrl('prospects'))}</div>`, { link: pageUrl('prospects') })}</div>
        <div class="col-md-6 col-lg-3">${card('Leads by stage', `<div class="px-3 py-2">${chips(stageLabels, d.lead_counts, 'lead', pageUrl('leads'))}</div>`, { link: pageUrl('leads') })}</div>
        <div class="col-lg-6">${card('Upcoming meetings', meetings)}</div>
      </div>
      <div class="row g-3">
        <div class="col-lg-6">${recentCallsCard(d.recent_calls)}</div>
        <div class="col-lg-6">${card('Client projects', projects, { link: pageUrl('clients'), linkText: 'Clients' })}</div>
      </div>`;
}

/* ---------- Dev ---------- */
function renderDev(d) {
    const tasks = d.tasks.length
        ? `<div class="row-list">${d.tasks.map(t => taskRowHtml(t)).join('')}</div>`
        : emptyState('bi-emoji-sunglasses', 'You are all caught up', 'No open tasks assigned to you.');
    const targets = d.targets.length
        ? `<div class="p-3 pb-1">${d.targets.map(t => targetRowHtml(t)).join('')}</div>`
        : emptyState('bi-bullseye', 'No targets set', 'Your admin sets monthly targets.');
    const projects = d.projects.length
        ? `<div class="row-list">${d.projects.map(p => projectRowHtml(p)).join('')}</div>`
        : emptyState('bi-kanban', 'You are not on any active project');
    const statuses = [['todo', 'To do'], ['in_progress', 'In progress'], ['review', 'In review'], ['blocked', 'Blocked'], ['done', 'Done']];

    return `
      ${kpiCards(d.kpis)}
      <div class="row g-3 mb-3">
        <div class="col-lg-7">${card('My open tasks', tasks, { link: pageUrl('tasks') })}</div>
        <div class="col-lg-5">
          <div class="d-grid gap-3">
            ${card('My targets this month', targets, { link: pageUrl('targets'), linkText: 'Details' })}
            ${card('Task status', `<div class="px-3 py-2">${statuses.map(([k, l]) => `<div class="d-flex justify-content-between align-items-center py-2">${toneBadge('task', k, l)}<span class="fw-600 tabular">${d.task_status_counts[k] || 0}</span></div>`).join('')}</div>`)}
          </div>
        </div>
      </div>
      <div class="row g-3"><div class="col-12">${card('My projects', projects, { link: pageUrl('clients'), linkText: 'All projects' })}</div></div>`;
}

function bindDashboardActions() {}

function animateBars() {
    requestAnimationFrame(() => {
        document.querySelectorAll('[data-w]').forEach(el => { el.style.width = `${el.dataset.w}%`; });
    });
}

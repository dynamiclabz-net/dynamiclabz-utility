let _csrf = null;
let _urlInvoice = null;
let _invoices = [];
const invoiceState = { status: '', search: '' };

function InvoicesInit(csrf, urlInvoice) {
    _csrf = csrf;
    _urlInvoice = urlInvoice;
    DL.csrf = csrf;

    document.getElementById('flt-search').addEventListener('input', debounce(e => { invoiceState.search = e.target.value.trim().toLowerCase(); renderRows(); }, 200));
    setupSegmented('flt-status', value => { invoiceState.status = value; loadInvoices(); });
    document.getElementById('invoice-rows').addEventListener('click', onClick);
    loadInvoices();
}

async function loadInvoices() {
    const res = await api('GET', `${_urlInvoice}?${toQueryString({ status: invoiceState.status })}`);
    const body = document.getElementById('invoice-rows');
    if (!res.ok) {
        body.innerHTML = `<tr><td colspan="7">${emptyState('bi-exclamation-triangle', 'Could not load invoices', res.error)}</td></tr>`;
        return;
    }
    _invoices = res.data.invoices;
    const f = res.data.finance;
    document.getElementById('invoice-kpis').innerHTML = [['Billed', f.billed, 'bi-receipt'], ['Collected', f.paid, 'bi-cash-stack'], ['Outstanding', f.outstanding, 'bi-hourglass-split'], ['Overdue', f.overdue, 'bi-exclamation-triangle']]
        .map(([label, value, icon]) => `<div class="col-6 col-lg-3"><div class="dl-card stat"><span class="ico"><i class="bi ${icon}"></i></span><span class="label">${label}</span><span class="value ${label === 'Overdue' && value ? 'text-danger' : ''}">${fmtMoney(value)}</span></div></div>`).join('');
    renderRows();
}

function renderRows() {
    const body = document.getElementById('invoice-rows');
    const items = _invoices.filter(i => !invoiceState.search || `${i.invoice_number} ${i.client_name} ${i.title}`.toLowerCase().includes(invoiceState.search));
    if (!items.length) {
        body.innerHTML = `<tr><td colspan="7">${emptyState('bi-receipt', 'No invoices found', 'Add invoices from a client page.')}</td></tr>`;
        return;
    }
    body.innerHTML = items.map(i => `<tr>
        <td><span class="cell-title">${esc(i.invoice_number)}</span><span class="cell-sub">${esc(i.title)}</span></td>
        <td><a class="text-primary-dl fw-600" href="${pageUrl('client', i.client)}">${esc(i.client_name)}</a></td>
        <td class="tabular fw-600">${esc(fmtMoneyFull(i.amount))}</td>
        <td>${esc(fmtDate(i.issue_date))}</td>
        <td>${i.due_date ? esc(fmtDate(i.due_date)) : '-'}</td>
        <td>${toneBadge('invoice', i.display_status, i.status_display)}${i.paid_on ? `<span class="cell-sub">Paid ${esc(fmtDate(i.paid_on))}</span>` : ''}</td>
        <td class="text-end text-nowrap">
          ${i.file_url ? `<a class="btn btn-sm btn-ghost btn-icon" href="${esc(i.file_url)}" target="_blank" rel="noopener noreferrer" aria-label="Open invoice file"><i class="bi bi-file-earmark-pdf"></i></a>` : ''}
          ${i.status === 'sent' || i.status === 'draft' ? `<button class="btn btn-sm btn-success-soft" data-pay="${i.id}"><i class="bi bi-check2"></i>Mark paid</button>` : ''}
        </td></tr>`).join('');
}

async function onClick(e) {
    const pay = e.target.closest('[data-pay]');
    if (!pay) return;
    const res = await api('PUT', withId(_urlInvoice, pay.dataset.pay), { status: 'paid' });
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast('Invoice marked as paid');
    loadInvoices();
}

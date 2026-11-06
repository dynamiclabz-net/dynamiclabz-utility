let _csrf = null;
let _urlFollowUp = null;
let _items = [];
const fuState = { scope: 'today', owner: '' };

function FollowUpsInit(csrf, urlFollowUp, urlProspect, urlCallLog, urlUsers) {
    _csrf = csrf;
    _urlFollowUp = urlFollowUp;
    DL.csrf = csrf;

    ProspectModalsInit({ prospect: urlProspect, callLog: urlCallLog, followUp: urlFollowUp, users: urlUsers }, () => loadFollowUps());

    setupSegmented('fu-scope', value => { fuState.scope = value; loadFollowUps(); });

    const ownerSelect = document.getElementById('fu-owner');
    if (ownerSelect) {
        ownerSelect.addEventListener('change', () => { fuState.owner = ownerSelect.value; loadFollowUps(); });
        api('GET', `${urlUsers}?role=sales,admin`).then(res => {
            if (res.ok) fillSelect(ownerSelect, res.data.users, { placeholder: 'Everyone' });
        });
    }

    document.getElementById('fu-list').addEventListener('click', onListClick);
    loadFollowUps();
}

async function loadFollowUps() {
    const res = await api('GET', `${_urlFollowUp}?${toQueryString({ scope: fuState.scope, owner: fuState.owner })}`);
    const list = document.getElementById('fu-list');
    if (!res.ok) {
        list.innerHTML = emptyState('bi-exclamation-triangle', 'Could not load follow-ups', res.error);
        return;
    }
    _items = res.data.follow_ups;
    updateSegmentCounts('fu-scope', res.data.counts);

    if (!_items.length) {
        const messages = {
            today: ['bi-check2-all', 'Nothing due today', 'You are all caught up.'],
            overdue: ['bi-emoji-smile', 'Nothing overdue', 'Every follow-up is on schedule.'],
            upcoming: ['bi-calendar2', 'No upcoming follow-ups', 'Schedule one when you log a call.'],
            done: ['bi-clock-history', 'Nothing completed yet', ''],
        };
        list.innerHTML = emptyState(...messages[fuState.scope]);
        return;
    }

    const showOwner = !!document.getElementById('fu-owner');
    list.innerHTML = `<div class="row-list">${_items.map(f => followUpRowHtml(f, true, showOwner)).join('')}</div>`;
}

function prospectFromFollowUp(f) {
    return { id: f.prospect, company_name: f.company_name, contact_person: f.contact_person, contact_number: f.contact_number };
}

function onListClick(e) {
    const call = e.target.closest('[data-fu-call]');
    if (call) {
        const f = _items.find(x => x.id === Number(call.dataset.fuCall));
        openCallModal(prospectFromFollowUp(f), { followUpId: f.id });
        return;
    }
    const done = e.target.closest('[data-fu-done]');
    if (done) { markFollowUpDone(done.dataset.fuDone); return; }
    const resched = e.target.closest('[data-fu-resched]');
    if (resched) {
        const f = _items.find(x => x.id === Number(resched.dataset.fuResched));
        openFollowUpModal({ prospect: prospectFromFollowUp(f), followUp: f });
    }
}

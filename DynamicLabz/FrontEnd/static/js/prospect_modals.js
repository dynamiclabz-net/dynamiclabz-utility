/* Call log, prospect form and follow-up modals shared by the prospect pages. */

const PM = { urlProspect: '', urlCallLog: '', urlFollowUp: '', urlUsers: '', onChange: () => {}, callProspect: null, completeFollowUpId: null, editProspectId: null, followUpProspect: null, editFollowUpId: null, usersLoaded: false };

const OUTCOMES = [
    ['connected_interested', 'Connected - interested'],
    ['connected_brief_given', 'Connected - brief given'],
    ['meeting_fixed', 'Connected - meeting fixed'],
    ['call_later', 'Connected - call later'],
    ['not_available', 'Currently not available'],
    ['no_answer', 'No answer'],
    ['wrong_number', 'Wrong number'],
    ['not_interested', 'Not interested'],
];
const FOLLOW_UP_SUGGEST = ['call_later', 'not_available', 'no_answer', 'connected_brief_given'];

function ProspectModalsInit(urls, onChange) {
    PM.urlProspect = urls.prospect;
    PM.urlCallLog = urls.callLog;
    PM.urlFollowUp = urls.followUp;
    PM.urlUsers = urls.users || '';
    PM.onChange = onChange || (() => {});

    fillSelect('cm-outcome', OUTCOMES.map(([value, label]) => ({ id: value, full_name: label })));
    document.getElementById('callForm').addEventListener('submit', e => { e.preventDefault(); saveCall(); });
    document.getElementById('prospectForm').addEventListener('submit', e => { e.preventDefault(); saveProspect(); });
    document.getElementById('followUpForm').addEventListener('submit', e => { e.preventDefault(); saveFollowUp(); });

    const toggle = document.getElementById('cm-fu-toggle');
    toggle.addEventListener('change', () => setFollowUpVisible(toggle.checked));
    document.getElementById('cm-outcome').addEventListener('change', e => {
        if (FOLLOW_UP_SUGGEST.includes(e.target.value) && !toggle.checked) {
            toggle.checked = true;
            setFollowUpVisible(true);
        }
    });
    document.getElementById('cm-fu-quick').addEventListener('click', e => {
        const b = e.target.closest('button[data-days]');
        if (b) document.getElementById('cm-fu-at').value = addDays(Number(b.dataset.days), 11);
    });
    document.getElementById('fm-quick').addEventListener('click', e => {
        const b = e.target.closest('button[data-days]');
        if (b) document.getElementById('fm-at').value = addDays(Number(b.dataset.days), 11);
    });
}

function setFollowUpVisible(visible) {
    document.getElementById('cm-fu-wrap').classList.toggle('d-none', !visible);
    if (visible && !document.getElementById('cm-fu-at').value) document.getElementById('cm-fu-at').value = addDays(1, 11);
}

/* ---------- Call modal ---------- */
function openCallModal(prospect, options = {}) {
    PM.callProspect = prospect;
    PM.completeFollowUpId = options.followUpId || null;
    document.getElementById('cm-prospect-name').textContent = `${prospect.company_name} \u00B7 ${prospect.contact_person} \u00B7 ${prospect.contact_number}`;
    document.getElementById('callForm').reset();
    document.getElementById('cm-outcome').value = 'connected_interested';
    document.getElementById('cm-called-at').value = toLocalInput(new Date());
    document.getElementById('cm-fu-at').value = '';
    setFollowUpVisible(false);
    showFormError('cm-error', '');
    modalShow('callModal');
}

async function saveCall() {
    const outcome = document.getElementById('cm-outcome').value;
    const followUpOn = document.getElementById('cm-fu-toggle').checked;
    const followUpAt = document.getElementById('cm-fu-at').value;
    if (followUpOn && !followUpAt) {
        showFormError('cm-error', 'Pick a date and time for the follow-up or switch it off.');
        return;
    }
    const button = document.getElementById('cm-save');
    setBusy(button, true);
    const res = await api('POST', PM.urlCallLog, {
        prospect: PM.callProspect.id,
        outcome,
        called_at: document.getElementById('cm-called-at').value,
        duration_minutes: document.getElementById('cm-duration').value,
        summary: document.getElementById('cm-summary').value,
        follow_up_at: followUpOn ? followUpAt : '',
        follow_type: document.getElementById('cm-fu-type').value,
        follow_up_note: document.getElementById('cm-fu-note').value,
        complete_follow_up_id: PM.completeFollowUpId,
    });
    setBusy(button, false);
    if (!res.ok) { showFormError('cm-error', res.error); return; }
    modalHide('callModal');
    toast(followUpOn ? 'Call logged and follow-up scheduled' : 'Call logged');
    PM.onChange('call', res.data);
}

/* ---------- Prospect form ---------- */
async function ensureOwners() {
    const select = document.getElementById('pf-owner');
    if (!select || PM.usersLoaded) return;
    const res = await api('GET', `${PM.urlUsers}?role=sales,admin`);
    if (res.ok) {
        fillSelect(select, res.data.users, { label: u => `${u.full_name} (${u.role})`, placeholder: 'Myself' });
        PM.usersLoaded = true;
    }
}

async function openProspectForm(prospect = null) {
    PM.editProspectId = prospect ? prospect.id : null;
    const form = document.getElementById('prospectForm');
    form.reset();
    showFormError('pf-error', '');
    document.getElementById('prospectModalTitle').textContent = prospect ? 'Edit prospect' : 'Add prospect';
    await ensureOwners();
    if (prospect) {
        ['company_name', 'place', 'website', 'industry', 'contact_person', 'designation', 'contact_number', 'alternate_number', 'email', 'requirement', 'source']
            .forEach(name => { form.elements[name].value = prospect[name] ?? ''; });
        if (form.elements.owner) form.elements.owner.value = prospect.owner;
    }
    modalShow('prospectModal');
}

async function saveProspect() {
    const form = document.getElementById('prospectForm');
    const values = formValues(form);
    if (!values.company_name || !values.contact_person || !values.contact_number) {
        showFormError('pf-error', 'Company name, contact person and contact number are required.');
        return;
    }
    const button = document.getElementById('pf-save');
    setBusy(button, true);
    const editing = PM.editProspectId;
    const res = editing ? await api('PUT', withId(PM.urlProspect, editing), values) : await api('POST', PM.urlProspect, values);
    setBusy(button, false);
    if (!res.ok) { showFormError('pf-error', res.error); return; }
    modalHide('prospectModal');
    toast(editing ? 'Prospect updated' : 'Prospect added');
    PM.onChange(editing ? 'edit' : 'create', res.data);
}

/* ---------- Follow-up modal ---------- */
function openFollowUpModal({ prospect, followUp = null }) {
    PM.followUpProspect = prospect;
    PM.editFollowUpId = followUp ? followUp.id : null;
    document.getElementById('followUpModalTitle').textContent = followUp ? 'Reschedule follow-up' : 'Add follow-up';
    document.getElementById('fm-prospect-name').textContent = prospect ? `${prospect.company_name} \u00B7 ${prospect.contact_person}` : (followUp?.company_name || '');
    document.getElementById('fm-at').value = followUp ? toLocalInput(followUp.due_at) : addDays(1, 11);
    document.getElementById('fm-type').value = followUp ? followUp.follow_type : 'call';
    document.getElementById('fm-notes').value = followUp ? (followUp.notes || '') : '';
    showFormError('fm-error', '');
    modalShow('followUpModal');
}

async function saveFollowUp() {
    const dueAt = document.getElementById('fm-at').value;
    if (!dueAt) { showFormError('fm-error', 'Pick a date and time.'); return; }
    const button = document.getElementById('fm-save');
    setBusy(button, true);
    const payload = { due_at: dueAt, follow_type: document.getElementById('fm-type').value, notes: document.getElementById('fm-notes').value };
    const res = PM.editFollowUpId
        ? await api('PUT', withId(PM.urlFollowUp, PM.editFollowUpId), payload)
        : await api('POST', PM.urlFollowUp, { ...payload, prospect: PM.followUpProspect.id });
    setBusy(button, false);
    if (!res.ok) { showFormError('fm-error', res.error); return; }
    modalHide('followUpModal');
    toast(PM.editFollowUpId ? 'Follow-up rescheduled' : 'Follow-up added');
    PM.onChange('followup', res.data);
}

async function markFollowUpDone(id) {
    const res = await api('PUT', withId(PM.urlFollowUp, id), { status: 'done' });
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast('Follow-up marked done');
    PM.onChange('followup', res.data);
}

let _csrf = null;
let _urlProfile = null;
let _urlPassword = null;

function ProfileInit(csrf, urlProfile, urlPassword) {
    _csrf = csrf;
    _urlProfile = urlProfile;
    _urlPassword = urlPassword;
    DL.csrf = csrf;

    document.getElementById('profileForm').addEventListener('submit', e => { e.preventDefault(); saveProfile(); });
    document.getElementById('passwordForm').addEventListener('submit', e => { e.preventDefault(); savePassword(); });
    document.getElementById('pf-image').addEventListener('change', e => {
        const file = e.target.files[0];
        if (file && file.size > 5 * 1024 * 1024) { toast('Photo must be under 5 MB.', 'error'); e.target.value = ''; }
    });
    loadProfile();
}

function fillProfile(user) {
    document.getElementById('pf-first').value = user.first_name || '';
    document.getElementById('pf-last').value = user.last_name || '';
    document.getElementById('pf-phone').value = user.contact_number || '';
    document.getElementById('pf-designation').value = user.designation || '';
    document.getElementById('pf-email').value = user.email;
    document.getElementById('pf-role').value = user.role_display;
    document.getElementById('pf-avatar').innerHTML = user.profile_image_url
        ? `<img class="avatar lg" src="${esc(user.profile_image_url)}" alt="Your profile photo">`
        : `<span class="avatar lg">${esc(user.initials)}</span>`;
}

async function loadProfile() {
    const res = await api('GET', _urlProfile);
    if (!res.ok) { showFormError('pf-error', res.error); return; }
    fillProfile(res.data.user);
}

async function saveProfile() {
    const first = document.getElementById('pf-first').value.trim();
    if (!first) { showFormError('pf-error', 'First name is required.'); return; }
    const form = new FormData();
    form.append('first_name', first);
    form.append('last_name', document.getElementById('pf-last').value.trim());
    form.append('contact_number', document.getElementById('pf-phone').value.trim());
    form.append('designation', document.getElementById('pf-designation').value.trim());
    const image = document.getElementById('pf-image').files[0];
    if (image) form.append('profile_image', image);

    const button = document.getElementById('pf-save');
    setBusy(button, true);
    const res = await api('POST', _urlProfile, form, true);
    setBusy(button, false);
    if (!res.ok) { showFormError('pf-error', res.error); return; }
    showFormError('pf-error', '');
    fillProfile(res.data.user);
    toast('Profile updated');
    setTimeout(() => window.location.reload(), 600);
}

async function savePassword() {
    const current = document.getElementById('pw-current').value;
    const next = document.getElementById('pw-new').value;
    const confirm = document.getElementById('pw-confirm').value;
    if (!current || !next) { showFormError('pw-error', 'Fill in your current and new password.'); return; }
    if (next.length < 8) { showFormError('pw-error', 'New password must be at least 8 characters.'); return; }
    if (next !== confirm) { showFormError('pw-error', 'New passwords do not match.'); return; }

    const button = document.getElementById('pw-save');
    setBusy(button, true);
    const res = await api('POST', _urlPassword, { current_password: current, new_password: next });
    setBusy(button, false);
    if (!res.ok) { showFormError('pw-error', res.error); return; }
    showFormError('pw-error', '');
    document.getElementById('passwordForm').reset();
    toast('Password updated');
}

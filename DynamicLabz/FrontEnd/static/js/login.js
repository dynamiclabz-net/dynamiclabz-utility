let _csrf = null;
let _urlLogin = null;
let _urlDashboard = null;

function LoginInit(csrf, urlLogin, urlDashboard) {
    _csrf = csrf;
    _urlLogin = urlLogin;
    _urlDashboard = urlDashboard;
    DL.csrf = csrf;

    document.getElementById('login-form').addEventListener('submit', function (e) {
        e.preventDefault();
        handleLogin();
    });
    document.getElementById('inp-email').focus();
}

async function handleLogin() {
    showFormError('alert-error', '');
    const email = document.getElementById('inp-email').value.trim().toLowerCase();
    const password = document.getElementById('inp-password').value;

    if (!email || !password) {
        showFormError('alert-error', 'Please enter your email and password.');
        return;
    }

    const btn = document.getElementById('btn-login');
    setBusy(btn, true, 'Signing in...');

    const res = await api('POST', _urlLogin, { email, password });

    if (!res.ok) {
        setBusy(btn, false);
        showFormError('alert-error', res.error || 'Login failed. Please try again.');
        return;
    }

    window.location.href = _urlDashboard;
}

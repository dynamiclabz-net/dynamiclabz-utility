function applyTheme(theme) {
    document.documentElement.setAttribute('data-bs-theme', theme);
    try { localStorage.setItem('dl-theme', theme); } catch (e) { /* storage unavailable */ }
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
}

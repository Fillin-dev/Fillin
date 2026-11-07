// Apply the theme before styles and React load, including when storage is blocked.
(() => {
  let preference = 'system';
  try {
    const saved = localStorage.getItem('fillin-theme');
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch { /* Keep system preference when browser storage is unavailable. */ }
  const dark = preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
})();

// Theme Manager
// This script runs immediately to apply theme before render
(function() {
  const savedTheme = localStorage.getItem('rpg_theme') || 'default';
  if (savedTheme !== 'default') {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  // Expose function globally
  window.setTheme = function(theme) {
    if (theme === 'default') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem('rpg_theme', theme);
  }
})();

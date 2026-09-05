(() => {
  const header = document.querySelector('.site-header');
  const menuButton = document.querySelector('.menu-button');
  const navigation = document.querySelector('.main-nav');
  if (!header || !menuButton || !navigation) return;
  navigation.id = 'primary-navigation';
  menuButton.setAttribute('aria-controls', navigation.id);
  menuButton.setAttribute('aria-expanded', 'false');
  const closeMenu = () => { navigation.classList.remove('is-open'); menuButton.setAttribute('aria-expanded', 'false'); menuButton.setAttribute('aria-label', 'Abrir menú'); menuButton.textContent = '☰'; };
  const openMenu = () => { navigation.classList.add('is-open'); menuButton.setAttribute('aria-expanded', 'true'); menuButton.setAttribute('aria-label', 'Cerrar menú'); menuButton.textContent = '×'; };
  menuButton.addEventListener('click', () => navigation.classList.contains('is-open') ? closeMenu() : openMenu());
  navigation.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeMenu(); menuButton.focus(); } });
  document.addEventListener('click', event => { if (!header.contains(event.target)) closeMenu(); });
  window.addEventListener('resize', () => { if (window.innerWidth >= 721) closeMenu(); });
})();

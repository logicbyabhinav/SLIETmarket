// ── SLIET Market — Shared JS ──────────────────────────────

// Hamburger menu toggle
function initHamburger() {
  const ham = document.getElementById('hamburger');
  const menu = document.getElementById('mobileMenu');
  if (!ham || !menu) return;
  ham.addEventListener('click', () => {
    menu.classList.toggle('open');
    const spans = ham.querySelectorAll('span');
    if (menu.classList.contains('open')) {
      spans[0].style.transform = 'rotate(45deg) translate(5px,5px)';
      spans[1].style.opacity = '0';
      spans[2].style.transform = 'rotate(-45deg) translate(5px,-5px)';
    } else {
      spans.forEach(s => { s.style.transform=''; s.style.opacity=''; });
    }
  });
  // Close on outside click
  document.addEventListener('click', e => {
    if (!ham.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.remove('open');
      ham.querySelectorAll('span').forEach(s => { s.style.transform=''; s.style.opacity=''; });
    }
  });
}

// Toast helper (available to all pages)
function showToast(msg, type='info') {
  let wrap = document.getElementById('toastWrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.id='toastWrap'; wrap.className='toast-wrap'; document.body.appendChild(wrap); }
  const icons = { success:'check_circle', error:'error', info:'info' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="material-symbols-outlined">${icons[type]||'info'}</span>${msg}`;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// Modal helpers
function openModal(id)  { document.getElementById(id).classList.add('open'); document.body.style.overflow='hidden'; }
function closeModal(id) { document.getElementById(id).classList.remove('open'); document.body.style.overflow=''; }
// Close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
    document.body.style.overflow = '';
  }
});

// Init on DOM ready
document.addEventListener('DOMContentLoaded', initHamburger);

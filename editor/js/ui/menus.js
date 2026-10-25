// Context menus, dropdown menus and the top menu bar.
import { el } from '../core/events.js';

const layer = () => document.getElementById('menu-layer');
let openMenus = [];

export function closeMenus() { for (const m of openMenus) m.remove(); openMenus = []; document.querySelectorAll('.menu-root.open').forEach(e => e.classList.remove('open')); }

export function showMenu(items, x, y, level = 0) {
  if (level === 0) closeMenus();
  const m = el('div', { class: 'menu' });
  for (const it of items) {
    if (it === '-' || it == null) { if (it === '-') m.append(el('div', { class: 'menu-sep' })); continue; }
    const row = el('div', { class: 'menu-item' + (it.disabled ? ' disabled' : '') + (it.submenu ? ' sub' : '') + (it.checked ? ' checked' : '') },
      el('span', { text: it.label }), it.shortcut ? el('span', { class: 'mk', text: it.shortcut }) : null);
    if (it.submenu) {
      row.addEventListener('mouseenter', () => {
        // close deeper submenus
        while (openMenus.length > level + 1) openMenus.pop().remove();
        const r = row.getBoundingClientRect();
        const sub = typeof it.submenu === 'function' ? it.submenu() : it.submenu;
        showMenu(sub, r.right - 2, r.top - 3, level + 1);
      });
    } else {
      row.addEventListener('mouseenter', () => { while (openMenus.length > level + 1) openMenus.pop().remove(); });
      if (!it.disabled) row.addEventListener('click', (e) => { e.stopPropagation(); closeMenus(); it.action && it.action(); });
    }
    m.append(row);
  }
  layer().append(m);
  openMenus.push(m);
  // keep on screen
  const r = m.getBoundingClientRect();
  if (x + r.width > window.innerWidth) x = Math.max(0, level > 0 ? x - r.width - (openMenus[level - 1]?.getBoundingClientRect().width || 0) + 4 : window.innerWidth - r.width - 4);
  if (y + r.height > window.innerHeight) y = Math.max(0, window.innerHeight - r.height - 4);
  m.style.left = x + 'px'; m.style.top = y + 'px';
  return m;
}

document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.menu') && !e.target.closest('.menu-root')) closeMenus(); }, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });

export function menuBar(host, menus) {
  host.innerHTML = '';
  let active = false;
  for (const [name, getItems] of menus) {
    const root = el('div', { class: 'menu-root', text: name });
    const open = () => {
      closeMenus();
      root.classList.add('open');
      const r = root.getBoundingClientRect();
      showMenu(typeof getItems === 'function' ? getItems() : getItems, r.left, r.bottom, 0);
      root.classList.add('open');
      active = true;
    };
    root.addEventListener('pointerdown', (e) => { e.preventDefault(); if (root.classList.contains('open')) { closeMenus(); active = false; } else open(); });
    root.addEventListener('mouseenter', () => { if (openMenus.length && document.querySelector('.menu-root.open')) open(); });
    host.append(root);
  }
}

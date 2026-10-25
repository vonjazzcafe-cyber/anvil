// Modal dialogs: prompt, confirm, choose-from-list, and a generic custom dialog.
import { el } from '../core/events.js';

const layer = () => document.getElementById('dialog-layer');

export function dialog({ title, body, buttons = [], width, onClose }) {
  const back = el('div', { class: 'dialog-back' });
  const close = (v) => { back.remove(); onClose && onClose(v); };
  const foot = el('div', { class: 'dialog-foot' });
  for (const b of buttons) foot.append(el('button', { class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''), text: b.label, onclick: () => { const r = b.action ? b.action() : undefined; if (r !== false) close(b.value); } }));
  const d = el('div', { class: 'dialog', style: width ? { width: width + 'px' } : null },
    el('div', { class: 'dialog-title' }, el('span', { text: title }), el('span', { class: 'x', text: '✕', onclick: () => close(undefined) })),
    el('div', { class: 'dialog-body' }, body),
    buttons.length ? foot : null);
  back.append(d);
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(undefined); });
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(undefined); } });
  layer().append(back);
  return { close, root: d };
}

export function prompt(title, label, value = '', okLabel = 'OK') {
  return new Promise((resolve) => {
    const input = el('input', { type: 'text', class: 'wide', value, spellcheck: 'false' });
    let done = false;
    const d = dialog({
      title, body: el('div', {}, label ? el('p', { text: label }) : null, input),
      buttons: [{ label: 'Cancel', value: null }, { label: okLabel, primary: true, action: () => { done = true; resolve(input.value.trim()); } }],
      onClose: () => { if (!done) resolve(null); },
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { done = true; resolve(input.value.trim()); d.close(); } });
    input.focus(); input.select();
  });
}

export function confirm(title, message, okLabel = 'OK', danger = false) {
  return new Promise((resolve) => {
    let r = false;
    dialog({ title, body: el('p', { text: message }), buttons: [{ label: 'Cancel' }, { label: okLabel, primary: !danger, danger, action: () => { r = true; } }], onClose: () => resolve(r) });
  });
}

export function alertBox(title, message) {
  return new Promise((resolve) => dialog({ title, body: typeof message === 'string' ? el('p', { text: message }) : message, buttons: [{ label: 'OK', primary: true }], onClose: () => resolve() }));
}

// Searchable picker (Add Component, object field picker, etc.)
export function pick(title, items, { placeholder = 'Search', width = 420 } = {}) {
  return new Promise((resolve) => {
    const input = el('input', { type: 'text', class: 'wide', placeholder, spellcheck: 'false' });
    const list = el('div', { class: 'picker-list' });
    let filtered = items, sel = 0, done = false;
    const render = () => {
      list.innerHTML = '';
      filtered.forEach((it, i) => {
        const row = el('div', { class: 'picker-item' + (i === sel ? ' sel' : '') }, el('span', { text: it.label }), it.hint ? el('span', { class: 'pk', text: it.hint }) : null);
        row.addEventListener('click', () => { done = true; resolve(it.value); d.close(); });
        list.append(row);
      });
    };
    const filter = () => {
      const q = input.value.toLowerCase().trim();
      filtered = q ? items.filter(it => it.label.toLowerCase().includes(q) || (it.hint || '').toLowerCase().includes(q)) : items;
      sel = 0; render();
    };
    input.addEventListener('input', filter);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(filtered.length - 1, sel + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter' && filtered[sel]) { done = true; resolve(filtered[sel].value); d.close(); }
    });
    const d = dialog({ title, width, body: el('div', {}, input, list), onClose: () => { if (!done) resolve(undefined); } });
    render();
    input.focus();
  });
}

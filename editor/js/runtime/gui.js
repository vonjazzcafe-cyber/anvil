// Draws OnGUI commands (GUI.Label, GUI.Box, GUI.Button...) as an HTML overlay on the Game view.
const pool = [];
let used = 0;

function richToHtml(s, rich) {
  const esc = (x) => x.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  if (!rich || s.indexOf('<') < 0) return esc(s);
  // supported Unity rich text tags: b, i, size, color
  let out = '', i = 0;
  const re = /<(\/?)(b|i|size|color)(?:=("?)([^>"]*)\3)?>/gi;
  let m;
  while ((m = re.exec(s))) {
    out += esc(s.slice(i, m.index));
    const close = m[1] === '/', tag = m[2].toLowerCase(), val = m[4];
    if (close) out += tag === 'b' ? '</b>' : tag === 'i' ? '</i>' : '</span>';
    else if (tag === 'b') out += '<b>';
    else if (tag === 'i') out += '<i>';
    else if (tag === 'size') out += `<span style="font-size:${parseFloat(val) || 12}px">`;
    else if (tag === 'color') out += `<span style="color:${/^#?[0-9a-f]{3,8}$/i.test(val) ? (val.startsWith('#') ? val : '#' + val) : (/^[a-z]+$/i.test(val) ? val : 'inherit')}">`;
    i = re.lastIndex;
  }
  return out + esc(s.slice(i));
}
const ALIGN = [['flex-start', 'flex-start', 'left'], ['flex-start', 'center', 'center'], ['flex-start', 'flex-end', 'right'], ['center', 'flex-start', 'left'], ['center', 'center', 'center'], ['center', 'flex-end', 'right'], ['flex-end', 'flex-start', 'left'], ['flex-end', 'center', 'center'], ['flex-end', 'flex-end', 'right']];

export function drawGui(overlay, cmds, scaleX = 1, scaleY = 1, offX = 0, offY = 0) {
  used = 0;
  if (cmds) for (const c of cmds) {
    let d = pool[used];
    if (!d) { d = document.createElement('div'); pool.push(d); overlay.append(d); }
    if (d.parentElement !== overlay) overlay.append(d);
    used++;
    const [kind, x, y, w, h, text, fontSize, fontStyle, align, color, bg, flags, value, min, max] = c;
    const wrap = flags & 1, rich = flags & 2, hot = flags & 4, drawBg = flags & 8, on = flags & 16;
    d.className = 'gui-el' + (wrap ? ' wrap' : '') + (kind === 2 ? ' btn' : '') + (hot ? ' hot' : '') + (kind === 4 || kind === 7 ? ' slider' : '') + (kind === 3 ? ' toggle' + (on ? ' on' : '') : '') + (drawBg && kind !== 2 ? ' bg' : '');
    d.style.display = 'flex';
    d.style.left = (offX + x * scaleX) + 'px'; d.style.top = (offY + y * scaleY) + 'px';
    d.style.width = Math.max(0, w * scaleX) + 'px'; d.style.height = Math.max(0, h * scaleY) + 'px';
    d.style.fontSize = (fontSize * scaleY) + 'px';
    d.style.fontWeight = fontStyle === 1 || fontStyle === 3 ? 'bold' : 'normal';
    d.style.fontStyle = fontStyle === 2 || fontStyle === 3 ? 'italic' : 'normal';
    d.style.color = color;
    const a = ALIGN[align] || ALIGN[0];
    d.style.alignItems = a[0]; d.style.justifyContent = a[1]; d.style.textAlign = a[2];
    d.style.padding = kind === 3 ? '0 0 0 16px' : kind === 1 ? '3px 4px' : '1px 3px';
    d.style.background = (kind === 2) ? `linear-gradient(${bg}, ${bg})` : (drawBg ? bg : 'transparent');
    d.style.textShadow = kind === 0 ? '0 1px 1px rgba(0,0,0,.35)' : 'none';
    if (kind === 4 || kind === 7) {
      let t = d.querySelector('.thumb'); if (!t) { d.textContent = ''; t = document.createElement('div'); t.className = 'thumb'; d.append(t); }
      const f = max !== min ? (value - min) / (max - min) : 0;
      t.style.left = (Math.max(0, Math.min(1, f)) * 100) + '%';
    } else {
      const html = richToHtml(text, rich);
      if (d._html !== html) { d.innerHTML = html; d._html = html; }
    }
  }
  for (let i = used; i < pool.length; i++) pool[i].style.display = 'none';
}
export function clearGui() { for (const d of pool) d.style.display = 'none'; }

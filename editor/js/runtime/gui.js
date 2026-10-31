// Draws OnGUI commands (GUI.Label, GUI.Box, GUI.Button...) as an HTML overlay on the Game view.
const pool = [];
let used = 0;

function cssColor(val) {
  if (!val) return 'inherit';
  val = val.replace(/^"|"$/g, '');
  if (/^#?[0-9a-f]{3,8}$/i.test(val)) return val.startsWith('#') ? val : '#' + val;
  return /^[a-z]+$/i.test(val) ? val : 'inherit';
}
// Unity rich text (OnGUI, uGUI Text) and the extra TextMesh Pro tags
function richToHtml(s, rich, tmp) {
  const esc = (x) => x.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  if (!rich || s.indexOf('<') < 0) return esc(s);
  let out = '', i = 0;
  const re = tmp ? /<(\/?)(b|i|u|s|size|color|sup|sub|mark|br|alpha|lowercase|uppercase|smallcaps|cspace|font-weight|align|nobr|indent|line-height|voffset|style|font|link|noparse|sprite)(?:=("?)([^>"]*)\3)?\s*\/?>/gi
                 : /<(\/?)(b|i|size|color)(?:=("?)([^>"]*)\3)?>/gi;
  let m; const stack = [];
  while ((m = re.exec(s))) {
    out += esc(s.slice(i, m.index));
    const close = m[1] === '/', tag = m[2].toLowerCase(), val = m[4];
    i = re.lastIndex;
    if (tag === 'br') { out += '<br>'; continue; }
    if (tag === 'sprite' || tag === 'noparse' || tag === 'link' || tag === 'font' || tag === 'style' || tag === 'nobr' || tag === 'indent' || tag === 'voffset') continue;
    if (close) { out += { b: '</b>', i: '</i>', u: '</u>', s: '</s>', sup: '</sup>', sub: '</sub>' }[tag] || '</span>'; continue; }
    switch (tag) {
      case 'b': out += '<b>'; break;
      case 'i': out += '<i>'; break;
      case 'u': out += '<u>'; break;
      case 's': out += '<s>'; break;
      case 'sup': out += '<sup>'; break;
      case 'sub': out += '<sub>'; break;
      case 'size': { const v = String(val || ''); const px = v.endsWith('%') ? (parseFloat(v) / 100) + 'em' : v.endsWith('em') ? v : ((parseFloat(v) || 12) + 'px'); out += `<span style="font-size:${px}">`; break; }
      case 'color': out += `<span style="color:${cssColor(val)}">`; break;
      case 'mark': out += `<span style="background:${cssColor(val)}">`; break;
      case 'alpha': { const a = parseInt(String(val || '#ff').replace('#', ''), 16); out += `<span style="opacity:${isNaN(a) ? 1 : a / 255}">`; break; }
      case 'lowercase': out += '<span style="text-transform:lowercase">'; break;
      case 'uppercase': out += '<span style="text-transform:uppercase">'; break;
      case 'smallcaps': out += '<span style="font-variant:small-caps">'; break;
      case 'cspace': out += `<span style="letter-spacing:${parseFloat(val) || 0}${String(val).endsWith('em') ? 'em' : 'px'}">`; break;
      case 'font-weight': out += `<span style="font-weight:${parseInt(val) || 400}">`; break;
      case 'line-height': out += '<span>'; break;
      case 'align': out += `<span style="display:block;text-align:${val || 'left'}">`; break;
      default: out += '<span>';
    }
  }
  return out + esc(s.slice(i));
}
const ALIGN = [['flex-start', 'flex-start', 'left'], ['flex-start', 'center', 'center'], ['flex-start', 'flex-end', 'right'], ['center', 'flex-start', 'left'], ['center', 'center', 'center'], ['center', 'flex-end', 'right'], ['flex-end', 'flex-start', 'left'], ['flex-end', 'center', 'center'], ['flex-end', 'flex-end', 'right']];

let textureURL = () => null; // set by play.js: texture uid -> image URL
export function setGuiTextureSource(fn) { textureURL = fn; }
const clipPool = [];

const extraCache = new Map();
function parseExtra(x) {
  if (!x) return null;
  let e = extraCache.get(x);
  if (!e) { e = {}; for (const part of x.split(';')) { if (!part) continue; const i = part.indexOf('='); e[part.slice(0, i)] = part.slice(i + 1); } if (extraCache.size > 500) extraCache.clear(); extraCache.set(x, e); }
  return e;
}
const uiPool = []; let uiUsed = 0;
const RADIAL = { 2: [['0% 100%', 0], ['0% 0%', 90], ['100% 0%', 180], ['100% 100%', 270]], 3: [['50% 100%', 270], ['0% 50%', 0], ['50% 0%', 90], ['100% 50%', 180]], 4: [['50% 50%', 180], ['50% 50%', 90], ['50% 50%', 0], ['50% 50%', 270]] };
function fillMask(st, fl) {
  const [m, a, o, cw] = fl.split(',').map(Number);
  st.clipPath = ''; st.maskImage = ''; st.webkitMaskImage = '';
  const r = (1 - a) * 100;
  if (m === 0) { st.clipPath = o === 1 ? `inset(0 0 0 ${r}%)` : `inset(0 ${r}% 0 0)`; return; }
  if (m === 1) { st.clipPath = o === 1 ? `inset(0 0 ${r}% 0)` : `inset(${r}% 0 0 0)`; return; }
  const span = m === 2 ? 90 : m === 3 ? 180 : 360;
  const [at, base] = (RADIAL[m] || RADIAL[4])[o] || RADIAL[4][0];
  const sweep = a * span;
  const from = cw ? base : base + span - sweep;
  const g = `conic-gradient(from ${from}deg at ${at}, #000 0deg ${sweep}deg, transparent ${sweep}deg 360deg)`;
  st.maskImage = g; st.webkitMaskImage = g;
}
function drawUi(c, top, overlay, scaleX, scaleY, offX, offY) {
  const [kind, x, y, w, h, text, fontSize, fontStyle, align, color, bg, flags, value, min, max, font, tex, , , , , rot, extraS] = c;
  let d = uiPool[uiUsed];
  if (!d) { d = document.createElement('div'); uiPool.push(d); }
  if (d.parentElement !== top.el) top.el.append(d);
  uiUsed++;
  const st = d.style, ex = parseExtra(extraS) || {};
  const ox = top.el === overlay ? offX : 0, oy = top.el === overlay ? offY : 0;
  st.display = 'block';
  st.left = (ox + (x - top.x) * scaleX) + 'px'; st.top = (oy + (y - top.y) * scaleY) + 'px';
  st.width = Math.max(0, w * scaleX) + 'px'; st.height = Math.max(0, h * scaleY) + 'px';
  st.transform = rot ? `rotate(${rot}deg)` : '';
  if (kind === 10) {
    if (d._k !== 10) { d.className = 'ui-rect'; d.innerHTML = ''; d._html = null; d._k = 10; }
    const url = tex ? textureURL(tex) : null;
    st.boxShadow = ex.sd ? '0 3px 10px rgba(0,0,0,.35)' : '';
    st.opacity = '';
    if (url) {
      const white = /^#ffffff/i.test(color);
      st.backgroundColor = white ? 'transparent' : color.slice(0, 7);
      st.backgroundBlendMode = white ? '' : 'multiply';
      const alpha = parseInt(color.slice(7, 9) || 'ff', 16) / 255;
      st.opacity = alpha < 1 ? String(alpha) : '';
      st.backgroundImage = `url(${url})`;
      st.backgroundRepeat = 'no-repeat';
      if (ex.sl) {
        const [l, t, r, b, ppu, hollow] = ex.sl.split(','); const px = (max || 1) * scaleY;
        st.backgroundImage = ''; st.backgroundColor = 'transparent';
        st.borderStyle = 'solid'; st.borderImageSource = `url(${url})`;
        st.borderImageSlice = `${t} ${r} ${b} ${l}` + (hollow ? '' : ' fill');
        st.borderWidth = `${t / ppu * px}px ${r / ppu * px}px ${b / ppu * px}px ${l / ppu * px}px`;
        st.boxSizing = 'border-box';
      } else {
        st.borderStyle = ''; st.borderImageSource = ''; st.borderWidth = '';
        if (ex.uv) {
          const [ux, uy, uw, uh] = ex.uv.split(',').map(Number);
          st.backgroundSize = `${100 / uw}% ${100 / uh}%`;
          const px = uw < 1 ? ux / (1 - uw) * 100 : 0, py = uh < 1 ? (1 - uy - uh) / (1 - uh) * 100 : 0;
          st.backgroundPosition = `${px}% ${py}%`;
        } else { st.backgroundSize = value === 2 ? 'contain' : '100% 100%'; st.backgroundPosition = 'center'; }
      }
      const mask = white ? '' : `url(${url})`;
      st.webkitMaskImage = mask; st.maskImage = mask; st.webkitMaskSize = st.backgroundSize; st.maskSize = st.backgroundSize; st.webkitMaskPosition = st.backgroundPosition; st.maskPosition = st.backgroundPosition; st.maskRepeat = 'no-repeat'; st.webkitMaskRepeat = 'no-repeat';
    } else {
      st.backgroundImage = ''; st.background = color; st.borderStyle = ''; st.borderImageSource = ''; st.borderWidth = '';
      st.maskImage = ''; st.webkitMaskImage = '';
    }
    if (ex.fl) fillMask(st, ex.fl); else st.clipPath = '';
    return;
  }
  if (kind === 12) {
    if (d._k !== 12) { d.className = 'ui-rect'; d._k = 12; d._html = null; st.background = 'transparent'; }
    if (d._html !== text) {
      const polys = text.split(';').filter(Boolean).map(t => { const [pts, col] = t.split('|'); return `<polygon points="${pts}" fill="${col.slice(0, 7)}" fill-opacity="${parseInt(col.slice(7, 9), 16) / 255}" shape-rendering="crispEdges"/>`; }).join('');
      d.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="overflow:visible;display:block">${polys}</svg>`;
      d._html = text;
    }
    return;
  }
  // kind 11: text
  if (d._k !== 11) { d.className = 'ui-text'; d.innerHTML = '<div class="ui-line"></div>'; d._k = 11; d._html = null; st.background = 'transparent'; st.clipPath = ''; st.maskImage = ''; st.webkitMaskImage = ''; st.borderStyle = ''; st.borderImageSource = ''; st.borderWidth = ''; st.boxShadow = ''; st.opacity = ''; }
  const inner = d.firstChild, wrap = flags & 1, rich = flags & 2, tmp = !!ex.tmp;
  const a = ALIGN[align] || ALIGN[0];
  st.alignItems = a[0]; st.justifyContent = a[1];
  inner.style.textAlign = ex.j ? 'justify' : a[2];
  st.overflow = ex.clip ? 'hidden' : 'visible';
  st.fontSize = (fontSize * scaleY) + 'px';
  st.fontFamily = font ? font.split(',').map(f => `"${f.trim()}"`).join(',') + ', Arial, sans-serif' : '';
  st.fontWeight = ex.fw ? ex.fw : (fontStyle === 1 || fontStyle === 3 ? 'bold' : 'normal');
  st.fontStyle = fontStyle === 2 || fontStyle === 3 ? 'italic' : 'normal';
  st.color = color;
  st.lineHeight = ((tmp ? 1.2 : 1.15) * (parseFloat(ex.ls) || 1)) + '';
  st.letterSpacing = ex.cs ? ex.cs + 'em' : '';
  st.wordSpacing = ex.ws ? ex.ws + 'em' : '';
  st.textDecoration = [ex.u ? 'underline' : '', ex.st ? 'line-through' : ''].filter(Boolean).join(' ');
  st.fontVariant = ex.sc ? 'small-caps' : '';
  st.direction = ex.rtl ? 'rtl' : '';
  inner.style.whiteSpace = wrap ? (ex.pw ? 'pre-wrap' : 'pre-wrap') : 'pre';
  inner.style.textOverflow = ex.el ? 'ellipsis' : '';
  inner.style.overflow = ex.el ? 'hidden' : '';
  inner.style.maxWidth = '100%'; inner.style.width = wrap || ex.j ? '100%' : '';
  const shadows = [];
  if (ex.sh) { const [col, dx, dy] = ex.sh.split(','); const px = (value || 1) * scaleY; shadows.push(`${dx * px}px ${-dy * px}px 0 ${col}`); }
  if (ex.ol) { const [col, dx, dy] = ex.ol.split(','); const px = (value || 1) * scaleY; const ax = Math.abs(dx * px), ay = Math.abs(dy * px); shadows.push(`${ax}px ${ay}px 0 ${col}`, `${-ax}px ${ay}px 0 ${col}`, `${ax}px ${-ay}px 0 ${col}`, `${-ax}px ${-ay}px 0 ${col}`); }
  st.textShadow = shadows.join(',');
  if (ex.ow) { const [col, wv] = ex.ow.split(','); st.webkitTextStroke = `${Math.max(0.5, wv * fontSize * scaleY * 0.3)}px ${col}`; st.paintOrder = 'stroke fill'; } else { st.webkitTextStroke = ''; st.paintOrder = ''; }
  if (ex.gr) { const [t, b] = ex.gr.split(','); inner.style.backgroundImage = `linear-gradient(${t}, ${b})`; inner.style.webkitBackgroundClip = 'text'; inner.style.backgroundClip = 'text'; inner.style.color = 'transparent'; }
  else if (inner.style.backgroundImage) { inner.style.backgroundImage = ''; inner.style.webkitBackgroundClip = ''; inner.style.backgroundClip = ''; inner.style.color = ''; }
  const html = richToHtml(text, rich, tmp);
  if (d._html !== html) { inner.innerHTML = html; d._html = html; }
}

export function drawGui(overlay, cmds, scaleX = 1, scaleY = 1, offX = 0, offY = 0) {
  used = 0; uiUsed = 0;
  let clipsUsed = 0;
  const stack = [{ el: overlay, x: 0, y: 0 }]; // clip containers (groups, scroll views, windows)
  if (cmds) for (const c of cmds) {
    const [kind, x, y, w, h, text, fontSize, fontStyle, align, color, bg, flags, value, min, max, font, tex, pl, pt, pr, pb] = c;
    const top = stack[stack.length - 1];
    if (kind === 8) {
      let cl = clipPool[clipsUsed];
      if (!cl) { cl = document.createElement('div'); cl.className = 'gui-clip'; clipPool.push(cl); }
      clipsUsed++;
      if (cl.parentElement !== top.el) top.el.append(cl);
      cl.style.display = 'block';
      cl.style.left = (x - top.x) * scaleX + (top.el === overlay ? offX : 0) + 'px'; cl.style.top = (y - top.y) * scaleY + (top.el === overlay ? offY : 0) + 'px';
      cl.style.width = Math.max(0, w * scaleX) + 'px'; cl.style.height = Math.max(0, h * scaleY) + 'px';
      stack.push({ el: cl, x, y });
      continue;
    }
    if (kind === 9) { if (stack.length > 1) stack.pop(); continue; }
    if (kind >= 10) { drawUi(c, top, overlay, scaleX, scaleY, offX, offY); continue; }
    let d = pool[used];
    if (!d) { d = document.createElement('div'); pool.push(d); }
    if (d.parentElement !== top.el) top.el.append(d);
    used++;
    const wrap = flags & 1, rich = flags & 2, hot = flags & 4, drawBg = flags & 8, on = flags & 16;
    d.className = 'gui-el' + (wrap ? ' wrap' : '') + (kind === 2 ? ' btn' : '') + (hot ? ' hot' : '') + (kind === 4 || kind === 7 ? ' slider' : '') + (kind === 3 ? ' toggle' + (on ? ' on' : '') : '') + (drawBg && kind !== 2 && kind !== 6 && !tex ? ' bg' : '');
    d.style.display = 'flex';
    const ox = top.el === overlay ? offX : 0, oy = top.el === overlay ? offY : 0;
    d.style.left = (ox + (x - top.x) * scaleX) + 'px'; d.style.top = (oy + (y - top.y) * scaleY) + 'px';
    d.style.width = Math.max(0, w * scaleX) + 'px'; d.style.height = Math.max(0, h * scaleY) + 'px';
    d.style.fontSize = (fontSize * scaleY) + 'px';
    d.style.fontFamily = font ? font.split(',').map(f => `"${f.trim()}"`).join(',') + ', monospace' : '';
    d.style.fontWeight = fontStyle === 1 || fontStyle === 3 ? 'bold' : 'normal';
    d.style.fontStyle = fontStyle === 2 || fontStyle === 3 ? 'italic' : 'normal';
    d.style.color = color;
    const a = ALIGN[align] || ALIGN[0];
    d.style.alignItems = a[0]; d.style.justifyContent = a[1]; d.style.textAlign = a[2];
    if (pl !== undefined && kind !== 3 && kind !== 6) d.style.padding = `${pt * scaleY}px ${pr * scaleX}px ${pb * scaleY}px ${pl * scaleX}px`;
    else d.style.padding = kind === 3 ? '0 0 0 16px' : kind === 6 ? '0' : kind === 1 ? '3px 4px' : '1px 3px';
    const url = tex ? textureURL(tex) : null;
    if (url) {
      d.style.background = '';
      d.style.backgroundImage = `url(${url})`;
      d.style.backgroundSize = kind === 6 ? (value === 2 ? 'contain' : value === 1 ? 'cover' : '100% 100%') : '100% 100%';
      d.style.backgroundPosition = 'center'; d.style.backgroundRepeat = 'no-repeat';
      d.style.backgroundColor = 'transparent';
      d.style.imageRendering = 'auto';
    } else {
      d.style.backgroundImage = '';
      d.style.background = (kind === 2 && !drawBg) ? `linear-gradient(${bg}, ${bg})` : (drawBg || kind === 6 ? bg : (kind === 2 ? `linear-gradient(${bg}, ${bg})` : 'transparent'));
    }
    d.style.borderRadius = kind === 6 || tex ? '0' : '';
    d.style.textShadow = kind === 0 ? '0 1px 1px rgba(0,0,0,.35)' : 'none';
    if (kind === 4 || kind === 7) {
      let t = d.querySelector('.thumb'); if (!t) { d.textContent = ''; t = document.createElement('div'); t.className = 'thumb'; d.append(t); }
      const f = max !== min ? (value - min) / (max - min) : 0;
      t.style.left = (Math.max(0, Math.min(1, f)) * 100) + '%';
      d._html = null;
    } else {
      const html = kind === 6 ? '' : richToHtml(text, rich, false);
      if (d._html !== html) { d.innerHTML = html; d._html = html; }
    }
  }
  for (let i = used; i < pool.length; i++) pool[i].style.display = 'none';
  for (let i = uiUsed; i < uiPool.length; i++) uiPool[i].style.display = 'none';
  for (let i = clipsUsed; i < clipPool.length; i++) clipPool[i].style.display = 'none';
}
export function clearGui() { for (const d of pool) d.style.display = 'none'; for (const d of uiPool) d.style.display = 'none'; for (const c of clipPool) c.style.display = 'none'; }

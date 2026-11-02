// Speech recognition for UnityEngine.Windows.Speech (DictationRecognizer / KeywordRecognizer), on Chrome's
// built-in Web Speech API. Chrome sends the audio to its speech service to turn it into text (needs internet).
// A small "listening" badge with what it heard sits in the Game view while it runs.
let rec = null, wanted = false, status = 0, lang = 'en-US', badge = null, lastText = '';
let queue = [];   // [kind, text, confidence]: 0 hypothesis, 1 final result, 2 stopped, 3 error

function showBadge() {
  const host = document.getElementById('game-host'); if (!host) return;
  if (!badge) {
    badge = document.createElement('div');
    badge.style.cssText = 'position:absolute;left:8px;bottom:8px;z-index:7;max-width:60%;background:rgba(17,17,17,.85);border:1px solid #444;border-radius:4px;padding:4px 8px;font:12px system-ui;color:#ddd;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    host.append(badge);
  }
  badge.style.display = '';
  render();
}
function render() {
  if (!badge) return;
  badge.textContent = (status === 1 ? '🎤 Listening' : status < 0 ? '🎤 Microphone off' : '🎤 Starting…') + (lastText ? ' · heard: "' + lastText + '"' : '');
}

export function start(language) {
  wanted = true;
  if (language) lang = language;
  showBadge();
  if (rec) { try { rec.start(); } catch { } return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { status = -1; queue.push([3, 'This browser has no speech recognition (use Chrome or Edge)', 0]); render(); return; }
  rec = new SR();
  rec.continuous = true; rec.interimResults = true; rec.lang = lang; rec.maxAlternatives = 1;
  rec.onstart = () => { status = 1; render(); };
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i], t = (r[0]?.transcript || '').trim();
      if (!t) continue;
      queue.push([r.isFinal ? 1 : 0, t, r[0].confidence || 0]);
      if (r.isFinal) { lastText = t; render(); }
    }
  };
  rec.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { wanted = false; status = -1; queue.push([3, 'Microphone permission was refused (click the microphone icon in the address bar to allow it)', 0]); }
    else queue.push([3, e.error === 'network' ? 'Speech recognition needs an internet connection' : e.error, 0]);
    render();
  };
  // Chrome ends a session after a pause: keep listening until stopped
  rec.onend = () => { if (wanted) { try { rec.start(); } catch { } } else { status = 0; queue.push([2, '', 0]); render(); } };
  try { rec.start(); } catch (e) { queue.push([3, e.message || String(e), 0]); }
}
export function stop() {
  wanted = false; status = 0; lastText = '';
  try { rec?.stop(); } catch { }
  if (badge) badge.style.display = 'none';
}
// for C#: what was heard since the last call, as JSON [[kind, text, confidence], …]
export function poll() {
  if (!queue.length) return '';
  const s = JSON.stringify(queue); queue = [];
  return s;
}
export function speechStatus() { return status; }
export const speechImports = { start: (l) => start(l), stop, poll, status: () => status };
// tests: pretend it heard this
export function injectSpeech(text) { queue.push([1, text, 0.9]); lastText = text; render(); }

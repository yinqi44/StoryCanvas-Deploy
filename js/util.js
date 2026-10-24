/* ============ 通用工具 ============ */
(function (global) {
  'use strict';

  const U = {};

  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  U.el = function (tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };

  U.uid = function (p) {
    return (p || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  };

  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  U.debounce = function (fn, ms) {
    let t;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(self, args), ms || 220);
    };
  };

  U.copy = function (obj) { return JSON.parse(JSON.stringify(obj)); };

  U.download = function (filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  };

  U.readText = function () {
    return new Promise((resolve, reject) => {
      const inp = U.$('#filePick');
      inp.value = '';
      inp.accept = '.json,application/json';
      inp.onchange = () => {
        const f = inp.files[0];
        if (!f) return reject(new Error('未选择文件'));
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error('读取失败'));
        r.readAsText(f);
      };
      inp.click();
    });
  };

  U.pickImage = function () {
    return new Promise((resolve, reject) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.onchange = () => {
        const f = inp.files[0];
        if (!f) return reject(new Error('未选择'));
        const r = new FileReader();
        r.onload = () => resolve({ url: String(r.result), name: f.name });
        r.onerror = () => reject(new Error('读取失败'));
        r.readAsDataURL(f);
      };
      inp.click();
    });
  };

  U.pickVideo = function () {
    return new Promise((resolve, reject) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'video/*';
      inp.onchange = () => {
        const f = inp.files[0];
        if (!f) return reject(new Error('未选择'));
        resolve({ url: URL.createObjectURL(f), name: f.name });
      };
      inp.click();
    });
  };

  U.mmss = function (sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(sec / 60), s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  };

  U.icon = function (name) {
    const P = {
      plus: '<path d="M10 4v12M4 10h12"/>',
      play: '<path d="M7 4.5l10 5.5-10 5.5z" fill="currentColor" stroke="none"/>',
      trash: '<path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11"/>',
      copy: '<rect x="7" y="7" width="9" height="9" rx="2"/><path d="M13 7V5a1 1 0 00-1-1H6a1 1 0 00-1 1v6a1 1 0 001 1h2"/>',
      download: '<path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M4 15v2h12v-2"/>',
      upload: '<path d="M10 13V4m0 0L6.5 7.5M10 4l3.5 3.5M4 15v2h12v-2"/>',
      link: '<path d="M8.5 11.5l3-3M7 9l-1.5 1.5a2.8 2.8 0 004 4L11 13M13 11l1.5-1.5a2.8 2.8 0 00-4-4L9 7"/>',
      refresh: '<path d="M15.5 7A6.5 6.5 0 104 12M4 12V8m0 4h4"/>',
      check: '<path d="M4 10.5l4 4 8-9"/>',
      close: '<path d="M5 5l10 10M15 5L5 15"/>',
      info: '<path d="M10 3a7 7 0 100 14 7 7 0 000-14z"/><path d="M10 9v5"/><circle cx="10" cy="6.6" r=".9" fill="currentColor" stroke="none"/>',
      warn: '<path d="M10 3l7 13H3z"/><path d="M10 8v4"/><circle cx="10" cy="13.6" r=".9" fill="currentColor" stroke="none"/>',
      group: '<rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/><path d="M9 6h2a2 2 0 012 2v3"/>',
      dash: '<path d="M4 12h12"/>',
      minus: '<path d="M4 10h12"/>',
      image: '<rect x="3" y="4" width="14" height="12" rx="2.5"/><circle cx="7.5" cy="8.5" r="1.4"/><path d="M4 15l4-4 3 3 2-2 3 3"/>',
      video: '<rect x="2.5" y="4.5" width="11" height="11" rx="2.5"/><path d="M13.5 9l4-2.4v6.8l-4-2.4z"/>',
      audio: '<path d="M9 15V5l9-2v10"/><circle cx="6.5" cy="15" r="2.5"/><circle cx="15.5" cy="13" r="2.5"/>',
      text: '<path d="M5 5h10M5 9h10M5 13h6"/>',
      script: '<path d="M5 3h9l2 2v12H5z"/><path d="M8 7h6M8 11h6M8 15h3"/>',
      magic: '<path d="M10 3l1.6 3.9L15.5 8.5 11.6 10 10 14 8.4 10 4.5 8.5 8.4 7z"/><path d="M15 13l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z"/>',
      expand: '<path d="M4 8V4h4M16 8V4h-4M4 12v4h4m8-4v4h-4"/>',
      layers: '<path d="M10 3l7 4-7 4-7-4z"/><path d="M3 11l7 4 7-4"/>',
      target: '<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="2.2"/>',
      share: '<circle cx="15" cy="5.5" r="2"/><circle cx="5" cy="10" r="2"/><circle cx="15" cy="14.5" r="2"/><path d="M7 9l6-3M7 11l6 3"/>',
      timeline: '<path d="M3 6h14M3 10h9M3 14h12"/>',
      save: '<path d="M4 5h9l3 3v8H4z"/><path d="M7 5v4h6V5M7 15v-3h6v3"/>',
      pin: '<path d="M12 3l5 5-2.5.5-3.5 3.5-.5 3-2.5 2-3-3 2-2.5 3-.5 3.5-3.5z"/>',
      'align-left': '<path d="M4 3v14"/><rect x="7" y="5.5" width="9" height="4" rx="1"/><rect x="7" y="11.5" width="6" height="4" rx="1"/>',
      'align-h': '<path d="M10 2.5v15"/><rect x="4" y="5.5" width="12" height="4" rx="1"/><rect x="6" y="11.5" width="8" height="4" rx="1"/>',
      'align-right': '<path d="M16 3v14"/><rect x="4" y="5.5" width="9" height="4" rx="1"/><rect x="7" y="11.5" width="6" height="4" rx="1"/>',
      'align-top': '<path d="M3 4h14"/><rect x="5.5" y="7" width="4" height="9" rx="1"/><rect x="11.5" y="7" width="4" height="6" rx="1"/>',
      'align-v': '<path d="M2.5 10h15"/><rect x="5.5" y="4" width="4" height="12" rx="1"/><rect x="11.5" y="6" width="4" height="8" rx="1"/>',
      'align-bottom': '<path d="M3 16h14"/><rect x="5.5" y="4" width="4" height="9" rx="1"/><rect x="11.5" y="7" width="4" height="6" rx="1"/>',
      'dist-h': '<path d="M3 4v12M17 4v12"/><rect x="6.5" y="6" width="3" height="8" rx="1"/><rect x="12.5" y="6" width="3" height="8" rx="1"/><path d="M8.5 10h4" stroke-dasharray="2 2"/>',
      'dist-v': '<path d="M4 3h12M4 17h12"/><rect x="6" y="6.5" width="8" height="3" rx="1"/><rect x="6" y="12.5" width="8" height="3" rx="1"/><path d="M10 8.5v4" stroke-dasharray="2 2"/>',
      tidy: '<rect x="2.5" y="4" width="5" height="5" rx="1.2"/><rect x="2.5" y="11.5" width="5" height="5" rx="1.2"/><rect x="12.5" y="7.5" width="5" height="5" rx="1.2"/><path d="M7.5 6.5h2.5a1.5 1.5 0 011.5 1.5M7.5 14h2.5a1.5 1.5 0 001.5-1.5"/>',
      lock: '<rect x="4.5" y="8.5" width="11" height="8" rx="2"/><path d="M7 8.5V6.6a3 3 0 016 0v1.9"/>',
      unlock: '<rect x="4.5" y="8.5" width="11" height="8" rx="2"/><path d="M7 8.5V6.6a3 3 0 015.9-.7"/>',
      subtitle: '<rect x="2.5" y="3.5" width="15" height="13" rx="2.5"/><path d="M6 11.5h8M7.5 14h5"/>',
      zip: '<path d="M10 3v6"/><path d="M6 3v2h8V3"/><path d="M6.5 5.5h7c-.4 1.6.6 2.4.6 4.2 0 1.9.9 2.7.9 4.3 0 1.6-1 2.2-1 2.2-1.6.6-5.7.6-7.6.6-1.9 0-3.4-.5-3.4-2 0-1.4 1-2.6 1-4.5 0-1.7.9-2.6.5-4.8z"/>',
      camera: '<rect x="2.5" y="5.5" width="15" height="11" rx="2.5"/><circle cx="10" cy="11" r="3.2"/><path d="M7 5.5l1-2h4l1 2"/>',
      search: '<circle cx="9" cy="9" r="5.5"/><path d="M13 13l4 4"/>',
      command: '<path d="M6.5 7.5a2.5 2.5 0 10-2.5 2.5h12a2.5 2.5 0 10-2.5-2.5v5a2.5 2.5 0 102.5-2.5h-12a2.5 2.5 0 102.5 2.5z"/>'
    };
    return '<svg viewBox="0 0 20 20">' + (P[name] || '') + '</svg>';
  };

  U.toast = function (msg, kind, ms) {
    const wrap = U.$('#toasts');
    if (!wrap) return;
    const t = U.el('div', 'toast ' + (kind || 'info'));
    const ico = kind === 'ok' ? 'check' : kind === 'err' ? 'warn' : 'info';
    t.innerHTML = U.icon(ico) + '<span>' + U.esc(msg) + '</span>';
    wrap.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity .25s, transform .25s';
      t.style.opacity = '0';
      t.style.transform = 'translateY(8px)';
      setTimeout(() => t.remove(), 260);
    }, ms || 2200);
  };

  /* 从文本中尽量提取有意义的关键信息 */
  U.keywords = function (text) {
    const s = String(text || '').toLowerCase();
    return {
      raw: String(text || ''),
      low: s,
      has: function () {
        for (let i = 0; i < arguments.length; i++) if (s.indexOf(String(arguments[i]).toLowerCase()) >= 0) return true;
        return false;
      }
    };
  };

  /* 种子随机数，保证同 seed 结果稳定 */
  U.rng = function (seed) {
    let s = 0;
    const str = String(seed || 'sf');
    for (let i = 0; i < str.length; i++) s = (s * 31 + str.charCodeAt(i)) >>> 0;
    s = (s || 1) >>> 0;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  };

  global.SF = global.SF || {};
  global.SF.util = U;
})(window);

/* ============ 底部：时间轴 + 成片预览 ============ */
(function (global) {
  'use strict';
  const SF = global.SF, U = SF.util, S = SF.store;

  const T = {};
  let video, poster, timeTag, playBtn, tracks;
  let idx = -1, playing = false, audioEl = null, tick = null, base = 0;

  function items() { return S.tlItems(); }
  function totalDur() {
    return items().reduce((s, it) => s + (it.asset.duration || 0), 0);
  }

  T.init = function () {
    video = U.$('#tlVideo');
    poster = U.$('#tlPoster');
    timeTag = U.$('#tlTime');
    playBtn = U.$('#tlPlay');
    tracks = U.$('#tlTracks');

    playBtn.onclick = () => (playing ? T.pause() : T.play());
    U.$('#tlNext').onclick = () => step(1);
    U.$('#tlPrev').onclick = () => step(-1);
    U.$('#tlToggle').onclick = () => document.getElementById('app').classList.toggle('tl-open');
    U.$('#tlClear').onclick = () => { S.tlSet([]); };
    U.$('#tlSync').onclick = () => syncFromCanvas();

    video.addEventListener('ended', () => { idx++; playCurrent(); });
    video.addEventListener('loadedmetadata', () => { if (playing) video.play().catch(() => { }); });

    S.subscribe(function (reason) {
      if (reason === 'timeline' || reason === 'asset:add' || reason === 'asset:remove' ||
        reason === 'reset' || reason === 'undo' || reason === 'redo' || reason === 'node:remove') T.render();
    });
  };

  function syncFromCanvas() {
    const vids = [];
    S.state.nodes.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x)).forEach((n) => {
      (n.assets || []).forEach((a) => { if (a.type === 'video') vids.push({ n, a }); });
    });
    const auds = [];
    S.state.nodes.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x)).forEach((n) => {
      (n.assets || []).forEach((a) => { if (a.type === 'audio') auds.push({ n, a }); });
    });
    const list = vids.concat(auds).map((x) => ({ nodeId: x.n.id, assetId: x.a.id }));
    S.tlSet(list);
    U.toast('已按画布顺序同步 ' + list.length + ' 个片段', 'ok');
    document.getElementById('app').classList.add('tl-open');
  }

  T.render = function () {
    if (!tracks) return;
    const all = items();
    const vids = all.filter((x) => x.asset.type === 'video');
    const auds = all.filter((x) => x.asset.type === 'audio');

    if (!all.length) {
      tracks.innerHTML = '<div class="tl-empty">时间轴空空如也<br>' +
        '<span style="font-size:10.5px">点击「按画布顺序同步」，或在产物卡片上选择「加入时间轴」</span></div>';
      poster.style.display = '';
      timeTag.textContent = '00:00 / 00:00';
      return;
    }
    poster.style.display = 'none';

    function lane(title, list, visible) {
      if (!list.length) return '';
      return '<div class="tl-lane"><div class="tl-lane-hd">' + U.icon(title === '视频轨' ? 'video' : 'audio') +
        title + ' · ' + list.length + ' 段</div><div class="tl-clips" data-lane>' +
        list.map((it, i) => {
          const a = it.asset;
          const cover = a.type === 'video' ? a.poster : '';
          return '<div class="clip-wrap"><div class="clip" draggable="true" data-asset="' + a.id + '" data-node="' + it.node.id + '">' +
            '<img src="' + cover + '" alt="">' +
            '<span class="nm">' + U.esc(it.node.title || '') + ' · ' + (a.duration || 0) + 's</span>' +
            '<span class="rm" data-rm="' + a.id + '">×</span>' +
            '</div></div>';
        }).join('') + '</div></div>';
    }

    tracks.innerHTML =
      '<div class="tl-ruler">' + Array.from({ length: Math.ceil(Math.max(8, totalDur()) / 2) }).map((_, i) =>
        '<span>' + (i * 2) + 's</span>').join('') + '</div>' +
      lane('视频轨', vids) + lane('音频轨', auds);

    U.$$('.clip', tracks).forEach((el, i) => {
      el.onclick = (e) => {
        if (e.target.dataset.rm) { S.tlRemove(e.target.dataset.rm); return; }
        const at = all.findIndex((x) => x.asset.id === el.dataset.asset);
        idx = at; playCurrent(true);
      };
      el.ondragstart = (e) => { el.dataset.dragging = '1'; e.dataTransfer.effectAllowed = 'move'; };
      el.ondragend = () => delete el.dataset.dragging;
      el.ondragover = (e) => { e.preventDefault(); };
      el.ondrop = (e) => {
        e.preventDefault();
        const fromA = tracks.querySelector('.clip[data-dragging]');
        if (!fromA || fromA === el) return;
        const list = S.state.timeline.slice();
        const fi = list.findIndex((c) => c.assetId === fromA.dataset.asset);
        const ti = list.findIndex((c) => c.assetId === el.dataset.asset);
        if (fi < 0 || ti < 0) return;
        const moved = list.splice(fi, 1)[0];
        list.splice(ti, 0, moved);
        S.tlSet(list);
      };
    });
    timeTag.textContent = '00:00 / ' + U.mmss(totalDur());
  };

  function step(d) {
    const all = items();
    if (!all.length) return;
    idx = U.clamp(idx + d, 0, all.length - 1);
    if (idx < 0) idx = 0;
    playCurrent(playing);
  }

  function playCurrent(force) {
    const all = items();
    stopAudio();
    if (!all.length) { stopUI(); return; }
    if (idx < 0) idx = 0;
    if (idx >= all.length) { idx = all.length - 1; stopUI(); return; }
    const it = all[idx];
    const a = it.asset;
    U.$$('.clip', tracks).forEach((el) => el.classList.toggle('on', el.dataset.asset === a.id));

    if (a.type === 'video' && a.url) {
      poster.style.display = 'none';
      video.poster = a.poster || '';
      video.src = a.url;
      if (force) video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      else setPlaying(!!force);
    } else if (a.type === 'video' && !a.url) {
      // 录制不可用时的降级：显示封面 2 秒后继续
      poster.style.display = 'none';
      video.removeAttribute('src');
      video.poster = a.poster || '';
      setPlaying(true);
      clearTimeout(T._t);
      T._t = setTimeout(() => { idx++; playCurrent(true); }, 1600);
    } else if (a.type === 'audio') {
      poster.style.display = '';
      poster.innerHTML = '<b style="color:var(--c-audio)">音频播放中</b><br><span>' + U.esc(it.node.title || '') + '</span>';
      audioEl = new Audio(a.url);
      audioEl.onended = () => { idx++; playCurrent(true); };
      audioEl.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      idx++; playCurrent(true);
    }
    if (playing) startTime();
    updateBase();
  }

  function updateBase() {
    const all = items();
    base = 0;
    for (let i = 0; i < idx && i < all.length; i++) base += (all[i].asset.duration || 0);
  }
  function startTime() {
    cancelAnimationFrame(tick);
    const loop = () => {
      const cur = idx >= 0 && items()[idx] ? (items()[idx].asset.duration || 0) : 0;
      let now = base;
      if (audioEl && !audioEl.paused) now += audioEl.currentTime;
      else if (video && !video.paused) now += video.currentTime;
      timeTag.textContent = U.mmss(Math.min(now, 999)) + ' / ' + U.mmss(totalDur());
      tick = requestAnimationFrame(loop);
    };
    loop();
  }
  function stopAudio() {
    if (audioEl) { audioEl.pause(); audioEl.currentTime = 0; audioEl = null; }
    clearTimeout(T._t);
  }
  function setPlaying(v) {
    playing = v;
    playBtn.innerHTML = v ? '❚❚' : '▶';
    playBtn.classList.toggle('on', v);
  }
  function stopUI() {
    setPlaying(false);
    cancelAnimationFrame(tick);
  }

  T.play = function () {
    const all = items();
    if (!all.length) { U.toast('时间轴还没有片段', 'info'); return; }
    if (!document.getElementById('app').classList.contains('tl-open')) {
      document.getElementById('app').classList.add('tl-open');
    }
    if (idx < 0) idx = 0;
    setPlaying(true);
    playCurrent(true);
  };
  T.pause = function () {
    setPlaying(false);
    video.pause();
    if (audioEl) audioEl.pause();
    cancelAnimationFrame(tick);
  };
  T.step = step;
  T.previewAsset = function (a) {
    document.getElementById('app').classList.add('tl-open');
    stopAudio();
    if (!a) return;
    if (a.type === 'video') {
      poster.style.display = 'none';
      video.poster = a.poster || '';
      video.src = a.url || '';
      if (a.url) video.play().catch(() => { });
    } else if (a.type === 'image') {
      poster.style.display = 'none';
      video.removeAttribute('src');
      video.poster = a.url;
    } else if (a.type === 'audio') {
      poster.innerHTML = '<b style="color:var(--c-audio)">音频试听</b>';
      poster.style.display = '';
      stopAudio();
      audioEl = new Audio(a.url);
      audioEl.play().catch(() => { });
    }
  };
  T.toggleOpen = function () {
    document.getElementById('app').classList.toggle('tl-open');
    setTimeout(T.render, 60);
  };

  T.sync = syncFromCanvas;
  SF.Timeline = T;
})(window);

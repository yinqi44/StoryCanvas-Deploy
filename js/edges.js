/* ============ 连线：渲染 + 端口拖拽连接 ============ */
(function (global) {
  'use strict';
  const SF = global.SF, U = SF.util, S = SF.store, N = SF.Nodes;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const OFF = 10000;

  let layer = null, ghost = null;
  const cache = {};          // edgeId -> {g, line, hit, dot}
  let selected = new Set();
  let linking = null;        // {nodeId, portId, dir, fromPos}

  function init() {
    layer = U.$('#edgeLayer');
    ghost = U.$('#ghostEdge');
    layer.setAttribute('transform', 'translate(' + OFF + ',' + OFF + ')');
    if (ghost && ghost.parentNode !== layer) layer.appendChild(ghost);
  }

  function path(p1, p2) {
    const dx = Math.max(48, Math.abs(p2.x - p1.x) * 0.42);
    return 'M' + p1.x + ',' + p1.y +
      ' C' + (p1.x + dx) + ',' + p1.y + ' ' + (p2.x - dx) + ',' + p2.y + ' ' + p2.x + ',' + p2.y;
  }

  function ensure(e) {
    if (cache[e.id]) return cache[e.id];
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'edge');
    g.dataset.id = e.id;
    const hit = document.createElementNS(SVGNS, 'path');
    hit.setAttribute('class', 'hit');
    const line = document.createElementNS(SVGNS, 'path');
    line.setAttribute('class', 'line');
    const dot = document.createElementNS(SVGNS, 'circle');
    dot.setAttribute('r', '3.4');
    dot.setAttribute('class', 'arrow');
    g.appendChild(hit); g.appendChild(line); g.appendChild(dot);
    layer.appendChild(g);
    const rec = { g, hit, line, dot };
    cache[e.id] = rec;
    return rec;
  }

  function posOf(nodeId, portId, dir) {
    const n = S.node(nodeId);
    if (!n) return { x: 0, y: 0 };
    if (n.type === 'frame') return { x: n.x + (dir === 'in' ? 0 : (n.w || 420)), y: n.y + 16 };
    return N.portPos(n, portId, dir === 'in');
  }

  function render() {
    if (!layer) init();
    const alive = {};
    S.state.edges.forEach((e) => {
      alive[e.id] = 1;
      const r = ensure(e);
      const p1 = posOf(e.from, e.fromPort, 'out');
      const p2 = posOf(e.to, e.toPort, 'in');
      if (p1.x === 0 && p1.y === 0) { /* 上游已删除 */ }
      const d = path(p1, p2);
      r.line.setAttribute('d', d);
      r.hit.setAttribute('d', d);
      r.dot.setAttribute('cx', p2.x - 1);
      r.dot.setAttribute('cy', p2.y);
      const sel = selected.has(e.id);
      r.line.classList.toggle('sel', sel);
      r.line.style.setProperty('--len', '1');
    });
    Object.keys(cache).forEach((id) => {
      if (!alive[id]) { cache[id].g.remove(); delete cache[id]; selected.delete(id); }
    });
  }

  /* ---------------- 拖线连接 ---------------- */
  function beginConnect(nodeId, portId, dir, world) {
    linking = { nodeId, portId, dir, from: world };
    // 若从输入口拖出且该口已有连线 → 断开并接管
    if (dir === 'in') {
      const exist = S.edgesTo(nodeId).find((e) => e.toPort === portId);
      if (exist) {
        linking.nodeId = exist.from;
        linking.portId = exist.fromPort;
        linking.dir = 'out';
        linking.from = posOf(exist.from, exist.fromPort, 'out');
        S.removeEdge(exist.id, { noHistory: true });
      }
    }
    highlight();
    if (ghost) ghost.setAttribute('d', '');
    return linking;
  }

  function moveConnect(world) {
    if (!linking) return;
    if (ghost) ghost.setAttribute('d', path(linking.from, world));
  }

  function endConnect(portEl, world) {
    const lk = linking;
    linking = null;
    clearHighlight();
    if (ghost) ghost.setAttribute('d', '');
    if (!lk) return null;
    if (portEl) {
      const toId = portEl.closest('.node').dataset.id;
      const toPort = portEl.dataset.port;
      const fromId = lk.nodeId, fromPort = lk.portId;
      if (toId === fromId) return null;
      return S.addEdge(fromId, fromPort, toId, toPort) ? { ok: true } : { ok: false };
    }
    return { release: true, from: lk.nodeId, port: lk.portId, world: world };
  }

  /* 兼容端口高亮 */
  const COMPAT = {
    text: ['prompt', 'story'], shots: ['prompt'],
    image: ['ref', 'image'], video: ['video'], audio: ['audio']
  };
  function highlight() {
    if (!linking) return;
    const fn = S.node(linking.nodeId);
    if (!fn) return;
    const outId = linking.portId;
    U.$$('.port.in').forEach((p) => {
      const nodeId = p.closest('.node').dataset.id;
      if (nodeId === linking.nodeId) return;
      const accept = COMPAT[outId];
      if (!accept || accept.indexOf(p.dataset.port) >= 0) p.classList.add('compat');
    });
  }
  function clearHighlight() {
    U.$$('.port.compat').forEach((p) => p.classList.remove('compat'));
  }

  function selectEE(id, additive) {
    if (!additive) selected.clear();
    selected.add(id);
    render();
    S.emit('selection');
  }
  function clearSel() { selected.clear(); render(); }
  function selectedEdges() { return Array.from(selected); }
  function removeSelected() {
    if (!selected.size) return false;
    S.pushHistory();
    Array.from(selected).forEach((id) => S.removeEdge(id, { noHistory: true }));
    selected.clear();
    render();
    return true;
  }
  function isSelected(id) { return selected.has(id); }

  SF.Edges = {
    init, render, beginConnect, moveConnect, endConnect,
    clearHighlight, clearSel, selectedEdges, removeSelected, isSelected,
    select: selectEE, get isLinking() { return !!linking; }, get linkInfo() { return linking; }
  };
})(window);

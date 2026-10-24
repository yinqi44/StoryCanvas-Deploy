/* ============ 状态中心：节点 / 连线 / 历史 / 持久化 ============ */
(function (global) {
  'use strict';
  const SF = global.SF, U = SF.util;
  const KEY = 'storycanvas.project.v1';

  const S = {
    state: null,
    selected: new Set(),
    _subs: [],
    _hist: [],
    _future: [],
    _dirty: false
  };

  function blank() {
    return {
      project: { name: '未命名项目', createdAt: Date.now() },
      nodes: [],
      edges: [],
      view: { x: 0, y: 0, k: 1 },
      timeline: []
    };
  }

  S.init = function () {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        const p = JSON.parse(raw);
        if (p && Array.isArray(p.nodes)) { S.state = p; return S.state; }
      } catch (e) { /* ignore */ }
    }
    S.state = blank();
    return S.state;
  };

  S.clearAll = function () {
    S.state = blank();
    S.selected.clear();
    S._hist.length = 0; S._future.length = 0;
    try { localStorage.removeItem(KEY); } catch (e) { }
    S.emit('reset');
  };

  /* ---- 订阅 ---- */
  S.subscribe = function (fn) { S._subs.push(fn); return fn; };
  S.emit = function (reason, extra) {
    S._subs.forEach((f) => { try { f(reason, extra); } catch (e) { console.error(e); } });
    S.scheduleSave();
  };

  /* ---- 持久化（防抖）---- */
  S.scheduleSave = U.debounce(function () {
    try {
      localStorage.setItem(KEY, JSON.stringify(S.state));
      const tag = U.$('#saveState');
      if (tag) {
        tag.textContent = '已自动保存 ' + new Date().toTimeString().slice(0, 5);
        clearTimeout(S._t);
        S._t = setTimeout(() => { if (tag) tag.textContent = '已自动保存'; }, 2600);
      }
    } catch (e) { /* quota or file:// restriction */ }
  }, 500);

  /* ---- 历史 ---- */
  function snap() {
    return JSON.stringify({
      nodes: S.state.nodes,
      edges: S.state.edges,
      timeline: S.state.timeline,
      project: S.state.project
    });
  }
  S.pushHistory = function () {
    S._hist.push(snap());
    if (S._hist.length > 80) S._hist.shift();
    S._future.length = 0;
  };
  S.canUndo = () => S._hist.length > 0;
  S.canRedo = () => S._future.length > 0;
  S.undo = function () {
    if (!S._hist.length) return false;
    S._future.push(snap());
    const cur = S._hist.pop();
    applySnap(cur);
    S.emit('undo');
    return true;
  };
  S.redo = function () {
    if (!S._future.length) return false;
    S._hist.push(snap());
    const cur = S._future.pop();
    applySnap(cur);
    S.emit('redo');
    return true;
  };
  function applySnap(s) {
    const p = JSON.parse(s);
    S.state.nodes = p.nodes;
    S.state.edges = p.edges;
    S.state.timeline = p.timeline || [];
    if (p.project) S.state.project = p.project;
    // 清理失效选中
    const ids = new Set(S.state.nodes.map((n) => n.id));
    Array.from(S.selected).forEach((id) => { if (!ids.has(id)) S.selected.delete(id); });
  }

  /* ---- 查询 ---- */
  S.node = (id) => S.state.nodes.find((n) => n.id === id) || null;
  S.edge = (id) => S.state.edges.find((e) => e.id === id) || null;
  S.edgesTo = (id) => S.state.edges.filter((e) => e.to === id);
  S.edgesFrom = (id) => S.state.edges.filter((e) => e.from === id);
  S.hasPath = function (a, b) { return S.state.edges.some((e) => e.from === a && e.to === b); };

  /* ---- 节点操作 ---- */
  S.addNode = function (spec, opts) {
    opts = opts || {};
    if (!opts.noHistory) S.pushHistory();
    const n = Object.assign({
      id: U.uid('n'),
      type: 'text',
      x: 0, y: 0, w: 268, h: null,
      title: '节点',
      collapsed: false,
      data: {},
      assets: [],
      status: ''
    }, spec);
    if (!n.data) n.data = {};
    if (!n.assets) n.assets = [];
    S.state.nodes.push(n);
    S.emit('node:add', n);
    return n;
  };

  S.updateNode = function (id, patch, opts) {
    opts = opts || {};
    const n = S.node(id);
    if (!n) return null;
    Object.assign(n, patch);
    if (opts.mergeData) n.data = Object.assign({}, n.data, patch.data);
    n._rev = (n._rev || 0) + 1;
    if (opts.silent) { S.scheduleSave(); return n; }
    S.emit('node:update', n);
    return n;
  };

  S.updateData = function (id, patch, opts) {
    opts = opts || {};
    const n = S.node(id);
    if (!n) return null;
    n.data = Object.assign({}, n.data, patch);
    n._rev = (n._rev || 0) + 1;
    if (opts.silent) { S.scheduleSave(); return n; }
    S.emit('node:data', n);
    return n;
  };

  S.removeNode = function (id, opts) {
    opts = opts || {};
    if (!opts.noHistory) S.pushHistory();
    const kids = S.state.nodes.filter((n) => n.parent === id).map((n) => n.id);
    S.state.edges = S.state.edges.filter((e) =>
      e.from !== id && e.to !== id && kids.indexOf(e.from) < 0 && kids.indexOf(e.to) < 0);
    S.state.nodes = S.state.nodes.filter((n) => n.id !== id && kids.indexOf(n.id) < 0);
    S.state.timeline = S.state.timeline.filter((c) => c.nodeId !== id && kids.indexOf(c.nodeId) < 0);
    S.selected.delete(id);
    S.emit('node:remove', id);
  };

  /* ---- 产物 ---- */
  S.addAsset = function (nodeId, asset) {
    const n = S.node(nodeId);
    if (!n) return null;
    const a = Object.assign({ id: U.uid('a'), createdAt: Date.now() }, asset);
    n.assets = n.assets || [];
    n.assets.push(a);
    n.status = 'done';
    n._rev = (n._rev || 0) + 1;
    S.emit('asset:add', { node: n, asset: a });
    return a;
  };
  S.removeAsset = function (nodeId, assetId) {
    const n = S.node(nodeId);
    if (!n) return;
    n.assets = (n.assets || []).filter((a) => a.id !== assetId);
    n._rev = (n._rev || 0) + 1;
    S.state.timeline = S.state.timeline.filter((c) => c.assetId !== assetId);
    S.emit('asset:remove', { node: n, assetId: assetId });
  };
  S.allAssets = function () {
    const out = [];
    S.state.nodes.forEach((n) => (n.assets || []).forEach((a) => out.push({ node: n, asset: a })));
    return out;
  };

  /* ---- 连线 ---- */
  S.addEdge = function (from, fromPort, to, toPort, opts) {
    opts = opts || {};
    if (from === to) return null;
    if (S.hasPath(from, to)) { U.toast('这两个节点已经连过了', 'err'); return null; }
    if (S.createsCycle(from, to)) { U.toast('不允许形成环形依赖', 'err'); return null; }
    const dupTo = S.state.edges.find((e) => e.to === to && e.toPort === toPort);
    if (dupTo) { // 单输入端口：替换旧连线
      S.state.edges.splice(S.state.edges.indexOf(dupTo), 1);
    }
    if (!opts.noHistory) S.pushHistory();
    const e = { id: U.uid('e'), from, fromPort, to, toPort };
    S.state.edges.push(e);
    S.emit('edge:add', e);
    return e;
  };
  S.removeEdge = function (id, opts) {
    opts = opts || {};
    if (!opts.noHistory) S.pushHistory();
    S.state.edges = S.state.edges.filter((e) => e.id !== id);
    S.emit('edge:remove', id);
  };
  S.createsCycle = function (from, to) {
    const seen = {};
    function walk(cur, target) {
      if (cur === target) return true;
      if (seen[cur]) return false;
      seen[cur] = 1;
      return S.state.edges.filter((e) => e.from === cur).some((e) => walk(e.to, target));
    }
    return walk(to, from);
  };

  /* ---- 输入解析：沿入边收集上游产出 ---- */
  S.resolveInputs = function (nodeId, depth) {
    const acc = { texts: [], stories: [], shotTexts: [] };
    const out = { text: '', images: [], videos: [], audios: [], refs: [] };

    // 第一层：直接向上游收集产物
    S.edgesTo(nodeId).forEach((e) => {
      const up = S.node(e.from);
      if (!up) return;
      (up.assets || []).forEach((a) => {
        if (a.type === 'image') out.images.push(a);
        else if (a.type === 'video') out.videos.push(a);
        else if (a.type === 'audio') out.audios.push(a);
        out.refs.push(a);
      });
    });

    // 文本：递归向上汇总，脚本已拆镜时以分镜描述为准
    (function collect(id, d) {
      if (d > 6) return;
      S.edgesTo(id).forEach((e) => {
        const up = S.node(e.from);
        if (!up) return;
        if (up.type === 'text') {
          if (up.data.text) acc.texts.push(up.data.text);
          collect(up.id, d + 1);
        } else if (up.type === 'script') {
          if (up.data.story) acc.stories.push(up.data.story);
          (up.data.shots || []).forEach((s) => { if (s.full || s.desc) acc.shotTexts.push(s.full || s.desc); });
          collect(up.id, d + 1);
        } else {
          collect(up.id, d + 1);
        }
      });
    })(nodeId, 0);

    const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
    if (acc.shotTexts.length) out.text = uniq(acc.shotTexts).join('\n');
    else out.text = uniq(acc.texts.concat(acc.stories)).join('\n');
    return out;
  };

  /* ---- 拓扑排序（一键运行用）---- */
  S.topoOrder = function () {
    const indeg = {}, map = {};
    S.state.nodes.forEach((n) => { indeg[n.id] = 0; map[n.id] = n; });
    S.state.edges.forEach((e) => { if (indeg[e.to] != null) indeg[e.to]++; });
    const q = S.state.nodes.filter((n) => indeg[n.id] === 0).map((n) => n.id);
    const out = [];
    while (q.length) {
      const id = q.shift();
      out.push(map[id]);
      S.state.edges.filter((e) => e.from === id).forEach((e) => {
        if (--indeg[e.to] === 0) q.push(e.to);
      });
    }
    // 环中的节点补在最后
    S.state.nodes.forEach((n) => { if (out.indexOf(n) < 0) out.push(n); });
    return out;
  };

  /* ---- 选中 ---- */
  S.select = function (ids, additive) {
    if (!additive) S.selected.clear();
    (Array.isArray(ids) ? ids : [ids]).forEach((id) => { if (id) S.selected.add(id); });
    S.emit('selection');
  };
  S.toggleSelect = function (id) {
    if (S.selected.has(id)) S.selected.delete(id); else S.selected.add(id);
    S.emit('selection');
  };
  S.clearSelect = function () { S.selected.clear(); S.emit('selection'); };
  S.selectedNodes = function () {
    return S.state.nodes.filter((n) => S.selected.has(n.id));
  };

  /* ---- 时间轴 ---- */
  S.tlAdd = function (nodeId, assetId) {
    if (S.state.timeline.some((c) => c.assetId === assetId)) return false;
    S.state.timeline.push({ nodeId, assetId });
    S.emit('timeline');
    return true;
  };
  S.tlRemove = function (assetId) {
    S.state.timeline = S.state.timeline.filter((c) => c.assetId !== assetId);
    S.emit('timeline');
  };
  S.tlSet = function (list) { S.state.timeline = list; S.emit('timeline'); };
  S.tlItems = function () {
    return S.state.timeline.map((c) => {
      const n = S.node(c.nodeId);
      if (!n) return null;
      const a = (n.assets || []).find((x) => x.id === c.assetId);
      return a ? { clip: c, node: n, asset: a } : null;
    }).filter(Boolean);
  };

  /* ---- 导入导出 ---- */
  S.exportProject = function () {
    return JSON.stringify(Object.assign({ version: 1, app: 'StoryCanvas' }, S.state), null, 2);
  };
  S.importProject = function (json) {
    const p = JSON.parse(json);
    if (!p || !Array.isArray(p.nodes)) throw new Error('不是有效的工程文件');
    S.state = Object.assign(blank(), p);
    S.selected.clear();
    S._hist.length = 0; S._future.length = 0;
    S.emit('reset');
  };

  SF.store = S;
})(window);

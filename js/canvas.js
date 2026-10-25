/* ============ 无限画布：视图 / 交互 / 渲染调度 ============ */
(function (global) {
  'use strict';
  const SF = global.SF, U = SF.util, S = SF.store, N = SF.Nodes, E = SF.Edges;

  const C = {};
  let vp, wrld, layer, mq, map, mapCtx;
  let tool = 'select';
  let gridSnap = true;
  let spaceDown = false;
  let clipboard = null;
  let drag = null;      // 节点拖拽
  let resize = null;    // 节点缩放
  let pan = null;       // 视图平移
  let marq = null;      // 框选
  let link = null;      // 连线

  /* ---------------- 坐标 ---------------- */
  function toWorld(cx, cy) {
    const r = vp.getBoundingClientRect(), v = S.state.view;
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  }
  function viewSize() {
    return { w: vp.clientWidth, h: vp.clientHeight };
  }
  C.toWorld = toWorld;

  function applyView() {
    const v = S.state.view;
    wrld.style.transform = 'translate(' + v.x + 'px,' + v.y + 'px) scale(' + v.k + ')';
    wrld.classList.toggle('lod-low', v.k < 0.45);
    const zb = U.$('#zoomReset');
    if (zb) zb.textContent = Math.round(v.k * 100) + '%';
    drawMap();
    S.scheduleSave();
  }
  C.applyView = applyView;

  function zoomAt(nextK, cx, cy) {
    const v = S.state.view;
    const r = vp.getBoundingClientRect();
    const sx = cx - r.left, sy = cy - r.top;
    const k = U.clamp(nextK, 0.2, 2.5);
    const wx = (sx - v.x) / v.k, wy = (sy - v.y) / v.k;
    v.k = k;
    v.x = sx - wx * k;
    v.y = sy - wy * k;
    applyView();
  }

  C.zoomStep = function (factor) {
    const r = vp.getBoundingClientRect();
    zoomAt(S.state.view.k * factor, r.left + r.width / 2, r.top + r.height / 2);
  };

  C.fit = function () {
    const ns = S.state.nodes;
    if (!ns.length) {
      S.state.view = { x: vp.clientWidth / 2 - 200, y: vp.clientHeight / 2 - 120, k: 1 };
      applyView(); return;
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ns.forEach((n) => {
      const el = layer.querySelector('.node[data-id="' + n.id + '"]');
      const w = n.type === 'frame' ? (n.w || 420) : N.nodeWidth(n);
      const h = el ? el.offsetHeight : (n.type === 'frame' ? (n.h || 220) : 200);
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
      x1 = Math.max(x1, n.x + w); y1 = Math.max(y1, n.y + h);
    });
    const pad = 80, vs = viewSize();
    const k = Math.min(1.2, Math.max(0.2, Math.min((vs.w - pad * 2) / (x1 - x0), (vs.h - pad * 2) / (y1 - y0))));
    S.state.view = {
      k: k,
      x: (vs.w - (x1 - x0) * k) / 2 - x0 * k,
      y: (vs.h - (y1 - y0) * k) / 2 - y0 * k
    };
    applyView();
  };
  C.resetZoom = function () { zoomAt(1, vp.getBoundingClientRect().left + vp.clientWidth / 2, vp.getBoundingClientRect().top + vp.clientHeight / 2); };

  /* ---------------- 渲染 ---------------- */
  C.render = function () {
    const ns = S.state.nodes;
    const order = ns.slice().sort((a, b) => (a.type === 'frame' ? -1 : 0) - (b.type === 'frame' ? -1 : 0));
    const alive = {};
    order.forEach((n) => {
      alive[n.id] = 1;
      const sel = layer.querySelector('.node[data-id="' + n.id + '"]');
      const rev = String(n._rev || 0);
      if (sel && sel.dataset.rev === rev) { positionNode(sel, n); return; }
      const el = N.render(n);
      if (sel) {
        const wasFocused = sel.contains(document.activeElement);
        sel.replaceWith(el);
        if (wasFocused) el.querySelector('textarea,.n-title') && el.querySelector('textarea,.n-title').focus();
      } else layer.appendChild(el);
      N.bind(el);
      positionNode(el, n);
    });
    Array.from(layer.children).forEach((el) => {
      if (!alive[el.dataset.id]) el.remove();
    });
    E.render();
    const hint = U.$('#emptyHint');
    if (hint) hint.style.display = ns.length ? 'none' : '';
    U.$('#stNodes').textContent = ns.length;
    U.$('#stEdges').textContent = S.state.edges.length;
    U.$('#stAssets').textContent = S.allAssets().length;
    drawMap();
  };

  function positionNode(el, n) {
    el.style.left = n.x + 'px';
    el.style.top = n.y + 'px';
    el.classList.toggle('selected', S.selected.has(n.id));
    el.classList.toggle('running', n.status === 'running');
    el.classList.toggle('error', n.status === 'error');
    el.classList.toggle('locked', !!n.locked);
    if (n.type === 'frame') { el.style.width = (n.w || 420) + 'px'; el.style.height = (n.h || 220) + 'px'; }
  }
  C.positionNode = positionNode;

  /* ---------------- 小地图 ---------------- */
  function drawMap() {
    if (!mapCtx) return;
    const w = map.width, h = map.height;
    mapCtx.clearRect(0, 0, w, h);
    mapCtx.fillStyle = '#0b0d13';
    mapCtx.fillRect(0, 0, w, h);
    const ns = S.state.nodes;
    const v = S.state.view, vs = viewSize();
    const vRect = { x: -v.x / v.k, y: -v.y / v.k, w: vs.w / v.k, h: vs.h / v.k };
    if (!ns.length) { drawRect(vRect, '#fff', true); return; }
    let x0 = vRect.x, y0 = vRect.y, x1 = vRect.x + vRect.w, y1 = vRect.y + vRect.h;
    const boxes = ns.map((n) => {
      const el = layer.querySelector('.node[data-id="' + n.id + '"]');
      return {
        x: n.x, y: n.y,
        w: n.type === 'frame' ? (n.w || 420) : N.nodeWidth(n),
        h: el ? el.offsetHeight : 180,
        frame: n.type === 'frame'
      };
    });
    boxes.forEach((b) => {
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    });
    const pad = 26;
    const sc = Math.min((w - pad) / (x1 - x0), (h - pad) / (h + (y1 - y0)) || 1, (h - pad) / (y1 - y0));
    const ox = (w - (x1 - x0) * sc) / 2, oy = (h - (y1 - y0) * sc) / 2;
    mapCtx.save();
    mapCtx.translate(ox, oy); mapCtx.scale(sc, sc); mapCtx.translate(-x0, -y0);
    const color = { text: '#94a3b8', script: '#a78bfa', image: '#34d399', video: '#22d3ee', audio: '#fbbf24', frame: '#4b3a7a' };
    boxes.forEach((b) => {
      const n = ns.find((m) => m.x === b.x && m.y === b.y && b.frame === (m.type === 'frame'));
      mapCtx.fillStyle = color[n ? n.type : 'text'] || '#888';
      mapCtx.globalAlpha = b.frame ? 0.25 : 0.75;
      mapCtx.beginPath();
      const r = b.frame ? 8 : 4;
      mapCtx.roundRect ? mapCtx.roundRect(b.x, b.y, b.w, b.h, r) : mapCtx.rect(b.x, b.y, b.w, b.h);
      mapCtx.fill();
    });
    mapCtx.globalAlpha = 1;
    mapCtx.strokeStyle = 'rgba(255,255,255,.85)';
    mapCtx.lineWidth = 1.4 / sc;
    mapCtx.strokeRect(vRect.x, vRect.y, vRect.w, vRect.h);
    mapCtx.restore();
  }
  function drawRect(r, c, stroke) {
    mapCtx.strokeStyle = c; mapCtx.lineWidth = 1;
    if (stroke) mapCtx.strokeRect(r.x, r.y, r.w, r.h); else mapCtx.fillRect(r.x, r.y, r.w, r.h);
  }

  /* ---------------- 节点 / 端口创建 ---------------- */
  function nextFree(x, y, w) {
    let nx = x, ny = y, tries = 0;
    while (tries < 40 && S.state.nodes.some((n) => Math.abs(n.x - nx) < 40 && Math.abs(n.y - ny) < 40)) {
      nx += 34; ny += 30; tries++;
    }
    return { x: nx, y: ny };
  }

  C.createNode = function (type, wx, wy, extra) {
    const m = N.meta(type);
    const spec = Object.assign({ type: type, title: extra && extra.title }, m.make());
    if (extra && extra.data) spec.data = Object.assign({}, spec.data, extra.data);
    const w = spec.w || m.w;
    const p = nextFree(Math.round(wx - w / 2), Math.round(wy - 30), w);
    spec.x = p.x; spec.y = p.y;
    const n = S.addNode(spec);
    S.select([n.id]);
    if (extra && extra.assets && extra.assets.length) {
      extra.assets.forEach((a) => S.addAsset(n.id, a));
    }
    C.render();
    return n;
  };

  C.createConnected = function (type, fromId, fromPort, wx, wy, toPort) {
    const n = C.createNode(type, wx, wy, { data: { title: N.meta(type).name } });
    S.addEdge(fromId, fromPort, n.id, toPort || defaultInPort(type));
    C.render();
    U.toast('已新建「' + N.meta(type).name + '」节点并连接', 'ok');
    return n;
  };
  function defaultInPort(type) {
    const ins = N.meta(type).portsIn;
    return ins && ins.length ? ins[0].id : null;
  }

  /* ---------------- 右键 / 快速菜单 ---------------- */
  function openMenu(clientX, clientY, items) {
    const el = U.$('#ctxmenu');
    el.innerHTML = '';
    items.forEach((it) => {
      if (it.type === 'sep') { el.appendChild(U.el('div', 'ctx-sep')); return; }
      if (it.type === 'title') { el.appendChild(U.el('div', 'ctx-group-title', U.esc(it.label))); return; }
      const b = U.el('button', 'ctx-item' + (it.danger ? ' danger' : ''));
      b.innerHTML = U.icon(it.icon || 'plus') + '<span>' + U.esc(it.label) + '</span>' +
        (it.shortcut ? '<span class="sc">' + it.shortcut + '</span>' : '');
      b.onclick = () => { closeMenu(); it.onClick && it.onClick(); };
      el.appendChild(b);
    });
    el.hidden = false;
    const r = el.getBoundingClientRect();
    let x = clientX, y = clientY;
    if (x + r.width > innerWidth - 8) x = innerWidth - r.width - 8;
    if (y + r.height > innerHeight - 8) y = Math.max(8, innerHeight - r.height - 8);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  }
  function closeMenu() { const el = U.$('#ctxmenu'); if (el) el.hidden = true; }
  C.openMenu = openMenu; C.closeMenu = closeMenu;

  function nodeTypeItems(wx, wy) {
    return { title: '添加节点', items: ['text', 'script', 'image', 'video', 'audio'].map((t) => ({
      icon: N.meta(t).icon, label: N.meta(t).name + '节点', onClick: () => C.createNode(t, wx, wy)
    })) };
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    vp = U.$('#viewport');
    wrld = U.$('#world');
    layer = U.$('#nodelayer');
    mq = U.$('#marquee');
    map = U.$('#mapCv');
    mapCtx = map.getContext('2d');

    E.init();
    applyView();

    /* --- 滚轮缩放 --- */
    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || !e.shiftKey) {
        const v = S.state.view;
        zoomAt(v.k * (e.deltaY > 0 ? 0.9 : 1.1), e.clientX, e.clientY);
      } else {
        S.state.view.x -= e.deltaY;
        applyView();
      }
    }, { passive: false });

    /* --- pointerdown --- */
    vp.addEventListener('pointerdown', (e) => {
      if (e.button === 2) return;
      closeMenu();
      const port = e.target.closest('.port');
      const nodeEl = e.target.closest('.node');

      if (port && nodeEl) {
        const w = toWorld(e.clientX, e.clientY);
        const info = E.beginConnect(nodeEl.dataset.id, port.dataset.port, port.dataset.dir, w);
        link = { from: info.nodeId, port: info.portId };
        e.preventDefault();
        return;
      }

      /* 右下角缩放手柄：拖拽调整节点大小 */
      const rz = e.target.closest('.n-resize');
      if (rz && nodeEl) {
        const bodyEl = nodeEl.querySelector('.n-body');
        resize = {
          id: nodeEl.dataset.id, sx: e.clientX, sy: e.clientY,
          k: S.state.view.k, el: nodeEl, bodyEl: bodyEl || null,
          w0: nodeEl.offsetWidth, h0: bodyEl ? bodyEl.offsetHeight : 0
        };
        e.preventDefault();
        return;
      }

      /* 输入区 / 交互区：不启动拖拽、不框选，让光标能正常进入输入框 */
      const typing = e.target.closest('.nodrag,[data-nodrag],textarea,input,select,[contenteditable="true"]');
      if (typing) {
        if (nodeEl && !S.selected.has(nodeEl.dataset.id)) {
          S.selected.clear();
          S.selected.add(nodeEl.dataset.id);
          document.querySelectorAll('.node.selected').forEach((el) => {
            if (el !== nodeEl) el.classList.remove('selected');
          });
          nodeEl.classList.add('selected');
          if (SF.Inspector && SF.Inspector.render) SF.Inspector.render();
        }
        return;
      }

      const onDragZone = true;

      if (nodeEl && onDragZone) {
        const id = nodeEl.dataset.id;
        if (e.shiftKey) S.toggleSelect(id);
        else if (!S.selected.has(id)) S.select([id]);
        const n = S.node(id);
        const sameFrameOnly = n && n.type === 'frame';
        if (n && n.locked) {
          drag = null;
          U.toast('该节点已锁定，Ctrl+Shift+L 可解锁', 'info', 1800);
        } else {
          const moveSet = S.selectedNodes().filter((m) => !m.locked);
          drag = {
            sx: e.clientX, sy: e.clientY, moved: false, pushed: false,
            items: moveSet.map((m) => ({ id: m.id, x: m.x, y: m.y })),
            kids: sameFrameOnly ? S.state.nodes.filter((m) => m.parent === id && !m.locked).map((m) => ({ id: m.id, x: m.x, y: m.y })) : [],
            frameAsWell: !!sameFrameOnly
          };
        }
        C.render();
        e.preventDefault();
        return;
      }

      if (tool === 'pan' || spaceDown || e.button === 1) {
        pan = { sx: e.clientX, sy: e.clientY, ox: S.state.view.x, oy: S.state.view.y };
        vp.classList.add('panning');
        e.preventDefault();
        return;
      }

      // 背景：框选
      const start = toWorld(e.clientX, e.clientY);
      marq = { start: start, rect: vp.getBoundingClientRect(), sx: e.clientX, sy: e.clientY, additive: e.shiftKey };
      if (!e.shiftKey) { S.clearSelect(); E.clearSel(); }
    });

    /* --- pointermove --- */
    window.addEventListener('pointermove', (e) => {
      if (resize) {
        const nw = U.clamp(Math.round(resize.w0 + (e.clientX - resize.sx) / resize.k), 250, 720);
        const nh = U.clamp(Math.round(resize.h0 + (e.clientY - resize.sy) / resize.k), 100, 900);
        resize.el.style.width = nw + 'px';
        if (resize.bodyEl) resize.bodyEl.style.height = nh + 'px';
        resize.cw = nw; resize.ch = nh;
        return;
      }
      if (link) {
        E.moveConnect(toWorld(e.clientX, e.clientY));
        return;
      }
      if (pan) {
        S.state.view.x = pan.ox + (e.clientX - pan.sx);
        S.state.view.y = pan.oy + (e.clientY - pan.sy);
        applyView();
        return;
      }
      if (drag) {
        const dx = (e.clientX - drag.sx) / S.state.view.k;
        const dy = (e.clientY - drag.sy) / S.state.view.k;
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 2.5) {
          drag.moved = true;
          S.pushHistory();
        }
        if (drag.moved) {
          drag.items.forEach((it) => {
            const n = S.node(it.id);
            if (!n) return;
            let nx = Math.round(it.x + dx), ny = Math.round(it.y + dy);
            if (gridSnap && !e.altKey) { nx = Math.round(nx / 8) * 8; ny = Math.round(ny / 8) * 8; }
            n.x = nx; n.y = ny;
          });
          drag.kids.forEach((it) => {
            const n = S.node(it.id);
            if (!n) return;
            n.x = Math.round(it.x + dx); n.y = Math.round(it.y + dy);
          });
          drag.items.forEach((it) => {
            const el = layer.querySelector('.node[data-id="' + it.id + '"]');
            const n = S.node(it.id);
            if (el && n) { el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; }
          });
          drag.kids.forEach((it) => {
            const el = layer.querySelector('.node[data-id="' + it.id + '"]');
            const n = S.node(it.id);
            if (el && n) { el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; }
          });
          E.render();
        }
        return;
      }
      if (marq) {
        const x0 = Math.min(marq.sx, e.clientX), x1 = Math.max(marq.sx, e.clientX);
        const y0 = Math.min(marq.sy, e.clientY), y1 = Math.max(marq.sy, e.clientY);
        const r = marq.rect;
        mq.hidden = false;
        mq.style.left = (x0 - r.left) + 'px';
        mq.style.top = (y0 - r.top) + 'px';
        mq.style.width = (x1 - x0) + 'px';
        mq.style.height = (y1 - y0) + 'px';
        const w0 = marq.start, w1 = toWorld(e.clientX, e.clientY);
        const box = { x: Math.min(w0.x, w1.x), y: Math.min(w0.y, w1.y), w: Math.abs(w1.x - w0.x), h: Math.abs(w1.y - w0.y) };
        const hits = S.state.nodes.filter((n) => {
          if (n.type === 'frame') return false;
          const el = layer.querySelector('.node[data-id="' + n.id + '"]');
          const nb = { x: n.x, y: n.y, w: N.nodeWidth(n), h: el ? el.offsetHeight : 180 };
          return !(nb.x > box.x + box.w || nb.x + nb.w < box.x || nb.y > box.y + box.h || nb.y + nb.h < box.y);
        }).map((n) => n.id);
        S.select(hits, marq.additive);
        E.clearSel();
        C.render();
      }
    });

    /* --- pointerup --- */
    window.addEventListener('pointerup', (e) => {
      if (resize) {
        if (resize.cw) S.updateNode(resize.id, { w: resize.cw, bodyH: resize.ch }, { silent: true });
        resize = null;
        C.render();
        return;
      }
      if (link) {
        const port = document.elementFromPoint(e.clientX, e.clientY);
        const portEl = port && port.closest ? port.closest('.port.in') : null;
        const res = E.endConnect(portEl, toWorld(e.clientX, e.clientY));
        link = null;
        if (res && res.ok) {
          C.render();
        } else if (res && res.release) {
          // 拖到空白处：快速创建下游节点
          const w = res.world;
          const fromNode = S.node(res.from);
          const suggest = {
            text: ['script', 'image'], shots: ['image'], image: ['video'],
            video: ['audio'], audio: []
          }[res.port] || ['image'];
          openMenu(e.clientX, e.clientY, [
            { type: 'title', label: '连接到新节点' },
            ...suggest.map((t) => ({
              icon: N.meta(t).icon,
              label: N.meta(t).name + '节点',
              onClick: () => C.createConnected(t, res.from, res.port,
                w.x + N.meta(t).w / 2 + 70, w.y, compatiblePort(t, res.port))
            })),
            { type: 'sep' }
          ]);
          if (fromNode) { /* noop */ }
        }
        C.render();
        return;
      }
      if (pan) { pan = null; vp.classList.remove('panning'); }
      if (drag) {
        if (drag.moved) {
          // 判断是否放进 frame
          const wpt = toWorld(e.clientX, e.clientY);
          const target = S.state.nodes.find((n) => n.type === 'frame' &&
            wpt.x >= n.x && wpt.x <= n.x + (n.w || 420) && wpt.y >= n.y && wpt.y <= n.y + (n.h || 220));
          drag.items.forEach((it) => {
            const n = S.node(it.id);
            if (!n || n.type === 'frame') return;
            n.parent = target ? target.id : (drag.origParent || undefined);
            if (!target) delete n.parent;
          });
          S.emit('node:move');
        }
        drag = null;
      }
      if (marq) { marq = null; mq.hidden = true; }
    });

    /* --- 双击空白：新建节点 --- */
    vp.addEventListener('dblclick', (e) => {
      if (e.target.closest('.node')) return;
      const w = toWorld(e.clientX, e.clientY);
      const t = nodeTypeItems(w.x, w.y);
      openMenu(e.clientX, e.clientY, [
        { type: 'title', label: t.title },
        ...t.items,
        { type: 'sep' },
        { icon: 'group', label: '流程组框', onClick: () => wrapFrame(w) }
      ]);
    });

    /* --- 右键 --- */
    vp.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const nodeEl = e.target.closest('.node');
      const edgeEl = e.target.closest('.edge');
      const w = toWorld(e.clientX, e.clientY);
      if (edgeEl) {
        const id = edgeEl.dataset.id;
        E.select(id);
        openMenu(e.clientX, e.clientY, [
          { icon: 'trash', label: '删除连线', danger: true, shortcut: 'Delete', onClick: () => { S.pushHistory(); E.removeSelected(); C.render(); } }
        ]);
        return;
      }
      if (nodeEl) {
        const id = nodeEl.dataset.id;
        const n = S.node(id);
        if (!S.selected.has(id)) S.select([id]);
        C.render();
        const multi = S.selected.size > 1;
        openMenu(e.clientX, e.clientY, [
          { type: 'title', label: n.type === 'frame' ? '流程组' : N.meta(n.type).name + '节点' },
          { icon: 'copy', label: '复制副本', shortcut: 'Ctrl+D', onClick: () => duplicate(id) },
          { icon: 'link', label: multi ? '把选中节点连到此处…' : '连接到…', onClick: () => linkFromSelected(id) },
          { icon: 'group', label: '打包为流程组', shortcut: 'Ctrl+G', onClick: () => wrapFrame(null) },
          { icon: n && n.locked ? 'unlock' : 'lock', label: n && n.locked ? '解锁此节点' : '锁定此节点', shortcut: 'Ctrl+Shift+L', onClick: () => C.toggleLock() },
          { type: 'sep' },
          { icon: 'magic', label: '运行此节点', onClick: () => N.run(id) },
          { icon: 'play', label: '从此节点向后运行', onClick: () => SF.App.runFrom(id) },
          ...(multi ? [
            { type: 'sep' },
            { type: 'title', label: '排列 ' + S.selected.size + ' 个选中节点' },
            { icon: 'align-left', label: '左对齐', onClick: () => C.align('left') },
            { icon: 'align-h', label: '水平居中', onClick: () => C.align('centerX') },
            { icon: 'align-v', label: '垂直居中', onClick: () => C.align('centerY') },
            { icon: 'align-top', label: '顶对齐', onClick: () => C.align('top') },
            { icon: 'dist-h', label: '水平等距分布', onClick: () => C.distribute('h') },
            { icon: 'dist-v', label: '垂直等距分布', onClick: () => C.distribute('v') }
          ] : []),
          { type: 'sep' },
          { icon: 'trash', label: '删除', danger: true, shortcut: 'Delete', onClick: () => delSelected() }
        ]);
        return;
      }
      const t = nodeTypeItems(w.x, w.y);
      openMenu(e.clientX, e.clientY, [
        { type: 'title', label: '画布' },
        ...t.items,
        { type: 'sep' },
        { icon: 'group', label: '流程组框', onClick: () => wrapFrame(w) },
        { icon: 'tidy', label: '自动整理布局', shortcut: 'Ctrl+Shift+T', onClick: () => C.tidy() },
        { icon: 'expand', label: '适应画布', shortcut: 'F', onClick: () => C.fit() },
        { icon: 'pin', label: '粘贴', shortcut: 'Ctrl+V', onClick: () => paste(w) }
      ]);
    });

    /* --- 拖放：节点库 / 资产 --- */
    vp.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    vp.addEventListener('drop', (e) => {
      e.preventDefault();
      const t = e.dataTransfer.getData('text/sf-type');
      const aid = e.dataTransfer.getData('text/sf-asset');
      const w = toWorld(e.clientX, e.clientY);
      if (t) { C.createNode(t, w.x, w.y); U.toast('已添加 ' + N.meta(t).name + ' 节点', 'ok'); return; }
      if (aid) {
        const found = S.allAssets().find((x) => x.asset.id === aid);
        if (found) {
          const nn = C.createNode(found.asset.type === 'audio' ? 'audio' : found.asset.type,
            w.x, w.y, { assets: [found.asset], title: '素材' });
          U.toast('已把素材拖入画布', 'ok');
        }
      }
    });

    /* --- 键盘 --- */
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !isTyping()) { spaceDown = true; vp.classList.add('pan'); e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') { spaceDown = false; vp.classList.remove('pan'); }
    });

    /* --- 小地图导航 --- */
    let mapDrag = false;
    function jumpMap(e) {
      const r = map.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      const ns = S.state.nodes;
      const v = S.state.view, vs = viewSize();
      const vRect = { x: -v.x / v.k, y: -v.y / v.k, w: vs.w / v.k, h: vs.h / v.k };
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      ns.forEach((n) => {
        const el = layer.querySelector('.node[data-id="' + n.id + '"]');
        const bw = n.type === 'frame' ? (n.w || 420) : N.nodeWidth(n), bh = el ? el.offsetHeight : 180;
        x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + bw); y1 = Math.max(y1, n.y + bh);
      });
      if (!ns.length) { x0 = 0; y0 = 0; x1 = 800; y1 = 600; }
      const wx = x0 + px * (x1 - x0), wy = y0 + py * (y1 - y0);
      S.state.view.x = -wx * v.k + vs.w / 2;
      S.state.view.y = -wy * v.k + vs.h / 2;
      applyView();
    }
    map.addEventListener('pointerdown', (e) => { mapDrag = true; jumpMap(e); map.setPointerCapture(e.pointerId); });
    map.addEventListener('pointermove', (e) => { if (mapDrag) jumpMap(e); });
    map.addEventListener('pointerup', () => { mapDrag = false; });

    window.addEventListener('resize', () => drawMap());
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#ctxmenu')) closeMenu();
    });
  }

  function isTyping() {
    const a = document.activeElement;
    return a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT' || a.isContentEditable);
  }

  function compatiblePort(type, outPort) {
    const map = { text: 'prompt', shots: 'prompt', image: 'image', ref: 'ref' };
    const ins = N.meta(type).portsIn.map((p) => p.id);
    const want = map[outPort];
    if (want && ins.indexOf(want) >= 0) return want;
    return ins[0] || null;
  }

  /* ---------------- 组合操作 ---------------- */
  function delSelected() {
    if (E.selectedEdges().length) { E.removeSelected(); C.render(); return; }
    const ids = Array.from(S.selected);
    if (!ids.length) return;
    S.pushHistory();
    ids.forEach((id) => S.removeNode(id, { noHistory: true }));
    U.toast('已删除 ' + ids.length + ' 个节点', 'ok');
    C.render();
  }
  C.delSelected = delSelected;

  function duplicate(id) {
    const n = S.node(id);
    if (!n) return;
    S.pushHistory();
    const copy = U.copy(n);
    copy.id = U.uid('n');
    copy.x = n.x + 28; copy.y = n.y + 28;
    copy.title = n.title + ' 副本';
    copy.assets = (n.assets || []).map((a) => Object.assign({}, a, { id: U.uid('a') }));
    (copy.data.shots || []).forEach((s) => s.id = U.uid('s'));
    S.state.nodes.push(copy);
    S.select([copy.id]);
    C.render();
    U.toast('已复制节点', 'ok');
  }
  C.duplicateSelected = function () {
    const ids = Array.from(S.selected);
    if (!ids.length) return;
    S.pushHistory();
    const news = [];
    ids.forEach((id) => {
      const n = S.node(id);
      if (!n) return;
      const copy = U.copy(n);
      copy.id = U.uid('n');
      copy.x = n.x + 28; copy.y = n.y + 28;
      copy.assets = (n.assets || []).map((a) => Object.assign({}, a, { id: U.uid('a') }));
      S.state.nodes.push(copy);
      news.push(copy.id);
    });
    S.select(news);
    C.render();
  };

  function wrapFrame(w) {
    const sel = S.selectedNodes().filter((n) => n.type !== 'frame');
    S.pushHistory();
    if (sel.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      sel.forEach((n) => {
        const el = layer.querySelector('.node[data-id="' + n.id + '"]');
        x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
        x1 = Math.max(x1, n.x + N.nodeWidth(n)); y1 = Math.max(y1, n.y + (el ? el.offsetHeight : 180));
      });
      const f = S.addNode({
        type: 'frame', x: x0 - 24, y: y0 - 44, title: '流程组 ' + (S.state.nodes.filter((m) => m.type === 'frame').length + 1),
        w: Math.round(x1 - x0 + 48), h: Math.round(y1 - y0 + 64)
      }, { noHistory: true });
      sel.forEach((n) => S.updateNode(n.id, { parent: f.id }, { silent: true }));
      C.render();
      U.toast('已把 ' + sel.length + ' 个节点打包为流程组', 'ok');
    } else if (w) {
      S.addNode({
        type: 'frame', x: Math.round(w.x - 200), y: Math.round(w.y - 130), w: 420, h: 280,
        title: '流程组 ' + (S.state.nodes.filter((m) => m.type === 'frame').length + 1)
      });
      C.render();
    } else {
      U.toast('请先选中要打包的节点', 'info');
    }
  }
  C.wrapFrame = wrapFrame;

  function linkFromSelected(targetId) {
    const src = Array.from(S.selected).filter((id) => id !== targetId);
    if (!src.length) { U.toast('请先选中上游节点', 'info'); return; }
    let cnt = 0;
    src.forEach((id) => {
      const a = S.node(id);
      if (!a) return;
      const outs = N.meta(a.type).portsOut;
      if (!outs.length) return;
      const ok = S.addEdge(id, outs[0].id, targetId, compatiblePort(S.node(targetId).type, outs[0].id));
      if (ok) cnt++;
    });
    C.render();
    if (cnt) U.toast('已连接 ' + cnt + ' 条链路', 'ok');
  }

  function copySel() {
    clipboard = S.selectedNodes().map((n) => U.copy(n));
    if (clipboard.length) U.toast('已复制 ' + clipboard.length + ' 个节点', 'ok');
  }
  function paste(w) {
    if (!clipboard || !clipboard.length) return;
    S.pushHistory();
    const news = [];
    const cx = w ? w.x : 0, cy = w ? w.y : 0;
    const x0 = Math.min.apply(null, clipboard.map((n) => n.x));
    const y0 = Math.min.apply(null, clipboard.map((n) => n.y));
    clipboard.forEach((src) => {
      const c = U.copy(src);
      c.id = U.uid('n');
      if (w) { c.x = Math.round(cx + (src.x - x0)); c.y = Math.round(cy + (src.y - y0)); }
      else { c.x = src.x + 32; c.y = src.y + 32; }
      c.assets = (src.assets || []).map((a) => Object.assign({}, a, { id: U.uid('a') }));
      delete c.parent;
      S.state.nodes.push(c);
      news.push(c.id);
    });
    S.select(news);
    C.render();
  }
  C.copySel = copySel; C.paste = paste;

  /* ---------------- 排列：对齐 / 分布 / 自动整理 / 锁定 ---------------- */
  function widthOf(n) { return n.type === 'frame' ? (n.w || 420) : N.nodeWidth(n); }
  function heightOf(n) {
    const el = layer.querySelector('.node[data-id="' + n.id + '"]');
    if (n.type === 'frame') return n.h || (el ? el.offsetHeight : 220);
    return el ? el.offsetHeight : 180;
  }

  function pickItems() {
    return S.selectedNodes().filter((n) => n.type !== 'frame' && !n.locked);
  }

  const ALIGN_NAME = {
    left: '左对齐', right: '右对齐', top: '顶对齐', bottom: '底对齐',
    centerX: '水平居中', centerY: '垂直居中'
  };

  C.align = function (mode) {
    const sel = pickItems();
    if (sel.length < 2) { U.toast('请先选中至少两个节点', 'info'); return; }
    S.pushHistory();
    const bs = sel.map((n) => ({ n: n, x: n.x, y: n.y, w: widthOf(n), h: heightOf(n) }));
    const minX = Math.min.apply(null, bs.map((b) => b.x));
    const maxX = Math.max.apply(null, bs.map((b) => b.x + b.w));
    const minY = Math.min.apply(null, bs.map((b) => b.y));
    const maxY = Math.max.apply(null, bs.map((b) => b.y + b.h));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    bs.forEach((b) => {
      if (mode === 'left') b.n.x = minX;
      else if (mode === 'right') b.n.x = maxX - b.w;
      else if (mode === 'centerX') b.n.x = Math.round(cx - b.w / 2);
      else if (mode === 'top') b.n.y = minY;
      else if (mode === 'bottom') b.n.y = maxY - b.h;
      else if (mode === 'centerY') b.n.y = Math.round(cy - b.h / 2);
    });
    afterLayout();
    U.toast('已' + (ALIGN_NAME[mode] || '对齐') + ' ' + sel.length + ' 个节点', 'ok');
  };

  C.distribute = function (axis) {
    const sel = pickItems();
    if (sel.length < 3) { U.toast('等距分布需要至少三个节点', 'info'); return; }
    S.pushHistory();
    const bs = sel.map((n) => ({ n: n, x: n.x, y: n.y, w: widthOf(n), h: heightOf(n) }));
    if (axis === 'h') {
      bs.sort((a, b) => a.x - b.x);
      const first = bs[0], last = bs[bs.length - 1];
      const total = bs.reduce((s, b) => s + b.w, 0);
      const gap = ((last.x + last.w) - first.x - total) / (bs.length - 1);
      let x = first.x;
      bs.forEach((b) => { b.n.x = Math.round(x); x += b.w + gap; });
    } else {
      bs.sort((a, b) => a.y - b.y);
      const first = bs[0], last = bs[bs.length - 1];
      const total = bs.reduce((s, b) => s + b.h, 0);
      const gap = ((last.y + last.h) - first.y - total) / (bs.length - 1);
      let y = first.y;
      bs.forEach((b) => { b.n.y = Math.round(y); y += b.h + gap; });
    }
    afterLayout();
    U.toast('已' + (axis === 'h' ? '水平' : '垂直') + '等距分布', 'ok');
  };

  /* 按拓扑层级自动排版：上游在左、下游在右，同层纵向依次排列 */
  C.tidy = function () {
    const nodes = S.state.nodes.filter((n) => n.type !== 'frame');
    if (!nodes.length) { U.toast('画布还是空的', 'info'); return; }
    S.pushHistory();
    const lv = {};
    S.topoOrder().forEach((n) => {
      const ups = S.edgesTo(n.id).map((e) => (lv[e.from] === undefined ? -1 : lv[e.from]));
      lv[n.id] = ups.length ? Math.max.apply(null, ups) + 1 : 0;
    });
    const cols = {};
    nodes.forEach((n) => { const k = lv[n.id] || 0; (cols[k] = cols[k] || []).push(n); });

    const GAP_X = 190, GAP_Y = 46;
    let x = 0;
    Object.keys(cols).map(Number).sort((a, b) => a - b).forEach((k) => {
      const col = cols[k].slice().sort((a, b) => a.y - b.y);
      const maxW = Math.max.apply(null, col.map(widthOf));
      let y = 0;
      col.forEach((n) => { n.x = x; n.y = y; y += heightOf(n) + GAP_Y; });
      x += maxW + GAP_X;
    });

    // 流程组跟随子节点重新贴合
    S.state.nodes.filter((n) => n.type === 'frame').forEach((f) => {
      const kids = S.state.nodes.filter((m) => m.parent === f.id);
      if (!kids.length) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      kids.forEach((m) => {
        x0 = Math.min(x0, m.x); y0 = Math.min(y0, m.y);
        x1 = Math.max(x1, m.x + widthOf(m)); y1 = Math.max(y1, m.y + heightOf(m));
      });
      f.x = Math.round(x0 - 24); f.y = Math.round(y0 - 44);
      f.w = Math.round(x1 - x0 + 48); f.h = Math.round(y1 - y0 + 64);
    });

    afterLayout();
    C.fit();
    U.toast('已按链路层级整理画布', 'ok');
  };

  C.toggleLock = function () {
    const sel = S.selectedNodes();
    if (!sel.length) { U.toast('请先选中节点', 'info'); return; }
    const lock = sel.some((n) => !n.locked);
    S.pushHistory();
    sel.forEach((n) => S.updateNode(n.id, { locked: lock }, { silent: true }));
    C.render();
    S.scheduleSave();
    U.toast(lock ? '已锁定 ' + sel.length + ' 个节点（不可拖动）' : '已解锁 ' + sel.length + ' 个节点', 'ok');
  };

  C.arrangeMenu = function (anchorEl) {
    const r = anchorEl.getBoundingClientRect();
    C.openMenu(r.left, r.bottom + 6, [
      { icon: 'align-left', label: '左对齐', onClick: () => C.align('left') },
      { icon: 'align-h', label: '水平居中', onClick: () => C.align('centerX') },
      { icon: 'align-right', label: '右对齐', onClick: () => C.align('right') },
      { type: 'sep' },
      { icon: 'align-top', label: '顶对齐', onClick: () => C.align('top') },
      { icon: 'align-v', label: '垂直居中', onClick: () => C.align('centerY') },
      { icon: 'align-bottom', label: '底对齐', onClick: () => C.align('bottom') },
      { type: 'sep' },
      { icon: 'dist-h', label: '水平等距分布', onClick: () => C.distribute('h') },
      { icon: 'dist-v', label: '垂直等距分布', onClick: () => C.distribute('v') },
      { type: 'sep' },
      { icon: 'tidy', label: '自动整理布局', hint: 'Ctrl+Shift+T', onClick: () => C.tidy() }
    ]);
  };

  /* 把指定节点移到视口中心 */
  C.centerNode = function (id) {
    const n = S.node(id);
    if (!n) return;
    const r = vp.getBoundingClientRect();
    const v = S.state.view;
    v.x = r.width / 2 - (n.x + widthOf(n) / 2) * v.k;
    v.y = r.height / 2 - (n.y + heightOf(n) / 2) * v.k;
    applyView();
  };

  function afterLayout() {
    C.render();
    S.scheduleSave();
  }
  C.widthOf = widthOf; C.heightOf = heightOf;

  C.setTool = function (t) {
    tool = t;
    U.$('#toolSelect').classList.toggle('active', t === 'select');
    U.$('#toolPan').classList.toggle('active', t === 'pan');
    vp.classList.toggle('pan', t === 'pan');
  };
  C.toggleGrid = function () {
    gridSnap = !gridSnap;
    U.$('#btnGrid').classList.toggle('active', gridSnap);
    U.toast(gridSnap ? '已开启网格吸附' : '已关闭网格吸附', 'info');
  };

  C.init = function () { bind(); C.setTool('select'); };
  SF.Canvas = C;
})(window);

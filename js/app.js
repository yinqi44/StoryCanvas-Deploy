/* ============ 启动编排：工具栏 / 侧栏 / 快捷键 / 一键运行 ============ */
(function (global) {
  'use strict';
  const SF = global.SF, U = SF.util, S = SF.store, N = SF.Nodes, C = SF.Canvas, G = SF.gen, TL = SF.Timeline, IN = SF.Inspector;

  const App = {};

  /* ---------------- 左侧：节点库 ---------------- */
  function buildNodeLib() {
    const wrap = U.$('#nodeLib');
    wrap.innerHTML = '';
    ['text', 'script', 'image', 'video', 'audio'].forEach((t) => {
      const m = N.meta(t);
      const el = U.el('div', 'lib-item');
      el.draggable = true;
      el.innerHTML = '<span class="lib-ico" style="background:' + m.color + '22;color:' + m.color + '">' + U.icon(m.icon) + '</span>' +
        '<span class="lib-txt"><b>' + m.name + '节点</b><span>' + m.desc + '</span></span>';
      el.ondragstart = (e) => { e.dataTransfer.setData('text/sf-type', t); e.dataTransfer.effectAllowed = 'copy'; };
      el.onclick = () => {
        const r = U.$('#viewport').getBoundingClientRect();
        const w = C.toWorld(r.left + r.width * (0.2 + Math.random() * 0.3), r.top + r.height * (0.2 + Math.random() * 0.3));
        C.createNode(t, w.x, w.y);
      };
      wrap.appendChild(el);
    });

    const tm = U.$('#tmplLib');
    const templates = [
      { name: '产品宣传片', desc: '文本 → 脚本 → 关键帧 → 视频 → 配乐', build: tplProduct },
      { name: '单镜头一镜到底', desc: '文本 → 图片 → 视频', build: tplSingle },
      { name: '旁白解说短片', desc: '文本(旁白) → 图片 → 视频 + 配音', build: tplNarration }
    ];
    tm.innerHTML = '';
    templates.forEach((t) => {
      const el = U.el('div', 'tmpl-item');
      el.innerHTML = '<b>' + t.name + '</b><small>' + t.desc + '</small>';
      el.onclick = () => { S.pushHistory(); t.build(); C.fit(); U.toast('已套用模板：' + t.name, 'ok'); };
      tm.appendChild(el);
    });
  }

  function mk(type, x, y, data, title) {
    return S.addNode(Object.assign({ type, x, y, title }, N.meta(type).make(), data ? { data: Object.assign(N.meta(type).make().data, data) } : {}), { noHistory: true });
  }

  function tplProduct() {
    S.clearAll();
    const t = mk('text', 60, 120, { text: '一款极简设计的智能咖啡机，主打都市独居青年的晨间仪式感', role: '提示词' }, '创意梗概');
    const s = mk('script', 380, 90, {
      story: '清晨的阳光洒进厨房，一台极简白色智能咖啡机静静立在台面上。按下启动键，蒸汽缓缓升起，咖啡豆被研磨，深褐色的咖啡液缓缓注入白瓷杯。男人端起杯子走到客厅落地窗前，望着城市慢慢醒来，最后定格在咖啡机上的品牌 Logo。',
      shotCount: 5, shots: []
    }, '分镜脚本');
    S.addEdge(t.id, 'text', s.id, 'story', { noHistory: true });
    const img = mk('image', 740, 90, { prompt: '', model: 'seedream5', ratio: '16:9', count: 1, style: '电影感', seed: 42 }, '关键帧');
    S.addEdge(s.id, 'shots', img.id, 'prompt', { noHistory: true });
    C.render();
  }
  function tplSingle() {
    S.clearAll();
    const t = mk('text', 60, 140, { text: '雨夜霓虹街道，一位撑伞的行人走过水洼，倒影被灯光打碎', role: '提示词' }, '画面创意');
    const img = mk('image', 380, 110, { prompt: '', count: 1 }, '首帧');
    const v = mk('video', 720, 110, { prompt: '画面缓缓推进，雨丝下落，霓虹在水面流动', duration: 4, motion: '推近' }, '运镜');
    S.addEdge(t.id, 'text', img.id, 'prompt', { noHistory: true });
    S.addEdge(img.id, 'image', v.id, 'image', { noHistory: true });
    C.render();
  }
  function tplNarration() {
    S.clearAll();
    const spy = mk('text', 60, 80, { text: '在这座永不入睡的城市里，每个人都藏着一段没说完的故事。', role: '旁白' }, '旁白台词');
    const img = mk('image', 380, 60, { prompt: '', count: 1 }, '画面');
    const v = mk('video', 700, 60, { prompt: '城市夜景缓慢横摇', motion: '左移', duration: 5 }, '影片');
    const a = mk('audio', 700, 400, { type: 'speech', prompt: '', duration: 8, voice: '男声' }, '配音');
    const m = mk('audio', 700, 660, { type: 'music', prompt: '孤独而温暖的钢琴', duration: 8 }, '背景音乐');
    S.addEdge(spy.id, 'text', img.id, 'prompt', { noHistory: true });
    S.addEdge(img.id, 'image', v.id, 'image', { noHistory: true });
    S.addEdge(spy.id, 'text', a.id, 'prompt', { noHistory: true });
    S.addEdge(v.id, 'video', m.id, 'video', { noHistory: true });
    C.render();
  }

  function buildModelHub() {
    const wrap = U.$('#modelHub');
    const groups = [['大语言模型', 'llm'], ['图像模型', 'image'], ['视频模型', 'video'], ['音频模型', 'audio']];
    wrap.innerHTML = groups.map((g) =>
      '<div class="model-group"><h5>' + g[0] + '</h5>' +
      G.MODELS[g[1]].map((m) => '<div class="model-row"><span class="dot" style="background:' + m.dot + '"></span>' +
        '<span class="nm">' + m.name + '</span><span class="tag">' + m.tag + ' · 本地</span></div>').join('') +
      '</div>').join('');
  }

  function refreshAssets() {
    const wrap = U.$('#assetLib');
    const all = S.allAssets().filter((x) => x.asset.type !== 'audio');
    if (!all.length) {
      wrap.innerHTML = '<div class="asset-empty">还没有产物<br>先在画布上生成图片或视频</div>';
      return;
    }
    wrap.innerHTML = '';
    all.slice().reverse().forEach((x) => {
      const a = x.asset;
      const el = U.el('div', 'asset-card');
      el.draggable = true;
      el.innerHTML = (a.type === 'video'
        ? '<video src="' + (a.url || '') + '" poster="' + a.poster + '" muted></video>'
        : '<img src="' + a.url + '" alt="">') +
        '<div class="cap">' + U.esc(x.node.title || '') + '</div>';
      el.ondragstart = (e) => { e.dataTransfer.setData('text/sf-asset', a.id); e.dataTransfer.effectAllowed = 'copy'; };
      el.onclick = () => { S.select([x.node.id]); C.render(); C.fit(); };
      el.ondblclick = () => TL.previewAsset(a);
      wrap.appendChild(el);
    });
  }

  /* ---------------- 一键运行 ---------------- */
  function needRun(n) {
    if (n.type === 'text') return false;
    if (n.type === 'script') return !(n.data.shots && n.data.shots.length);
    if (n.type === 'frame') return false;
    return true;
  }
  App.runNodes = async function (ids) {
    const list = ids.map((id) => S.node(id)).filter(Boolean).filter(needRun);
    if (!list.length) { U.toast('没有需要运行的节点（文本/已有产物会自动跳过）', 'info', 2600); return; }
    U.toast('开始顺序运行 ' + list.length + ' 个节点', 'info');
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      n._rev = (n._rev || 0) + 1;
      S.emit('node:status', n);
      await N.run(n.id, true);
    }
    C.render();
    U.toast('链路运行完成', 'ok', 3000);
  };
  App.runFrom = function (id) {
    const seen = {};
    const out = [];
    (function walk(i) {
      if (seen[i]) return;
      seen[i] = 1;
      const n = S.node(i);
      if (n) out.push(i);
      S.edgesFrom(i).forEach((e) => walk(e.to));
    })(id);
    App.runNodes(out);
  };
  App.runAll = function () {
    const order = S.topoOrder().map((n) => n.id);
    App.runNodes(order);
  };

  /* ---------------- 导出 ---------------- */
  function exportMenu() {
    const EK = SF.ExportKit;
    C.openMenu(U.$('#btnExport').getBoundingClientRect().left,
      U.$('#btnExport').getBoundingClientRect().bottom + 6, [
      { type: 'title', label: '工程与数据' },
      { icon: 'save', label: '导出工程 JSON', onClick: () => U.download((S.state.project.name || 'storycanvas') + '.json', S.exportProject()) },
      { icon: 'upload', label: '导入工程 JSON', onClick: () => U.$('#btnImport').click() },
      { type: 'sep' },
      { type: 'title', label: '素材与字幕' },
      { icon: 'zip', label: '打包全部素材为 ZIP', onClick: () => EK.exportAssetsZip() },
      { icon: 'script', label: '导出分镜表 CSV', onClick: exportCSV },
      { icon: 'subtitle', label: '导出 SRT 字幕', onClick: () => EK.exportSRT() },
      { icon: 'layers', label: '导出素材清单', onClick: exportManifest },
      { type: 'sep' },
      { icon: 'camera', label: '导出画布截图 PNG', onClick: () => EK.exportPNG(2) },
      { type: 'sep' },
      { icon: 'trash', label: '清空画布', danger: true, onClick: () => { if (confirm('确定清空整个画布？该操作不可撤销。')) { S.clearAll(); C.render(); } } }
    ]);
  }
  function exportCSV() {
    const scripts = S.state.nodes.filter((n) => n.type === 'script' && (n.data.shots || []).length);
    if (!scripts.length) { U.toast('还没有已拆镜的脚本节点', 'err'); return; }
    let csv = '\uFEFF镜号,画面描述,景别,运镜,时长(秒)\n';
    scripts.forEach((n) => {
      (n.data.shots || []).forEach((s) => {
        csv += [s.idx, '"' + String(s.desc).replace(/"/g, '""') + '"', s.size, s.cam, s.dur].join(',') + '\n';
      });
    });
    U.download('分镜表.csv', csv, 'text/csv;charset=utf-8');
    U.toast('分镜表已导出', 'ok');
  }
  function exportManifest() {
    const all = S.allAssets();
    if (!all.length) { U.toast('还没有任何产物', 'err'); return; }
    const lines = all.map((x, i) => {
      const a = x.asset;
      return [i + 1, a.type, String(x.node.title || ''), a.url ? a.url.slice(0, 120) : '(仅封面)',
      String(a.meta && a.meta.model || ''), String(a.duration || '')].join('\t');
    });
    U.download('素材清单.tsv', '\uFEFF序号\t类型\t节点\t链接\t模型\t时长\n' + lines.join('\n'), 'text/tab-separated-values;charset=utf-8');
    U.toast('素材清单已导出', 'ok');
  }

  /* ---------------- 帮助 ---------------- */
  function help() {
    const html =
      '<div class="modal-hd"><b>StoryCanvas · 使用说明</b><button class="mini" data-close>×</button></div>' +
      '<div class="modal-bd">' +
      '<p>这是一个 <b>无限画布 + 节点式工作流</b> 的 AI 视频创作原型。把文本、脚本、图片、视频、音频都做成节点，' +
      '自由拖拽连线，上游的输出自动成为下游的输入，最后在时间轴里串成成片。</p>' +
      '<h4>五分钟上手</h4><ul>' +
      '<li><b>双击画布空白处</b> 添加节点，或从左侧拖入</li>' +
      '<li><b>拖动节点右侧彩色圆点</b> 到另一个节点左侧圆点即可连线；拖到空白处会让你直接新建下游节点</li>' +
      '<li>在<b>脚本节点</b>里粘贴剧情梗概 → 点「AI 拆分镜」→ 再点「批量排出关键帧节点」，会自动生成一排图片节点</li>' +
      '<li>各节点点「生成」产出图片 / 视频 / 音频，<b>Ctrl+Enter</b> 可按拓扑顺序跑整条链路</li>' +
      '<li>底部「按画布顺序同步」把视频和音频片段排进时间轴，点 ▶ 预览成片</li>' +
      '</ul>' +
      '<h4>关于生成能力</h4><p>当前使用<b>本地推理演示引擎</b>：图片由 Canvas 按提示词语义程序化绘制、' +
      '视频由浏览器实时录制生成真实的 webm 文件、音频由 WebAudio 离线合成为 wav，全部离线运行。' +
      '要接真实模型，替换 <code>js/gen.js</code> 中 <code>SF.gen.image / video / audio / shots</code> 四个函数即可，节点与画布逻辑无需改动。</p>' +
      '<h4>快捷键</h4><div class="shortcut-list" style="display:grid;grid-template-columns:1fr 1fr;gap:4px 18px">' +
      [['新建节点', '双击空白'], ['命令面板', 'Ctrl+K'], ['平移画布', '空格拖动 / H'], ['缩放', '滚轮'], ['框选', '空白拖动'],
      ['复制粘贴', 'Ctrl+C / V'], ['快速复制', 'Ctrl+D'], ['打成流程组', 'Ctrl+G'],
      ['删除', 'Delete'], ['撤销重做', 'Ctrl+Z / Ctrl+Shift+Z'], ['适应画布', 'F'], ['整链运行', 'Ctrl+Enter'],
      ['自动整理布局', 'Ctrl+Shift+T'], ['锁定节点', 'Ctrl+Shift+L'], ['帮助', '?']]
        .map((s) => '<div><span>' + s[0] + '</span><kbd>' + s[1] + '</kbd></div>').join('') +
      '</div></div>' +
      '<div class="modal-ft"><button class="btn primary" data-close>知道了</button></div>';
    openModal(html);
  }
  function openModal(html) {
    const root = U.$('#modalRoot');
    root.innerHTML = '<div class="modal">' + html + '</div>';
    root.hidden = false;
    U.$$('[data-close]', root).forEach((b) => b.onclick = () => { root.hidden = true; root.innerHTML = ''; });
    root.onclick = (e) => { if (e.target === root) { root.hidden = true; root.innerHTML = ''; } };
  }
  App.openModal = openModal;

  /* ---------------- 命令面板（Ctrl+K） ---------------- */
  function fuzzy(q, s) {
    if (!q) return true;
    s = String(s || '').toLowerCase();
    if (s.indexOf(q) >= 0) return true;
    let i = 0;
    for (let j = 0; j < s.length && i < q.length; j++) if (s[j] === q[i]) i++;
    return i === q.length;
  }

  function addNodeCenter(t) {
    const r = U.$('#viewport').getBoundingClientRect();
    const w = C.toWorld(r.left + r.width / 2 - 140, r.top + r.height / 2 - 90);
    C.createNode(t, w.x, w.y);
    U.toast('已添加 ' + N.meta(t).name + ' 节点', 'ok');
  }

  function commandList() {
    const list = [];
    ['text', 'script', 'image', 'video', 'audio'].forEach((t) => {
      const m = N.meta(t);
      list.push({
        group: '添加节点', icon: m.icon, label: '添加「' + m.name + '」节点',
        kw: m.name + '节点 ' + m.desc, run: () => addNodeCenter(t)
      });
    });
    [
      { icon: 'play', label: '一键运行整条链路', hint: 'Ctrl+Enter', kw: 'run 运行 yunxing', run: () => App.runAll() },
      { icon: 'tidy', label: '自动整理布局', hint: 'Ctrl+Shift+T', kw: 'tidy 整理 zhengli sort 排版', run: () => C.tidy() },
      { icon: 'expand', label: '适应画布', hint: 'F', kw: 'fit 缩放 suofang zoom', run: () => C.fit() },
      { icon: 'align-left', label: '左对齐选中节点', kw: 'align 对齐 duiqi', run: () => C.align('left') },
      { icon: 'align-h', label: '水平居中选中节点', kw: 'align 对齐 duiqi', run: () => C.align('centerX') },
      { icon: 'align-v', label: '垂直居中选中节点', kw: 'align 对齐 duiqi', run: () => C.align('centerY') },
      { icon: 'align-top', label: '顶对齐选中节点', kw: 'align 对齐 duiqi', run: () => C.align('top') },
      { icon: 'dist-h', label: '水平等距分布', kw: 'distribute 分布 fenbu', run: () => C.distribute('h') },
      { icon: 'dist-v', label: '垂直等距分布', kw: 'distribute 分布 fenbu', run: () => C.distribute('v') },
      { icon: 'lock', label: '锁定 / 解锁选中节点', hint: 'Ctrl+Shift+L', kw: 'lock 锁定 suoding', run: () => C.toggleLock() },
      { icon: 'group', label: '打包为流程组', hint: 'Ctrl+G', kw: 'group 组 frame 打包', run: () => C.wrapFrame(null) },
      { icon: 'timeline', label: '按画布顺序同步时间轴', kw: 'timeline 时间轴 同步', run: () => TL.sync() },
      { icon: 'save', label: '导出工程 JSON', kw: 'export 导出 daochu', run: () => U.download((S.state.project.name || 'storycanvas') + '.json', S.exportProject()) },
      { icon: 'zip', label: '打包全部素材为 ZIP', kw: 'zip 打包 素材 下载 xiazai', run: () => SF.ExportKit.exportAssetsZip() },
      { icon: 'subtitle', label: '导出 SRT 字幕', kw: 'srt 字幕 zimu', run: () => SF.ExportKit.exportSRT() },
      { icon: 'camera', label: '导出画布截图 PNG', kw: 'png 截图 jietu canvas', run: () => SF.ExportKit.exportPNG(2) },
      { icon: 'script', label: '导出分镜表 CSV', kw: 'csv 分镜 fenjing', run: exportCSV },
      { icon: 'upload', label: '导入工程 JSON', kw: 'import 导入 daoru', run: () => U.$('#btnImport').click() },
      { icon: 'refresh', label: '重做 / 撤销', kw: 'undo redo 撤销 重做', run: () => { } },
      { icon: 'info', label: '使用说明与快捷键', hint: '?', kw: 'help 帮助 bangzhu', run: help },
      { icon: 'trash', label: '清空画布', kw: 'clear 清空 qingkong reset', run: () => { if (confirm('确定清空整个画布？该操作不可撤销。')) { S.clearAll(); C.render(); } } }
    ].forEach((o) => { o.group = '操作'; list.push(o); });

    S.state.nodes.slice(0, 80).forEach((n) => {
      list.push({
        group: '跳到节点', icon: n.type === 'frame' ? 'group' : N.meta(n.type).icon,
        label: (n.title || (N.meta(n.type).name + '节点')),
        kw: 'goto 跳转 jump',
        run: () => { S.select([n.id]); C.render(); C.centerNode(n.id); }
      });
    });
    return list;
  }

  let cmdView = [], cmdIdx = 0;
  function openPalette() {
    const root = U.$('#cmdk');
    const input = U.$('#cmdkInput');
    const listEl = U.$('#cmdkList');
    const all = commandList();
    root.hidden = false;
    input.value = '';
    cmdIdx = 0;

    function highlight() {
      U.$$('.cmdk-row', listEl).forEach((el) => el.classList.toggle('on', Number(el.dataset.i) === cmdIdx));
      const on = listEl.querySelector('.cmdk-row.on');
      if (on) on.scrollIntoView({ block: 'nearest' });
    }
    function paint() {
      const q = input.value.trim().toLowerCase();
      cmdView = all.filter((c) => !q || fuzzy(q, c.label) || fuzzy(q, c.kw || ''));
      U.$('#cmdkCount').textContent = cmdView.length + ' 项';
      if (!cmdView.length) { listEl.innerHTML = '<div class="cmdk-empty">没有匹配的命令</div>'; return; }
      if (cmdIdx >= cmdView.length) cmdIdx = 0;
      listEl.innerHTML = cmdView.map((c, i) =>
        '<div class="cmdk-row' + (i === cmdIdx ? ' on' : '') + '" data-i="' + i + '">' + U.icon(c.icon) +
        '<span>' + U.esc(c.label) + '</span>' +
        (c.hint ? '<span class="hint">' + U.esc(c.hint) + '</span>' : '') +
        '<span class="gr">' + U.esc(c.group) + '</span></div>').join('');
      U.$$('.cmdk-row', listEl).forEach((el) => {
        el.onmouseenter = () => { cmdIdx = Number(el.dataset.i); highlight(); };
        el.onclick = () => { cmdIdx = Number(el.dataset.i); exec(); };
      });
      highlight();
    }
    function close() { root.hidden = true; }
    function exec() {
      const c = cmdView[cmdIdx];
      if (!c) return;
      close();
      setTimeout(() => { try { c.run(); } catch (e) { U.toast('执行失败：' + e.message, 'err'); } }, 40);
    }

    input.oninput = () => { cmdIdx = 0; paint(); };
    input.onkeydown = (e) => {
      const n = cmdView.length || 1;
      if (e.key === 'ArrowDown') { e.preventDefault(); cmdIdx = (cmdIdx + 1) % n; highlight(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cmdIdx = (cmdIdx - 1 + n) % n; highlight(); }
      else if (e.key === 'Enter') { e.preventDefault(); exec(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    };
    root.onclick = (e) => { if (e.target === root) close(); };

    paint();
    input.focus();
  }
  App.openPalette = openPalette;

  /* ---------------- 快捷键 ---------------- */
  function isTyping() {
    const a = document.activeElement;
    return a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT' || a.isContentEditable);
  }
  function bindKeys() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && k === 'enter') { e.preventDefault(); App.runAll(); return; }
      if (mod && k === 'k') { e.preventDefault(); openPalette(); return; }
      if (mod && e.shiftKey && k === 't') { e.preventDefault(); C.tidy(); return; }
      if (mod && e.shiftKey && k === 'l') { e.preventDefault(); C.toggleLock(); return; }
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) S.redo(); else S.undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); S.redo(); return; }
      if (mod && k === 'c') { C.copySel(); return; }
      if (mod && k === 'v' && !isTyping()) { const r = U.$('#viewport').getBoundingClientRect(); C.paste(C.toWorld(r.left + 200, r.top + 160)); return; }
      if (mod && k === 'd') { e.preventDefault(); SF.Canvas.duplicateSelected(); return; }
      if (mod && k === 'g') { e.preventDefault(); C.wrapFrame(null); return; }
      if (mod && k === 'a') { e.preventDefault(); S.select(S.state.nodes.filter((n) => n.type !== 'frame').map((n) => n.id)); return; }
      if (mod && k === 's') { e.preventDefault(); U.toast('已自动保存到本地', 'ok'); return; }
      if (mod) return;
      if (k === 'delete' || k === 'backspace') {
        if (isTyping()) return;
        e.preventDefault(); C.delSelected(); return;
      }
      if (k === 'v') C.setTool('select');
      if (k === 'h') C.setTool('pan');
      if (k === 'f') C.fit();
      if (k === '?') help();
    });
  }

  /* ---------------- 抽屉字段 ---------------- */
  function bindChrome() {
    U.$('#toolSelect').onclick = () => C.setTool('select');
    U.$('#toolPan').onclick = () => C.setTool('pan');
    U.$('#btnUndo').onclick = () => { S.undo(); };
    U.$('#btnRedo').onclick = () => { S.redo(); };
    U.$('#btnFit').onclick = () => C.fit();
    U.$('#btnGrid').onclick = () => C.toggleGrid();
    U.$('#btnGrid').classList.add('active');
    U.$('#btnArrange').onclick = () => C.arrangeMenu(U.$('#btnArrange'));
    U.$('#btnLock').onclick = () => C.toggleLock();
    U.$('#btnCmd').onclick = () => openPalette();
    U.$('#zoomIn').onclick = () => C.zoomStep(1.18);
    U.$('#zoomOut').onclick = () => C.zoomStep(0.85);
    U.$('#zoomReset').onclick = () => C.resetZoom();

    U.$$('.tab').forEach((t) => t.onclick = () => {
      U.$$('.tab').forEach((x) => x.classList.remove('active'));
      U.$$('.tabpane').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      U.$('.tabpane[data-pane="' + t.dataset.tab + '"]').classList.add('active');
      if (t.dataset.tab === 'assets') refreshAssets();
    });

    const pn = U.$('#projName');
    pn.value = S.state.project.name || '未命名项目';
    pn.oninput = U.debounce(() => {
      S.state.project.name = pn.value;
      S.scheduleSave();
    }, 400);

    U.$('#btnExport').onclick = exportMenu;
    U.$('#btnImport').onclick = async () => {
      try {
        const txt = await U.readText();
        S.importProject(txt);
        C.render(); C.fit();
        U.toast('工程已导入', 'ok');
      } catch (err) { U.toast('导入失败：' + err.message, 'err'); }
    };
    U.$('#btnRunAll').onclick = () => App.runAll();
    U.$('#btnHelp').onclick = help;

    // 窄屏（<=880px）时侧栏收成抽屉：点 logo 打开左侧，选中节点自动弹出属性面板
    const APP = document.getElementById('app');
    const brand = U.$('.brand');
    if (brand) brand.onclick = () => { if (innerWidth <= 880) APP.classList.toggle('left-open'); };
    U.$('#rpClose').onclick = () => {
      if (innerWidth <= 880) APP.classList.remove('rp-open');
      else APP.classList.toggle('right-hidden');
    };
  }

  /* ---------------- 首次种子数据 ---------------- */
  function seedDemo() {
    const t = mk('text', 40, 120, {
      text: '极简白色智能咖啡机，主打都市独居青年的晨间仪式感，暖调木质厨房，清晨侧逆光',
      role: '提示词'
    }, '创意梗概');
    const s = mk('script', 360, 90, {
      story: '清晨的阳光洒进厨房，一台极简白色智能咖啡机静静立在木质台面上。按下启动键，蒸汽缓缓升起，咖啡豆被研磨成粉，深褐色的咖啡液缓缓注入白瓷杯。男人端起杯子走到客厅落地窗前，望着城市慢慢醒来，镜头最后落到机身中央的品牌 Logo。',
      shotCount: 5, shots: []
    }, '30秒广告脚本');
    S.addEdge(t.id, 'text', s.id, 'story', { noHistory: true });
    C.render();
    C.fit();
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    const had = (function () {
      try { return !!localStorage.getItem('storycanvas.project.v1'); } catch (e) { return false; }
    })();
    S.init();
    C.init();
    TL.init();
    buildNodeLib();
    buildModelHub();

    S.subscribe(function (reason) {
      C.render();
      IN.render();
      if (reason === 'asset:add' || reason === 'asset:remove' || reason === 'reset' ||
        reason === 'node:remove' || reason === 'undo' || reason === 'redo') refreshAssets();
      const zu = U.$('#btnUndo'), zr = U.$('#btnRedo');
      if (zu) zu.disabled = !S.canUndo();
      if (zr) zr.disabled = !S.canRedo();
      if (reason === 'selection' && innerWidth <= 880 && S.selected.size) {
        document.getElementById('app').classList.add('rp-open');
      }
    });

    bindKeys();
    bindChrome();

    if (!had && !S.state.nodes.length) seedDemo();
    else { C.render(); C.fit(); }

    IN.render();
    refreshAssets();
    if (!had) {
      setTimeout(() => App.openModal(
        '<div class="modal-hd"><b>欢迎来到 StoryCanvas</b><button class="mini" data-close>×</button></div>' +
        '<div class="modal-bd">' +
        '<p>这是一个仿 LibTV「无限画布 + 节点式工作流」的 AI 视频创作原型，生成能力由浏览器本地实现：' +
        '图片按语义程序化绘制，视频是真实录制出来的 webm，音频是离线合成的 wav。</p>' +
        '<h4>建议先做这三件事</h4><ul>' +
        '<li>点中间<b>「30秒广告脚本」</b>节点上的 <b>AI 拆分镜</b>，看剧本如何自动拆成一排可执行镜头</li>' +
        '<li>点 <b>批量排出关键帧节点</b>，画布会自动长出一条图片节点流水线</li>' +
        '<li>按 <b>Ctrl+Enter</b> 一键跑通整条链路，再去底部时间轴预览成片</li>' +
        '</ul><p>画布上的工程会自动保存在本机浏览器里，随时可用「导出」带走。</p>' +
        '</div><div class="modal-ft"><button class="btn primary" data-close>开始创作</button></div>'
      ), 420);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  SF.App = App;
})(window);

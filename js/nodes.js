/* ============ 节点：类型注册表 + DOM 渲染 + 执行逻辑 ============ */
(function (global) {
  'use strict';
  const SF = global.SF, U = SF.util, S = SF.store, G = SF.gen;

  const TYPES = {
    text: {
      name: '文本', desc: '提示词 / 旁白 / 字幕', icon: 'text', color: 'var(--c-text)',
      w: 268, portsIn: [], portsOut: [{ id: 'text', name: '文本' }],
      make: () => ({ data: { role: '提示词', text: '' } })
    },
    script: {
      name: '脚本', desc: '梗概 → 自动拆分镜', icon: 'script', color: 'var(--c-script)',
      w: 312, portsIn: [{ id: 'story', name: '梗概' }], portsOut: [{ id: 'shots', name: '分镜' }, { id: 'text', name: '文本' }],
      make: () => ({ data: { story: '', shotCount: 6, shots: [] } })
    },
    image: {
      name: '图片', desc: '文生图 / 图生图', icon: 'image', color: 'var(--c-image)',
      w: 296, portsIn: [{ id: 'prompt', name: '提示词' }, { id: 'ref', name: '参考图' }],
      portsOut: [{ id: 'image', name: '图片' }],
      make: () => ({ data: { prompt: '', model: 'seedream5', ratio: '16:9', count: 1, style: '电影感', seed: 42, refMode: 'style' } })
    },
    video: {
      name: '视频', desc: '图生视频 / 文生视频', icon: 'video', color: 'var(--c-video)',
      w: 312, portsIn: [{ id: 'prompt', name: '提示词' }, { id: 'image', name: '首帧' }],
      portsOut: [{ id: 'video', name: '视频' }],
      make: () => ({ data: { prompt: '', model: 'kling3', duration: 4, motion: '推近', ratio: '16:9', seed: 7 } })
    },
    audio: {
      name: '音频', desc: '配乐 / 配音 / 音效', icon: 'audio', color: 'var(--c-audio)',
      w: 288, portsIn: [{ id: 'prompt', name: '文案' }, { id: 'video', name: '影片' }],
      portsOut: [{ id: 'audio', name: '音频' }],
      make: () => ({ data: { type: 'music', prompt: '', duration: 8, voice: '男声', model: 'mureka', seed: 3 } })
    },
    frame: {
      name: '组', desc: '打包节点形成流程', icon: 'group', color: '#c4b5fd',
      w: 420, portsIn: [], portsOut: [],
      make: () => ({ data: {}, w: 420, h: 260 })
    }
  };

  function meta(type) { return TYPES[type] || TYPES.text; }

  /* 端口坐标（世界坐标）—— 必须与 portTop() 保持几何一致 */
  const PORT_R = 6.5;
  function portTop(n, i) { return (n.collapsed ? 10 : 36 + i * 22) + 'px'; }
  function portOffsetY(n, i) { return (n.collapsed ? 10 : 36 + i * 22) + PORT_R; }

  function portPos(n, portId, isIn) {
    const list = isIn ? meta(n.type).portsIn : meta(n.type).portsOut;
    let idx = 0;
    if (list && list.length) {
      const f = list.findIndex((p) => p.id === portId);
      idx = f < 0 ? 0 : f;
    }
    if (n.collapsed) return { x: isIn ? n.x : n.x + nodeWidth(n), y: n.y + 10 + PORT_R };
    return { x: isIn ? n.x : n.x + nodeWidth(n), y: n.y + portOffsetY(n, idx) };
  }
  function nodeWidth(n) { return n.w || meta(n.type).w; }

  /* 取一个好看的标题 */
  function autoTitle(n) {
    const d = n.data || {};
    if (n.type === 'image') return (d.prompt || '图片生成').slice(0, 12);
    if (n.type === 'video') return (d.prompt || '镜头').slice(0, 12);
    if (n.type === 'audio') return (d.type === 'music' ? '配乐' : d.type === 'speech' ? '旁白' : '音效') + ' · ' + (d.prompt || '').slice(0, 8);
    if (n.type === 'script') return (d.shots && d.shots.length) ? ('分镜 × ' + d.shots.length) : '脚本';
    return (d.text || meta(n.type).name).slice(0, 12);
  }

  /* ---------------- 小部件 ---------------- */
  function field(label, control) {
    return '<div class="field">' + (label ? '<label>' + label + '</label>' : '') + control + '</div>';
  }
  function chips(list) {
    return '<div class="n-params">' + list.map((c) => '<span class="chip">' + c[0] + ' <b>' + U.esc(c[1]) + '</b></span>').join('') + '</div>';
  }
  /* 画面比例全表（与 gen.js RATIOS 对应） */
  const RATIOS_LIST = [['16:9', '16:9'], ['9:16', '9:16'], ['1:1', '1:1'], ['4:3', '4:3'], ['3:4', '3:4'], ['3:2', '3:2'], ['2:3', '2:3'], ['21:9', '21:9']];
  /* 节点卡片内的可选项框 */
  function selChip(label, k, opts, cur) {
    return '<label class="chip selc">' + label +
      '<select class="nd-sel nodrag" data-k="' + k + '">' +
      opts.map((o) => '<option value="' + o[0] + '"' + (String(cur) === String(o[0]) ? ' selected' : '') + '>' + o[1] + '</option>').join('') +
      '</select></label>';
  }
  /* 参考图区：缩略图 + 加号上传 */
  function refGrid(n) {
    const refs = (n.assets || []).filter((a) => a.type === 'image' && a.meta && a.meta.source === 'upload');
    const tiles = refs.map((a) =>
      '<span class="ref-tile"><img src="' + a.thumb + '" data-rf="' + a.id + '" alt="">' +
      '<button class="ref-x nodrag" data-act="rmref" data-rf="' + a.id + '" title="移除">×</button></span>').join('');
    return '<div class="ref-grid">' + tiles +
      '<button class="ref-add nodrag" data-act="upload" title="上传参考图"><span>+</span></button></div>' +
      (refs.length ? '' : '<div class="hintline" style="font-size:10.5px;padding:3px 0 0">可作垫图 / 风格参考，生成时自动融合</div>');
  }
  function assetGrid(n, opts) {
    let list = n.assets || [];
    if (opts && opts.hideUploads) list = list.filter((a) => !(a.meta && a.meta.source === 'upload'));
    if (!list.length) return '';
    const one = opts && opts.one;
    const acts = '<div class="ai-act">' +
      '<button data-aa="tl" title="加入时间轴">' + U.icon('timeline') + '</button>' +
      '<button data-aa="view" title="预览">' + U.icon('expand') + '</button>' +
      '<button data-aa="dl" title="下载">' + U.icon('download') + '</button>' +
      '<button data-aa="rm" title="删除">' + U.icon('trash') + '</button>' +
      '</div>';
    const html = list.map((a) => {
      if (a.type === 'image') {
        return '<div class="ass" data-asset="' + a.id + '"><img src="' + a.url + '" alt="">' + acts + '</div>';
      }
      if (a.type === 'video') {
        return '<div class="ass" data-asset="' + a.id + '">' +
          '<video src="' + (a.url || '') + '" poster="' + (a.poster || '') + '" muted loop autoplay playsinline></video>' +
          acts + '</div>';
      }
      return '';
    }).join('');
    return '<div class="ass-grid' + (one ? ' one' : '') + '">' + html + '</div>';
  }

  /* ---------------- 各类节点主体 ---------------- */
  const BODY = {
    text: function (n) {
      const d = n.data;
      return '<textarea class="nd nodrag" data-k="text" rows="4" placeholder="输入提示词 / 旁白文案…">' + U.esc(d.text || '') + '</textarea>' +
        '<div class="n-row"><label>用途</label>' +
        '<div class="seg" style="flex:1">' +
        ['提示词', '旁白', '字幕'].map((r) =>
          '<button class="nodrag' + (d.role === r ? ' on' : '') + '" data-role="' + r + '">' + r + '</button>').join('') +
        '</div></div>' +
        chips([['字数', String((d.text || '').length)]]);
    },

    script: function (n) {
      const d = n.data;
      const shots = d.shots || [];
      return '<textarea class="story-area nodrag" data-k="story" rows="3" placeholder="粘贴剧情梗概或剧本，AI 会自动拆成可拍的分镜表…">' + U.esc(d.story || '') + '</textarea>' +
        '<div class="n-row"><label>镜数</label>' +
        '<input class="inp nodrag" style="width:52px" type="number" min="1" max="12" data-k="shotCount" value="' + (d.shotCount || 6) + '">' +
        '<label style="margin-left:auto">共 ' + shots.length + ' 镜</label></div>' +
        (shots.length ?
          '<div class="shot-list">' + shots.map((s) =>
            '<div class="shot" data-shot="' + s.id + '">' +
            '<span class="idx">' + s.idx + '</span>' +
            '<div class="txt nodrag" contenteditable="true" data-shotk="desc">' + U.esc(s.desc) + '</div>' +
            '<span class="meta">' + U.esc(s.size) + '<br>' + U.esc(s.cam) + '</span>' +
            '</div>').join('') + '</div>'
          : '<div class="hintline" style="text-align:center;padding:14px 0 8px">尚未拆镜 · 点击下方按钮</div>') +
        '<button class="n-run nodrag" data-act="split">' + U.icon('magic') + 'AI 拆分镜</button>' +
        (shots.length ? '<button class="n-run sec nodrag" data-act="storyboard" style="margin-top:6px">' + U.icon('layers') + '批量排出关键帧节点</button>' : '');
    },

    image: function (n) {
      const d = n.data;
      return '<div class="n-sec"><div class="n-sec-t">提示词</div>' +
        '<textarea class="nd plain nodrag" data-k="prompt" rows="3" placeholder="描述画面：主体 + 环境 + 光线 + 镜头…">' + U.esc(d.prompt || '') + '</textarea></div>' +
        '<div class="n-sec"><div class="n-sec-t">参考图</div>' + refGrid(n) + '</div>' +
        '<div class="n-params">' +
          selChip('比例', 'ratio', RATIOS_LIST, d.ratio) +
          selChip('数量', 'count', [[1, '1'], [2, '2'], [3, '3'], [4, '4']], d.count || 1) +
        '</div>' +
        assetGrid(n, { hideUploads: true }) +
        '<button class="n-run nodrag" data-act="gen">' + U.icon('magic') + '生成图片</button>';
    },

    video: function (n) {
      const d = n.data;
      const mi = (G.MODELS.video.find((m) => m.id === d.model) || G.MODELS.video[0]);
      const inp = S.resolveInputs(n.id);
      const hasRef = inp.images.length > 0;
      return '<textarea class="nd nodrag" data-k="prompt" rows="3" placeholder="描述运动：' + (hasRef ? '让画面里的主体…' : '镜头主体 + 运动 + 氛围…') + '">' + U.esc(d.prompt || '') + '</textarea>' +
        chips([['模型', mi.name], ['时长', d.duration + 's'], ['运镜', d.motion], ['源头', hasRef ? '图生视频' : '文生视频']]) +
        assetGrid(n, { one: true }) +
        '<button class="n-run nodrag" data-act="gen">' + U.icon('magic') + '生成视频</button>' +
        '<div class="n-row" style="gap:5px"><button class="n-run sec nodrag" style="flex:1;margin-top:6px" data-act="upload">' + U.icon('upload') + '上传视频</button>' +
        '<button class="n-run sec nodrag" style="flex:1;margin-top:6px" data-act="toaudio">' + U.icon('audio') + '配音 / 配乐</button></div>';
    },

    audio: function (n) {
      const d = n.data;
      const list = n.assets || [];
      return '<div class="seg nodrag" style="margin-bottom:8px">' +
        [['music', '配乐'], ['speech', '旁白'], ['sfx', '音效']].map((t) =>
          '<button class="' + (d.type === t[0] ? 'on' : '') + '" data-atype="' + t[0] + '">' + t[1] + '</button>').join('') +
        '</div>' +
        '<textarea class="nd nodrag" data-k="prompt" rows="2" placeholder="' +
        (d.type === 'speech' ? '输入配音台词…' : d.type === 'music' ? '描述情绪：温暖 / 紧张 / 宏大…' : '描述音效：风声、转场、门响…') + '">' + U.esc(d.prompt || '') + '</textarea>' +
        chips([['模型', (G.MODELS.audio.find((m) => m.id === d.model) || G.MODELS.audio[0]).name],
        ['时长', d.duration + 's'], ['音色', d.type === 'speech' ? d.voice : '—']]) +
        (list.length ? list.map((a) =>
          '<div class="audio-row" data-asset="' + a.id + '">' +
          '<button class="play nodrag" data-act="playaudio">' + U.icon('play') + '</button>' +
          '<span class="wave">' + (a.wave || []).map((v) => '<i style="height:' + Math.round(v * 100) + '%"></i>').join('') + '</span>' +
          '<span class="dur">' + (a.duration || 0) + 's</span></div>').join('')
          : '') +
        '<button class="n-run nodrag" data-act="gen">' + U.icon('magic') + '生成音频</button>';
    },

    frame: function (n) { return ''; }
  };

  /* ---------------- 渲染单个节点 ---------------- */
  function renderNode(n) {
    const m = meta(n.type);
    const el = U.el('div', 'node n-' + n.type + (n.type === 'frame' ? ' frame' : ''));
    el.dataset.id = n.id;
    el.dataset.type = n.type;
    el.dataset.rev = String(n._rev || 0);
    el.style.left = (n.x || 0) + 'px';
    el.style.top = (n.y || 0) + 'px';

    if (n.type === 'frame') {
      el.style.width = (n.w || m.w) + 'px';
      el.style.height = (n.h || 220) + 'px';
      el.innerHTML =
        '<div class="n-head"><span class="f-label">' + U.icon('group') + '</span>' +
        '<span class="f-label" style="flex:1" data-k="title">' + U.esc(n.title || '流程组') + '</span>' +
        '<button class="n-act del nodrag" data-act="del">' + U.icon('trash') + '</button></div>';
      return el;
    }

    el.style.width = nodeWidth(n) + 'px';
    el.innerHTML =
      '<div class="n-head">' +
      '<span class="n-badge" style="background:' + m.color + '22;color:' + m.color + '">' + U.icon(m.icon) + '</span>' +
      '<span class="n-kind">' + m.name + '</span>' +
      '<span class="n-title">' + U.esc(n.title || autoTitle(n)) + '</span>' +
      '<button class="n-act nodrag" data-act="collapse" title="折叠">' + U.icon(n.collapsed ? 'plus' : 'minus') + '</button>' +
      '<button class="n-act del nodrag" data-act="del" title="删除">' + U.icon('trash') + '</button>' +
      '</div>' +
      (n.collapsed ? '' : '<div class="n-body">' + (BODY[n.type] ? BODY[n.type](n) : '') + '</div>') +
      (n.status === 'running' ? '<span class="n-status" data-status>生成中…</span>' : '') +
      (n.status === 'error' ? '<span class="n-status err" data-status>失败</span>' : '');

    // 端口
    (m.portsIn || []).forEach((p, i) => {
      const has = S.edgesTo(n.id).some((e) => e.toPort === p.id);
      const pt = U.el('div', 'port in' + (has ? ' filled' : ''));
      pt.dataset.port = p.id; pt.dataset.dir = 'in';
      pt.style.top = portTop(n, i);
      pt.style.setProperty('--port-c', m.color);
      pt.title = '输入：' + p.name;
      pt.innerHTML = '<span class="port-tip in">' + p.name + '</span>';
      el.appendChild(pt);
    });
    (m.portsOut || []).forEach((p, i) => {
      const pt = U.el('div', 'port out filled');
      pt.dataset.port = p.id; pt.dataset.dir = 'out';
      pt.style.top = portTop(n, i);
      pt.style.setProperty('--port-c', m.color);
      pt.title = '输出：' + p.name;
      pt.innerHTML = '<span class="port-tip out">' + p.name + '</span>';
      el.appendChild(pt);
    });

    return el;
  }
  function portTop(n, i) {
    return (n.collapsed ? 10 : 36 + i * 22) + 'px';
  }

  /* ---------------- 事件代理：节点内部交互 ---------------- */
  function bindNodeEvents(el) {
    const id = el.dataset.id;

    // 文本 / 数字输入（静默更新，不触发重绘）
    el.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.k && t.tagName === 'TEXTAREA') {
        S.updateData(id, { [t.dataset.k]: t.value }, { silent: true });
        syncTitle(id);
        return;
      }
      if (t.dataset.k === 'shotCount') {
        S.updateData(id, { shotCount: U.clamp(parseInt(t.value || '6', 10), 1, 12) }, { silent: true });
      }
    });

    el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.tagName === 'SELECT' && t.dataset.k) {
        const v = t.dataset.k === 'count' ? parseInt(t.value || '1', 10) : t.value;
        S.updateData(id, { [t.dataset.k]: v }, { silent: true });
        return;
      }
      if (t.dataset.k === 'shotCount') S.updateData(id, { shotCount: U.clamp(parseInt(t.value || '6', 10), 1, 12) }, { silent: true });
    });

    // 双击文本区不冒泡到画布（避免新建节点）
    el.addEventListener('dblclick', (e) => e.stopPropagation());

    el.addEventListener('click', (e) => {
      const aaBtn = e.target.closest('[data-aa]');
      if (aaBtn) {
        e.stopPropagation();
        assetAction(id, aaBtn.dataset.aa, aaBtn.closest('[data-asset]').dataset.asset);
        return;
      }
      const btn = e.target.closest('[data-act],[data-role],[data-atype]');
      const n = S.node(id);
      if (!n || !btn) return;
      e.stopPropagation();

      if (btn.dataset.role) {
        S.updateData(id, { role: btn.dataset.role });
        return;
      }
      if (btn.dataset.atype) {
        S.updateData(id, { type: btn.dataset.atype });
        return;
      }
      const act = btn.dataset.act;
      if (act === 'del') { S.pushHistory(); S.removeNode(id, { noHistory: true }); }
      else if (act === 'collapse') S.updateNode(id, { collapsed: !n.collapsed }, {});
      else if (act === 'gen') run(id);
      else if (act === 'split') splitShots(id);
      else if (act === 'storyboard') storyboard(id);
      else if (act === 'upload') uploadAsset(id);
      else if (act === 'rmref') S.removeAsset(id, btn.dataset.rf);
      else if (act === 'tovideo') forkTo(id, 'video');
      else if (act === 'toaudio') forkTo(id, 'audio');
      else if (act === 'playaudio') playAsset(n, n.assets[0]);
    });

    // 分镜描述编辑
    el.addEventListener('focusout', (e) => {
      const cell = e.target.closest('[data-shotk]');
      if (!cell) return;
      const row = cell.closest('[data-shot]');
      const n = S.node(id);
      if (!n || !row) return;
      const sid = row.dataset.shot;
      const shots = (n.data.shots || []).map((s) =>
        s.id === sid ? Object.assign({}, s, { desc: cell.textContent.trim() }) : s);
      S.updateData(id, { shots: shots }, { silent: true });
    });

    // 标题编辑
    el.addEventListener('focusout', (e) => {
      if (e.target.dataset.k !== 'title') return;
      S.updateNode(id, { title: e.target.textContent.trim() || autoTitle(S.node(id)) }, { silent: true });
    });
  }

  function assetAction(nodeId, act, assetId) {
    const n = S.node(nodeId);
    if (!n) return;
    const a = (n.assets || []).find((x) => x.id === assetId);
    if (!a) return;
    if (act === 'rm') S.removeAsset(nodeId, assetId);
    else if (act === 'tl') { if (S.tlAdd(nodeId, assetId)) U.toast('已加入时间轴', 'ok'); }
    else if (act === 'view') SF.Timeline.previewAsset(a);
    else if (act === 'dl') {
      const name = (n.title || a.type) + (a.type === 'video' ? '.webm' : '.jpg');
      if (a.type === 'image') { const l = document.createElement('a'); l.href = a.url; l.download = name; l.click(); }
      else fetch(a.url).then((r) => r.blob()).then((b) => U.download(name, b));
    }
  }

  function syncTitle(id) {
    const n = S.node(id);
    if (!n) return;
    const el = document.querySelector('.node[data-id="' + id + '"] .n-title');
    if (!el || document.activeElement === el) return;
    if (n._titleManual) return;
    el.textContent = autoTitle(n);
  }

  /* ---------------- 执行逻辑 ---------------- */
  async function run(id, optSilent) {
    const n = S.node(id);
    if (!n) return;
    const d = n.data || {};
    setStatus(id, 'running');
    try {
      if (n.type === 'image') {
        const inp = S.resolveInputs(id);
        const prompt = [d.prompt, inp.text].filter(Boolean).join(' ').trim();
        const ownRef = (n.assets || []).find((a) => a.type === 'image' && a.meta && a.meta.source === 'upload');
        const ref = ownRef || inp.images[0];
        const out = await G.image({
          prompt: prompt || '电影感画面', model: d.model, ratio: d.ratio,
          count: d.count, seed: d.seed,
          refUrl: ref ? ref.url : null, refMode: d.refMode
        }, (p, label) => setProgress(id, p, label));
        out.forEach((a) => S.addAsset(id, a));
        if (!optSilent) U.toast('图片生成完成（' + out.length + ' 张）', 'ok');
      } else if (n.type === 'video') {
        const inp = S.resolveInputs(id);
        const prompt = [d.prompt, inp.text].filter(Boolean).join(' ').trim();
        const ref = inp.images[0];
        const out = await G.video({
          prompt: prompt || '镜头缓缓推进', model: d.model, duration: d.duration,
          motion: d.motion, ratio: d.ratio, seed: d.seed, refUrl: ref ? ref.url : null
        }, (p, label) => setProgress(id, p, label));
        out.forEach((a) => S.addAsset(id, a));
        if (!optSilent) {
          if (out[0] && out[0].meta && out[0].meta.fallback) U.toast('当前浏览器不支持录制，已输出封面帧', 'err', 3200);
          else U.toast('视频生成完成 · ' + d.duration + 's', 'ok');
        }
      } else if (n.type === 'audio') {
        const inp = S.resolveInputs(id);
        const prompt = [d.prompt, inp.text].filter(Boolean).join(' ').trim();
        const out = await G.audio({
          prompt: prompt || '温暖治愈', type: d.type, duration: d.duration,
          voice: d.voice, model: d.model, seed: d.seed
        }, (p, label) => setProgress(id, p, label));
        out.forEach((a) => S.addAsset(id, a));
        if (!optSilent) U.toast('音频生成完成', 'ok');
      } else if (n.type === 'script') {
        await splitShots(id);
      } else {
        U.toast('文本节点无需生成', 'info');
      }
      setStatus(id, '');
    } catch (err) {
      console.error(err);
      setStatus(id, 'error');
      if (!optSilent) U.toast('生成失败：' + (err && err.message ? err.message : '未知错误'), 'err', 3600);
      setTimeout(() => setStatus(id, ''), 3000);
    }
  }

  function setStatus(id, st) {
    const n = S.node(id);
    if (!n) return;
    n.status = st;
    n._rev = (n._rev || 0) + 1;
    S.emit('node:status', n);
  }
  function setProgress(id, p, label) {
    const tag = document.querySelector('.node[data-id="' + id + '"] [data-status]');
    if (tag) tag.textContent = label || (Math.round(p * 100) + '%');
    const sk = document.querySelector('.node[data-id="' + id + '"] .ass.running .stripe');
    if (sk) sk.style.width = Math.round(p * 100) + '%';
  }

  async function splitShots(id) {
    const n = S.node(id);
    if (!n) return;
    const inp = S.resolveInputs(id);
    const story = [n.data.story, inp.text].filter(Boolean).join('\n').trim();
    if (!story) { U.toast('请先填写剧情梗概，或连入一个文本/脚本节点', 'err'); return; }
    setStatus(id, 'running');
    const shots = await G.shots(story, { count: n.data.shotCount || 6 }, (p, l) => setProgress(id, p, l));
    S.pushHistory();
    n._rev = (n._rev || 0) + 1;
    S.updateData(id, { shots: shots }, { noHistory: true });
    setStatus(id, '');
    U.toast('已拆出 ' + shots.length + ' 个分镜', 'ok');
  }

  /* 批量排出关键帧：为每个分镜生成一个图片节点并连线 */
  function storyboard(id) {
    const n = S.node(id);
    if (!n || !(n.data.shots || []).length) return;
    const SH = 150;
    S.pushHistory();
    const baseX = n.x + nodeWidth(n) + 160;
    const created = [];
    n.data.shots.forEach((s, i) => {
      const nn = S.addNode({
        type: 'image',
        x: baseX,
        y: n.y + i * SH,
        title: ('镜头 ' + s.idx),
        data: {
          prompt: (s.full || s.desc) + '，' + s.size + '，' + s.cam + '，电影感画面',
          model: 'seedream5', ratio: '16:9', count: 1, style: '电影感', seed: 42 + i * 13, refMode: 'style'
        }
      }, { noHistory: true });
      created.push(nn);
      S.addEdge(id, 'shots', nn.id, 'prompt', { noHistory: true });
    });
    S.emit('graph');
    U.toast('已排出 ' + created.length + ' 个关键帧节点，可逐个或批量生成', 'ok', 3000);
  }

  async function uploadAsset(id) {
    const n = S.node(id);
    if (!n) return;
    try {
      if (n.type === 'image') {
        const r = await U.pickImage();
        S.addAsset(id, { type: 'image', url: r.url, thumb: r.url, w: 0, h: 0, meta: { name: r.name, source: 'upload' } });
      } else if (n.type === 'video') {
        const r = await U.pickVideo();
        S.addAsset(id, { type: 'video', url: r.url, poster: '', duration: 0, meta: { name: r.name, source: 'upload' } });
      }
      U.toast('素材已上传', 'ok');
    } catch (e) { /* 用户取消 */ }
  }

  /* 下游派生：图片→视频、视频→音频 */
  function forkTo(id, type) {
    const n = S.node(id);
    if (!n || !(n.assets || []).length) { U.toast('请先在该节点生成产物', 'err'); return; }
    let x = n.x + nodeWidth(n) + 150, y = n.y;
    const exist = S.state.nodes.filter((m) => m.type === type);
    if (exist.length) y = exist[exist.length - 1].y + 40;
    S.pushHistory();
    if (type === 'video') {
      const nn = S.addNode({
        type: 'video', x: x, y: y, title: (n.title || '镜头') + ' · 动态',
        data: { prompt: (n.data.prompt || '') + '，画面缓缓运动', model: 'kling3', duration: 4, motion: '推近', ratio: n.data.ratio || '16:9', seed: 7 }
      }, { noHistory: true });
      S.addEdge(id, 'image', nn.id, 'image', { noHistory: true });
      U.toast('已创建视频节点并取用该图作为首帧', 'ok');
    } else {
      const nn = S.addNode({
        type: 'audio', x: x, y: y, title: '配乐 · ' + (n.title || ''),
        data: { type: 'music', prompt: (n.data.prompt || '') + ' 的氛围配乐', duration: 8, voice: '男声', model: 'mureka', seed: 3 }
      }, { noHistory: true });
      S.addEdge(id, 'video', nn.id, 'video', { noHistory: true });
      U.toast('已创建音频节点', 'ok');
    }
  }

  function playAsset(node, asset) {
    if (!asset) return;
    SF.Timeline.previewAsset(asset);
  }

  SF.Nodes = {
    TYPES: TYPES, meta: meta, render: renderNode, bind: bindNodeEvents,
    run: run, portPos: portPos, nodeWidth: nodeWidth, autoTitle: autoTitle,
    storyboard: storyboard, splitShots: splitShots
  };
})(window);

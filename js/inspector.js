/* ============ 右侧属性面板 ============ */
(function (global) {
  'use strict';
  const SF = global.SF, U = SF.util, S = SF.store, N = SF.Nodes, G = SF.gen;

  const I = {};
  let body, title;

  function sel(label, opts, val, key) {
    return '<select class="inp" data-p="' + key + '">' +
      opts.map((o) => {
        const v = Array.isArray(o) ? o[0] : o.id || o;
        const t = Array.isArray(o) ? o[1] : o.name || o;
        return '<option value="' + U.esc(v) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + U.esc(t) + '</option>';
      }).join('') + '</select>';
  }
  function num(val, key, min, max, step) {
    return '<input class="inp" type="number" data-p="' + key + '" value="' + val + '"' +
      (min != null ? ' min="' + min + '"' : '') + (max != null ? ' max="' + max + '"' : '') +
      (step != null ? ' step="' + step + '"' : '') + '>';
  }
  function f(label, ctrl, hint) {
    return '<div class="field"><label>' + label + '</label>' + ctrl + (hint ? '<div class="hintline">' + hint + '</div>' : '') + '</div>';
  }
  function segBar(opts, val, key) {
    return '<div class="seg" data-p="' + key + '">' + opts.map((o) => {
      const v = Array.isArray(o) ? o[0] : o.id;
      const t = Array.isArray(o) ? o[1] : o.name;
      return '<button type="button" data-v="' + U.esc(v) + '" class="' + (String(v) === String(val) ? 'on' : '') + '">' + t + '</button>';
    }).join('') + '</div>';
  }

  const PANELS = {
    text: (n) => f('文本内容', '<textarea class="inp" rows="5" data-p="text">' + U.esc(n.data.text || '') + '</textarea>') +
      f('用途归类', segBar([['提示词', '提示词'], ['旁白', '旁白'], ['字幕', '字幕']], n.data.role, 'role'),
        n.data.role === '旁白' ? '下游音频节点会把它当配音台词' : '下游图片/视频节点会把它并入提示词'),
    script: (n) => f('剧情梗概', '<textarea class="inp" rows="4" data-p="story">' + U.esc(n.data.story || '') + '</textarea>') +
      f('目标镜数', num(n.data.shotCount || 6, 'shotCount', 1, 12, 1), 'AI 会按起承转合重新分配景别'),
      image: (n) => f('画面提示词', '<textarea class="inp" rows="4" data-p="prompt">' + U.esc(n.data.prompt || '') + '</textarea>',
        '主体 + 环境 + 光线 + 镜头语言，越具体越稳') +
      '<div class="grid2">' +
      f('画幅', sel([['16:9', '16:9 横'], ['9:16', '9:16 竖'], ['1:1', '1:1 方'], ['4:3', '4:3 横'], ['3:4', '3:4 竖'], ['3:2', '3:2 横'], ['2:3', '2:3 竖'], ['21:9', '21:9 宽银幕']], n.data.ratio, 'ratio')) +
      f('数量', num(n.data.count || 1, 'count', 1, 4, 1)) +
      f('随机种子', num(n.data.seed || 42, 'seed', 1, 99999, 1), '同种子可复现') +
      f('参考图用法', sel([['style', '作垫图融合'], ['ignore', '仅作提示参考'], ['blend', '保留构图']], n.data.refMode, 'refMode')) +
      '</div>',
    video: (n) => f('运动描述', '<textarea class="inp" rows="3" data-p="prompt">' + U.esc(n.data.prompt || '') + '</textarea>',
      '描述镜头里发生什么运动；连了首帧则为图生视频') +
      '<div class="grid2">' +
      f('模型', sel(G.MODELS.video, n.data.model, 'model')) +
      f('画幅', sel([['16:9', '16:9'], ['9:16', '9:16'], ['1:1', '1:1']], n.data.ratio, 'ratio')) +
      f('时长', sel([2, 3, 4, 5, 8].map((d) => [d, d + ' 秒']), n.data.duration, 'duration')) +
      f('随机种子', num(n.data.seed || 7, 'seed', 1, 99999, 1)) +
      '</div>' +
      f('运镜', sel(G.CAMERAS.map((c) => [c, c]), n.data.motion, 'motion')),
    audio: (n) => f('类型', segBar([['music', '配乐'], ['speech', '旁白'], ['sfx', '音效']], n.data.type, 'type'),
      '旁白模式下输出带语调节奏的配音') +
      f('描述 / 台词', '<textarea class="inp" rows="3" data-p="prompt">' + U.esc(n.data.prompt || '') + '</textarea>') +
      '<div class="grid2">' +
      f('模型', sel(G.MODELS.audio, n.data.model, 'model')) +
      f('时长', num(n.data.duration || 8, 'duration', 2, 30, 1)) +
      '</div>' +
      (n.data.type === 'speech' ? f('音色', segBar([['男声', '男声'], ['女声', '女声']], n.data.voice, 'voice')) : '')
  };

  I.render = function () {
    if (!body) { body = U.$('#rpBody'); title = U.$('#rpTitle'); }
    const sel = S.selectedNodes();
    if (!sel.length) {
      title.textContent = '属性';
      body.innerHTML = emptyState();
      return;
    }
    if (sel.length > 1) {
      title.textContent = '已选中 ' + sel.length + ' 个节点';
      body.innerHTML = multiState(sel);
      bindMulti(sel);
      return;
    }
    const n = sel[0];
    const m = N.meta(n.type);
    title.textContent = m.name + '节点';
    const assets = n.assets || [];
    let html = '<div class="rp-sec"><div class="kvlist">' +
      '<div><span>类型</span><b>' + m.name + '</b></div>' +
      '<div><span>坐标</span><b>' + Math.round(n.x) + ', ' + Math.round(n.y) + '</b></div>' +
      '<div><span>产物</span><b>' + assets.length + ' 个</b></div>' +
      ((m.portsIn.length || m.portsOut.length) ? '<div><span>端口</span><b>' +
        m.portsIn.map((p) => p.name).join('·') + (m.portsIn.length && m.portsOut.length ? ' → ' : '') +
        m.portsOut.map((p) => p.name).join('·') + '</b></div>' : '') +
      '</div></div>';

    html += '<div class="rp-sec"><h6>参数</h6>' + (PANELS[n.type] ? PANELS[n.type](n) : '<div class="hintline">该节点无额外参数</div>') + '</div>';

    html += '<div class="rp-sec"><h6>操作</h6>' +
      '<button class="btn primary block" data-do="run">' + U.icon('magic') + '运行此节点</button>' +
      '<div style="height:6px"></div>' +
      '<button class="btn ghost block sm" data-do="runnext">' + U.icon('play') + '向后整链运行</button>' +
      '<div style="height:6px"></div>' +
      '<button class="btn ghost block sm" data-do="dup">' + U.icon('copy') + '复制副本</button>' +
      '<div style="height:6px"></div>' +
      '<button class="btn ghost block sm" data-do="del" style="color:var(--err)">' + U.icon('trash') + '删除节点</button>' +
      '</div>';

    if (assets.length && n.type !== 'audio') {
      html += '<div class="rp-sec"><h6>产物管理</h6>' +
        assets.map((a, i) => '<div class="kvlist" style="margin-bottom:6px"><div>' +
          '<span>#' + (i + 1) + ' ' + (a.type === 'video' ? (a.meta.duration + 's') : 'image') + '</span>' +
          '<span><button class="mini" data-a="tl" data-asset="' + a.id + '" title="加入时间轴">⏱</button> ' +
          '<button class="mini" data-a="dl" data-asset="' + a.id + '" title="下载">⤓</button> ' +
          '<button class="mini" data-a="rm" data-asset="' + a.id + '" title="删除">×</button></span></div></div>').join('') +
        '</div>';
    }
    if (assets.length && n.type === 'audio') {
      html += '<div class="rp-sec"><h6>产物管理</h6>' +
        assets.map((a, i) => '<div class="kvlist" style="margin-bottom:6px"><div>' +
          '<span>#' + (i + 1) + ' ' + (a.duration || 0) + 's</span>' +
          '<span><button class="mini" data-a="play" data-asset="' + a.id + '" title="试听">▶</button> ' +
          '<button class="mini" data-a="dl" data-asset="' + a.id + '" title="下载">⤓</button> ' +
          '<button class="mini" data-a="rm" data-asset="' + a.id + '" title="删除">×</button></span></div></div>').join('') +
        '</div>';
    }
    body.innerHTML = html;
    bindFields(n);
  };

  function emptyState() {
    const st = S.state;
    return '<div class="rp-empty">' + U.icon('target') +
      '<div>选中一个节点<br>在这里精调它的全部参数</div></div>' +
      '<div class="rp-sec" style="margin-top:18px"><h6>项目概况</h6><div class="kvlist">' +
      '<div><span>节点总数</span><b>' + st.nodes.length + '</b></div>' +
      '<div><span>连线</span><b>' + st.edges.length + '</b></div>' +
      '<div><span>已生成产物</span><b>' + S.allAssets().length + '</b></div>' +
      '<div><span>时间轴片段</span><b>' + st.timeline.length + '</b></div>' +
      '</div></div>' +
      '<div class="rp-sec"><h6>快捷键</h6><div class="shortcut-list">' +
      [['新建节点', '双击画布'], ['平移画布', '空格拖动'], ['缩放', '滚轮'], ['框选', '拖动空白'],
      ['复制 / 粘贴', 'Ctrl+C / V'], ['快速复制', 'Ctrl+D'], ['打包成组', 'Ctrl+G'],
      ['删除', 'Delete'], ['撤销 / 重做', 'Ctrl+Z / ⇧Z'], ['适应画布', 'F'], ['整链运行', 'Ctrl+Enter']]
        .map((s) => '<div><span>' + s[0] + '</span><kbd>' + s[1] + '</kbd></div>').join('') +
      '</div></div>';
  }

  function multiState(sel) {
    const types = {};
    sel.forEach((n) => types[N.meta(n.type).name] = (types[N.meta(n.type).name] || 0) + 1);
    return '<div class="rp-sec"><div class="kvlist">' +
      Object.keys(types).map((k) => '<div><span>' + k + '</span><b>' + types[k] + '</b></div>').join('') +
      '</div></div>' +
      '<div class="rp-sec"><h6>批量操作</h6>' +
      '<button class="btn primary block" data-do="runall">' + U.icon('magic') + '批量生成 ' + sel.length + ' 个节点</button>' +
      '<div style="height:6px"></div>' +
      '<button class="btn ghost block sm" data-do="frame">' + U.icon('group') + '打包为流程组</button>' +
      '<div style="height:6px"></div>' +
      '<button class="btn ghost block sm" data-do="alignv">' + U.icon('layers') + '按画布顺序纵向排列</button>' +
      '<div style="height:6px"></div>' +
      '<button class="btn ghost block sm" data-do="dup">' + U.icon('copy') + '复制全部副本</button>' +
      '<div style="height:6px"></div>' +
      '<button class="btn ghost block sm" data-do="del" style="color:var(--err)">' + U.icon('trash') + '删除全部</button>' +
      '</div>';
  }

  function bindMulti(sel) {
    U.$$('[data-do]', body).forEach((b) => b.onclick = () => {
      const act = b.dataset.do;
      if (act === 'runall') SF.App.runNodes(sel.map((n) => n.id));
      else if (act === 'frame') SF.Canvas.wrapFrame(null);
      else if (act === 'dup') SF.Canvas.duplicateSelected();
      else if (act === 'del') SF.Canvas.delSelected();
      else if (act === 'alignv') {
        S.pushHistory();
        sel.slice().sort((a, b) => a.y - b.y || a.x - b.x).forEach((n, i) => {
          S.updateNode(n.id, { x: sel[0].x, y: sel[0].y + i * 26 }, { silent: true });
        });
        SF.Canvas.render();
      }
    });
  }

  function bindFields(n) {
    U.$$('[data-p]', body).forEach((ctrl) => {
      const key = ctrl.dataset.p;
      let patch = {};
      if (ctrl.tagName === 'SELECT') {
        ctrl.onchange = () => {
          const raw = ctrl.value;
          const numKeys = ['count', 'seed', 'shotCount', 'duration'];
          patch[key] = numKeys.indexOf(key) >= 0 ? Number(raw) : raw;
          S.pushHistory();
          S.updateData(n.id, patch);
          n._rev = (n._rev || 0) + 1;
          SF.Canvas.render();
        };
      } else if (ctrl.tagName === 'INPUT' && ctrl.type === 'number') {
        ctrl.onchange = () => {
          patch[key] = Number(ctrl.value);
          S.pushHistory();
          S.updateData(n.id, patch);
          n._rev = (n._rev || 0) + 1;
          SF.Canvas.render();
        };
      } else if (ctrl.tagName === 'TEXTAREA') {
        // 面板里打字时不重绘画布，直接把值同步给节点上的同名输入框，避免焦点与光标被打断
        ctrl.oninput = U.debounce(() => {
          patch[key] = ctrl.value;
          S.updateData(n.id, patch, { silent: true });
          const target = document.querySelector('.node[data-id="' + n.id + '"] [data-k="' + key + '"]');
          if (target && target.value !== ctrl.value) target.value = ctrl.value;
        }, 450);
      } else if (ctrl.classList.contains('seg')) {
        U.$$('button', ctrl).forEach((b) => b.onclick = () => {
          S.pushHistory();
          S.updateData(n.id, { [key]: b.dataset.v });
          n._rev = (n._rev || 0) + 1;
          SF.Canvas.render();
        });
      }
    });

    U.$$('[data-do]', body).forEach((b) => b.onclick = () => {
      const act = b.dataset.do;
      if (act === 'run') N.run(n.id);
      else if (act === 'runnext') SF.App.runFrom(n.id);
      else if (act === 'dup') { SF.Canvas.copySel(); SF.Canvas.paste(); }
      else if (act === 'del') SF.Canvas.delSelected();
    });

    U.$$('[data-a]', body).forEach((b) => b.onclick = () => {
      const asset = (n.assets || []).find((a) => a.id === b.dataset.asset);
      if (!asset) return;
      if (b.dataset.a === 'rm') S.removeAsset(n.id, asset.id);
      else if (b.dataset.a === 'dl') {
        if (asset.type === 'image') U.download((n.title || 'image') + '.jpg', asset.url);
        else {
          fetch(asset.url).then((r) => r.blob()).then((bl) => {
            U.download((n.title || asset.type) + (asset.type === 'video' ? '.webm' : '.wav'), bl);
          });
        }
      } else if (b.dataset.a === 'tl') {
        if (S.tlAdd(n.id, asset.id)) U.toast('已加入时间轴', 'ok');
      } else if (b.dataset.a === 'play') SF.Timeline.previewAsset(asset);
    });
  }

  SF.Inspector = I;
})(window);

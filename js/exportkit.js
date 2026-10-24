/* ============ 导出工具集：素材打包 ZIP / SRT 字幕 / 画布截图 PNG ============ */
(function (global) {
  'use strict';
  const SF = global.SF, U = SF.util, S = SF.store, N = SF.Nodes;

  const K = {};

  /* ================= CRC32 ================= */
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  const TE = new TextEncoder();

  function dosStamp(d) {
    const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
    const date = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    return { time: time, date: date };
  }

  /* ZIP（store 无压缩模式）打包：files = [{name, data:Uint8Array}] -> Blob */
  function buildZip(files) {
    const parts = [];
    const central = [];
    let offset = 0;
    const st = dosStamp(new Date());

    files.forEach((f) => {
      const nameBytes = TE.encode(f.name);
      const data = f.data;
      const crc = crc32(data);

      const lo = new Uint8Array(30);
      const lv = new DataView(lo.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);   // UTF-8 文件名
      lv.setUint16(8, 0, true);        // store
      lv.setUint16(10, st.time, true);
      lv.setUint16(12, st.date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      parts.push(lo, nameBytes, data);

      const cd = new Uint8Array(46);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, st.time, true);
      cv.setUint16(14, st.date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      central.push({ head: cd, name: nameBytes });

      offset += 30 + nameBytes.length + data.length;
    });

    let cdSize = 0;
    central.forEach((c) => { cdSize += c.head.length + c.name.length; });
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    const out = [];
    parts.forEach((p) => out.push(p));
    central.forEach((c) => { out.push(c.head); out.push(c.name); });
    out.push(eocd);
    return new Blob(out, { type: 'application/zip' });
  }

  function safeName(s, fb) {
    const t = String(s || '').replace(/[\\/:*?"<>|\r\n\t]+/g, '_').replace(/\s+/g, ' ').trim();
    return (t || fb).slice(0, 60);
  }

  function extOf(asset, url) {
    const m = /^data:([a-zA-Z0-9.+-]+)\/([a-zA-Z0-9.+-]+)/.exec(url || '');
    if (m) {
      const sub = m[2].toLowerCase();
      if (sub === 'jpeg' || sub === 'jpg') return 'jpg';
      if (sub === 'png') return 'png';
      if (sub === 'webp') return 'webp';
      if (sub === 'webm') return 'webm';
      if (sub === 'mp4') return 'mp4';
      if (sub === 'mpeg' || sub === 'mp3') return 'mp3';
      if (sub === 'wav' || sub === 'x-wav' || sub === 'wave') return 'wav';
      return sub;
    }
    if (asset.type === 'image') return 'png';
    if (asset.type === 'video') return 'webm';
    return 'wav';
  }

  async function fetchBytes(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return new Uint8Array(await res.arrayBuffer());
  }

  /* ================= 1. 素材打包 ZIP ================= */
  K.exportAssetsZip = async function () {
    const all = S.allAssets();
    if (!all.length) { U.toast('还没有任何可打包的产物', 'err'); return; }

    const files = [];
    let done = 0, fail = 0;

    for (let i = 0; i < all.length; i++) {
      const item = all[i];
      const a = item.asset;
      if (!a.url) { fail++; continue; }
      // 目标根目录按类型分文件夹，方便后续剪辑流程
      const dir = a.type === 'image' ? 'images' : (a.type === 'video' ? 'videos' : 'audios');
      const base = (item.node && item.node.title) ? item.node.title : ('node-' + item.node.id.slice(-4));
      const name = dir + '/' + String(i + 1).padStart(2, '0') + '_' + safeName(base, a.type) + '.' + extOf(a, a.url);
      U.toast('打包中 ' + (i + 1) + '/' + all.length, 'info', 1200);
      try {
        const data = await fetchBytes(a.url);
        files.push({ name: name, data: data });
        done++;
      } catch (e) { fail++; }
      // 封面帧作为视频的配套 JPG 一起打包
      if (a.type === 'video' && a.poster) {
        try {
          files.push({
            name: dir + '/' + String(i + 1).padStart(2, '0') + '_' + safeName(base, 'poster') + '_poster.png',
            data: await fetchBytes(a.poster)
          });
        } catch (e) { /* 封面可选 */ }
      }
    }

    if (!files.length) { U.toast('没有成功读取到素材数据', 'err'); return; }

    // 附一份清单，方便对着时间轴找素材
    const csv = ['\uFEFF序号,类型,来源节点,文件名,时长(秒),模型'];
    all.forEach((x, i) => {
      csv.push([i + 1, x.asset.type, '"' + String((x.node && x.node.title) || '').replace(/"/g, '""') + '"',
        '"' + (files.find((f) => f.name.indexOf(String(i + 1).padStart(2, '0') + '_') >= 0) || {}).name + '"',
        (x.asset.duration || ''), (x.asset.meta && x.asset.meta.model) || ''].join(','));
    });
    files.push({ name: '素材清单.csv', data: TE.encode('\uFEFF' + csv.slice(1).join('\n')) });

    // 顺手带上分镜表
    const srt = K.buildSRT();
    if (srt) files.push({ name: '字幕.srt', data: TE.encode(srt) });

    U.download((S.state.project.name || 'storycanvas') + '-素材包.zip', buildZip(files));
    U.toast('已打包 ' + done + ' 个素材' + (fail ? '（' + fail + ' 个读取失败）' : ''), 'ok', 3200);
  };

  /* ================= 2. SRT 字幕 ================= */
  function fmtTime(sec) {
    const ms = Math.round((sec % 1) * 1000);
    const s = Math.floor(sec) % 60;
    const m = Math.floor(sec / 60) % 60;
    const h = Math.floor(sec / 3600);
    const p = (v, n) => String(v).padStart(n, '0');
    return p(h, 2) + ':' + p(m, 2) + ':' + p(s, 2) + ',' + String(ms).padStart(3, '0');
  }

  /* 收集可用于配音/字幕的旁白文案（脚本节点的上游文本优先） */
  function narrationFor(scriptNode) {
    const inp = S.resolveInputs(scriptNode.id);
    const own = scriptNode.data && scriptNode.data.story ? scriptNode.data.story : '';
    const raw = (inp.text || '').trim() || own;
    if (!raw) return [];
    // 按句中/句末标点切句，过滤过短片段
    return raw.split(/[\n。！？!?；;]+/).map((s) => s.trim()).filter((s) => s.length >= 2);
  }

  K.buildSRT = function () {
    const scripts = S.state.nodes.filter((n) => n.type === 'script' && (n.data.shots || []).length);
    if (!scripts.length) return '';

    let out = '', t = 0, idx = 0;
    scripts.forEach((n) => {
      const lines = narrationFor(n);
      (n.data.shots || []).forEach((s, i) => {
        const dur = Number(s.dur) || 3;
        let text = lines[i] || '';
        if (!text) text = s.desc || '';
        if (!text) { t += dur; return; }
        idx++;
        out += idx + '\n' + fmtTime(t) + ' --> ' + fmtTime(t + dur) + '\n' + text + '\n\n';
        t += dur;
      });
    });
    return out;
  };

  K.exportSRT = function () {
    const srt = K.buildSRT();
    if (!srt) { U.toast('还没有已拆镜的脚本节点，无法生成字幕', 'err'); return; }
    U.download((S.state.project.name || 'storycanvas') + '.srt', srt, 'text/plain;charset=utf-8');
    U.toast('字幕文件已导出', 'ok');
  };

  /* ================= 3. 画布截图 PNG ================= */
  function colorOf(n) {
    const c = N.meta(n.type).color;
    if (!c || c.indexOf('var(') !== 0) return c || '#8b5cf6';
    const name = c.slice(4, c.length - 1);
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#8b5cf6';
  }

  function nodeBox(n) {
    const el = document.querySelector('.node[data-id="' + n.id + '"]');
    const w = n.type === 'frame' ? (n.w || 420) : N.nodeWidth(n);
    let h = el ? el.offsetHeight : 180;
    if (n.type === 'frame') h = n.h || (el ? el.offsetHeight : 260);
    if (n.collapsed) h = 34;
    return { x: n.x, y: n.y, w: w, h: h };
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function loadImg(src) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = src;
    });
  }

  async function thumbFor(a) {
    if (a.type === 'image') return await loadImg(a.url);
    if (a.type === 'video' && a.poster) return await loadImg(a.poster);
    return null;
  }

  function drawDot(ctx, x, y, c) {
    ctx.beginPath();
    ctx.arc(x, y, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.strokeStyle = '#0b0d13';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  K.exportPNG = async function (scale) {
    scale = scale || 2;
    const nodes = S.state.nodes;
    if (!nodes.length) { U.toast('画布是空的', 'err'); return; }

    const boxes = {};
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach((n) => {
      const b = nodeBox(n);
      boxes[n.id] = b;
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
    });

    const PAD = 72;
    const W = Math.ceil((maxX - minX + PAD * 2) * scale);
    const H = Math.ceil((maxY - minY + PAD * 2) * scale);
    if (W * H > 26000000) { U.toast('画布过大，截图尺寸超限', 'err'); return; }

    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.scale(scale, scale);
    const ox = -minX + PAD, oy = -minY + PAD;

    // 背景
    ctx.fillStyle = '#0b0d13';
    ctx.fillRect(0, 0, W / scale, H / scale);

    // 网格点
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    const step = 26;
    const gw = (maxX - minX + PAD * 2) / step, gh = (maxY - minY + PAD * 2) / step;
    const startX = Math.round(minX / step) * step, startY = Math.round(minY / step) * step;
    for (let i = 0; i <= gw; i++) {
      for (let j = 0; j <= gh; j++) {
        ctx.fillRect(startX + i * step + ox, startY + j * step + oy, 1.2, 1.2);
      }
    }

    // 组框
    nodes.filter((n) => n.type === 'frame').forEach((n) => {
      const b = boxes[n.id];
      ctx.save();
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = 'rgba(196,181,253,0.55)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, b.x + ox, b.y + oy, b.w, b.h, 14);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(196,181,253,0.08)';
      ctx.fill();
      ctx.font = '600 13px -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#c4b5fd';
      ctx.fillText(n.title || '流程组', b.x + ox + 12, b.y + oy + 20);
      ctx.restore();
    });

    // 连线
    for (let i = 0; i < S.state.edges.length; i++) {
      const e = S.state.edges[i];
      const a = S.node(e.from), b = S.node(e.to);
      if (!a || !b) continue;
      // 注意：portPos 第三参数是布尔语义（true=输入侧），不可传字符串
      const p1 = N.portPos(a, e.fromPort, false);
      const p2 = N.portPos(b, e.toPort, true);
      const x1 = p1.x + ox, y1 = p1.y + oy, x2 = p2.x + ox, y2 = p2.y + oy;
      const dx = Math.max(48, Math.abs(x2 - x1) * 0.42);
      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, '#8b5cf6'); g.addColorStop(1, '#22d3ee');
      ctx.strokeStyle = g;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2);
      ctx.stroke();
    }

    // 节点卡片
    const FONT = '-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
    const items = nodes.filter((n) => n.type !== 'frame');
    const thumbs = [];

    for (let i = 0; i < items.length; i++) {
      const n = items[i];
      const b = boxes[n.id];
      const c = colorOf(n);
      const x = b.x + ox, y = b.y + oy;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 4;
      roundRect(ctx, x, y, b.w, b.h, 12);
      ctx.fillStyle = '#12151f';
      ctx.fill();
      ctx.restore();

      ctx.save();
      roundRect(ctx, x, y, b.w, b.h, 12);
      ctx.clip();
      ctx.fillStyle = c;
      ctx.fillRect(x, y, b.w, 3);
      ctx.restore();

      roundRect(ctx, x, y, b.w, b.h, 12);
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 标题 + 类型
      ctx.font = '600 13.5px ' + FONT;
      ctx.fillStyle = '#e9ecf5';
      const title = String(n.title || N.meta(n.type).name + '节点');
      let tt = title;
      while (ctx.measureText(tt).width > b.w - 74 && tt.length > 2) tt = tt.slice(0, -1);
      if (tt !== title) tt = tt.slice(0, -1) + '…';
      ctx.fillText(tt, x + 14, y + 30);
      ctx.font = '11px ' + FONT;
      ctx.fillStyle = 'rgba(233,236,245,0.45)';
      ctx.fillText(N.meta(n.type).name, x + 14, y + 46);

      // 端口
      (N.meta(n.type).portsIn || []).forEach((p) => {
        const pp = N.portPos(n, p.id, true);
        drawDot(ctx, pp.x + ox, pp.y + oy, c);
      });
      (N.meta(n.type).portsOut || []).forEach((p) => {
        const pp = N.portPos(n, p.id, false);
        drawDot(ctx, pp.x + ox, pp.y + oy, c);
      });

      // 产物缩略图（卡片足够高时才画）
      const list = (n.assets || []).slice(0, 4);
      if (list.length && b.h > 130) {
        const th = 46, tw = 62, gap = 6;
        const total = list.length * tw + (list.length - 1) * gap;
        let tx = x + b.w - 14 - total;
        const ty = y + b.h - 14 - th;
        for (let k = 0; k < list.length; k++) {
          thumbs.push({ asset: list[k], x: tx + k * (tw + gap), y: ty, w: tw, h: th });
        }
      }
    }

    // 画缩略图
    for (let i = 0; i < thumbs.length; i++) {
      const t = thumbs[i];
      ctx.save();
      roundRect(ctx, t.x, t.y, t.w, t.h, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < thumbs.length; i++) {
      const t = thumbs[i];
      try {
        const im = await thumbFor(t.asset);
        if (!im) continue;
        ctx.save();
        roundRect(ctx, t.x, t.y, t.w, t.h, 5);
        ctx.clip();
        const s = Math.max(t.w / im.width, t.h / im.height);
        const dw = im.width * s, dh = im.height * s;
        ctx.drawImage(im, t.x + (t.w - dw) / 2, t.y + (t.h - dh) / 2, dw, dh);
        ctx.restore();
      } catch (e) { /* 单张失败不影响整体 */ }
    }

    // 页脚标注
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = '12px ' + FONT;
    ctx.fillStyle = 'rgba(233,236,245,0.42)';
    ctx.fillText('StoryCanvas · ' + (S.state.project.name || '未命名项目') + ' · ' +
      new Date().toLocaleString('zh-CN'), 20, H - 20);

    return new Promise((res) => {
      cv.toBlob((blob) => {
        if (!blob) { U.toast('截图失败', 'err'); res(false); return; }
        U.download((S.state.project.name || 'storycanvas') + '-画布.png', blob);
        U.toast('画布截图已导出', 'ok');
        res(true);
      }, 'image/png');
    });
  };

  global.SF.ExportKit = K;
})(window);

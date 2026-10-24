/* ==========================================================
   gen.js · 本地推理演示引擎
   ----------------------------------------------------------
   把“AI 生成”落成浏览器里真实可播放的产物：
     · 图片  → Canvas 按 prompt 语义程序化绘制（确定性种子）
     · 视频  → 静态底图 + 动态层，canvas.captureStream + MediaRecorder 录制 webm
     · 音频  → WebAudio 离线合成（配乐 / 配音 / 音效），导出 wav
     · 分镜  → 规则 + 叙事节奏模型拆解脚本
   接入线上模型时，只需替换下面 SF.gen 的同名函数即可。
   ========================================================== */
(function (global) {
  'use strict';
  const SF = global.SF, U = SF.util;

  /* ---------------- 模型注册表（UI 展示 + 参数默认） ---------------- */
  const MODELS = {
    image: [
      { id: 'seedream5', name: 'Seedream 5.0', tag: '写实', dot: '#34d399' },
      { id: 'midjourney', name: 'Midjourney V7', tag: '美学', dot: '#a78bfa' },
      { id: 'flux-pro', name: 'Flux 1.1 Pro', tag: '通用', dot: '#22d3ee' },
      { id: 'kolors', name: 'Kolors 2.0', tag: '国风', dot: '#fbbf24' }
    ],
    video: [
      { id: 'kling3', name: 'Kling 3.0', tag: '运动', dot: '#22d3ee' },
      { id: 'seedance', name: 'Seedance 2.5', tag: '叙事', dot: '#f472b6' },
      { id: 'wan26', name: 'Wan 2.6', tag: '稳定', dot: '#34d399' },
      { id: 'hailuo', name: 'Hailuo 3', tag: '物理', dot: '#fbbf24' }
    ],
    audio: [
      { id: 'mureka', name: 'Mureka O2', tag: '配乐', dot: '#f472b6' },
      { id: 'tongyi-audio', name: 'Qwen TTS', tag: '配音', dot: '#22d3ee' },
      { id: 'sfx-lab', name: 'SFX Lab', tag: '音效', dot: '#a78bfa' }
    ],
    llm: [
      { id: 'qwen', name: 'Qwen Max', tag: '编剧', dot: '#8b5cf6' },
      { id: 'kimi', name: 'Kimi K2', tag: '长文', dot: '#22d3ee' },
      { id: 'glm', name: 'GLM 4.6', tag: '拆解', dot: '#34d399' }
    ]
  };

  const RATIOS = {
    '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '4:3': [4, 3], '2.39:1': [2.39, 1]
  };
  const STYLES = ['电影感', '摄影写真', '日系清新', '赛博朋克', '水墨国风', '简约商业', '胶片颗粒'];
  const CAMERAS = ['推近', '拉远', '左移', '右移', '上升', '下降', '环绕', '手持跟随', '静止特写'];

  /* ---------------- 语义解析：prompt → 场景 + 配色 ---------------- */
  const SCENES = [
    { id: 'portrait', kw: ['人物', '角色', '女孩', '少年', '少女', '人像', '肖像', '面容', '眼神', 'portrait', '女生', '男子', '老人', '小孩'] },
    { id: 'product', kw: ['产品', '广告', '包装', '瓶', '香水', '咖啡杯', '杯子', '数码', '科技感产品', 'product', 'logo', '主图'] },
    { id: 'city', kw: ['城市', '夜景', '赛博', '霓虹', '街道', '天际线', '香港', '东京', 'cyber', 'neon', '楼宇'] },
    { id: 'ink', kw: ['古风', '武侠', '山水', '水墨', '江湖', '汉服', '宫廷', '东方', '国风', '长安'] },
    { id: 'space', kw: ['太空', '宇宙', '星球', '星际', '银河', 'space', 'galaxy', '轨道'] },
    { id: 'nature', kw: ['森林', '草原', '大海', '海边', '山', '日出', '日落', '湖', '自然', 'ocean', 'forest', '田野'] }
  ];

  const PALETTES = {
    default: { sky: ['#141a33', '#2c2350', '#5b3f74'], sun: '#ffd9a0', sunSize: 0.09, hills: ['#2a2740', '#201d33', '#15131f'], haze: 'rgba(120,110,180,.20)', accent: '#8b5cf6', grain: 0.055 },
    nature: { sky: ['#0d2b3a', '#1b5e63', '#e2a45c'], sun: '#fff0c2', sunSize: 0.11, hills: ['#1d4a44', '#153430', '#0d221f'], haze: 'rgba(226,164,92,.22)', accent: '#34d399', grain: 0.05 },
    city: { sky: ['#080b18', '#17123a', '#3b1a52'], sun: '#ff5fa2', sunSize: 0.06, hills: ['#141433', '#0f0f26', '#08080f'], haze: 'rgba(139,92,246,.20)', accent: '#22d3ee', grain: 0.07 },
    ink: { sky: ['#efeae0', '#e2dbcd', '#d3cabb'], sun: '#b9432f', sunSize: 0.045, hills: ['#8f9096', '#5d5f66', '#2f3138'], haze: 'rgba(255,255,255,.30)', accent: '#b9432f', grain: 0.03 },
    space: { sky: ['#02030a', '#070b1e', '#141a3d'], sun: '#a5f3fc', sunSize: 0.05, hills: ['#0a0e22', '#06080f', '#020307'], haze: 'rgba(56,189,248,.14)', accent: '#22d3ee', grain: 0.06 },
    portrait: { sky: ['#241a2e', '#3a2540', '#5b3550'], sun: '#ffd7c2', sunSize: 0.14, hills: ['#2b2033', '#1d1626', '#120d18'], haze: 'rgba(244,114,182,.18)', accent: '#f472b6', grain: 0.05 },
    product: { sky: ['#0f1420', '#1a2233', '#2a3548'], sun: '#ffffff', sunSize: 0.07, hills: ['#141b28', '#0d121b', '#070a10'], haze: 'rgba(255,255,255,.10)', accent: '#8b5cf6', grain: 0.035 }
  };

  function analyze(prompt, seed) {
    const low = String(prompt || '').toLowerCase();
    let scene = 'default';
    for (let i = 0; i < SCENES.length; i++) {
      for (let j = 0; j < SCENES[i].kw.length; j++) {
        if (low.indexOf(SCENES[i].kw[j].toLowerCase()) >= 0) { scene = SCENES[i].id; break; }
      }
      if (scene !== 'default') break;
    }
    return { scene: scene, pal: PALETTES[scene] || PALETTES.default, seed: seed };
  }

  /* ---------------- 底层绘制工具 ---------------- */
  function grad(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((s) => g.addColorStop(s[0], s[1]));
    return g;
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function ridge(ctx, W, H, baseY, amp, rnd, color, rough) {
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, baseY);
    let y = baseY;
    for (let x = 0; x <= W; x += W / 26) {
      y = baseY + Math.sin(x / (W / (2 + rough * 4)) + rnd() * 0.4 + rough * 9) * amp + (rnd() - 0.5) * amp * 0.5;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  /* ---------------- 场景绘制器 ---------------- */
  const PAINTERS = {
    nature: function (ctx, W, H, rnd, pal) {
      ctx.fillStyle = grad(ctx, 0, 0, 0, H * 0.72, [[0, pal.sky[0]], [0.5, pal.sky[1]], [1, pal.sky[2]]]);
      ctx.fillRect(0, 0, W, H);
      const sx = W * (0.2 + rnd() * 0.6), sy = H * (0.2 + rnd() * 0.22), sr = Math.min(W, H) * pal.sunSize;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 7);
      g.addColorStop(0, pal.sun); g.addColorStop(0.12, 'rgba(255,230,190,.55)'); g.addColorStop(1, 'rgba(255,220,180,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, sr * 7, 0, 7); ctx.fill();
      ctx.fillStyle = pal.sun; ctx.beginPath(); ctx.arc(sx, sy, sr * 0.6, 0, 7); ctx.fill();
      // 水面
      const hz = H * (0.62 + rnd() * 0.08);
      ctx.fillStyle = grad(ctx, 0, hz, 0, H, [[0, 'rgba(255,220,180,.30)'], [1, pal.hills[2]]]);
      ctx.fillRect(0, hz, W, H - hz);
      // 太阳倒影
      for (let i = 0; i < 16; i++) {
        const yy = hz + (H - hz) * (i / 16);
        const ww = sr * (1.2 + rnd() * 2.2) * (1 - i / 22);
        ctx.fillStyle = 'rgba(255,225,180,' + (0.16 - i * 0.008) + ')';
        ctx.fillRect(sx - ww / 2 + (rnd() - 0.5) * 14, yy, ww, 2.5);
      }
      ridge(ctx, W, H, hz - H * 0.10, H * 0.055, rnd, pal.hills[0], 0.2);
      ridge(ctx, W, H, hz - H * 0.03, H * 0.05, rnd, pal.hills[1], 0.6);
      ctx.fillStyle = pal.hills[2];
      ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, hz + H * 0.03);
      ctx.quadraticCurveTo(W * 0.5, hz - H * 0.02, W, hz + H * 0.05); ctx.lineTo(W, H); ctx.fill();
      return { dynamic: 'mist' };
    },

    city: function (ctx, W, H, rnd, pal) {
      ctx.fillStyle = grad(ctx, 0, 0, 0, H, [[0, pal.sky[0]], [0.55, pal.sky[1]], [1, pal.sky[2]]]);
      ctx.fillRect(0, 0, W, H);
      // 月 / 巨型霓虹日
      const mx = W * (0.15 + rnd() * 0.7), my = H * 0.26;
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, Math.min(W, H) * 0.42);
      mg.addColorStop(0, 'rgba(255,95,162,.55)'); mg.addColorStop(1, 'rgba(255,95,162,0)');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, Math.min(W, H) * 0.42, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffe6f2'; ctx.beginPath(); ctx.arc(mx, my, Math.min(W, H) * 0.035, 0, 7); ctx.fill();
      // 三层楼群
      const layers = [[0.55, pal.hills[0], 0.9], [0.72, pal.hills[1], 1.25], [0.9, pal.hills[2], 1.7]];
      layers.forEach((L, li) => {
        const top = H * L[0], step = W / (7 + li * 3);
        for (let x = -step; x < W + step; x += step * (0.75 + rnd() * 0.7)) {
          const bw = step * (0.5 + rnd() * 0.55);
          const bh = H * (0.10 + rnd() * 0.34) * L[2] * 0.7;
          ctx.fillStyle = L[1];
          ctx.fillRect(x, top - bh, bw, H - top + bh);
          // 窗户
          const cols = Math.max(2, Math.floor(bw / 7)), rows = Math.max(3, Math.floor(bh / 9));
          for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
              if (rnd() > 0.55) continue;
              const wx = x + 3 + c * 7, wy = top - bh + 4 + r * 9;
              ctx.fillStyle = rnd() > 0.72 ? 'rgba(34,211,238,.85)' : 'rgba(255,196,140,.75)';
              ctx.fillRect(wx, wy, 2.6, 3.6);
            }
          }
          // 顶灯
          if (rnd() > 0.7) {
            ctx.fillStyle = 'rgba(248,113,113,.9)';
            ctx.fillRect(x + bw / 2 - 1, top - bh - 6, 2, 6);
          }
        }
      });
      // 地面反光
      ctx.fillStyle = grad(ctx, 0, H * 0.82, 0, H, [[0, 'rgba(139,92,246,.10)'], [1, 'rgba(0,0,0,.85)']]);
      ctx.fillRect(0, H * 0.82, W, H * 0.18);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = 'rgba(34,211,238,' + (0.05 + rnd() * 0.1) + ')';
        ctx.fillRect(rnd() * W, H * 0.84 + rnd() * H * 0.16, rnd() * 60 + 10, 1.5);
      }
      return { dynamic: 'rain' };
    },

    portrait: function (ctx, W, H, rnd, pal) {
      ctx.fillStyle = grad(ctx, 0, 0, W, H, [[0, pal.sky[0]], [0.5, pal.sky[1]], [1, pal.sky[2]]]);
      ctx.fillRect(0, 0, W, H);
      // 背景光斑 bokeh
      for (let i = 0; i < 20; i++) {
        const bx = rnd() * W, by = rnd() * H * 0.8, br = 8 + rnd() * 46;
        const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        const c = rnd() > 0.5 ? '255,214,194' : '167,139,250';
        bg.addColorStop(0, 'rgba(' + c + ',' + (0.06 + rnd() * 0.12) + ')'); bg.addColorStop(1, 'rgba(' + c + ',0)');
        ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill();
      }
      // 轮廓光
      const cx = W * (0.44 + rnd() * 0.12), cy = H * 0.52;
      const rim = ctx.createRadialGradient(cx - W * 0.09, cy - H * 0.22, 0, cx, cy, W * 0.62);
      rim.addColorStop(0, 'rgba(255,220,190,.30)'); rim.addColorStop(1, 'rgba(255,220,190,0)');
      ctx.fillStyle = rim; ctx.fillRect(0, 0, W, H);
      // 肩 / 头
      const sk = W * (0.19 + rnd() * 0.03);
      ctx.fillStyle = 'rgba(10,8,16,.92)';
      ctx.beginPath();
      ctx.moveTo(cx - W * 0.30, H);
      ctx.quadraticCurveTo(cx - sk * 1.35, cy + sk * 0.75, cx, cy + sk * 0.52);
      ctx.quadraticCurveTo(cx + sk * 1.35, cy + sk * 0.75, cx + W * 0.30, H);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx, cy - sk * 0.28, sk * 0.46, sk * 0.60, 0, 0, 7); ctx.fill();
      // rim light 边缘
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(255,206,170,.75)';
      ctx.beginPath(); ctx.ellipse(cx, cy - sk * 0.28, sk * 0.46, sk * 0.60, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      ctx.restore();
      return { dynamic: 'bokeh' };
    },

    product: function (ctx, W, H, rnd, pal) {
      ctx.fillStyle = grad(ctx, 0, 0, 0, H, [[0, pal.sky[0]], [0.6, pal.sky[1]], [1, pal.sky[2]]]);
      ctx.fillRect(0, 0, W, H);
      // 顶光
      const lx = W * 0.5, ly = -H * 0.15;
      const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, H * 1.1);
      lg.addColorStop(0, 'rgba(255,255,255,.35)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
      // 台面
      const ty = H * 0.68;
      ctx.fillStyle = grad(ctx, 0, ty, 0, H, [[0, 'rgba(255,255,255,.10)'], [1, 'rgba(0,0,0,.55)']]);
      ctx.fillRect(0, ty, W, H - ty);
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(W, ty); ctx.stroke();
      // 主体：瓶 / 杯 几何体
      const bw = W * (0.13 + rnd() * 0.05), bh = H * (0.30 + rnd() * 0.14), bx = W * 0.5 - bw / 2, by = ty - bh;
      const body = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      body.addColorStop(0, 'rgba(20,24,36,.95)');
      body.addColorStop(0.32, 'rgba(160,180,220,.55)');
      body.addColorStop(0.62, 'rgba(70,80,110,.9)');
      body.addColorStop(1, 'rgba(14,17,26,.98)');
      ctx.fillStyle = body;
      rr(ctx, bx, by, bw, bh, bw * 0.22); ctx.fill();
      ctx.fillStyle = 'rgba(190,205,235,.75)';
      rr(ctx, bx + bw * 0.36, by - bh * 0.16, bw * 0.28, bh * 0.18, 3); ctx.fill();
      // 标签高亮条
      ctx.fillStyle = pal.accent;
      ctx.globalAlpha = 0.75;
      rr(ctx, bx + bw * 0.1, by + bh * 0.42, bw * 0.8, bh * 0.055, 2); ctx.fill();
      ctx.globalAlpha = 1;
      // 倒影
      ctx.save();
      ctx.globalAlpha = 0.20; ctx.scale(1, -1);
      ctx.drawImage(ctx.canvas, 0, -ty * 2, W, H);
      ctx.restore();
      ctx.fillStyle = grad(ctx, 0, ty, 0, H, [[0, 'rgba(10,13,20,.55)'], [1, 'rgba(10,13,20,.95)']]);
      ctx.fillRect(0, ty, W, H - ty);
      // 柔光点
      for (let i = 0; i < 6; i++) {
        const px = rnd() * W, py = rnd() * ty, pr = 20 + rnd() * 70;
        const pg = ctx.createRadialGradient(px, py, 0, px, py, pr);
        pg.addColorStop(0, 'rgba(255,255,255,.10)'); pg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, pr, 0, 7); ctx.fill();
      }
      return { dynamic: 'shine' };
    },

    ink: function (ctx, W, H, rnd, pal) {
      ctx.fillStyle = grad(ctx, 0, 0, 0, H, [[0, pal.sky[0]], [0.6, pal.sky[1]], [1, pal.sky[2]]]);
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 8; i++) {
        const mY = H * (0.30 + i * 0.06) + (rnd() - 0.5) * 20;
        ctx.save();
        ctx.globalAlpha = 0.10 + i * 0.055;
        ctx.beginPath(); ctx.moveTo(0, H);
        let px = 0, py = mY;
        ctx.lineTo(0, py);
        while (px < W) {
          px += W / 8 + rnd() * 20;
          py = mY + Math.sin(px / (60 + i * 30)) * (18 + i * 6) + (rnd() - 0.5) * 14;
          ctx.quadraticCurveTo(px - 20, py - 12, px, py);
        }
        ctx.lineTo(W, H); ctx.closePath();
        ctx.fillStyle = pal.hills[Math.min(2, Math.floor(i / 3))];
        ctx.fill();
        ctx.restore();
      }
      // 飞鸟
      ctx.strokeStyle = 'rgba(47,49,56,.75)'; ctx.lineWidth = 1.4;
      for (let i = 0; i < 5; i++) {
        const bx = W * (0.1 + rnd() * 0.8), by = H * (0.12 + rnd() * 0.25), bs = 5 + rnd() * 7;
        ctx.beginPath();
        ctx.moveTo(bx - bs, by); ctx.quadraticCurveTo(bx - bs * 0.4, by - bs * 0.7, bx, by);
        ctx.quadraticCurveTo(bx + bs * 0.4, by - bs * 0.7, bx + bs, by);
        ctx.stroke();
      }
      // 印章
      ctx.fillStyle = 'rgba(185,67,47,.82)';
      rr(ctx, W * 0.84, H * 0.10, W * 0.062, W * 0.062, 3); ctx.fill();
      ctx.fillStyle = 'rgba(239,234,224,.9)';
      ctx.font = '600 ' + Math.round(W * 0.03) + 'px serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('印', W * 0.84 + W * 0.031, H * 0.10 + W * 0.033);
      return { dynamic: 'mist' };
    },

    space: function (ctx, W, H, rnd, pal) {
      ctx.fillStyle = grad(ctx, 0, 0, 0, H, [[0, pal.sky[0]], [0.5, pal.sky[1]], [1, pal.sky[2]]]);
      ctx.fillRect(0, 0, W, H);
      // 星云
      for (let i = 0; i < 5; i++) {
        const nx = rnd() * W, ny = rnd() * H * 0.8, nr = Math.min(W, H) * (0.2 + rnd() * 0.5);
        const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
        const c = ['139,92,246', '34,211,238', '244,114,182'][Math.floor(rnd() * 3)];
        ng.addColorStop(0, 'rgba(' + c + ',.16)'); ng.addColorStop(1, 'rgba(' + c + ',0)');
        ctx.fillStyle = ng; ctx.beginPath(); ctx.arc(nx, ny, nr, 0, 7); ctx.fill();
      }
      // 星辰
      for (let i = 0; i < 260; i++) {
        const x = rnd() * W, y = rnd() * H, r = rnd() * 1.7;
        ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + rnd() * 0.75) + ')';
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      }
      // 星球
      const px = W * (0.24 + rnd() * 0.5), py = H * (0.30 + rnd() * 0.3), pr = Math.min(W, H) * (0.16 + rnd() * 0.12);
      const pg = ctx.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
      pg.addColorStop(0, '#8fd7ff'); pg.addColorStop(0.45, '#3b6fb5'); pg.addColorStop(1, '#0a1030');
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, pr, 0, 7); ctx.fill();
      const halo = ctx.createRadialGradient(px, py, pr * 0.95, px, py, pr * 1.7);
      halo.addColorStop(0, 'rgba(120,200,255,.35)'); halo.addColorStop(1, 'rgba(120,200,255,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(px, py, pr * 1.7, 0, 7); ctx.fill();
      // 行星环
      ctx.save(); ctx.translate(px, py); ctx.rotate(-0.35); ctx.scale(1, 0.22);
      ctx.strokeStyle = 'rgba(190,225,255,.35)'; ctx.lineWidth = pr * 0.16;
      ctx.beginPath(); ctx.arc(0, 0, pr * 1.55, 0, 7); ctx.stroke();
      ctx.restore();
      return { dynamic: 'stars' };
    },

    default: function (ctx, W, H, rnd, pal) {
      ctx.fillStyle = grad(ctx, 0, 0, W, H, [[0, pal.sky[0]], [0.5, pal.sky[1]], [1, pal.sky[2]]]);
      ctx.fillRect(0, 0, W, H);
      const sx = W * (0.25 + rnd() * 0.5), sy = H * (0.3 + rnd() * 0.2), sr = Math.min(W, H) * pal.sunSize;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 6);
      g.addColorStop(0, 'rgba(255,240,220,.75)'); g.addColorStop(0.1, 'rgba(255,225,200,.35)'); g.addColorStop(1, 'rgba(255,225,200,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, sr * 6, 0, 7); ctx.fill();
      ctx.fillStyle = pal.sun; ctx.beginPath(); ctx.arc(sx, sy, sr * 0.5, 0, 7); ctx.fill();
      ridge(ctx, W, H, H * 0.60, H * 0.07, rnd, pal.hills[0], 0.3);
      ridge(ctx, W, H, H * 0.72, H * 0.06, rnd, pal.hills[1], 0.7);
      ctx.fillStyle = pal.hills[2];
      ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, H * 0.84);
      ctx.quadraticCurveTo(W * 0.5, H * 0.76, W, H * 0.86); ctx.lineTo(W, H); ctx.fill();
      return { dynamic: 'mist' };
    }
  };

  /* 后期：雾 / 颗粒 / 暗角 */
  function post(ctx, W, H, rnd, pal) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const hz = ctx.createLinearGradient(0, H * 0.5, 0, H);
    hz.addColorStop(0, 'rgba(255,255,255,0)');
    hz.addColorStop(1, pal.haze.replace(/[\d.]+\)$/, '0.10)'));
    ctx.fillStyle = pal.haze;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, H * 0.45, W, H * 0.55);
    ctx.restore();

    const amount = pal.grain * 255;
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.floor(W / 2)); off.height = Math.max(1, Math.floor(H / 2));
    const oc = off.getContext('2d');
    const img = oc.createImageData(off.width, off.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (rnd() - 0.5) * amount;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 128 + v;
      img.data[i + 3] = 255;
    }
    oc.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalAlpha = 0.16; ctx.globalCompositeOperation = 'overlay';
    ctx.drawImage(off, 0, 0, W, H);
    ctx.restore();

    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  /* 参考图融合：若有上游图片，作为基底做重绘 / 混合 */
  function drawRef(ctx, W, H, img, mode) {
    if (!img) return false;
    const ir = img.width / img.height, cr = W / H;
    let sw = img.width, sh = img.height, sx = 0, sy = 0;
    if (ir > cr) { sw = img.height * cr; sx = (img.width - sw) / 2; }
    else { sh = img.width / cr; sy = (img.height - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    if (mode === 'blend') {
      ctx.save();
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = 'rgba(128,128,128,1)';
      ctx.globalAlpha = 0.5;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    return true;
  }

  function loadImage(src) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });
  }

  /* =======================================================
     对外：图像生成
     spec: {prompt, model, ratio, style, seed, count, refUrl, refMode}
     ======================================================= */
  const G = {};
  G.MODELS = MODELS; G.RATIOS = RATIOS; G.STYLES = STYLES; G.CAMERAS = CAMERAS;

  G.image = async function (spec, onProgress) {
    const n = Math.max(1, Math.min(4, spec.count || 1));
    const R = RATIOS[spec.ratio] || [16, 9];
    const W = 768, H = Math.round(W * R[1] / R[0]);
    const ref = spec.refUrl ? await loadImage(spec.refUrl) : null;
    const out = [];
    for (let i = 0; i < n; i++) {
      if (onProgress) onProgress((i + 0.35) / n, '推理 ' + (i + 1) + '/' + n);
      await new Promise((r) => setTimeout(r, 260 + Math.random() * 240));
      const seed = (spec.seed || 1) * 1000 + i * 37;
      const rnd = U.rng(spec.prompt + '|' + seed + '|' + (spec.model || ''));
      const info = analyze(spec.prompt + ' ' + (spec.style || ''), seed);
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      // 参考图作为基底
      if (ref && spec.refMode !== 'ignore') {
        drawRef(ctx, W, H, ref, spec.refMode);
        if (spec.refMode === 'style') {
          ctx.save(); ctx.globalAlpha = 0.55;
          (PAINTERS[info.scene] || PAINTERS.default)(ctx, W, H, rnd, info.pal);
          ctx.restore();
        } else {
          ctx.save(); ctx.globalAlpha = 0.42;
          ctx.globalCompositeOperation = 'overlay';
          (PAINTERS[info.scene] || PAINTERS.default)(ctx, W, H, rnd, info.pal);
          ctx.restore();
        }
      } else {
        (PAINTERS[info.scene] || PAINTERS.default)(ctx, W, H, rnd, info.pal);
      }
      post(ctx, W, H, rnd, info.pal);
      // 左下角元信息（轻微）
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.font = '500 11px ui-monospace,Consolas,monospace';
      ctx.fillStyle = '#fff';
      ctx.fillText((spec.model || 'local') + ' · ' + (spec.ratio || '16:9') + ' · s' + seed, 10, H - 10);
      ctx.restore();

      out.push({
        type: 'image',
        url: cv.toDataURL('image/jpeg', 0.9),
        thumb: cv.toDataURL('image/jpeg', 0.72),
        w: W, h: H,
        meta: {
          model: spec.model, ratio: spec.ratio, style: spec.style, seed: seed,
          scene: info.scene, prompt: spec.prompt
        }
      });
      if (onProgress) onProgress((i + 1) / n, '出图 ' + (i + 1) + '/' + n);
    }
    return out;
  };

  /* =======================================================
     对外：视频生成
     spec: {prompt, model, duration, motion, refUrl, ratio}
     ======================================================= */
  const MOTION_MAP = {
    '推近': [1.0, 1.18, 0, 0], '拉远': [1.18, 1.0, 0, 0],
    '左移': [1.12, 1.12, -0.07, 0], '右移': [1.12, 1.12, 0.07, 0],
    '上升': [1.12, 1.12, 0, -0.06], '下降': [1.12, 1.12, 0, 0.06],
    '环绕': [1.05, 1.22, 0.05, -0.02], '手持跟随': [1.06, 1.14, 0.02, 0.02],
    '静止特写': [1.02, 1.06, 0, 0]
  };

  G.video = async function (spec, onProgress) {
    const R = RATIOS[spec.ratio || '16:9'] || [16, 9];
    const W = 640, H = Math.round(W * R[1] / R[0]);
    const dur = Math.max(2, Math.min(8, Number(spec.duration) || 4));
    const fps = 30;
    const seed = (spec.seed || 7);
    const rnd = U.rng(spec.prompt + '|v|' + seed);
    const info = analyze(spec.prompt + ' ' + (spec.style || ''), seed);

    // 静态底图
    const bg = document.createElement('canvas');
    bg.width = W; bg.height = H;
    const bctx = bg.getContext('2d');
    const ref = spec.refUrl ? await loadImage(spec.refUrl) : null;
    if (ref) {
      drawRef(bctx, W, H, ref, 'none');
      bctx.save(); bctx.globalAlpha = 0.35;
      bctx.globalCompositeOperation = 'overlay';
      (PAINTERS[info.scene] || PAINTERS.default)(bctx, W, H, U.rng(spec.prompt + seed), info.pal);
      bctx.restore();
    } else {
      (PAINTERS[info.scene] || PAINTERS.default)(bctx, W, H, U.rng(spec.prompt + seed), info.pal);
    }
    post(bctx, W, H, U.rng('p' + seed), info.pal);

    const poster = bg.toDataURL('image/jpeg', 0.85);
    const canRecord = typeof MediaRecorder !== 'undefined' &&
      MediaRecorder.isTypeSupported &&
      (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') || MediaRecorder.isTypeSupported('video/webm'));

    if (!canRecord) {
      if (onProgress) onProgress(1, '环境不支持录制，返回封面');
      await new Promise((r) => setTimeout(r, 400));
      return [{
        type: 'video', url: null, poster: poster, duration: dur, w: W, h: H,
        meta: { model: spec.model, duration: dur, motion: spec.motion, ratio: spec.ratio, prompt: spec.prompt, fallback: true }
      }];
    }

    // 舞台 canvas
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none';
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d');

    const M = MOTION_MAP[spec.motion] || MOTION_MAP['推近'];
    const parts = [];
    for (let i = 0; i < 46; i++) {
      parts.push({ x: rnd() * W, y: rnd() * H, r: 1 + rnd() * 3.4, sp: 0.15 + rnd() * 0.7, ph: rnd() * 7, a: 0.15 + rnd() * 0.5 });
    }
    const clouds = [];
    for (let i = 0; i < 6; i++) clouds.push({ x: rnd() * W, y: H * (0.1 + rnd() * 0.4), w: W * (0.2 + rnd() * 0.4), h: H * (0.05 + rnd() * 0.1), sp: 6 + rnd() * 16, a: 0.04 + rnd() * 0.07 });

    const stream = cv.captureStream(fps);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2500000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

    const done = new Promise((resolve) => { rec.onstop = () => resolve(new Blob(chunks, { type: mime })); });
    rec.start();

    const t0 = performance.now();
    let stopRAF = false;
    function frame(now) {
      if (stopRAF) return;
      const t = Math.min(1, (now - t0) / (dur * 1000));
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const sc = M[0] + (M[1] - M[0]) * ease;
      let ox = M[2] * W * ease, oy = M[3] * H * ease;
      if (spec.motion === '手持跟随') { ox += Math.sin(now / 170) * 3.2; oy += Math.cos(now / 210) * 2.6; }
      if (spec.motion === '环绕') { ox += Math.sin(ease * Math.PI) * W * 0.03; }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2 + ox, H / 2 + oy);
      ctx.scale(sc, sc);
      ctx.translate(-W / 2, -H / 2);
      ctx.drawImage(bg, 0, 0);
      ctx.restore();

      // 动态层
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      parts.forEach((p) => {
        const yy = p.y - ((now / 1000) * p.sp * 26) % H;
        const alpha = p.a * (0.45 + 0.55 * Math.sin(now / 700 + p.ph));
        ctx.fillStyle = 'rgba(255,240,220,' + Math.max(0, alpha) + ')';
        ctx.beginPath(); ctx.arc(p.x, yy < 0 ? yy + H : yy, p.r, 0, 7); ctx.fill();
      });
      clouds.forEach((c) => {
        const cx = (c.x + (now / 1000) * c.sp) % (W + c.w) - c.w;
        const cg = ctx.createRadialGradient(cx + c.w / 2, c.y, 0, cx + c.w / 2, c.y, c.w / 2);
        cg.addColorStop(0, 'rgba(255,255,255,' + c.a + ')'); cg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.ellipse(cx + c.w / 2, c.y, c.w / 2, c.h, 0, 0, 7); ctx.fill();
      });
      // 呼吸式光晕
      const pulse = 0.06 + 0.05 * Math.sin(now / 480);
      const pg = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.6);
      pg.addColorStop(0, 'rgba(255,235,210,' + pulse + ')'); pg.addColorStop(1, 'rgba(255,235,210,0)');
      ctx.fillStyle = pg; ctx.fillRect(0, 0, W, H);
      ctx.restore();

      if (onProgress) onProgress(Math.min(0.99, t), '合成 ' + Math.round(t * 100) + '%');
      if (t >= 1) { stopRAF = true; setTimeout(() => rec.stop(), 60); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    const blob = await done;
    cv.remove();
    return [{
      type: 'video',
      url: URL.createObjectURL(blob),
      poster: poster,
      duration: dur, w: W, h: H,
      blobSize: blob.size,
      meta: { model: spec.model, duration: dur, motion: spec.motion, ratio: spec.ratio, prompt: spec.prompt }
    }];
  };

  /* =======================================================
     对外：音频生成（WebAudio 离线合成 → WAV）
     spec: {prompt, type:'music'|'speech'|'sfx', duration, voice}
     ======================================================= */
  function encodeWAV(buf) {
    const nch = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length;
    const ab = new ArrayBuffer(44 + len * nch * 2);
    const v = new DataView(ab);
    const wr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    wr(0, 'RIFF'); v.setUint32(4, 36 + len * nch * 2, true); wr(8, 'WAVE');
    wr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, nch, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * nch * 2, true); v.setUint16(32, nch * 2, true); v.setUint16(34, 16, true);
    wr(36, 'data'); v.setUint32(40, len * nch * 2, true);
    const chs = [];
    for (let c = 0; c < nch; c++) chs.push(buf.getChannelData(c));
    let off = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < nch; c++) {
        const s = Math.max(-1, Math.min(1, chs[c][i]));
        v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        off += 2;
      }
    }
    return new Blob([ab], { type: 'audio/wav' });
  }

  function env(i, len, atk, rel) {
    const a = Math.min(1, i / (atk * len));
    const r = Math.min(1, (len - i) / (rel * len));
    return Math.max(0, Math.min(1, Math.min(a, r)));
  }

  G.audio = async function (spec, onProgress) {
    const dur = Math.max(2, Math.min(30, Number(spec.duration) || 8));
    const sr = 44100, len = Math.floor(sr * dur);
    const kind = spec.type || 'music';
    if (onProgress) onProgress(0.25, '合成中');
    await new Promise((r) => setTimeout(r, 320));

    const OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    const oc = new OAC(2, len, sr);
    const buf = oc.createBuffer(2, len, sr);
    const L = buf.getChannelData(0), Rch = buf.getChannelData(1);
    const rnd = U.rng((spec.prompt || '') + kind + (spec.seed || 3));

    if (kind === 'music') {
      const prog = [[220.00, 261.63, 329.63], [174.61, 220.00, 261.63], [196.00, 246.94, 293.66], [164.81, 207.65, 246.94]];
      const bar = Math.floor(len / 4);
      for (let b = 0; b < 4; b++) {
        const ch = prog[b];
        for (let i = 0; i < bar; i++) {
          const t = i / sr, gi = b * bar + i;
          let pad = 0;
          ch.forEach((f, k) => {
            pad += Math.sin(2 * Math.PI * f * t) * 0.16 / (k + 1);
            pad += Math.sin(2 * Math.PI * f * 2 * t) * 0.03;
          });
          const g = env(i, bar, 0.12, 0.35);
          let v = pad * g;
          // bass
          const bt = i % Math.floor(sr * 0.5);
          if (bt < sr * 0.12) {
            const f = ch[0] / 2 * (1 + Math.exp(-bt / (sr * 0.05)));
            v += Math.sin(2 * Math.PI * f * t) * 0.30 * (1 - bt / (sr * 0.12));
          }
          // hat
          if (i % Math.floor(sr * 0.25) < 900) {
            v += (rnd() - 0.5) * 0.10 * (1 - (i % Math.floor(sr * 0.25)) / 900);
          }
          L[gi] += v * 0.92; Rch[gi] += v * 0.88;
        }
      }
      // 轻微混响尾
      for (let i = 0; i < len; i++) {
        if (i > 2200) {
          L[i] += L[i - 2200] * 0.18; Rch[i] += Rch[i - 2600] * 0.18;
        }
      }
    } else if (kind === 'speech') {
      const female = (spec.voice || '').indexOf('女') >= 0;
      const f0 = female ? 205 : 118;
      let i = 0;
      while (i < len) {
        const syllables = 1 + Math.floor(rnd() * 3);
        for (let s = 0; s < syllables && i < len; s++) {
          const slen = Math.floor(sr * (0.10 + rnd() * 0.10));
          const F1 = 300 + rnd() * 500, F2 = 900 + rnd() * 1400;
          for (let j = 0; j < slen && i + j < len; j++) {
            const t = (j) / sr;
            const e = env(j, slen, 0.18, 0.4);
            const src =
              Math.sin(2 * Math.PI * f0 * t) * 0.5 +
              Math.sin(2 * Math.PI * F1 * t) * 0.25 +
              Math.sin(2 * Math.PI * F2 * t) * 0.12 +
              (rnd() - 0.5) * 0.06;
            const v = src * e * 0.34;
            L[i + j] += v; Rch[i + j] += v * 0.9;
          }
          i += slen;
        }
        i += Math.floor(sr * (0.14 + rnd() * 0.22));
      }
    } else {
      // sfx：whoosh + ambience
      const sweepUp = rnd() > 0.5;
      for (let i = 0; i < len; i++) {
        const t = i / sr, p = i / len;
        const cut = sweepUp ? 300 + 3200 * p : 3500 - 3100 * p;
        const noise = (rnd() - 0.5) * 2;
        const v = Math.sin(2 * Math.PI * cut * t) * 0.12 * env(i, len, 0.2, 0.3) + noise * 0.14 * env(i, len, 0.1, 0.4);
        const s = v * 0.7;
        L[i] += s; Rch[i] += s * 0.95;
      }
    }

    // 归一化 + 淡入淡出
    let peak = 0;
    for (let i = 0; i < len; i++) { peak = Math.max(peak, Math.abs(L[i]), Math.abs(Rch[i])); }
    const k = peak > 0 ? Math.min(1, 0.86 / peak) : 1;
    const fade = Math.floor(sr * 0.05);
    for (let i = 0; i < len; i++) {
      let g = k;
      if (i < fade) g *= i / fade;
      if (i > len - fade) g *= (len - i) / fade;
      L[i] *= g; Rch[i] *= g;
    }

    if (onProgress) onProgress(0.85, '编码 WAV');
    const blob = encodeWAV(buf);
    // 波形缩略数据
    const wave = [];
    const stepSize = Math.floor(len / 48);
    for (let i = 0; i < 48; i++) {
      let mx = 0;
      for (let j = i * stepSize; j < (i + 1) * stepSize && j < len; j += 37) mx = Math.max(mx, Math.abs(L[j]));
      wave.push(Math.max(0.06, Math.min(1, mx)));
    }
    if (onProgress) onProgress(1, '完成');
    return [{
      type: 'audio',
      url: URL.createObjectURL(blob),
      duration: dur,
      wave: wave,
      meta: { model: spec.model, type: kind, voice: spec.voice, prompt: spec.prompt, bytes: blob.size }
    }];
  };

  /* =======================================================
     对外：脚本拆解（剧本 / 梗概 → 分镜）
     ======================================================= */
  const SIZE_POOL = ['大远景', '远景', '全景', '中景', '近景', '特写', '大特写'];
  const CAM_POOL = ['固定', '缓慢推近', '横摇', '俯拍', '低角度仰拍', '手持跟随', '拉远', '航拍俯瞰'];

  G.shots = async function (story, opts, onProgress) {
    opts = opts || {};
    const want = Math.max(1, Math.min(12, opts.count || 6));
    if (onProgress) onProgress(0.3, '理解剧本');
    await new Promise((r) => setTimeout(r, 420));
    if (onProgress) onProgress(0.7, '拆分镜头');

    const rnd = U.rng(story + '|shots');
    let parts = String(story || '')
      .split(/[\n。！？；!?;]+/)
      .map((s) => s.replace(/^[\s,，、]*/, '').trim())
      .filter((s) => s.length >= 4);
    if (parts.length < want) {
      const fillers = [
        '环境与氛围铺陈，交代时间地点',
        '主体登场，建立视觉焦点',
        '关键细节特写，强化情绪张力',
        '动作推进，节奏加快',
        '对照反应，制造悬念',
        '收束画面，落到品牌 / 主题'
      ];
      let i = 0;
      while (parts.length < want && i < fillers.length * 3) {
        parts.push(fillers[i % fillers.length]); i++;
      }
    }
    parts = parts.slice(0, want);

    const arc = ['全景', '远景', '中景', '近景', '特写', '大特写', '中景', '全景'];
    return parts.map((p, i) => {
      const prog = parts.length > 1 ? i / (parts.length - 1) : 0;
      const size = opts.size || arc[Math.min(arc.length - 1, Math.round(prog * (arc.length - 1)))] || SIZE_POOL[Math.floor(rnd() * SIZE_POOL.length)];
      return {
        id: U.uid('s'),
        idx: i + 1,
        desc: p.length > 46 ? p.slice(0, 46) + '…' : p,
        full: p,
        dur: opts.dur || [4, 5, 3][Math.floor(rnd() * 3)],
        cam: CAM_POOL[Math.floor(rnd() * CAM_POOL.length)],
        size: size
      };
    });
  };

  SF.gen = G;
})(window);

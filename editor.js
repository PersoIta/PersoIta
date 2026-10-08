(() => {
'use strict';

// ============================================================
// HELPERS
// ============================================================
const $ = id => document.getElementById(id);
const canvas = $('artboard');
const ctx = canvas.getContext('2d');
const frame = $('canvasFrame');
const stage = $('stage');
const guidesEl = $('guides');

const PRESETS = {
  mug:    [1240, 561],
  shirt:  [1476, 1772],
  tile:   [1181, 1181],
  photo:  [591, 886],
  banner: [1920, 1080],
  card:   [1050, 600],
  story:  [1080, 1920],
  post:   [1080, 1080]
};

// ============================================================
// ESTADO GLOBAL
// ============================================================
let items = [];
let selectedIds = new Set();      // seleção múltipla
let nextId = 1;
let bg = '#ffffff';
let bgMode = 'solid';
let bgGradient = { c1: '#6c4df6', c2: '#ff6b9a', angle: 135 };
let transparent = false;
let zoom = 1;
let history = [];
let historyAt = -1;
let toastTimer;

let isDragging = false;
let isResizing = false;
let isRotating = false;
let isPanning = false;
let dragDelta = { x: 0, y: 0 };
let resizeHandle = null;
let resizeStart = null;
let rotateStart = null;
let panStart = null;

let showGrid = false;
let snapEnabled = true;
let clipboard = null;

const imageCache = new Map();
const SNAP_THRESHOLD = 6;

// ============================================================
// UTILITÁRIOS
// ============================================================
function notify(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2300);
}

function status(msg) {
  $('status').textContent = msg;
  $('saveState').textContent = 'Alterações locais';
}

function selected() {
  const arr = [...selectedIds].map(id => items.find(i => i.id === id)).filter(Boolean);
  return arr.length ? arr : null;
}

function selectedFirst() {
  const arr = selected();
  return arr ? arr[0] : null;
}

function isSelected(id) { return selectedIds.has(id); }

function clearSelection() {
  selectedIds.clear();
}

function selectOnly(id) {
  selectedIds.clear();
  selectedIds.add(id);
}

function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
}

// ============================================================
// HISTÓRICO
// ============================================================
function state() {
  return JSON.stringify({
    items: items.map(i => { const c = { ...i }; delete c.img; return c; }),
    bg, bgMode, bgGradient, transparent,
    w: canvas.width, h: canvas.height, nextId
  });
}

function checkpoint() {
  const s = state();
  if (history[historyAt] === s) return;
  history = history.slice(0, historyAt + 1);
  history.push(s);
  if (history.length > 100) history.shift();
  historyAt = history.length - 1;
}

function restoreState(s) {
  const d = JSON.parse(s);
  items = d.items || [];
  bg = d.bg || '#fff';
  bgMode = d.bgMode || 'solid';
  bgGradient = d.bgGradient || { c1: '#6c4df6', c2: '#ff6b9a', angle: 135 };
  transparent = !!d.transparent;
  canvas.width = d.w || 1240;
  canvas.height = d.h || 561;
  nextId = d.nextId || Math.max(1, ...items.map(x => x.id + 1));
  clearSelection();
  items.forEach(i => {
    if (i.type === 'image' && i.src) {
      loadImage(i.src).then(img => { i.img = img; render(); });
    }
  });
  render();
  syncInspector();
  syncDimensions();
  syncLayers();
  applyZoom();
}

function undo() {
  if (historyAt > 0) { historyAt--; restoreState(history[historyAt]); status('Ação desfeita.'); }
}
function redo() {
  if (historyAt < history.length - 1) { historyAt++; restoreState(history[historyAt]); status('Ação refeita.'); }
}

// ============================================================
// IMAGEM
// ============================================================
function loadImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  imageCache.set(src, p);
  return p;
}

// ============================================================
// BASE DE ITEM
// ============================================================
function baseItem(type, props = {}) {
  const defaults = {
    id: nextId++,
    type,
    name: ({
      text: 'Texto', rect: 'Retângulo', circle: 'Círculo', triangle: 'Triângulo',
      star: 'Estrela', heart: 'Coração', line: 'Linha', image: 'Imagem',
      hexagon: 'Hexágono', pentagon: 'Pentágono', diamond: 'Losango',
      arrow: 'Seta', icon: 'Ícone'
    })[type] || 'Elemento',
    x: canvas.width / 2,
    y: canvas.height / 2,
    w: type === 'text' ? Math.min(600, canvas.width * .72) : Math.min(220, canvas.width * .3),
    h: type === 'text' ? 90 : Math.min(180, canvas.height * .3),
    text: 'Seu texto aqui',
    font: 'Arial',
    fontSize: 48,
    color: '#6c4df6',
    opacity: 100,
    rotation: 0,
    bold: false,
    italic: false,
    underline: false,
    uppercase: false,
    align: 'center',
    visible: true,
    locked: false,
    groupId: null,
    // novos
    letterSpacing: 0,
    lineHeight: 1.2,
    textCurve: 0,
    cornerRadius: 0,
    shadow: 0,
    shadowColor: '#000000',
    shadowBlur: 10,
    stroke: 0,
    strokeColor: '#222222',
    glow: 0,
    fillMode: 'solid',
    fillGradient: { c1: '#6c4df6', c2: '#ff6b9a', angle: 135 },
    flipH: false,
    flipV: false
  };
  return { ...defaults, ...props };
}

function addItem(type, props = {}, silent = false) {
  const item = baseItem(type, props);
  items.push(item);
  selectOnly(item.id);
  if (!silent) {
    checkpoint();
    render();
    syncInspector();
    syncLayers();
    status('Elemento adicionado.');
  }
  return item;
}

// ============================================================
// RENDER — DRAW ITEM
// ============================================================
function wrapText(text, maxWidth, fontSize) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function applyFillStyle(context, item) {
  if (item.fillMode === 'gradient' && item.fillGradient) {
    const g = context.createLinearGradient(
      -item.w / 2, -item.h / 2,
      item.w / 2, item.h / 2
    );
    // ângulo simplificado — usar c1 e c2
    g.addColorStop(0, item.fillGradient.c1 || '#6c4df6');
    g.addColorStop(1, item.fillGradient.c2 || '#ff6b9a');
    return g;
  }
  return item.color || '#222';
}

function drawItem(item, opts = {}) {
  if (!item.visible) return;
  const showSelection = opts.showSelection !== false;

  ctx.save();
  ctx.globalAlpha = (item.opacity ?? 100) / 100;
  ctx.translate(item.x, item.y);
  ctx.rotate((item.rotation || 0) * Math.PI / 180);
  if (item.flipH || item.flipV) {
    ctx.scale(item.flipH ? -1 : 1, item.flipV ? -1 : 1);
  }

  const w = item.w || 100;
  const h = item.h || 60;

  // Sombra
  if (item.shadow > 0) {
    ctx.shadowColor = item.shadowColor || '#000';
    ctx.shadowBlur = item.shadowBlur || 10;
    ctx.shadowOffsetX = item.shadow;
    ctx.shadowOffsetY = item.shadow;
  }

  // Brilho
  if (item.glow > 0) {
    ctx.shadowColor = item.color || '#6c4df6';
    ctx.shadowBlur = item.glow;
  }

  const fillStyle = applyFillStyle(ctx, item);
  ctx.fillStyle = fillStyle;
  ctx.strokeStyle = item.color || '#222';
  ctx.lineWidth = Math.max(2, Math.min(w, h) * .025);

  if (item.type === 'text') {
    ctx.fillStyle = fillStyle;
    ctx.textAlign = item.align || 'center';
    ctx.textBaseline = 'middle';
    const text = item.uppercase ? String(item.text).toUpperCase() : String(item.text);
    const fs = item.fontSize || 48;
    const letterSpacing = item.letterSpacing || 0;
    const lineH = (item.lineHeight || 1.2) * fs;

    // Curvatura de texto (simples)
    if (item.textCurve && Math.abs(item.textCurve) > 0) {
      drawCurvedText(ctx, text, item, fs, w);
      if (showSelection && isSelected(item.id)) drawSelectionBox(item, w, h);
      ctx.restore();
      return;
    }

    // Espaçamento entre letras
    ctx.font = `${item.italic ? 'italic ' : ''}${item.bold ? 'bold ' : ''}${fs}px "${item.font || 'Arial'}"`;
    if (letterSpacing === 0) {
      const lines = wrapText(text, w, fs);
      const start = -((lines.length - 1) * lineH) / 2;
      lines.forEach((line, index) => {
        const tx = item.align === 'left' ? -w / 2 : item.align === 'right' ? w / 2 : 0;
        ctx.fillText(line, tx, start + index * lineH, w);
        if (item.underline) {
          const m = ctx.measureText(line).width;
          let ux = tx - m / 2;
          if (item.align === 'left') ux = tx;
          if (item.align === 'right') ux = tx - m;
          ctx.beginPath();
          ctx.moveTo(ux, start + index * lineH + fs * .42);
          ctx.lineTo(ux + m, start + index * lineH + fs * .42);
          ctx.stroke();
        }
      });
    } else {
      drawSpacedText(ctx, text, item, fs, w, lineH, letterSpacing);
    }
  } else if (item.type === 'rect') {
    if (item.cornerRadius > 0) {
      roundRect(ctx, -w / 2, -h / 2, w, h, item.cornerRadius);
      ctx.fill();
      if (item.stroke > 0) { ctx.lineWidth = item.stroke; ctx.strokeStyle = item.strokeColor; ctx.stroke(); }
    } else {
      ctx.fillRect(-w / 2, -h / 2, w, h);
      if (item.stroke > 0) { ctx.lineWidth = item.stroke; ctx.strokeStyle = item.strokeColor; ctx.strokeRect(-w / 2, -h / 2, w, h); }
    }
  } else if (item.type === 'circle') {
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    if (item.stroke > 0) { ctx.lineWidth = item.stroke; ctx.strokeStyle = item.strokeColor; ctx.stroke(); }
  } else if (item.type === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.closePath();
    ctx.fill();
    if (item.stroke > 0) { ctx.lineWidth = item.stroke; ctx.strokeStyle = item.strokeColor; ctx.stroke(); }
  } else if (item.type === 'hexagon') {
    drawPolygon(ctx, 6, w, h);
    ctx.fill();
    if (item.stroke > 0) { ctx.lineWidth = item.stroke; ctx.strokeStyle = item.strokeColor; ctx.stroke(); }
  } else if (item.type === 'pentagon') {
    drawPolygon(ctx, 5, w, h);
    ctx.fill();
    if (item.stroke > 0) { ctx.lineWidth = item.stroke; ctx.strokeStyle = item.strokeColor; ctx.stroke(); }
  } else if (item.type === 'diamond') {
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(w / 2, 0);
    ctx.lineTo(0, h / 2);
    ctx.lineTo(-w / 2, 0);
    ctx.closePath();
    ctx.fill();
    if (item.stroke > 0) { ctx.lineWidth = item.stroke; ctx.strokeStyle = item.strokeColor; ctx.stroke(); }
  } else if (item.type === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 6);
    ctx.lineTo(w / 6, -h / 6);
    ctx.lineTo(w / 6, -h / 2);
    ctx.lineTo(w / 2, 0);
    ctx.lineTo(w / 6, h / 2);
    ctx.lineTo(w / 6, h / 6);
    ctx.lineTo(-w / 2, h / 6);
    ctx.closePath();
    ctx.fill();
  } else if (item.type === 'star' || item.type === 'heart') {
    ctx.font = `${Math.min(w, h)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.type === 'star' ? '★' : '♥', 0, 0, w);
  } else if (item.type === 'line') {
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(w / 2, 0);
    ctx.stroke();
  } else if (item.type === 'icon') {
    ctx.font = `${Math.min(w, h)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.text || '★', 0, 0, w);
  } else if (item.type === 'image') {
    if (item.img) {
      ctx.drawImage(item.img, -w / 2, -h / 2, w, h);
    } else if (item.src) {
      loadImage(item.src).then(img => { item.img = img; render(); }).catch(() => {});
    }
  }

  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  if (showSelection && isSelected(item.id)) {
    drawSelectionBox(item, w, h);
  }

  ctx.restore();
}

function drawSelectionBox(item, w, h) {
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#6c4df6';
  ctx.lineWidth = Math.max(2, canvas.width / 900 * 2);
  ctx.setLineDash([8, 5]);
  ctx.strokeRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12);
  ctx.setLineDash([]);

  // Handles
  const handles = [
    [-w / 2 - 6, -h / 2 - 6],
    [w / 2 + 6, -h / 2 - 6],
    [-w / 2 - 6, h / 2 + 6],
    [w / 2 + 6, h / 2 + 6],
    [0, -h / 2 - 6],
    [0, h / 2 + 6],
    [-w / 2 - 6, 0],
    [w / 2 + 6, 0]
  ];
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#6c4df6';
  ctx.lineWidth = 2;
  handles.forEach(([hx, hy]) => {
    ctx.beginPath();
    ctx.arc(hx, hy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  // Handle de rotação
  ctx.beginPath();
  ctx.arc(0, -h / 2 - 26, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#6c4df6';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Linha até o handle de rotação
  ctx.beginPath();
  ctx.moveTo(0, -h / 2 - 6);
  ctx.lineTo(0, -h / 2 - 20);
  ctx.strokeStyle = '#6c4df6';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawPolygon(context, sides, w, h) {
  context.beginPath();
  const angleStep = (Math.PI * 2) / sides;
  const startAngle = -Math.PI / 2;
  for (let i = 0; i < sides; i++) {
    const a = startAngle + i * angleStep;
    const x = Math.cos(a) * w / 2;
    const y = Math.sin(a) * h / 2;
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

function roundRect(context, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + w - r, y);
  context.quadraticCurveTo(x + w, y, x + w, y + r);
  context.lineTo(x + w, y + h - r);
  context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  context.lineTo(x + r, y + h);
  context.quadraticCurveTo(x, y + h, x, y + h - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function drawCurvedText(context, text, item, fontSize, maxWidth) {
  const fs = fontSize;
  const align = item.align || 'center';
  const curve = item.textCurve / 100;
  const radius = Math.abs(curve) * 400 + 100;
  const chars = [...text];
  const totalWidth = chars.reduce((sum, ch) => sum + context.measureText(ch).width + (item.letterSpacing || 0), 0);
  let startAngle = -Math.PI / 2;

  if (curve > 0) startAngle = Math.PI / 2;
  const arcAngle = totalWidth / radius;

  context.font = `${item.italic ? 'italic ' : ''}${item.bold ? 'bold ' : ''}${fs}px "${item.font || 'Arial'}"`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = context.fillStyle;

  let acc = 0;
  chars.forEach((ch, i) => {
    const charW = context.measureText(ch).width + (item.letterSpacing || 0);
    const angleOffset = (acc + charW / 2) / radius * (curve > 0 ? -1 : 1);
    const angle = startAngle + angleOffset;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    context.save();
    context.translate(x, y);
    context.rotate(angle + (curve > 0 ? Math.PI : 0) + (curve > 0 ? -Math.PI / 2 : Math.PI / 2));
    context.fillText(ch, 0, 0);
    context.restore();
    acc += charW;
  });
}

function drawSpacedText(context, text, item, fs, maxWidth, lineH, spacing) {
  const align = item.align || 'center';
  const lines = wrapText(text, maxWidth + spacing * 5, fs);
  const start = -((lines.length - 1) * lineH) / 2;

  lines.forEach((line, index) => {
    const chars = [...line];
    const totalW = chars.reduce((s, c) => s + context.measureText(c).width + spacing, 0) - spacing;
    let startX;
    if (align === 'left') startX = -maxWidth / 2;
    else if (align === 'right') startX = maxWidth / 2 - totalW;
    else startX = -totalW / 2;

    let cx = startX;
    const cy = start + index * lineH;
    chars.forEach(ch => {
      const cw = context.measureText(ch).width;
      context.fillText(ch, cx + cw / 2, cy);
      cx += cw + spacing;
    });
  });
}

// ============================================================
// RENDER PRINCIPAL
// ============================================================
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Fundo
  if (!transparent) {
    if (bgMode === 'gradient') {
      const angle = (bgGradient.angle || 135) * Math.PI / 180;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const len = Math.max(canvas.width, canvas.height);
      const x1 = cx - Math.cos(angle) * len / 2;
      const y1 = cy - Math.sin(angle) * len / 2;
      const x2 = cx + Math.cos(angle) * len / 2;
      const y2 = cy + Math.sin(angle) * len / 2;
      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, bgGradient.c1);
      g.addColorStop(1, bgGradient.c2);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = bg;
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Grade
  if (showGrid) drawGrid();

  // Itens
  items.forEach(i => drawItem(i));

  // Multi-seleção — desenha um retângulo tracejado ao redor
  if (selectedIds.size > 1) drawMultiSelectionBounds();
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = 'rgba(108, 77, 246, .12)';
  ctx.lineWidth = 1;
  const step = Math.max(20, canvas.width / 40);
  for (let x = step; x < canvas.width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = step; y < canvas.height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMultiSelectionBounds() {
  const arr = selected();
  if (!arr || arr.length < 2) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  arr.forEach(i => {
    minX = Math.min(minX, i.x - i.w / 2);
    minY = Math.min(minY, i.y - i.h / 2);
    maxX = Math.max(maxX, i.x + i.w / 2);
    maxY = Math.max(maxY, i.y + i.h / 2);
  });
  ctx.save();
  ctx.strokeStyle = '#6c4df6';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(minX - 4, minY - 4, maxX - minX + 8, maxY - minY + 8);
  ctx.restore();
}

// ============================================================
// ZOOM / DIMENSÕES
// ============================================================
function applyZoom() {
  const maxW = Math.max(180, stage.clientWidth - 70);
  const maxH = Math.max(180, stage.clientHeight - 70);
  const fit = Math.min(maxW / canvas.width, maxH / canvas.height, 1);
  const actual = fit * zoom;
  frame.style.width = (canvas.width * actual) + 'px';
  frame.style.height = (canvas.height * actual) + 'px';
  canvas.style.width = (canvas.width * actual) + 'px';
  canvas.style.height = (canvas.height * actual) + 'px';
  $('zoomLabel').textContent = Math.round(zoom * 100) + '%';
}

function syncDimensions() {
  $('dimensions').textContent = `${canvas.width} × ${canvas.height} px`;
  $('canvasW').value = canvas.width;
  $('canvasH').value = canvas.height;
}

// ============================================================
// INSPECTOR
// ============================================================
function syncInspector() {
  const arr = selected();
  const empty = !arr;
  $('emptyInspector').classList.toggle('hidden', !empty);
  $('inspectorControls').classList.toggle('hidden', empty);

  if (empty) {
    $('selectedType').textContent = 'Nenhum item';
    $('selectionInfo').textContent = '';
    return;
  }

  const i = arr[0];
  $('selectedType').textContent = arr.length > 1
    ? arr.length + ' itens'
    : (({
        text: 'Texto', rect: 'Forma', circle: 'Forma', triangle: 'Forma',
        star: 'Forma', heart: 'Forma', line: 'Linha', image: 'Imagem',
        hexagon: 'Forma', pentagon: 'Forma', diamond: 'Forma', arrow: 'Seta',
        icon: 'Ícone'
      })[i.type] || 'Elemento');

  $('selectionInfo').textContent = arr.length > 1 ? `${arr.length} selecionados` : '';

  $('layerName').value = i.name || '';
  $('textControl').classList.toggle('hidden', i.type !== 'text' && i.type !== 'icon');
  $('fontControl').classList.toggle('hidden', i.type !== 'text' && i.type !== 'icon');
  $('textOptions').classList.toggle('hidden', i.type !== 'text');

  $('textValue').value = i.text || '';
  $('fontFamily').value = (i.font || 'Arial').replace(/['"]/g, '');
  $('fontSize').value = i.fontSize || 48;
  $('textAlign').value = i.align || 'center';
  $('letterSpacing').value = i.letterSpacing || 0;
  $('lineHeight').value = i.lineHeight || 1.2;
  $('textCurve').value = i.textCurve || 0;

  $('boldBtn').classList.toggle('active', !!i.bold);
  $('italicBtn').classList.toggle('active', !!i.italic);
  $('underlineBtn').classList.toggle('active', !!i.underline);
  $('uppercaseBtn').classList.toggle('active', !!i.uppercase);

  $('objectColor').value = toHex(i.color || '#222222');
  $('opacity').value = i.opacity ?? 100;

  // Gradiente
  const showGrad = i.type !== 'image' && i.type !== 'line';
  $('gradientControl').classList.toggle('hidden', !showGrad);
  document.querySelectorAll('[data-fill-mode]').forEach(b => {
    b.classList.toggle('active', (i.fillMode || 'solid') === b.dataset.fillMode);
  });
  $('fillGradient').classList.toggle('hidden', i.fillMode !== 'gradient');
  if (i.fillGradient) {
    $('fillGrad1').value = i.fillGradient.c1 || '#6c4df6';
    $('fillGrad2').value = i.fillGradient.c2 || '#ff6b9a';
    $('fillGradAngle').value = i.fillGradient.angle || 135;
  }

  // Raio de canto
  $('radiusControl').classList.toggle('hidden', i.type !== 'rect');
  $('cornerRadius').value = i.cornerRadius || 0;

  $('posX').value = Math.round(i.x);
  $('posY').value = Math.round(i.y);
  $('objW').value = Math.round(i.w);
  $('objH').value = Math.round(i.h);
  $('rotation').value = i.rotation || 0;
  $('rotationLabel').textContent = (i.rotation || 0) + '°';

  // Efeitos
  $('shadowRange').value = i.shadow || 0;
  $('shadowColor').value = i.shadowColor || '#000000';
  $('shadowBlur').value = i.shadowBlur || 10;
  $('strokeRange').value = i.stroke || 0;
  $('strokeColor').value = i.strokeColor || '#222222';
  $('glowRange').value = i.glow || 0;
}

function toHex(c) {
  if (!c) return '#222222';
  if (c.startsWith('#')) return c.length === 4 ? '#' + [1, 2, 3].map(k => c[k] + c[k]).join('') : c;
  return '#222222';
}

// ============================================================
// LAYERS
// ============================================================
function syncLayers() {
  const list = $('layersList');
  $('layerCount').textContent = items.length;
  if (!items.length) {
    list.innerHTML = '<p class="muted-note">Seus elementos aparecerão aqui.</p>';
    return;
  }
  list.innerHTML = '';
  [...items].reverse().forEach(i => {
    const b = document.createElement('button');
    b.className = 'layer-item' + (isSelected(i.id) ? ' selected' : '') + (i.locked ? ' locked' : '');
    b.innerHTML = `
      <span class="layer-icon">${({
        text: 'T', image: '▧', rect: '▰', circle: '◯', triangle: '△',
        star: '★', heart: '♥', line: '╱', hexagon: '⬡', pentagon: '⬠',
        diamond: '◆', arrow: '➤', icon: '★'
      })[i.type] || '◇'}</span>
      <span class="layer-name"></span>
      <span class="layer-eye" title="${i.visible ? 'Ocultar' : 'Mostrar'}">${i.visible ? '◉' : '○'}</span>
      <span class="layer-eye" title="${i.locked ? 'Desbloquear' : 'Bloquear'}">${i.locked ? '🔒' : '🔓'}</span>
    `;
    b.querySelector('.layer-name').textContent = i.name || i.text || 'Elemento';
    b.addEventListener('click', e => {
      const eyes = b.querySelectorAll('.layer-eye');
      if (e.target === eyes[0]) {
        i.visible = !i.visible;
        checkpoint(); render(); syncLayers();
        return;
      }
      if (e.target === eyes[1]) {
        i.locked = !i.locked;
        checkpoint(); syncLayers();
        return;
      }
      if (e.shiftKey) toggleSelect(i.id);
      else selectOnly(i.id);
      render(); syncInspector(); syncLayers();
    });
    list.appendChild(b);
  });
}

// ============================================================
// UPDATE SELECTED
// ============================================================
function updateSelected(key, value, rerender = true) {
  const arr = selected();
  if (!arr) return;
  arr.forEach(i => { i[key] = value; });
  if (rerender) { render(); syncLayers(); }
}

function bindInput(id, key, parse = v => v, multi = true) {
  const el = $(id);
  if (!el) return;
  el.addEventListener('input', () => {
    const val = parse(el.value);
    if (key === 'rotation') $('rotationLabel').textContent = val + '°';
    updateSelected(key, val);
  });
  el.addEventListener('change', () => { checkpoint(); status('Propriedade atualizada.'); });
}

// ============================================================
// ADICIONAR ELEMENTOS
// ============================================================
$('addHeading').onclick = () => addItem('text', {
  name: 'Título', text: 'Seu título aqui', fontSize: 72, bold: true,
  color: '#6c4df6', w: Math.min(800, canvas.width * .8), h: 130
});
$('addSubheading').onclick = () => addItem('text', {
  name: 'Subtítulo', text: 'Uma mensagem especial', fontSize: 43,
  color: '#29283a', w: Math.min(800, canvas.width * .8), h: 100
});
$('addBodyText').onclick = () => addItem('text', {
  name: 'Texto corrido', text: 'Escreva sua mensagem personalizada',
  fontSize: 29, color: '#29283a', w: Math.min(700, canvas.width * .75), h: 150
});

document.querySelectorAll('[data-add]').forEach(b => {
  b.onclick = () => {
    const t = b.dataset.add;
    addItem(t, {
      color: t === 'line' ? '#6c4df6' : '#ff6b9a',
      w: t === 'line' ? Math.min(300, canvas.width * .5) : 200,
      h: t === 'line' ? 5 : 160
    });
  };
});

// ============================================================
// ÍCONES
// ============================================================
const ICONS = {
  shapes: ['★', '☆', '♥', '♦', '♣', '♠', '●', '○', '■', '□', '▲', '▼', '◀', '▶', '◆', '◇', '⬡', '⬠', '✦', '✧', '✓', '✗', '⚡', '🔥'],
  faces: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😜', '🤪', '😝'],
  nature: ['🌸', '🌺', '🌻', '🌹', '🌷', '🌼', '🍀', '🌿', '🌱', '🌳', '🌲', '🌴', '🌵', '🍁', '🍂', '🍃', '🌾', '🌊', '☀️', '🌙', '⭐', '🌟', '✨', '💫'],
  food: ['🍕', '🍔', '🍟', '🌭', '🥪', '🌮', '🌯', '🥗', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🍤', '🍙', '🍘', '🍥', '🥠', '🍢', '🍡', '🍧', '🍨'],
  objects: ['📱', '💻', '🖥️', '⌨️', '🖱️', '🖨️', '📷', '📹', '🎥', '📺', '📻', '🎙️', '⏰', '⌚', '📚', '📖', '📝', '✏️', '🖊️', '🖌️', '🎨', '🎭', '🎬', '🎤'],
  symbols: ['❤️', '💔', '💕', '💖', '💗', '💓', '💞', '💝', '💘', '💌', '☮️', '☯️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☦️', '⚛️', '♈', '♉', '♊']
};

function buildIconGrids() {
  const maps = {
    iconGridShapes: ICONS.shapes,
    iconGridFaces: ICONS.faces,
    iconGridNature: ICONS.nature,
    iconGridFood: ICONS.food,
    iconGridObjects: ICONS.objects,
    iconGridSymbols: ICONS.symbols
  };
  Object.entries(maps).forEach(([id, arr]) => {
    const el = $(id);
    if (!el) return;
    el.innerHTML = arr.map(icon => `<button type="button">${icon}</button>`).join('');
    el.querySelectorAll('button').forEach((btn, idx) => {
      btn.onclick = () => {
        addItem('icon', {
          text: arr[idx],
          name: 'Ícone ' + arr[idx],
          w: 120, h: 120,
          color: '#222222'
        });
      };
    });
  });
}
buildIconGrids();

// ============================================================
// NAVEGAÇÃO LATERAL
// ============================================================
document.querySelectorAll('[data-panel]').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('[data-panel]').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('[data-panel-content]').forEach(x => x.classList.toggle('hidden', x.dataset.panelContent !== b.dataset.panel));
  };
});

// ============================================================
// UPLOADS
// ============================================================
$('uploadButton').onclick = () => $('imageInput').click();
$('imageInput').addEventListener('change', async e => {
  for (const file of [...e.target.files]) {
    if (!file.type.startsWith('image/')) continue;
    const src = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const img = await loadImage(src);
    const scale = Math.min(380 / img.width, 340 / img.height, 1);
    const item = addItem('image', {
      name: file.name.replace(/\.[^.]+$/, ''),
      src, img,
      w: img.width * scale,
      h: img.height * scale,
      color: '#222'
    });
    addUploadThumb(src, file.name, item.id);
  }
  e.target.value = '';
});

function addUploadThumb(src, name, id) {
  const wrap = document.createElement('div');
  wrap.className = 'upload-thumb';
  const im = document.createElement('img');
  im.src = src; im.alt = name;
  const b = document.createElement('button');
  b.textContent = 'Adicionar';
  b.onclick = () => {
    const original = items.find(x => x.id === id);
    if (!original) return;
    const c = { ...original, id: nextId++, x: canvas.width / 2, y: canvas.height / 2, name: original.name + ' cópia' };
    delete c.img;
    items.push(c);
    selectOnly(c.id);
    checkpoint(); render(); syncInspector(); syncLayers();
  };
  wrap.append(im, b);
  $('uploadList').prepend(wrap);
}

// ============================================================
// FUNDO
// ============================================================
document.querySelectorAll('[data-bg-mode]').forEach(b => {
  b.onclick = () => {
    bgMode = b.dataset.bgMode;
    document.querySelectorAll('[data-bg-mode]').forEach(x => x.classList.toggle('active', x === b));
    $('bgSolid').classList.toggle('hidden', bgMode !== 'solid');
    $('bgGradient').classList.toggle('hidden', bgMode !== 'gradient');
    transparent = false;
    render(); checkpoint();
  };
});

$('backgroundColor').oninput = e => { bg = e.target.value; transparent = false; render(); };
$('backgroundColor').onchange = checkpoint;
$('bgGrad1').oninput = e => { bgGradient.c1 = e.target.value; render(); };
$('bgGrad1').onchange = checkpoint;
$('bgGrad2').oninput = e => { bgGradient.c2 = e.target.value; render(); };
$('bgGrad2').onchange = checkpoint;
$('bgGradAngle').oninput = e => { bgGradient.angle = Number(e.target.value); render(); };
$('bgGradAngle').onchange = checkpoint;
$('transparentBackground').onclick = () => { transparent = true; render(); checkpoint(); notify('Fundo transparente ativado.'); };

// ============================================================
// TAMANHO
// ============================================================
$('preset').onchange = e => {
  if (PRESETS[e.target.value]) {
    $('canvasW').value = PRESETS[e.target.value][0];
    $('canvasH').value = PRESETS[e.target.value][1];
  }
};

$('applySize').onclick = () => {
  const w = Math.max(100, Math.min(5000, Number($('canvasW').value) || 1240));
  const h = Math.max(100, Math.min(5000, Number($('canvasH').value) || 561));
  canvas.width = w; canvas.height = h;
  render(); syncDimensions(); applyZoom(); checkpoint();
  status('Tamanho atualizado.');
};

document.querySelectorAll('[data-preset-quick]').forEach(b => {
  b.onclick = () => {
    const p = PRESETS[b.dataset.presetQuick];
    if (!p) return;
    $('canvasW').value = p[0];
    $('canvasH').value = p[1];
    $('applySize').click();
  };
});

// ============================================================
// TEMPLATES
// ============================================================
$('templateSearch').oninput = e => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.template-card').forEach(c => c.classList.toggle('hidden', !c.innerText.toLowerCase().includes(q)));
};

const templates = {
  birthday: { bg: '#fff0f4', items: [
    { type: 'text', name: 'Mensagem', text: 'Feliz', x: .5, y: .27, w: .8, h: .18, fontSize: 60, color: '#733d62', font: 'Georgia' },
    { type: 'text', name: 'Título', text: 'ANIVERSÁRIO', x: .5, y: .48, w: .9, h: .2, fontSize: 76, color: '#d34f8d', bold: true },
    { type: 'text', name: 'Detalhe', text: '✦ um dia para celebrar ✦', x: .5, y: .72, w: .9, h: .13, fontSize: 27, color: '#733d62' }
  ]},
  minimal: { bg: '#f6f1e7', items: [
    { type: 'text', name: 'Texto pequeno', text: 'feito com', x: .5, y: .37, w: .8, h: .15, fontSize: 38, color: '#3e3b32', font: 'Georgia' },
    { type: 'text', name: 'Título', text: 'amor ♡', x: .5, y: .56, w: .8, h: .23, fontSize: 88, color: '#b55b55', font: 'Georgia', bold: true }
  ]},
  floral: { bg: '#e7f1e5', items: [
    { type: 'text', name: 'Flor', text: '❀', x: .5, y: .23, w: .3, h: .18, fontSize: 78, color: '#3b6749' },
    { type: 'text', name: 'Título', text: 'Especial', x: .5, y: .48, w: .8, h: .2, fontSize: 67, color: '#3b6749', font: 'Georgia', bold: true },
    { type: 'text', name: 'Subtítulo', text: 'para você', x: .5, y: .68, w: .8, h: .13, fontSize: 34, color: '#3b6749', font: 'Georgia' }
  ]},
  bold: { bg: '#222222', items: [
    { type: 'text', name: 'Texto superior', text: 'YOUR', x: .5, y: .32, w: .8, h: .18, fontSize: 62, color: '#f8e4a1', bold: true },
    { type: 'text', name: 'Título', text: 'DESIGN', x: .5, y: .53, w: .95, h: .23, fontSize: 94, color: '#f8e4a1', bold: true },
    { type: 'text', name: 'Detalhe', text: 'MAKE IT YOURS', x: .5, y: .72, w: .8, h: .1, fontSize: 24, color: '#ffffff' }
  ]},
  sale: { bg: '#fff3c4', items: [
    { type: 'text', name: 'Topo', text: 'SUPER', x: .5, y: .3, w: .9, h: .2, fontSize: 80, color: '#a84800', bold: true },
    { type: 'text', name: 'Título', text: 'OFERTA', x: .5, y: .55, w: .95, h: .25, fontSize: 110, color: '#d13f00', bold: true },
    { type: 'text', name: 'Subtítulo', text: 'até 50% off', x: .5, y: .78, w: .8, h: .12, fontSize: 32, color: '#a84800' }
  ]},
  wedding: { bg: '#f4ecf7', items: [
    { type: 'text', name: 'Nome 1', text: 'Ana', x: .5, y: .3, w: .8, h: .18, fontSize: 72, color: '#5b2c6f', font: 'Georgia', italic: true },
    { type: 'text', name: 'E', text: '&', x: .5, y: .48, w: .2, h: .15, fontSize: 60, color: '#8e44ad', font: 'Georgia' },
    { type: 'text', name: 'Nome 2', text: 'Carlos', x: .5, y: .65, w: .8, h: .18, fontSize: 72, color: '#5b2c6f', font: 'Georgia', italic: true }
  ]}
};

document.querySelectorAll('[data-template]').forEach(b => {
  b.onclick = () => {
    const t = templates[b.dataset.template];
    if (!t) return;
    bg = t.bg; bgMode = 'solid'; transparent = false;
    items = []; clearSelection();
    t.items.forEach(d => {
      const props = { ...d, x: d.x * canvas.width, y: d.y * canvas.height, w: d.w * canvas.width, h: d.h * canvas.height };
      delete props.type;
      addItem(d.type, props, true);
    });
    clearSelection();
    if (items.length) selectOnly(items[items.length - 1].id);
    render(); syncInspector(); syncLayers();
    $('backgroundColor').value = bg;
    checkpoint();
    notify('Modelo aplicado. Personalize os textos e as cores.');
  };
});

// ============================================================
// INSPECTOR — bindings
// ============================================================
$('layerName').oninput = e => { updateSelected('name', e.target.value, false); syncLayers(); };
$('layerName').onchange = checkpoint;

$('textValue').oninput = e => updateSelected('text', e.target.value);
$('textValue').onchange = checkpoint;

$('fontFamily').onchange = e => { updateSelected('font', e.target.value); checkpoint(); };
$('fontSize').onchange = e => { updateSelected('fontSize', Math.max(6, Math.min(500, Number(e.target.value) || 48))); checkpoint(); };
$('textAlign').onchange = e => { updateSelected('align', e.target.value); checkpoint(); };

$('letterSpacing').oninput = e => updateSelected('letterSpacing', Number(e.target.value));
$('letterSpacing').onchange = checkpoint;
$('lineHeight').oninput = e => updateSelected('lineHeight', Number(e.target.value));
$('lineHeight').onchange = checkpoint;
$('textCurve').oninput = e => updateSelected('textCurve', Number(e.target.value));
$('textCurve').onchange = checkpoint;

$('boldBtn').onclick = () => { const arr = selected(); if (!arr) return; const v = !arr[0].bold; arr.forEach(i => i.bold = v); render(); syncInspector(); checkpoint(); };
$('italicBtn').onclick = () => { const arr = selected(); if (!arr) return; const v = !arr[0].italic; arr.forEach(i => i.italic = v); render(); syncInspector(); checkpoint(); };
$('underlineBtn').onclick = () => { const arr = selected(); if (!arr) return; const v = !arr[0].underline; arr.forEach(i => i.underline = v); render(); syncInspector(); checkpoint(); };
$('uppercaseBtn').onclick = () => { const arr = selected(); if (!arr) return; const v = !arr[0].uppercase; arr.forEach(i => i.uppercase = v); render(); syncInspector(); checkpoint(); };

$('objectColor').oninput = e => { updateSelected('color', e.target.value); };
$('objectColor').onchange = checkpoint;

$('opacity').oninput = e => updateSelected('opacity', Number(e.target.value));
$('opacity').onchange = checkpoint;

document.querySelectorAll('[data-fill-mode]').forEach(b => {
  b.onclick = () => {
    const arr = selected();
    if (!arr) return;
    const mode = b.dataset.fillMode;
    arr.forEach(i => i.fillMode = mode);
    document.querySelectorAll('[data-fill-mode]').forEach(x => x.classList.toggle('active', x === b));
    $('fillGradient').classList.toggle('hidden', mode !== 'gradient');
    render(); checkpoint();
  };
});

$('fillGrad1').oninput = e => { const arr = selected(); if (!arr) return; arr.forEach(i => { i.fillGradient = { ...(i.fillGradient || {}), c1: e.target.value }; }); render(); };
$('fillGrad1').onchange = checkpoint;
$('fillGrad2').oninput = e => { const arr = selected(); if (!arr) return; arr.forEach(i => { i.fillGradient = { ...(i.fillGradient || {}), c2: e.target.value }; }); render(); };
$('fillGrad2').onchange = checkpoint;
$('fillGradAngle').oninput = e => { const arr = selected(); if (!arr) return; arr.forEach(i => { i.fillGradient = { ...(i.fillGradient || {}), angle: Number(e.target.value) }; }); render(); };
$('fillGradAngle').onchange = checkpoint;

$('cornerRadius').oninput = e => updateSelected('cornerRadius', Number(e.target.value));
$('cornerRadius').onchange = checkpoint;

bindInput('posX', 'x', v => Number(v) || 0);
bindInput('posY', 'y', v => Number(v) || 0);
bindInput('objW', 'w', v => Math.max(1, Number(v) || 1));
bindInput('objH', 'h', v => Math.max(1, Number(v) || 1));
bindInput('rotation', 'rotation', v => Number(v) || 0);

// Efeitos
$('shadowRange').oninput = e => updateSelected('shadow', Number(e.target.value));
$('shadowRange').onchange = checkpoint;
$('shadowColor').oninput = e => updateSelected('shadowColor', e.target.value);
$('shadowColor').onchange = checkpoint;
$('shadowBlur').oninput = e => updateSelected('shadowBlur', Number(e.target.value));
$('shadowBlur').onchange = checkpoint;
$('strokeRange').oninput = e => updateSelected('stroke', Number(e.target.value));
$('strokeRange').onchange = checkpoint;
$('strokeColor').oninput = e => updateSelected('strokeColor', e.target.value);
$('strokeColor').onchange = checkpoint;
$('glowRange').oninput = e => updateSelected('glow', Number(e.target.value));
$('glowRange').onchange = checkpoint;
$('resetEffects').onclick = () => {
  const arr = selected();
  if (!arr) return;
  arr.forEach(i => {
    i.shadow = 0; i.shadowBlur = 10; i.shadowColor = '#000';
    i.stroke = 0; i.strokeColor = '#222'; i.glow = 0;
  });
  render(); syncInspector(); checkpoint();
};

// ============================================================
// DELETE / DUPLICATE / LAYER ORDER
// ============================================================
$('deleteBtn').onclick = deleteSelected;
$('deleteToolbarBtn').onclick = deleteSelected;

function deleteSelected() {
  if (!selectedIds.size) return;
  items = items.filter(i => !selectedIds.has(i.id));
  clearSelection();
  render(); syncInspector(); syncLayers(); checkpoint();
  status('Elemento(s) excluído(s).');
}

$('duplicateBtn').onclick = () => {
  const arr = selected();
  if (!arr) return;
  const newIds = [];
  arr.forEach(i => {
    const c = { ...i, id: nextId++, name: (i.name || 'Elemento') + ' cópia', x: i.x + 25, y: i.y + 25 };
    delete c.img;
    items.push(c);
    newIds.push(c.id);
  });
  clearSelection();
  newIds.forEach(id => selectedIds.add(id));
  checkpoint(); render(); syncInspector(); syncLayers();
};

$('bringFrontBtn').onclick = () => moveLayer('front');
$('sendBackBtn').onclick = () => moveLayer('back');
$('bringFrontOneBtn').onclick = () => moveLayer('front1');
$('sendBackOneBtn').onclick = () => moveLayer('back1');

function moveLayer(dir) {
  if (!selectedIds.size) return;
  const sel = items.filter(i => selectedIds.has(i.id));
  const rest = items.filter(i => !selectedIds.has(i.id));
  if (dir === 'front') items = [...rest, ...sel];
  else if (dir === 'back') items = [...sel, ...rest];
  else if (dir === 'front1') {
    sel.forEach(i => {
      const idx = items.indexOf(i);
      if (idx < items.length - 1) {
        [items[idx], items[idx + 1]] = [items[idx + 1], items[idx]];
      }
    });
  } else if (dir === 'back1') {
    [...sel].reverse().forEach(i => {
      const idx = items.indexOf(i);
      if (idx > 0) {
        [items[idx], items[idx - 1]] = [items[idx - 1], items[idx]];
      }
    });
  }
  checkpoint(); render(); syncLayers();
}

// ============================================================
// PALETA RÁPIDA
// ============================================================
document.querySelectorAll('[data-color]').forEach(b => {
  b.onclick = () => {
    const arr = selected();
    if (arr) {
      arr.forEach(i => i.color = b.dataset.color);
      checkpoint(); render(); syncInspector();
    } else {
      bg = b.dataset.color;
      bgMode = 'solid';
      transparent = false;
      $('backgroundColor').value = bg;
      document.querySelectorAll('[data-bg-mode]').forEach(x => x.classList.toggle('active', x.dataset.bgMode === 'solid'));
      $('bgSolid').classList.remove('hidden');
      $('bgGradient').classList.add('hidden');
      render(); checkpoint();
    }
  };
});

// ============================================================
// CANVAS — POINT / HIT / HANDLES
// ============================================================
function point(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * canvas.width / r.width,
    y: (e.clientY - r.top) * canvas.height / r.height
  };
}

function hit(i, p) {
  const a = (i.rotation || 0) * Math.PI / 180;
  const dx = p.x - i.x, dy = p.y - i.y;
  const rx = dx * Math.cos(a) + dy * Math.sin(a);
  const ry = -dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(rx) <= i.w / 2 + 8 && Math.abs(ry) <= i.h / 2 + 8;
}

function hitHandle(item, p) {
  const a = (item.rotation || 0) * Math.PI / 180;
  const dx = p.x - item.x, dy = p.y - item.y;
  const rx = dx * Math.cos(a) + dy * Math.sin(a);
  const ry = -dx * Math.sin(a) + dy * Math.cos(a);
  const w = item.w, h = item.h;

  const handles = [
    { name: 'nw', x: -w / 2 - 6, y: -h / 2 - 6 },
    { name: 'ne', x: w / 2 + 6, y: -h / 2 - 6 },
    { name: 'sw', x: -w / 2 - 6, y: h / 2 + 6 },
    { name: 'se', x: w / 2 + 6, y: h / 2 + 6 },
    { name: 'n', x: 0, y: -h / 2 - 6 },
    { name: 's', x: 0, y: h / 2 + 6 },
    { name: 'w', x: -w / 2 - 6, y: 0 },
    { name: 'e', x: w / 2 + 6, y: 0 },
    { name: 'rot', x: 0, y: -h / 2 - 26 }
  ];

  for (const hd of handles) {
    const hdx = rx - hd.x, hdy = ry - hd.y;
    if (Math.sqrt(hdx * hdx + hdy * hdy) < 12) return hd.name;
  }
  return null;
}

// ============================================================
// CANVAS — POINTER EVENTS
// ============================================================
canvas.addEventListener('pointerdown', e => {
  // Pan: espaço apertado ou botão do meio
  if (e.button === 1 || (e.button === 0 && e.shiftKey && e.altKey)) {
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    canvas.classList.add('grabbing');
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  if (e.button !== 0) return;

  const p = point(e);

  // Prioriza interação com handles de itens selecionados
  const sel = selected();
  if (sel) {
    for (const item of sel) {
      if (item.locked) continue;
      const hd = hitHandle(item, p);
      if (hd === 'rot') {
        isRotating = true;
        rotateStart = {
          item,
          centerX: item.x,
          centerY: item.y,
          startRotation: item.rotation || 0,
          startAngle: Math.atan2(p.y - item.y, p.x - item.x) * 180 / Math.PI
        };
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (hd) {
        isResizing = true;
        resizeHandle = hd;
        resizeStart = {
          items: sel.map(i => ({ id: i.id, x: i.x, y: i.y, w: i.w, h: i.h, rot: i.rotation || 0 })),
          mouse: { x: p.x, y: p.y },
          pivot: { x: item.x, y: item.y }
        };
        canvas.setPointerCapture(e.pointerId);
        return;
      }
    }
  }

  // Hit em item
  const found = [...items].reverse().find(i => i.visible && !i.locked && hit(i, p));

  if (found) {
    if (e.shiftKey) {
      toggleSelect(found.id);
    } else if (!isSelected(found.id)) {
      selectOnly(found.id);
    }
    isDragging = true;
    dragDelta = { x: p.x - found.x, y: p.y - found.y };
    canvas.setPointerCapture(e.pointerId);
  } else {
    if (!e.shiftKey) clearSelection();
    // seleção por retângulo
    isDragging = 'marquee';
    dragDelta = { x: p.x, y: p.y };
    canvas.setPointerCapture(e.pointerId);
  }

  render(); syncInspector(); syncLayers();
});

canvas.addEventListener('pointermove', e => {
  const p = point(e);

  if (isPanning) {
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    stage.scrollLeft -= dx;
    stage.scrollTop -= dy;
    panStart = { x: e.clientX, y: e.clientY };
    return;
  }

  if (isRotating && rotateStart) {
    const angle = Math.atan2(p.y - rotateStart.centerY, p.x - rotateStart.centerX) * 180 / Math.PI;
    const delta = angle - rotateStart.startAngle;
    rotateStart.item.rotation = Math.round(rotateStart.startRotation + delta);
    render();
    $('rotation').value = rotateStart.item.rotation;
    $('rotationLabel').textContent = rotateStart.item.rotation + '°';
    return;
  }

  if (isResizing && resizeStart) {
    const dx = p.x - resizeStart.mouse.x;
    const dy = p.y - resizeStart.mouse.y;
    resizeStart.items.forEach(orig => {
      const item = items.find(i => i.id === orig.id);
      if (!item) return;
      let nw = orig.w, nh = orig.h, nx = orig.x, ny = orig.y;
      if (resizeHandle.includes('e')) nw = Math.max(20, orig.w + dx);
      if (resizeHandle.includes('w')) { nw = Math.max(20, orig.w - dx); nx = orig.x + (orig.w - nw); }
      if (resizeHandle.includes('s')) nh = Math.max(20, orig.h + dy);
      if (resizeHandle.includes('n')) { nh = Math.max(20, orig.h - dy); ny = orig.y + (orig.h - nh); }
      item.w = nw; item.h = nh; item.x = nx; item.y = ny;
    });
    render();
    return;
  }

  if (isDragging === 'marquee') {
    // Seleção por retângulo
    const startX = dragDelta.x, startY = dragDelta.y;
    const minX = Math.min(startX, p.x);
    const maxX = Math.max(startX, p.x);
    const minY = Math.min(startY, p.y);
    const maxY = Math.max(startY, p.y);

    items.forEach(i => {
      const itemMinX = i.x - i.w / 2;
      const itemMaxX = i.x + i.w / 2;
      const itemMinY = i.y - i.h / 2;
      const itemMaxY = i.y + i.h / 2;
      const intersects = !(itemMaxX < minX || itemMinX > maxX || itemMaxY < minY || itemMinY > maxY);
      if (intersects) selectedIds.add(i.id);
      else if (!e.shiftKey) selectedIds.delete(i.id);
    });
    render();
    // marquee visual
    ctx.save();
    ctx.strokeStyle = '#6c4df6';
    ctx.fillStyle = 'rgba(108,77,246,0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
    ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
    ctx.restore();
    return;
  }

  if (!isDragging) {
    // Atualiza cursor
    const sel = selected();
    if (sel) {
      for (const item of sel) {
        const hd = hitHandle(item, p);
        if (hd === 'rot') { canvas.style.cursor = 'grab'; return; }
        if (hd) {
          const map = { nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', se: 'nwse-resize', n: 'ns-resize', s: 'ns-resize', w: 'ew-resize', e: 'ew-resize' };
          canvas.style.cursor = map[hd] || 'default';
          return;
        }
      }
    }
    const found = [...items].reverse().find(i => i.visible && !i.locked && hit(i, p));
    canvas.style.cursor = found ? 'move' : 'default';
    return;
  }

  // Drag normal
  const arr = selected();
  if (!arr) return;
  const dx = p.x - dragDelta.x - arr[0].x;
  const dy = p.y - dragDelta.y - arr[0].y;
  arr.forEach(item => {
    if (item.locked) return;
    item.x += dx;
    item.y += dy;
  });
  dragDelta = { x: p.x - arr[0].x, y: p.y - arr[0].y };

  // Snap
  if (snapEnabled) applySnap(arr);

  render();
  const a = arr[0];
  $('posX').value = Math.round(a.x);
  $('posY').value = Math.round(a.y);
});

canvas.addEventListener('pointerup', () => {
  if (isDragging || isResizing || isRotating || isPanning) {
    if (isDragging === 'marquee') {
      // noop
    }
    isDragging = false;
    isResizing = false;
    isRotating = false;
    isPanning = false;
    canvas.classList.remove('grabbing');
    clearGuides();
    checkpoint();
    syncInspector();
    syncLayers();
  }
});

canvas.addEventListener('pointercancel', () => {
  isDragging = isResizing = isRotating = isPanning = false;
  clearGuides();
});

// Zoom com Ctrl+scroll
stage.addEventListener('wheel', e => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    if (e.deltaY < 0) zoom = Math.min(4, zoom + .08);
    else zoom = Math.max(.15, zoom - .08);
    applyZoom();
  }
}, { passive: false });

// ============================================================
// SNAP
// ============================================================
function applySnap(arr) {
  const item = arr[0];
  const snapLines = [];
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const threshold = SNAP_THRESHOLD;

  // Snap ao centro do canvas
  if (Math.abs(item.x - centerX) < threshold) {
    item.x = centerX;
    snapLines.push({ type: 'v', pos: centerX });
  }
  if (Math.abs(item.y - centerY) < threshold) {
    item.y = centerY;
    snapLines.push({ type: 'h', pos: centerY });
  }

  // Snap a outros itens
  items.forEach(other => {
    if (arr.includes(other)) return;
    if (!other.visible) return;
    // Bordas
    if (Math.abs((item.x - item.w / 2) - (other.x - other.w / 2)) < threshold) {
      item.x = other.x - other.w / 2 + item.w / 2;
      snapLines.push({ type: 'v', pos: other.x - other.w / 2 });
    }
    if (Math.abs((item.x + item.w / 2) - (other.x + other.w / 2)) < threshold) {
      item.x = other.x + other.w / 2 - item.w / 2;
      snapLines.push({ type: 'v', pos: other.x + other.w / 2 });
    }
    if (Math.abs(item.y - other.y) < threshold) {
      item.y = other.y;
      snapLines.push({ type: 'h', pos: other.y });
    }
    if (Math.abs(item.x - other.x) < threshold) {
      item.x = other.x;
      snapLines.push({ type: 'v', pos: other.x });
    }
  });

  drawGuides(snapLines);
}

function drawGuides(lines) {
  guidesEl.innerHTML = '';
  lines.forEach(l => {
    const div = document.createElement('div');
    div.className = 'guide-line ' + l.type;
    if (l.type === 'v') {
      div.style.left = (l.pos / canvas.width * 100) + '%';
    } else {
      div.style.top = (l.pos / canvas.height * 100) + '%';
    }
    guidesEl.appendChild(div);
  });
}
function clearGuides() { guidesEl.innerHTML = ''; }

// ============================================================
// ZOOM BUTTONS
// ============================================================
$('zoomIn').onclick = () => { zoom = Math.min(4, zoom + .1); applyZoom(); };
$('zoomOut').onclick = () => { zoom = Math.max(.15, zoom - .1); applyZoom(); };
$('fitCanvas').onclick = () => { zoom = 1; applyZoom(); };
$('gridToggle').onclick = () => { showGrid = !showGrid; $('gridToggle').classList.toggle('active', showGrid); render(); };
$('snapToggle').onclick = () => { snapEnabled = !snapEnabled; $('snapToggle').classList.toggle('active', snapEnabled); notify(snapEnabled ? '🧲 Ímãs ativados' : 'Ímãs desativados'); };

// ============================================================
// ALINHAR / DISTRIBUIR
// ============================================================
document.querySelectorAll('[data-align]').forEach(b => {
  b.onclick = () => alignAction(b.dataset.align);
});

function alignAction(action) {
  const arr = selected();
  if (!arr) return;

  if (action === 'dist-h' || action === 'dist-v') {
    if (arr.length < 3) { notify('Selecione 3+ elementos para distribuir.'); return; }
    const sorted = [...arr].sort((a, b) => action === 'dist-h' ? a.x - b.x : a.y - b.y);
    const first = sorted[0], last = sorted[sorted.length - 1];
    if (action === 'dist-h') {
      const totalW = sorted.reduce((s, i) => s + i.w, 0);
      const gap = (last.x - first.x - totalW + sorted[0].w / 2 + last.w / 2) / (sorted.length - 1);
      let cx = first.x;
      sorted.forEach((i, idx) => {
        if (idx === 0) { cx = i.x; return; }
        cx += sorted[idx - 1].w / 2 + gap + i.w / 2;
        i.x = cx;
      });
    } else {
      const totalH = sorted.reduce((s, i) => s + i.h, 0);
      const gap = (last.y - first.y - totalH + sorted[0].h / 2 + last.h / 2) / (sorted.length - 1);
      let cy = first.y;
      sorted.forEach((i, idx) => {
        if (idx === 0) { cy = i.y; return; }
        cy += sorted[idx - 1].h / 2 + gap + i.h / 2;
        i.y = cy;
      });
    }
    checkpoint(); render(); syncInspector();
    return;
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  arr.forEach(i => {
    minX = Math.min(minX, i.x - i.w / 2);
    maxX = Math.max(maxX, i.x + i.w / 2);
    minY = Math.min(minY, i.y - i.h / 2);
    maxY = Math.max(maxY, i.y + i.h / 2);
  });

  if (action === 'center-canvas') {
    arr.forEach(i => {
      i.x = canvas.width / 2;
      i.y = canvas.height / 2;
    });
  } else if (arr.length === 1) {
    const i = arr[0];
    if (action === 'left') i.x = i.w / 2;
    else if (action === 'right') i.x = canvas.width - i.w / 2;
    else if (action === 'top') i.y = i.h / 2;
    else if (action === 'bottom') i.y = canvas.height - i.h / 2;
    else if (action === 'center-h') i.x = canvas.width / 2;
    else if (action === 'center-v') i.y = canvas.height / 2;
  } else {
    if (action === 'left') arr.forEach(i => i.x = minX + i.w / 2);
    else if (action === 'right') arr.forEach(i => i.x = maxX - i.w / 2);
    else if (action === 'top') arr.forEach(i => i.y = minY + i.h / 2);
    else if (action === 'bottom') arr.forEach(i => i.y = maxY - i.h / 2);
    else if (action === 'center-h') arr.forEach(i => i.x = (minX + maxX) / 2);
    else if (action === 'center-v') arr.forEach(i => i.y = (minY + maxY) / 2);
  }
  checkpoint(); render(); syncInspector();
}

// ============================================================
// AGRUPAR / BLOQUEAR / FLIP
// ============================================================
$('groupBtn').onclick = () => {
  if (selectedIds.size < 2) { notify('Selecione 2+ elementos.'); return; }
  const gid = 'g_' + Date.now();
  selected().forEach(i => i.groupId = gid);
  checkpoint(); syncLayers();
  notify('Elementos agrupados.');
};
$('ungroupBtn').onclick = () => {
  const arr = selected();
  if (!arr) return;
  arr.forEach(i => i.groupId = null);
  checkpoint(); syncLayers();
  notify('Elementos desagrupados.');
};
$('lockBtn').onclick = () => {
  const arr = selected();
  if (!arr) return;
  const lock = !arr[0].locked;
  arr.forEach(i => i.locked = lock);
  checkpoint(); syncLayers();
  notify(lock ? 'Bloqueado' : 'Desbloqueado');
};
$('flipHBtn').onclick = () => { const arr = selected(); if (!arr) return; arr.forEach(i => i.flipH = !i.flipH); render(); checkpoint(); };
$('flipVBtn').onclick = () => { const arr = selected(); if (!arr) return; arr.forEach(i => i.flipV = !i.flipV); render(); checkpoint(); };

// ============================================================
// EXPORTAR PNG
// ============================================================
function exportPNG() {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const oc = out.getContext('2d');

  if (!transparent) {
    if (bgMode === 'gradient') {
      const angle = (bgGradient.angle || 135) * Math.PI / 180;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const len = Math.max(canvas.width, canvas.height);
      const x1 = cx - Math.cos(angle) * len / 2;
      const y1 = cy - Math.sin(angle) * len / 2;
      const x2 = cx + Math.cos(angle) * len / 2;
      const y2 = cy + Math.sin(angle) * len / 2;
      const g = oc.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, bgGradient.c1);
      g.addColorStop(1, bgGradient.c2);
      oc.fillStyle = g;
    } else {
      oc.fillStyle = bg;
    }
    oc.fillRect(0, 0, out.width, out.height);
  }

  items.forEach(i => drawExportItem(oc, i));

  const projectName = ($('projectName').value || 'minha-arte')
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-');

  out.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = projectName + '.png';
    a.href = url;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);

    status('Arquivo PNG salvo.');
    notify('✅ Arte salva! Volte ao catálogo e anexe este PNG no produto.');
  }, 'image/png');
}

function drawExportItem(c, i) {
  if (!i.visible) return;
  c.save();
  c.globalAlpha = (i.opacity ?? 100) / 100;
  c.translate(i.x, i.y);
  c.rotate((i.rotation || 0) * Math.PI / 180);
  if (i.flipH || i.flipV) {
    c.scale(i.flipH ? -1 : 1, i.flipV ? -1 : 1);
  }
  const w = i.w || 100, h = i.h || 60;

  if (i.shadow > 0) {
    c.shadowColor = i.shadowColor || '#000';
    c.shadowBlur = i.shadowBlur || 10;
    c.shadowOffsetX = i.shadow;
    c.shadowOffsetY = i.shadow;
  }

  let fillStyle = i.color || '#222';
  if (i.fillMode === 'gradient' && i.fillGradient) {
    const g = c.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    g.addColorStop(0, i.fillGradient.c1 || '#6c4df6');
    g.addColorStop(1, i.fillGradient.c2 || '#ff6b9a');
    fillStyle = g;
  }

  c.fillStyle = fillStyle;
  c.strokeStyle = i.color || '#222';
  c.lineWidth = Math.max(2, Math.min(w, h) * .025);

  if (i.type === 'text') {
    c.fillStyle = fillStyle;
    c.textAlign = i.align || 'center';
    c.textBaseline = 'middle';
    const text = i.uppercase ? String(i.text).toUpperCase() : String(i.text);
    const fs = i.fontSize || 48;
    const lineH = (i.lineHeight || 1.2) * fs;
    c.font = `${i.italic ? 'italic ' : ''}${i.bold ? 'bold ' : ''}${fs}px "${i.font || 'Arial'}"`;

    if (i.textCurve && Math.abs(i.textCurve) > 0) {
      drawCurvedText(c, text, i, fs, w);
    } else {
      const words = text.split(/\s+/);
      const lines = [];
      let line = '';
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (c.measureText(test).width > w && line) { lines.push(line); line = word; }
        else line = test;
      }
      if (line) lines.push(line);
      const start = -((lines.length - 1) * lineH) / 2;
      lines.forEach((ln, n) => {
        const tx = i.align === 'left' ? -w / 2 : i.align === 'right' ? w / 2 : 0;
        c.fillText(ln, tx, start + n * lineH, w);
        if (i.underline) {
          const m = c.measureText(ln).width;
          let ux = tx - m / 2;
          if (i.align === 'left') ux = tx;
          if (i.align === 'right') ux = tx - m;
          c.beginPath();
          c.moveTo(ux, start + n * lineH + fs * .42);
          c.lineTo(ux + m, start + n * lineH + fs * .42);
          c.stroke();
        }
      });
    }
  } else if (i.type === 'rect') {
    if (i.cornerRadius > 0) {
      roundRect(c, -w / 2, -h / 2, w, h, i.cornerRadius);
      c.fill();
      if (i.stroke > 0) { c.lineWidth = i.stroke; c.strokeStyle = i.strokeColor; c.stroke(); }
    } else {
      c.fillRect(-w / 2, -h / 2, w, h);
      if (i.stroke > 0) { c.lineWidth = i.stroke; c.strokeStyle = i.strokeColor; c.strokeRect(-w / 2, -h / 2, w, h); }
    }
  } else if (i.type === 'circle') {
    c.beginPath(); c.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); c.fill();
    if (i.stroke > 0) { c.lineWidth = i.stroke; c.strokeStyle = i.strokeColor; c.stroke(); }
  } else if (i.type === 'triangle') {
    c.beginPath(); c.moveTo(0, -h / 2); c.lineTo(w / 2, h / 2); c.lineTo(-w / 2, h / 2); c.closePath(); c.fill();
  } else if (i.type === 'hexagon') {
    drawPolygon(c, 6, w, h); c.fill();
  } else if (i.type === 'pentagon') {
    drawPolygon(c, 5, w, h); c.fill();
  } else if (i.type === 'diamond') {
    c.beginPath(); c.moveTo(0, -h / 2); c.lineTo(w / 2, 0); c.lineTo(0, h / 2); c.lineTo(-w / 2, 0); c.closePath(); c.fill();
  } else if (i.type === 'arrow') {
    c.beginPath();
    c.moveTo(-w / 2, -h / 6); c.lineTo(w / 6, -h / 6); c.lineTo(w / 6, -h / 2);
    c.lineTo(w / 2, 0); c.lineTo(w / 6, h / 2); c.lineTo(w / 6, h / 6);
    c.lineTo(-w / 2, h / 6); c.closePath(); c.fill();
  } else if (i.type === 'star' || i.type === 'heart' || i.type === 'icon') {
    c.font = `${Math.min(w, h)}px Arial`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const txt = i.type === 'star' ? '★' : i.type === 'heart' ? '♥' : (i.text || '★');
    c.fillText(txt, 0, 0, w);
  } else if (i.type === 'line') {
    c.beginPath(); c.moveTo(-w / 2, 0); c.lineTo(w / 2, 0); c.stroke();
  } else if (i.type === 'image' && i.img) {
    c.drawImage(i.img, -w / 2, -h / 2, w, h);
  }
  c.restore();
}

$('exportBtn').onclick = exportPNG;

// ============================================================
// SALVAR / ABRIR PROJETO
// ============================================================
function projectData() {
  return {
    app: 'Personaliza Studio',
    version: 3,
    name: $('projectName').value,
    width: canvas.width,
    height: canvas.height,
    background: bg,
    bgMode,
    bgGradient,
    transparent,
    items: items.map(i => { const c = { ...i }; delete c.img; return c; })
  };
}

$('saveProjectBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(projectData(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = ($('projectName').value || 'projeto').trim().replace(/[^\p{L}\p{N}_-]+/gu, '-') + '.json';
  a.click();
  URL.revokeObjectURL(url);
  notify('Projeto salvo em JSON.');
};

$('openProjectBtn').onclick = () => $('projectInput').click();

$('projectInput').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    canvas.width = d.width || 1240;
    canvas.height = d.height || 561;
    bg = d.background || '#fff';
    bgMode = d.bgMode || 'solid';
    bgGradient = d.bgGradient || { c1: '#6c4df6', c2: '#ff6b9a', angle: 135 };
    transparent = !!d.transparent;
    items = d.items || [];
    nextId = Math.max(1, ...items.map(i => i.id + 1));
    for (const i of items) {
      if (i.type === 'image' && i.src) {
        try { i.img = await loadImage(i.src); } catch (e) {}
      }
    }
    clearSelection();
    render(); syncInspector(); syncLayers(); syncDimensions(); applyZoom();
    checkpoint();
    $('projectName').value = d.name || 'Projeto importado';
    $('backgroundColor').value = bg;
    notify('Projeto aberto.');
  } catch (err) {
    notify('Não foi possível abrir esse arquivo de projeto.');
  }
  e.target.value = '';
};

// ============================================================
// UNDO / REDO
// ============================================================
$('undoBtn').onclick = undo;
$('redoBtn').onclick = redo;

// ============================================================
// COPIAR / COLAR / CORTAR
// ============================================================
function copySelection() {
  const arr = selected();
  if (!arr) return;
  clipboard = arr.map(i => { const c = { ...i }; delete c.img; return c; });
  notify('Copiado.');
}
function cutSelection() {
  copySelection();
  deleteSelected();
}
function pasteClipboard() {
  if (!clipboard || !clipboard.length) return;
  const newIds = [];
  clipboard.forEach(orig => {
    const c = { ...orig, id: nextId++, x: orig.x + 30, y: orig.y + 30 };
    items.push(c);
    newIds.push(c.id);
  });
  clearSelection();
  newIds.forEach(id => selectedIds.add(id));
  checkpoint(); render(); syncInspector(); syncLayers();
  notify('Colado.');
}

// ============================================================
// TECLADO
// ============================================================
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName;
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
  const ctrl = e.ctrlKey || e.metaKey;

  if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if (ctrl && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); return; }
  if (!typing && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); deleteSelected(); return; }
  if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); $('duplicateBtn').click(); return; }
  if (ctrl && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(); return; }
  if (ctrl && e.key.toLowerCase() === 'x') { e.preventDefault(); cutSelection(); return; }
  if (ctrl && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); return; }
  if (ctrl && e.key.toLowerCase() === 'a') { e.preventDefault(); items.forEach(i => selectedIds.add(i.id)); render(); syncInspector(); syncLayers(); return; }
  if (ctrl && e.key.toLowerCase() === 'g') { e.preventDefault(); $('groupBtn').click(); return; }

  if (typing) return;

  // Setas
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    const arr = selected();
    if (!arr) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    arr.forEach(i => {
      if (i.locked) return;
      if (e.key === 'ArrowUp') i.y -= step;
      if (e.key === 'ArrowDown') i.y += step;
      if (e.key === 'ArrowLeft') i.x -= step;
      if (e.key === 'ArrowRight') i.x += step;
    });
    render();
    const a = arr[0];
    $('posX').value = Math.round(a.x);
    $('posY').value = Math.round(a.y);
    clearTimeout(window._arrowTimer);
    window._arrowTimer = setTimeout(() => { checkpoint(); syncInspector(); }, 300);
  }

  if (e.key === 'Escape') { clearSelection(); render(); syncInspector(); syncLayers(); }
});

// ============================================================
// RESIZE
// ============================================================
window.addEventListener('resize', applyZoom);

// ============================================================
// INIT
// ============================================================
function init() {
  const params = new URLSearchParams(window.location.search);
  const formato = params.get('formato');
  const mapa = { caneca: 'mug', camiseta: 'shirt', azulejo: 'tile', foto: 'photo', banner: 'banner', story: 'story', post: 'post', cartao: 'card' };

  if (formato && mapa[formato]) {
    const [w, h] = PRESETS[mapa[formato]];
    canvas.width = w;
    canvas.height = h;
    $('preset').value = mapa[formato];
  }

  addItem('text', {
    name: 'Título',
    text: 'Sua arte começa aqui!',
    fontSize: 58,
    bold: true,
    color: '#6c4df6',
    w: Math.min(850, canvas.width * .8),
    h: 130
  }, true);

  clearSelection();
  checkpoint();
  applyZoom();
  syncDimensions();
  syncLayers();
  syncInspector();
  $('backgroundColor').value = bg;
}

init();

})();
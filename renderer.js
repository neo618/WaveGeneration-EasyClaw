// ============================================================
// 多通道波形CSV生成工具 - 前端渲染逻辑
// ============================================================

// 通道颜色
const CHANNEL_COLORS = [
  '#ff6b6b', '#4ecdc4', '#ffe66d', '#a29bfe', '#fd79a8',
  '#00cec9', '#fdcb6e', '#6c5ce7', '#e17055', '#74b9ff'
];

// 波形类型定义
const WAVE_TYPES = [
  { id: 'sin',    name: '正弦波' },
  { id: 'square', name: '方波' },
  { id: 'triangle', name: '三角波' },
  { id: 'random', name: '均匀随机数' }
];

// ---- DOM 引用 ----
const elTimeInterval = document.getElementById('timeInterval');
const elDataLength    = document.getElementById('dataLength');
const elChannelNum    = document.getElementById('channelNum');
const elChannelConfigs = document.getElementById('channelConfigs');
const elBtnGenerate   = document.getElementById('btnGenerate');
const elStatusText    = document.getElementById('statusText');
const elStatusIndicator = document.getElementById('statusIndicator');
const elPresetName    = document.getElementById('presetName');
const elBtnSavePreset = document.getElementById('btnSavePreset');
const elPresetSelect  = document.getElementById('presetSelect');
const elBtnLoadPreset = document.getElementById('btnLoadPreset');
const elCanvas        = document.getElementById('waveCanvas');
const elChannelLegend = document.getElementById('channelLegend');
const elWaveCanvas    = document.getElementById('waveCanvas');

// ---- 新增 DOM 引用 ----
const elCanvasWrapper = document.getElementById('canvasWrapper');
const elBtnZoomIn = document.getElementById('btnZoomIn');
const elBtnZoomOut = document.getElementById('btnZoomOut');
const elBtnZoomFit = document.getElementById('btnZoomFit');
const elBtnZoomReset = document.getElementById('btnZoomReset');
const elZoomRangeX = document.getElementById('zoomRangeX');

// ---- 内部状态 ----
let currentChannels = [];    // 当前通道参数配置数组

// 缩放/视口状态
let viewRange = { xMin: 0, xMax: 0, yMin: 0, yMax: 0 }; // 当前视口范围
let defaultViewRange = { xMin: 0, xMax: 0, yMin: 0, yMax: 0 }; // 默认全范围
let channelVisibility = []; // 每个通道是否可见

// 框选状态
let isSelecting = false;
let selectStart = { x: 0, y: 0 };
let selectEnd = { x: 0, y: 0 };
let selectionRect = null;

// 拖拽平移状态
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panViewStart = { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };

// ---- 初始化 ----
function init() {
  // 读取全局参数默认值
  const ti = parseFloat(elTimeInterval.value) || 2;
  const dl = parseInt(elDataLength.value) || 2048;
  const cn = parseInt(elChannelNum.value) || 2;
  rebuildChannels(cn);
  refreshPresetList();
  // 重置视口
  viewRange = { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
}

// ---- 全局参数变更 ----
elTimeInterval.addEventListener('input', onGlobalParamChange);
elDataLength.addEventListener('input', onGlobalParamChange);
elChannelNum.addEventListener('input', () => {
  const cn = parseInt(elChannelNum.value) || 2;
  const clamped = Math.max(1, Math.min(10, cn));
  elChannelNum.value = clamped;
  rebuildChannels(clamped);
  onGlobalParamChange();
});

// ---- 通道数量变更时重建通道卡片 ----
function rebuildChannels(count) {
  // 保留已有通道配置
  const oldChannels = [...currentChannels];
  currentChannels = [];
  for (let i = 0; i < count; i++) {
    if (oldChannels[i]) {
      currentChannels.push({ ...oldChannels[i] });
    } else {
      currentChannels.push(createDefaultChannel(i));
    }
  }

  // 重建 DOM
  elChannelConfigs.innerHTML = '';
  for (let i = 0; i < count; i++) {
    elChannelConfigs.appendChild(createChannelCard(i, currentChannels[i]));
  }

  // 同步通道可见性数组
  const newVis = new Array(count).fill(true);
  for (let i = 0; i < Math.min(count, channelVisibility.length); i++) {
    newVis[i] = channelVisibility[i];
  }
  channelVisibility = newVis;

  onGlobalParamChange();
}

function createDefaultChannel(index) {
  return {
    type: 'sin',
    amplitude: 10,
    frequency: 50,
    dcOffset: 0,
    phase: 0,
    randomMin: 0,
    randomMax: 1,
    squareAmplitude: 5,
    squareFrequency: 50,
    squareDuty: 50,
    triAmplitude: 5,
    triFrequency: 50
  };
}

// ---- 创建通道卡片 ----
function createChannelCard(index, config) {
  const card = document.createElement('div');
  card.className = 'channel-card active';
  card.dataset.index = index;

  const color = CHANNEL_COLORS[index];

  // 头部
  const header = document.createElement('div');
  header.className = 'channel-card-header';
  header.innerHTML = `
    <div class="channel-label">
      <span class="channel-color-dot" style="background:${color};"></span>
      通道 ${index + 1}
    </div>
  `;

  const select = document.createElement('select');
  select.className = 'channel-type-select';
  WAVE_TYPES.forEach(wt => {
    const opt = document.createElement('option');
    opt.value = wt.id;
    opt.textContent = wt.name;
    if (wt.id === config.type) opt.selected = true;
    select.appendChild(opt);
  });

  select.addEventListener('change', () => {
    config.type = select.value;
    updateChannelParamsUI(card, index, config);
    onGlobalParamChange();
  });

  header.appendChild(select);
  card.appendChild(header);

  // 参数区
  const paramsDiv = document.createElement('div');
  paramsDiv.className = 'channel-params';
  card.appendChild(paramsDiv);

  updateChannelParamsUI(card, index, config);

  return card;
}

// ---- 更新通道参数 UI ----
function updateChannelParamsUI(card, index, config) {
  const paramsDiv = card.querySelector('.channel-params');
  paramsDiv.innerHTML = '';

  switch (config.type) {
    case 'sin':
      paramsDiv.appendChild(makeParamInput('幅值', 'amplitude', config.amplitude, index));
      paramsDiv.appendChild(makeParamInput('频率 (Hz)', 'frequency', config.frequency, index));
      paramsDiv.appendChild(makeParamInput('直流偏移', 'dcOffset', config.dcOffset, index));
      paramsDiv.appendChild(makeParamInput('初始相位 (°)', 'phase', config.phase, index));
      break;
    case 'square':
      paramsDiv.appendChild(makeParamInput('幅值', 'squareAmplitude', config.squareAmplitude, index));
      paramsDiv.appendChild(makeParamInput('频率 (Hz)', 'squareFrequency', config.squareFrequency, index));
      paramsDiv.appendChild(makeParamInput('占空比 (%)', 'squareDuty', config.squareDuty, index));
      break;
    case 'triangle':
      paramsDiv.appendChild(makeParamInput('幅值', 'triAmplitude', config.triAmplitude, index));
      paramsDiv.appendChild(makeParamInput('频率 (Hz)', 'triFrequency', config.triFrequency, index));
      break;
    case 'random':
      paramsDiv.appendChild(makeParamInput('数值下限', 'randomMin', config.randomMin, index));
      paramsDiv.appendChild(makeParamInput('数值上限', 'randomMax', config.randomMax, index));
      break;
  }
}

function makeParamInput(label, key, value, channelIndex) {
  const div = document.createElement('div');
  div.className = 'channel-param';
  div.innerHTML = `<label>${label}</label>`;
  const input = document.createElement('input');
  input.type = 'number';
  input.value = value;
  input.addEventListener('input', () => {
    currentChannels[channelIndex][key] = parseFloat(input.value);
    onGlobalParamChange();
  });
  div.appendChild(input);
  return div;
}

// ---- 全局参数 & 通道参数变更时触发预览刷新 ----
function onGlobalParamChange() {
  const ti = parseFloat(elTimeInterval.value) || 2;
  const dl = parseInt(elDataLength.value) || 2048;
  // 重置视口
  viewRange = { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  drawPreview(ti, dl, currentChannels);
}

// ============================================================
// Canvas 波形预览绘制
// ============================================================

function drawPreview(timeInterval, dataLength, channels, viewRangeOverride) {
  const canvas = elWaveCanvas;
  const wrapper = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;

  const w = wrapper.clientWidth;
  const h = wrapper.clientHeight;

  if (w <= 0 || h <= 0) return;

  canvas.width = w * dpr;
  canvas.height = h * dpr;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // 清空
  ctx.fillStyle = '#1a1d23';
  ctx.fillRect(0, 0, w, h);

  if (!channels || channels.length === 0) return;

  const totalTime = timeInterval * (dataLength - 1);

  // 计算全范围内所有可见通道的 Y 范围
  let globalMin = Infinity, globalMax = -Infinity;
  const sampleStep = Math.max(1, Math.floor(dataLength / 500));

  for (let chIdx = 0; chIdx < channels.length; chIdx++) {
    if (!channelVisibility[chIdx]) continue;
    for (let i = 0; i < dataLength; i += sampleStep) {
      const timeMs = i * timeInterval;
      const value = calculateWaveValue(channels[chIdx], timeMs);
      if (value < globalMin) globalMin = value;
      if (value > globalMax) globalMax = value;
    }
  }

  if (globalMax - globalMin < 1e-6) {
    globalMax = globalMin + 1;
  }

  // 更新默认范围
  defaultViewRange = { xMin: 0, xMax: totalTime, yMin: globalMin, yMax: globalMax };

  // 使用传入的视口范围，或默认范围
  let vr = viewRangeOverride || viewRange;
  if (vr.xMin === 0 && vr.xMax === 0) {
    vr = { ...defaultViewRange };
    viewRange = { ...defaultViewRange };
  }

  // 视口范围
  const xMin = vr.xMin, xMax = vr.xMax, yMin = vr.yMin, yMax = vr.yMax;

  // 绘图留边距
  const margin = { top: 20, right: 30, bottom: 35, left: 55 };
  const plotW = w - margin.left - margin.right;
  const plotH = h - margin.top - margin.bottom;

  const xToPixel = (timeMs) => margin.left + ((timeMs - xMin) / (xMax - xMin)) * plotW;
  const yToPixel = (value) => margin.top + plotH - ((value - yMin) / (yMax - yMin)) * plotH;

  // 网格线
  ctx.strokeStyle = '#2a2f3a';
  ctx.lineWidth = 1;
  const gridLinesY = 5;
  for (let i = 0; i <= gridLinesY; i++) {
    const y = margin.top + (plotH / gridLinesY) * i;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + plotW, y);
    ctx.stroke();
  }
  const gridLinesX = 8;
  for (let i = 0; i <= gridLinesX; i++) {
    const x = margin.left + (plotW / gridLinesX) * i;
    ctx.beginPath();
    ctx.moveTo(x, margin.top);
    ctx.lineTo(x, margin.top + plotH);
    ctx.stroke();
  }

  // 坐标轴
  ctx.strokeStyle = '#5a5f6b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + plotH);
  ctx.lineTo(margin.left + plotW, margin.top + plotH);
  ctx.stroke();

  // Y 轴刻度
  ctx.fillStyle = '#a0a8b8';
  ctx.font = '10px "Cascadia Code", "Consolas", monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i <= gridLinesY; i++) {
    const value = yMin + (yMax - yMin) * (i / gridLinesY);
    const y = margin.top + plotH - (plotH / gridLinesY) * i;
    ctx.fillText(value.toFixed(2), margin.left - 6, y + 4);
  }

  // X 轴刻度
  ctx.textAlign = 'center';
  for (let i = 0; i <= gridLinesX; i++) {
    const timeMs = xMin + (xMax - xMin) * (i / gridLinesX);
    const x = margin.left + (plotW / gridLinesX) * i;
    ctx.fillText(timeMs.toFixed(1), x, margin.top + plotH + 18);
  }

  // X 轴标签
  ctx.fillStyle = '#e0e0e0';
  ctx.font = '11px "Microsoft YaHei", sans-serif';
  ctx.fillText('时间 (ms)', margin.left + plotW / 2, margin.top + plotH + 32);

  // 绘制各通道曲线
  for (let chIdx = 0; chIdx < channels.length; chIdx++) {
    if (!channelVisibility[chIdx]) continue;

    const color = CHANNEL_COLORS[chIdx];
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    let firstPoint = true;
    for (let i = 0; i < dataLength; i++) {
      const timeMs = i * timeInterval;
      const value = calculateWaveValue(channels[chIdx], timeMs);
      const px = xToPixel(timeMs);
      const py = yToPixel(value);

      // 裁剪：只画在视口范围内的点
      if (px < margin.left - 10 || px > margin.left + plotW + 10) {
        firstPoint = true;
        continue;
      }

      if (firstPoint) {
        ctx.moveTo(px, py);
        firstPoint = false;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
  }

  // 边框
  ctx.strokeStyle = '#3a3f4b';
  ctx.lineWidth = 1;
  ctx.strokeRect(margin.left, margin.top, plotW, plotH);

  // 更新图例
  updateLegend(channels.length);

  // 更新范围显示
  elZoomRangeX.textContent = xMin.toFixed(0) + ' - ' + xMax.toFixed(0) + ' ms';
}

function updateLegend(count) {
  elChannelLegend.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const item = document.createElement('div');
    item.className = 'legend-item';
    if (!channelVisibility[i]) item.classList.add('hidden');

    const isVisible = channelVisibility[i] !== false; // 默认 true

    item.innerHTML = `
      <span class="legend-check">${isVisible ? '✓' : ''}</span>
      <span class="legend-color" style="background:${CHANNEL_COLORS[i]};"></span>
      V${i + 1}
    `;

    item.addEventListener('click', () => {
      channelVisibility[i] = !channelVisibility[i];
      const ti = parseFloat(elTimeInterval.value) || 2;
      const dl = parseInt(elDataLength.value) || 2048;
      drawPreview(ti, dl, currentChannels);
      // 更新 item 样式
      if (channelVisibility[i]) {
        item.classList.remove('hidden');
        item.querySelector('.legend-check').textContent = '✓';
      } else {
        item.classList.add('hidden');
        item.querySelector('.legend-check').textContent = '';
      }
    });

    elChannelLegend.appendChild(item);
  }
}

// ============================================================
// 波形数值计算（与 main.js 一致）
// ============================================================

function calculateWaveValue(config, timeMs) {
  const timeSec = timeMs / 1000;

  switch (config.type) {
    case 'sin': {
      const amplitude = parseFloat(config.amplitude) || 10;
      const frequency = parseFloat(config.frequency) || 1000;
      const dcOffset = parseFloat(config.dcOffset) || 0;
      const phaseRad = (parseFloat(config.phase) || 0) * Math.PI / 180;
      return amplitude * Math.sin(2 * Math.PI * frequency * timeSec + phaseRad) + dcOffset;
    }
    case 'square': {
      const amplitude = parseFloat(config.squareAmplitude) || 5;
      const frequency = parseFloat(config.squareFrequency) || 50;
      const duty = parseFloat(config.squareDuty) || 50;
      const periodMs = 1000 / frequency;
      const tInPeriod = (timeMs % periodMs + periodMs) % periodMs;
      return tInPeriod <= periodMs * (duty / 100) ? amplitude : -amplitude;
    }
    case 'triangle': {
      const amplitude = parseFloat(config.triAmplitude) || 5;
      const frequency = parseFloat(config.triFrequency) || 50;
      const periodMs = 1000 / frequency;
      const tInPeriod = (timeMs % periodMs + periodMs) % periodMs;
      const halfPeriod = periodMs / 2;
      if (tInPeriod <= halfPeriod) {
        return -amplitude + 2 * amplitude * (tInPeriod / halfPeriod);
      } else {
        return amplitude - 2 * amplitude * ((tInPeriod - halfPeriod) / halfPeriod);
      }
    }
    case 'random': {
      const min = parseFloat(config.randomMin) || 0;
      const max = parseFloat(config.randomMax) || 1;
      return min + Math.random() * (max - min);
    }
    default:
      return 0;
  }
}

// ============================================================
// 生成 CSV
// ============================================================

elBtnGenerate.addEventListener('click', async () => {
  const timeInterval = parseFloat(elTimeInterval.value) || 2;
  const dataLength = parseInt(elDataLength.value) || 2048;
  const channelNum = parseInt(elChannelNum.value) || 2;

  // 构建配置
  const config = {
    timeInterval,
    dataLength,
    channelNum,
    channels: currentChannels
  };

  // 更新状态
  setStatus('生成中...', 'working');

  try {
    const result = await window.electronAPI.generateCSV(config);
    if (result.success) {
      setStatus(`已生成: ${result.filePath}`, 'success');
    } else {
      setStatus(`失败: ${result.error}`, 'error');
    }
  } catch (err) {
    setStatus(`错误: ${err.message}`, 'error');
  }
});

// ============================================================
// 预设管理
// ============================================================

elBtnSavePreset.addEventListener('click', async () => {
  const name = elPresetName.value.trim();
  if (!name) {
    setStatus('请输入预设名称', 'error');
    return;
  }

  const config = {
    timeInterval: parseFloat(elTimeInterval.value) || 2,
    dataLength: parseInt(elDataLength.value) || 2048,
    channelNum: parseInt(elChannelNum.value) || 2,
    channels: currentChannels
  };

  const result = await window.electronAPI.savePreset({ name, config });
  if (result.success) {
    setStatus(`预设 "${name}" 已保存`, 'success');
    elPresetName.value = '';
    await refreshPresetList();
  } else {
    setStatus(`保存失败: ${result.error}`, 'error');
  }
});

elBtnLoadPreset.addEventListener('click', async () => {
  const name = elPresetSelect.value;
  if (!name) {
    setStatus('请选择预设', 'error');
    return;
  }

  const result = await window.electronAPI.loadPreset(name);
  if (result.success && result.config) {
    applyPreset(result.config);
    setStatus(`已加载预设 "${name}"`, 'success');
  } else {
    setStatus(`加载失败: ${result.error}`, 'error');
  }
});

async function refreshPresetList() {
  const result = await window.electronAPI.listPresets();
  elPresetSelect.innerHTML = '<option value="">-- 选择预设 --</option>';
  if (result.success && result.presets) {
    result.presets.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = p.name;
      elPresetSelect.appendChild(opt);
    });
  }
}

function applyPreset(config) {
  elTimeInterval.value = config.timeInterval;
  elDataLength.value = config.dataLength;
  elChannelNum.value = config.channelNum;

  currentChannels = config.channels.map((ch, i) => {
    return {
      type: ch.type || 'sin',
      amplitude: ch.amplitude ?? 10,
      frequency: ch.frequency ?? 50,
      dcOffset: ch.dcOffset ?? 0,
      phase: ch.phase ?? 0,
      randomMin: ch.randomMin ?? 0,
      randomMax: ch.randomMax ?? 1,
      squareAmplitude: ch.squareAmplitude ?? 5,
      squareFrequency: ch.squareFrequency ?? 50,
      squareDuty: ch.squareDuty ?? 50,
      triAmplitude: ch.triAmplitude ?? 5,
      triFrequency: ch.triFrequency ?? 50
    };
  });

  // 补齐/截断通道
  const targetCount = parseInt(elChannelNum.value) || 2;
  while (currentChannels.length < targetCount) {
    currentChannels.push(createDefaultChannel(currentChannels.length));
  }
  currentChannels = currentChannels.slice(0, targetCount);

  rebuildChannels(targetCount);
  onGlobalParamChange();
}

// ============================================================
// 状态栏
// ============================================================

function setStatus(text, type) {
  elStatusText.textContent = text;
  elStatusIndicator.className = 'status-indicator';
  switch (type) {
    case 'working': elStatusIndicator.classList.add('status-working'); break;
    case 'success': elStatusIndicator.classList.add('status-success'); break;
    case 'error':   elStatusIndicator.classList.add('status-error'); break;
    default:        elStatusIndicator.classList.add('status-ready'); break;
  }
}

// ============================================================
// Canvas 响应式（窗口大小变更时重绘）
// ============================================================

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(onGlobalParamChange, 100);
});

// ============ 缩放交互 ============

// 鼠标滚轮缩放
elCanvasWrapper.addEventListener('wheel', (e) => {
  e.preventDefault();

  const canvas = elWaveCanvas;
  const rect = canvas.getBoundingClientRect();
  const margin = { top: 20, right: 30, bottom: 35, left: 55 };
  const plotW = rect.width - margin.left - margin.right;
  const plotH = rect.height - margin.top - margin.bottom;

  const mouseX = e.clientX - rect.left - margin.left;
  const mouseY = e.clientY - rect.top - margin.top;

  // 鼠标在绘图区域外则不缩放
  if (mouseX < 0 || mouseX > plotW || mouseY < 0 || mouseY > plotH) return;

  const vr = viewRange;
  const zoomFactor = e.deltaY < 0 ? 0.8 : 1.25; // 滚轮向上放大

  // 以鼠标位置为中心缩放 X 轴
  const xCenter = vr.xMin + (mouseX / plotW) * (vr.xMax - vr.xMin);
  const newXRange = (vr.xMax - vr.xMin) * zoomFactor;
  const newXMin = xCenter - newXRange * (mouseX / plotW);
  const newXMax = xCenter + newXRange * (1 - mouseX / plotW);

  // 限制 X 范围不超出数据范围
  const totalTime = parseFloat(elTimeInterval.value) * (parseInt(elDataLength.value) - 1);
  const clampedXMin = Math.max(0, newXMin);
  const clampedXMax = Math.min(totalTime, newXMax);

  viewRange = { xMin: clampedXMin, xMax: clampedXMax, yMin: vr.yMin, yMax: vr.yMax };

  const ti = parseFloat(elTimeInterval.value) || 2;
  const dl = parseInt(elDataLength.value) || 2048;
  drawPreview(ti, dl, currentChannels, viewRange);
}, { passive: false });

// 框选放大（鼠标拖拽）
elCanvasWrapper.addEventListener('mousedown', (e) => {
  const canvas = elWaveCanvas;
  const rect = canvas.getBoundingClientRect();
  const margin = { top: 20, right: 30, bottom: 35, left: 55 };
  const plotW = rect.width - margin.left - margin.right;
  const plotH = rect.height - margin.top - margin.bottom;

  const mouseX = e.clientX - rect.left - margin.left;
  const mouseY = e.clientY - rect.top - margin.top;

  if (mouseX < 0 || mouseX > plotW || mouseY < 0 || mouseY > plotH) return;

  // 如果按住 Shift 键，进入框选模式；否则进入平移模式
  if (e.shiftKey) {
    isSelecting = true;
    selectStart = { x: e.clientX, y: e.clientY };

    // 创建选择框
    if (!selectionRect) {
      selectionRect = document.createElement('div');
      selectionRect.className = 'selection-rect';
      elCanvasWrapper.appendChild(selectionRect);
    }
    selectionRect.style.display = 'none';
  } else {
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    panViewStart = { ...viewRange };
    elWaveCanvas.style.cursor = 'grabbing';
  }
});

window.addEventListener('mousemove', (e) => {
  if (isSelecting) {
    selectEnd = { x: e.clientX, y: e.clientY };
    if (selectionRect) {
      const left = Math.min(selectStart.x, selectEnd.x);
      const top = Math.min(selectStart.y, selectEnd.y);
      const width = Math.abs(selectEnd.x - selectStart.x);
      const height = Math.abs(selectEnd.y - selectStart.y);

      const wrapperRect = elCanvasWrapper.getBoundingClientRect();
      selectionRect.style.left = (left - wrapperRect.left) + 'px';
      selectionRect.style.top = (top - wrapperRect.top) + 'px';
      selectionRect.style.width = width + 'px';
      selectionRect.style.height = height + 'px';
      selectionRect.style.display = 'block';
    }
  } else if (isPanning) {
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;

    const canvas = elWaveCanvas;
    const rect = canvas.getBoundingClientRect();
    const margin = { top: 20, right: 30, bottom: 35, left: 55 };
    const plotW = rect.width - margin.left - margin.right;
    const plotH = rect.height - margin.top - margin.bottom;

    const xScale = (panViewStart.xMax - panViewStart.xMin) / plotW;
    const yScale = (panViewStart.yMax - panViewStart.yMin) / plotH;

    const totalTime = parseFloat(elTimeInterval.value) * (parseInt(elDataLength.value) - 1);

    let newXMin = panViewStart.xMin - dx * xScale;
    let newXMax = panViewStart.xMax - dx * xScale;
    let newYMin = panViewStart.yMin + dy * yScale;
    let newYMax = panViewStart.yMax + dy * yScale;

    // 限制 X 范围
    if (newXMin < 0) { const shift = -newXMin; newXMin += shift; newXMax += shift; }
    if (newXMax > totalTime) { const shift = newXMax - totalTime; newXMin -= shift; newXMax -= shift; }
    if (newXMin < 0) newXMin = 0;
    if (newXMax > totalTime) newXMax = totalTime;

    viewRange = { xMin: newXMin, xMax: newXMax, yMin: newYMin, yMax: newYMax };
    const ti = parseFloat(elTimeInterval.value) || 2;
    const dl = parseInt(elDataLength.value) || 2048;
    drawPreview(ti, dl, currentChannels, viewRange);
  }
});

window.addEventListener('mouseup', (e) => {
  if (isSelecting) {
    isSelecting = false;

    if (selectionRect) {
      selectionRect.style.display = 'none';
    }

    // 计算框选区域对应的数据范围
    const canvas = elWaveCanvas;
    const rect = canvas.getBoundingClientRect();
    const margin = { top: 20, right: 30, bottom: 35, left: 55 };
    const plotW = rect.width - margin.left - margin.right;
    const plotH = rect.height - margin.top - margin.bottom;

    const vr = viewRange;
    const selLeft = Math.min(selectStart.x, selectEnd.x);
    const selRight = Math.max(selectStart.x, selectEnd.x);
    const selTop = Math.min(selectStart.y, selectEnd.y);
    const selBottom = Math.max(selectStart.y, selectEnd.y);

    const selDataX1 = vr.xMin + ((selLeft - rect.left - margin.left) / plotW) * (vr.xMax - vr.xMin);
    const selDataX2 = vr.xMin + ((selRight - rect.left - margin.left) / plotW) * (vr.xMax - vr.xMin);
    const selDataY1 = vr.yMin + ((rect.top + margin.top + plotH - selBottom) / plotH) * (vr.yMax - vr.yMin);
    const selDataY2 = vr.yMin + ((rect.top + margin.top + plotH - selTop) / plotH) * (vr.yMax - vr.yMin);

    // 只有拖拽区域足够大才执行放大
    const minSelSize = 10;
    if (Math.abs(selectEnd.x - selectStart.x) > minSelSize && Math.abs(selectEnd.y - selectStart.y) > minSelSize) {
      viewRange = {
        xMin: Math.min(selDataX1, selDataX2),
        xMax: Math.max(selDataX1, selDataX2),
        yMin: Math.min(selDataY1, selDataY2),
        yMax: Math.max(selDataY1, selDataY2)
      };

      const ti = parseFloat(elTimeInterval.value) || 2;
      const dl = parseInt(elDataLength.value) || 2048;
      drawPreview(ti, dl, currentChannels, viewRange);
    }
  }

  if (isPanning) {
    isPanning = false;
    elWaveCanvas.style.cursor = 'default';
  }
});

// 按钮：放大
elBtnZoomIn.addEventListener('click', () => {
  const vr = viewRange;
  const cx = (vr.xMin + vr.xMax) / 2;
  const cy = (vr.yMin + vr.yMax) / 2;
  const rx = (vr.xMax - vr.xMin) * 0.6 / 2;
  const ry = (vr.yMax - vr.yMin) * 0.6 / 2;
  const totalTime = parseFloat(elTimeInterval.value) * (parseInt(elDataLength.value) - 1);

  viewRange = {
    xMin: Math.max(0, cx - rx),
    xMax: Math.min(totalTime, cx + rx),
    yMin: cy - ry,
    yMax: cy + ry
  };

  const ti = parseFloat(elTimeInterval.value) || 2;
  const dl = parseInt(elDataLength.value) || 2048;
  drawPreview(ti, dl, currentChannels, viewRange);
});

// 按钮：缩小
elBtnZoomOut.addEventListener('click', () => {
  const vr = viewRange;
  const cx = (vr.xMin + vr.xMax) / 2;
  const cy = (vr.yMin + vr.yMax) / 2;
  const rx = (vr.xMax - vr.xMin) * 1.4 / 2;
  const ry = (vr.yMax - vr.yMin) * 1.4 / 2;
  const totalTime = parseFloat(elTimeInterval.value) * (parseInt(elDataLength.value) - 1);

  viewRange = {
    xMin: Math.max(0, cx - rx),
    xMax: Math.min(totalTime, cx + rx),
    yMin: cy - ry,
    yMax: cy + ry
  };

  const ti = parseFloat(elTimeInterval.value) || 2;
  const dl = parseInt(elDataLength.value) || 2048;
  drawPreview(ti, dl, currentChannels, viewRange);
});

// 按钮：适应窗口
elBtnZoomFit.addEventListener('click', () => {
  viewRange = { ...defaultViewRange };
  const ti = parseFloat(elTimeInterval.value) || 2;
  const dl = parseInt(elDataLength.value) || 2048;
  drawPreview(ti, dl, currentChannels, viewRange);
});

// 按钮：重置
elBtnZoomReset.addEventListener('click', () => {
  viewRange = { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  const ti = parseFloat(elTimeInterval.value) || 2;
  const dl = parseInt(elDataLength.value) || 2048;
  drawPreview(ti, dl, currentChannels);
});

// 启动
// ============================================================

// 延迟初始化确保 DOM 布局完成
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(init, 100);
});

// 如果 DOMContentLoaded 已经触发，直接初始化
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(init, 100);
}

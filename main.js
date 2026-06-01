const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    title: '多通道波形CSV生成工具',
    backgroundColor: '#1a1d23',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'icon.png'),
    show: false
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 移除菜单栏（军工风格，无多余UI元素）
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ============ IPC 处理 ============

// 生成 CSV 数据并写入文件
ipcMain.handle('generate-csv', async (event, config) => {
  try {
    const { timeInterval, dataLength, channelNum, channels } = config;

    // 1. 确保根目录存在
    const rootDir = 'D:\\data';
    if (!fs.existsSync(rootDir)) {
      fs.mkdirSync(rootDir, { recursive: true });
    }

    // 2. 创建子文件夹（当前系统时间）
    const now = new Date();
    const folderName = formatTimestamp(now);
    const folderPath = path.join(rootDir, folderName);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // 3. 生成 CSV 内容
    const csvContent = generateCSVContent(timeInterval, dataLength, channelNum, channels);

    // 4. 写入文件
    const filePath = path.join(folderPath, `${folderName}.csv`);
    fs.writeFileSync(filePath, '\uFEFF' + csvContent, 'utf8'); // BOM 确保 Excel 正确识别 UTF-8

    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 保存预设
ipcMain.handle('save-preset', async (event, { name, config }) => {
  try {
    const presetDir = getPresetDir();
    if (!fs.existsSync(presetDir)) {
      fs.mkdirSync(presetDir, { recursive: true });
    }
    const filePath = path.join(presetDir, `${sanitizeFileName(name)}.json`);
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 加载预设列表
ipcMain.handle('list-presets', async () => {
  try {
    const presetDir = getPresetDir();
    if (!fs.existsSync(presetDir)) {
      return { success: true, presets: [] };
    }
    const files = fs.readdirSync(presetDir).filter(f => f.endsWith('.json'));
    const presets = [];
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(presetDir, file), 'utf8');
        const config = JSON.parse(content);
        presets.push({ name: file.replace('.json', ''), config });
      } catch (e) {
        // 跳过损坏的预设文件
      }
    }
    return { success: true, presets };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 加载单个预设
ipcMain.handle('load-preset', async (event, presetName) => {
  try {
    const filePath = path.join(getPresetDir(), `${sanitizeFileName(presetName)}.json`);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '预设文件不存在' };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, config: JSON.parse(content) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ============ 辅助函数 ============

function formatTimestamp(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}_${h}${min}${s}`;
}

function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}

function getPresetDir() {
  return path.join(app.getPath('userData'), 'presets');
}

function formatValue(val) {
  const fixed = Number(val).toFixed(2);
  // 避免 -0.00 显示
  return fixed === '-0.00' ? '0.00' : fixed;
}

function generateCSVContent(timeInterval, dataLength, channelNum, channels) {
  const lines = [];

  // 表头
  const headers = ['时间(ms)'];
  for (let i = 1; i <= channelNum; i++) {
    headers.push(`V${i}`);
  }
  lines.push(headers.join(','));

  // 数据行
  for (let row = 0; row < dataLength; row++) {
    const time = row * timeInterval;
    const rowData = [formatValue(time)];

    for (let ch = 0; ch < channelNum; ch++) {
      const chanConfig = channels[ch] || { type: 'sin', amplitude: 10, frequency: 50, dcOffset: 0, phase: 0 };
      const value = calculateWaveValue(chanConfig, time);
      rowData.push(formatValue(value));
    }

    lines.push(rowData.join(','));
  }

  return lines.join('\r\n');
}

function calculateWaveValue(config, timeMs) {
  const timeSec = timeMs / 1000;

  switch (config.type) {
    case 'sin': {
      // 正弦波: y = A * sin(2π * f * t + φ) + DC
      const amplitude = parseFloat(config.amplitude) || 10;
      const frequency = parseFloat(config.frequency) || 1000;
      const dcOffset = parseFloat(config.dcOffset) || 0;
      const phaseRad = (parseFloat(config.phase) || 0) * Math.PI / 180;
      return amplitude * Math.sin(2 * Math.PI * frequency * timeSec + phaseRad) + dcOffset;
    }

    case 'square': {
      // 方波: y = ±A，频率 f，占空比 duty%
      const amplitude = parseFloat(config.squareAmplitude) || 5;
      const frequency = parseFloat(config.squareFrequency) || 50;
      const duty = parseFloat(config.squareDuty) || 50;
      const periodMs = 1000 / frequency;
      const tInPeriod = (timeMs % periodMs + periodMs) % periodMs;
      return tInPeriod <= periodMs * (duty / 100) ? amplitude : -amplitude;
    }

    case 'triangle': {
      // 三角波: y 在 ±A 之间线性变化，频率 f
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
      // 均匀随机数: [min, max]
      const min = parseFloat(config.randomMin) || 0;
      const max = parseFloat(config.randomMax) || 1;
      return min + Math.random() * (max - min);
    }

    default:
      return 0;
  }
}

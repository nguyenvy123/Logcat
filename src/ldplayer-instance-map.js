const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function parseLdconsoleList2(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [indexText, name] = line.split(',', 3);
      const index = parseInt(indexText, 10);
      if (!Number.isInteger(index) || !name) return null;
      return { index, name: name.trim() };
    })
    .filter(Boolean);
}

function serialFromLdPlayerIndex(index) {
  return `emulator-${5554 + (index * 2)}`;
}

function buildLdPlayerDisplayMap(output) {
  const map = new Map();
  parseLdconsoleList2(output).forEach(({ index, name }) => {
    map.set(serialFromLdPlayerIndex(index), name);
  });
  return map;
}

function getDeviceMetadata(serial, displayMap) {
  const displayName = displayMap.get(serial) || serial;
  return { serial, displayName };
}

function resolveLdconsolePath(adbPath) {
  if (process.env.LDPLAYER_CONSOLE_PATH && fs.existsSync(process.env.LDPLAYER_CONSOLE_PATH)) {
    return process.env.LDPLAYER_CONSOLE_PATH;
  }

  if (adbPath) {
    const candidate = path.join(path.dirname(adbPath), 'ldconsole.exe');
    if (fs.existsSync(candidate)) return candidate;
  }

  const fallback = 'C:\\LDPlayer\\LDPlayer9\\ldconsole.exe';
  return fs.existsSync(fallback) ? fallback : null;
}

function loadLdPlayerDisplayMap({ adbPath, execFile = execFileSync } = {}) {
  const consolePath = resolveLdconsolePath(adbPath);
  if (!consolePath) return new Map();

  try {
    const output = execFile(consolePath, ['list2'], { timeout: 5000 }).toString();
    return buildLdPlayerDisplayMap(output);
  } catch (_) {
    return new Map();
  }
}

module.exports = {
  parseLdconsoleList2,
  serialFromLdPlayerIndex,
  buildLdPlayerDisplayMap,
  getDeviceMetadata,
  resolveLdconsolePath,
  loadLdPlayerDisplayMap,
};

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseLdconsoleList2,
  serialFromLdPlayerIndex,
  buildLdPlayerDisplayMap,
  getDeviceMetadata,
} = require('../src/ldplayer-instance-map');

test('parses ldconsole list2 rows into instance metadata', () => {
  const rows = parseLdconsoleList2([
    '0,LDPlayerAutoUI1,723014,133254,1,179960,17128,540,960,240',
    '2,LDPlayer-2,199222,38865768,1,246268,39480,1280,720,240',
  ].join('\n'));

  assert.deepEqual(rows, [
    { index: 0, name: 'LDPlayerAutoUI1' },
    { index: 2, name: 'LDPlayer-2' },
  ]);
});

test('derives emulator serials from ldplayer indexes', () => {
  assert.equal(serialFromLdPlayerIndex(0), 'emulator-5554');
  assert.equal(serialFromLdPlayerIndex(1), 'emulator-5556');
  assert.equal(serialFromLdPlayerIndex(3), 'emulator-5560');
});

test('builds a serial-to-display-name map from ldconsole output', () => {
  const map = buildLdPlayerDisplayMap([
    '0,LDPlayerAutoUI1,723014,133254,1,179960,17128,540,960,240',
    '1,LDPlayerAutoUI2,133412,133482,1,3380,27168,1280,720,240',
  ].join('\n'));

  assert.deepEqual([...map.entries()], [
    ['emulator-5554', 'LDPlayerAutoUI1'],
    ['emulator-5556', 'LDPlayerAutoUI2'],
  ]);
});

test('returns fallback metadata for unknown devices', () => {
  const metadata = getDeviceMetadata('127.0.0.1:5555', new Map());
  assert.deepEqual(metadata, {
    serial: '127.0.0.1:5555',
    displayName: '127.0.0.1:5555',
  });
});

test('returns ldplayer display names when available', () => {
  const metadata = getDeviceMetadata('emulator-5558', new Map([
    ['emulator-5558', 'LDPlayer-2'],
  ]));

  assert.deepEqual(metadata, {
    serial: 'emulator-5558',
    displayName: 'LDPlayer-2',
  });
});

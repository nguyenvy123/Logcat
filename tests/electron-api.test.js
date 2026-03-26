const test = require('node:test');
const assert = require('node:assert/strict');

const { loadElectronMainApi } = require('../src/electron-api');

test('loads main-process APIs from electron/main when available', () => {
  const electronMain = { app: {}, BrowserWindow: {} };
  const calls = [];

  const result = loadElectronMainApi((moduleName) => {
    calls.push(moduleName);
    if (moduleName === 'electron/main') return electronMain;
    throw new Error(`Unexpected module: ${moduleName}`);
  });

  assert.equal(result, electronMain);
  assert.deepEqual(calls, ['electron/main']);
});

test('falls back to electron when electron/main is unavailable', () => {
  const electronFallback = { app: {}, BrowserWindow: {} };
  const calls = [];

  const result = loadElectronMainApi((moduleName) => {
    calls.push(moduleName);
    if (moduleName === 'electron/main') {
      const error = new Error('missing');
      error.code = 'MODULE_NOT_FOUND';
      throw error;
    }

    if (moduleName === 'electron') return electronFallback;
    throw new Error(`Unexpected module: ${moduleName}`);
  });

  assert.equal(result, electronFallback);
  assert.deepEqual(calls, ['electron/main', 'electron']);
});

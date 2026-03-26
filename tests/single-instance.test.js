const test = require('node:test');
const assert = require('node:assert/strict');

const { registerSingleInstance } = require('../src/single-instance');

function createAppMock({ locked }) {
  const handlers = new Map();
  let quitCalls = 0;

  return {
    handlers,
    requestSingleInstanceLock() {
      return locked;
    },
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
    quit() {
      quitCalls += 1;
    },
    get quitCalls() {
      return quitCalls;
    },
  };
}

test('quits immediately when single instance lock is unavailable', () => {
  const app = createAppMock({ locked: false });
  let focused = 0;

  const registered = registerSingleInstance(app, {
    focusMainWindow() {
      focused += 1;
    },
  });

  assert.equal(registered, false);
  assert.equal(app.quitCalls, 1);
  assert.equal(focused, 0);
  assert.equal(app.handlers.has('second-instance'), false);
});

test('focuses the existing window when a second instance is launched', () => {
  const app = createAppMock({ locked: true });
  let focused = 0;

  const registered = registerSingleInstance(app, {
    focusMainWindow() {
      focused += 1;
    },
  });

  assert.equal(registered, true);
  assert.equal(app.quitCalls, 0);
  assert.equal(app.handlers.has('second-instance'), true);

  app.handlers.get('second-instance')();

  assert.equal(focused, 1);
});

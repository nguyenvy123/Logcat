# Single Instance Electron Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the Electron app from crashing with `EADDRINUSE` when the user opens it again while it is already running in the tray.

**Architecture:** Add a focused single-instance helper that acquires Electron's app lock before the backend server starts. Reopen/focus the existing window on `second-instance`, and exit the new process immediately if it cannot acquire the lock.

**Tech Stack:** Electron, Node.js built-in `node:test`, CommonJS

---

### Task 1: Add a failing test for single-instance behavior

**Files:**
- Create: `tests/single-instance.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

```js
test('quits immediately when single instance lock is unavailable', () => {
  // app mock returns false from requestSingleInstanceLock()
  // expect registerSingleInstance() to call quit and report locked=false
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/single-instance.test.js`
Expected: FAIL because the helper does not exist yet

### Task 2: Implement the single-instance helper

**Files:**
- Create: `src/single-instance.js`
- Modify: `electron-main.js`
- Test: `tests/single-instance.test.js`

- [ ] **Step 1: Write minimal implementation**

```js
function registerSingleInstance(app, callbacks) {
  const locked = app.requestSingleInstanceLock();
  if (!locked) {
    app.quit();
    return false;
  }

  app.on('second-instance', () => callbacks.focusMainWindow());
  return true;
}
```

- [ ] **Step 2: Wire the helper into Electron startup**

```js
if (!registerSingleInstance(app, { focusMainWindow })) {
  process.exit(0);
}
```

- [ ] **Step 3: Run tests to verify it passes**

Run: `node --test tests/single-instance.test.js`
Expected: PASS

### Task 3: Verify the app startup path

**Files:**
- Modify: `electron-main.js`

- [ ] **Step 1: Confirm server startup still happens only after lock acquisition**

Run: `node --test tests/single-instance.test.js`
Expected: PASS

- [ ] **Step 2: Smoke-test application packaging/runtime assumptions**

Run: `npm test`
Expected: PASS

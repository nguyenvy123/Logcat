# LDPlayer Display Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show LDPlayer instance names in the Logcat UI while preserving serial-based filtering and log streaming.

**Architecture:** Add a focused LDPlayer metadata helper in the backend, enrich device/log payloads with `displayName`, and keep the frontend keyed by raw serial. The implementation falls back to the existing serial-only behavior when LDPlayer metadata is unavailable.

**Tech Stack:** Node.js, Express, WebSocket, Electron, `node:test`, CommonJS

---

### Task 1: Add failing tests for LDPlayer metadata parsing

**Files:**
- Create: `tests/ldplayer-instance-map.test.js`
- Create: `src/ldplayer-instance-map.js`

- [ ] **Step 1: Write the failing test**

```js
test('maps ldconsole list2 rows to emulator serial display names', () => {
  const output = '0,LDPlayer-1,...';
  assert.equal(resolveDeviceDisplayName('emulator-5554'), 'LDPlayer-1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ldplayer-instance-map.test.js`
Expected: FAIL because the helper does not exist yet

### Task 2: Implement backend metadata enrichment

**Files:**
- Modify: `src/server.js`
- Create: `src/ldplayer-instance-map.js`
- Test: `tests/ldplayer-instance-map.test.js`

- [ ] **Step 1: Implement minimal parser and resolver**
- [ ] **Step 2: Enrich device payloads and log entries with `displayName`**
- [ ] **Step 3: Run tests to verify they pass**

Run: `node --test tests/ldplayer-instance-map.test.js`
Expected: PASS

### Task 3: Update the UI to render display names

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Keep device selection keyed by serial**
- [ ] **Step 2: Render `displayName` in dropdown and log rows**
- [ ] **Step 3: Verify full test suite**

Run: `npm test`
Expected: PASS

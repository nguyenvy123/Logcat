# LDPlayer Display Names Design

## Goal

Show each connected LDPlayer in the Logcat UI by its current LDPlayer instance name instead of the raw ADB serial, while keeping device filtering and log routing stable.

## Current State

- Backend discovers devices only as raw ADB serials in `src/server.js`.
- Frontend uses those serial strings directly for the device dropdown and the device column in `public/index.html`.
- This makes multiple LDPlayer instances hard to distinguish.

## Chosen Approach

Use LDPlayer's local CLI (`ldconsole.exe`) to read the current instance list and names, then map each connected ADB serial to a display name derived from the LDPlayer instance index. Keep the raw serial as the canonical internal key everywhere else.

## Data Model

Device metadata sent to the UI will become:

```js
{
  serial: 'emulator-5554',
  displayName: 'LDPlayerAutoUI1'
}
```

Log entries will keep `entry.device` as the serial and add `entry.deviceName` for display.

## Backend Changes

- Add an LDPlayer helper in `src/ldplayer-instance-map.js`.
- Read instance names via `ldconsole list2`.
- Derive the expected emulator serial from the LDPlayer index.
- Build a `Map<serial, displayName>`.
- Use that map when:
  - sending WebSocket `config.devices`
  - broadcasting `devices`
  - emitting log entries
  - returning `/api/status`

Fallback behavior:

- If `ldconsole` is unavailable or parsing fails, use the serial as the display name.
- Non-LDPlayer devices continue to work unchanged.

## Frontend Changes

- Track devices by `serial`.
- Render `displayName` in the dropdown.
- Render `entry.deviceName` in the log row, with the serial still available in the tooltip/title.
- Filtering continues to use the serial.

## Testing

- Add unit tests for LDPlayer metadata parsing and serial-to-name mapping.
- Add frontend-adjacent tests for device registration payload handling only if needed; otherwise keep UI changes minimal and verify via existing runtime flow.

## Risks

- LDPlayer CLI output format may vary by version.
- Some instances may not be connected through `emulator-<port>` naming; those should fall back cleanly to the serial.

---
name: glo-n3-ops
description: >-
  Standard operating procedures, automated health checks, diagnostics, session recovery,
  and incident resolution for the GLO N3 Dealer Portal and LINE Official Account Bot.
  Use when checking system health, diagnosing order stalls, handling session kickouts,
  restarting the bot service, syncing live quota, or running the verification test suite.
---

# GLO N3 Bot Operations & Auto-Recovery (glo-n3-ops)

## Overview
This skill provides comprehensive operational workflows, diagnostics, health audits, and incident auto-recovery for the GLO N3 lottery dealer automation portal (`https://n3.glolotteryshop.com/`) and LINE Official Account bot (`@586xxhlx` ร้านสลาก N3 ธนกิจนำโชค). It encapsulates hardened engineering rules to prevent session ghosting, crashes, message truncation, and unmanaged background processes.

## Dependencies
- `accidental-data-loss-prevention`: Protects critical credentials and production ticket states.
- `credentials`: Handles LINE Channel Access Token and Admin IDs securely.

## Quick Start

### 1. Run Complete System Health Check
Run the 1-click health audit to inspect Bot HTTP (port 3333), Chrome CDP (port 9222), Cloudflare Tunnel, and Quota balance:
```bash
node .agents/skills/glo-n3-ops/scripts/health_check.js
```

For automated agent consumption (returns JSON):
```bash
node .agents/skills/glo-n3-ops/scripts/health_check.js --json
```

To auto-recover failed components:
```bash
node .agents/skills/glo-n3-ops/scripts/health_check.js --fix
```

### 2. Restart Bot Service (Preserving Webhook URL & Tunnel)
When code has been updated or the worker needs a fresh start:
```bash
npm run build --prefix bot-service
node scripts/n3-engine.js restart-bot
```

### 3. Run Automated Test Suite (88+ Tests)
Verify multi-ticket parsing, cart accumulation, stepper mechanics, and LINE message sanitizer:
```bash
npm test --prefix bot-service
```

---

## Utility Scripts & Tools

### `scripts/health_check.js`
CLI diagnostic tool providing instant health telemetry:
- **Bot HTTP (Port 3333)**: Verifies `/health` endpoint, process uptime, and queue state.
- **Chrome CDP (Port 9222)**: Checks Chrome browser process, active pages, and detects whether GLO is stuck at `/login/`.
- **Cloudflare Tunnel**: Validates `webhook-url.txt` and tests public reachability.
- **Quota Balance**: Reads `bot-service/data/quota.json` for live balance and tickets sold.

### `scripts/n3-engine.js`
Main service orchestrator:
- `node scripts/n3-engine.js menu`: Opens N3-MANAGER console dashboard.
- `node scripts/n3-engine.js restart-bot`: Hot-restarts the bot process without altering the Cloudflare tunnel.
- `node scripts/n3-engine.js clean`: Cleans up temporary QR images.
- `node scripts/n3-engine.js richmenu`: Deploys and syncs the 6-button LINE Rich Menu.

---

## Standard Operating Workflows

### 1. Order Processing & Verification Workflow
1. Customer sends an order in LINE (e.g. `สั่งซื้อ 325 1 ใบ, 929 1 ใบ, 812 1 ใบ, 593 1 ใบ`).
2. Webhook immediately acknowledges order receipt with item breakdown and total price.
3. Order task enters FIFO queue (`OrderQueue`).
4. Worker verifies `N3Auth.isSessionValid(page)`. If invalid, it alerts admin with a Paotang login QR and notifies the customer.
5. Worker enters `https://n3.glolotteryshop.com/lotto-search/?position=1` in a single navigation session.
6. Digits are entered, "เลือกเลข" clicked, item picked, and quantity adjusted via stepper `img[src*="plus-icon"]` with React prototype setter.
7. Subsequent items click "ล้างค่า" without reloading the page.
8. Pre-checkout audit verifies total ticket count across all items.
9. Clicks "ตรวจสอบสลากฯ" -> "สร้าง QR ซื้อ-ขายสลากฯ" -> "ยืนยัน".
10. Extracts 1:1 square QR code from canvas with 48px Quiet Zone.
11. Delivers payment QR to customer as **Native LINE Image Message + Flex Card Summary**.
12. Automatically reconciles quota from the live GLO portal.

### 2. Session Recovery & Paotang Auth Workflow
1. When GLO session expires, GLO displays `<div class="fixed inset-0 z-[200]">` with text *"ไม่สามารถทำรายการได้ หากต้องการทำรายการต่อบนอุปกรณ์นี้ กรุณาเข้าสู่ระบบใหม่อีกครั้ง"*.
2. `N3Auth.checkAndDismissSessionModal(page)` detects the modal, clicks "ตกลง", and redirects to `/login/`.
3. `triggerAdminLoginQR` generates a fresh Paotang login QR and pushes it to `CONFIG.ADMIN_LINE_USER_ID`.
4. Admin scans QR with Paotang app.
5. System confirms login, syncs quota, and notifies admin that the bot is ready.

---

## Rate Limiting & Safety Controls
- **LINE Push Messages**: LINE free tier provides 500 push messages/month. All immediate chat responses MUST use `replyToken`. Push messages are reserved for async order completion and admin emergency alerts.
- **Message Truncation**: All LINE text messages are capped at 4,000 characters by `LineReplyHandler.sanitizeMessages()` to prevent LINE HTTP 400 Bad Request.
- **GLO DOM Pacing**: Minimum 150-300ms delay between DOM operations to prevent React state dropouts.

---

## Common Mistakes to Avoid
1. **Clicking "บันทึก" on GLO `/qr/` page**: Never do this. It crashes Chrome at the C++ level on Windows. Always capture the canvas directly.
2. **Spawning background tasks with `shell: true` or via `cmd.exe`**: This causes visible console windows on Windows. Always use `detached: true`, `shell: false`, and `windowsHide: true`.
3. **Omitting `chcp 65001 >nul` in batch files**: Causes Thai font corruption and spacing mojibake in Windows command prompt.
4. **Delivering QR code only inside Flex Messages**: Flex messages lack the built-in 📥 download button. Always send as a native Image Message paired with the Flex Message card.
5. **Trusting URL alone for session validity**: GLO keeps the URL at `/lotto-search/?position=1` even when a session is invalidated with a modal. Always inspect DOM for kickout modals.

---

## Reference Documents
- [Permanent Invariants & Safeguards](file:///d:/Promote_GLON3/.agents/skills/glo-n3-ops/references/invariants.md)
- [Incident Response Playbook](file:///d:/Promote_GLON3/.agents/skills/glo-n3-ops/references/incident_playbook.md)

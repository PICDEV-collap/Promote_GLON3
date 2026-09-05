# GLO N3 Operations - Incident Playbook

This playbook provides actionable, step-by-step diagnostic and remediation instructions for known failure modes in the GLO N3 dealer automation system.

---

## Playbook 1: Order Stalls or Payment QR Not Delivered

### Symptoms
- Customer sends an order in LINE (e.g. `สั่งซื้อ 325 1 ใบ, 929 1 ใบ`).
- Bot sends order received acknowledgment, but no QR code or error arrives.
- Chrome stays stuck on `/lotto-search/?position=1`.

### Root Cause
1. GLO session expired with backdrop modal (`ไม่สามารถทำรายการได้`) intercepting click events.
2. Playwright threw `TimeoutError` and the raw error exceeded LINE's 5,000 character limit.

### Remediation Steps
1. Run health check:
   ```bash
   node .agents/skills/glo-n3-ops/scripts/health_check.js
   ```
2. If `Active GLO URL` shows `/login/` or `ACTION_REQUIRED_LOGIN`:
   - Ask the admin to scan the Paotang QR code:
     - Type `qr` in LINE, or
     - Run `N3-MANAGER.bat` and select `[2]` Live Chrome Login.
3. If the bot service is hung or needs restart:
   ```bash
   node scripts/n3-engine.js restart-bot
   ```
4. Verify by checking `bot.log`:
   ```powershell
   Get-Content -Tail 50 bot.log
   ```

---

## Playbook 2: LINE Push Error 400 (Bad Request)

### Symptoms
- `bot.log` contains:
  `HTTPFetchError: 400 - Bad Request {"details":[{"message":"Length must be between 0 and 5000","property":"messages[0].text"}]}`.

### Root Cause
An un-sanitized error string or text payload exceeded 5,000 characters or was empty.

### Remediation Steps
1. Ensure `LineReplyHandler.sanitizeMessages()` is invoked in `reply`, `push`, and `pushToAdmin` in `bot-service/src/line/reply-handler.ts`.
2. Ensure error handlers in `bot-service/src/index.ts` and `bot-service/src/automation/n3-order.ts` clean up Playwright call logs before passing errors to messages.
3. Run tests to confirm sanitizer compliance:
   ```bash
   npm test --prefix bot-service
   ```
4. Hot-reload bot service:
   ```bash
   node scripts/n3-engine.js restart-bot
   ```

---

## Playbook 3: Chrome Browser Crashes (Renderer Crash / Disconnect)

### Symptoms
- `bot.log` shows `[BROWSER EVENT] ตรวจพบหน้าต่างเว็บเบราว์เซอร์แครช` or `CDP Client disconnected`.
- Port 9222 becomes unavailable.

### Root Cause
1. Automation clicked the native Windows file download button ("บันทึก") on `/qr/`.
2. Out-of-memory or GPU driver fault in Chrome headless mode.

### Remediation Steps
1. Never click "บันทึก" on `/qr/`; always extract QR directly from the `<canvas id="qr-code-image">` DOM element.
2. Kill any orphaned Chrome processes:
   ```powershell
   Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" | Where-Object { $_.CommandLine -like '*browser_profile*' -or $_.CommandLine -like '*--remote-debugging-port=9222*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
   ```
3. Restart the bot service to respawn a clean Chrome detached process:
   ```bash
   node scripts/n3-engine.js restart-bot
   ```
4. Check health check:
   ```bash
   node .agents/skills/glo-n3-ops/scripts/health_check.js
   ```

---

## Playbook 4: Cloudflare Tunnel Unreachable or URL Changed

### Symptoms
- LINE commands receive no reply at all.
- Webhook verify in LINE Console fails.
- Health check shows `LINE Tunnel: UNREACHABLE`.

### Remediation Steps
1. Check `tunnel.log`:
   ```powershell
   Get-Content -Tail 50 tunnel.log
   ```
2. Verify `webhook-url.txt`:
   ```powershell
   Get-Content webhook-url.txt
   ```
3. If the tunnel died or connection was severed, restart both Bot & Tunnel:
   ```bash
   node scripts/n3-engine.js restart
   ```
4. The system will automatically update the LINE Webhook endpoint via LINE Developer API.

---

## Playbook 5: Quota Desynchronization

### Symptoms
- Quota in LINE chat or N3-MANAGER differs from the actual GLO dealer portal.

### Remediation Steps
1. Type `sync` or `sync quota` in LINE chat (as Admin) to force live reconciliation.
2. Or trigger live synchronization via script:
   ```bash
   npm run test:quota --prefix bot-service
   ```
3. Check `bot-service/data/quota.json` for current numbers:
   ```powershell
   Get-Content bot-service/data/quota.json
   ```

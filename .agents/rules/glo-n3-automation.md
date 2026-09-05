---
trigger: always_on
description: Universal Behavioral Guardrails and Technical Invariants for GLO N3 Dealer Automation and LINE Bot
---

# GLO N3 Dealer Automation & LINE Bot Rules

These rules are permanent invariants learned from operating the GLO N3 Dealer Portal (`https://n3.glolotteryshop.com/`) and the LINE Official Account bot for "ร้านสลาก N3 ธนกิจนำโชค" (`@586xxhlx`).

## 1. Multi-Ticket Cart Accumulation Invariant
- **Single Navigation**: When ordering multiple numbers (e.g., `334=5, 447=6, 778=3`), NEVER reload or navigate to a new page between items.
- Always open `https://n3.glolotteryshop.com/lotto-search/?position=1` once at the beginning of the order.
- Clear previous digits using GLO's native "ล้างค่า" button or selecting visible input elements.
- Adjust ticket quantities by targeting the actual stepper element: `img[src*="plus-icon"]` and `<input type="number">` using React's native property descriptor setter (`Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set`) to ensure React controlled state updates.
- Only after all numbers have been accumulated in the cart should the bot click "ตรวจสอบสลากฯ" -> "สร้าง QR ซื้อ-ขายสลากฯ" -> "ยืนยัน".

## 2. Crash-Proof 1:1 QR Code Capture
- **NEVER click the "บันทึก" (Save) button on GLO's `/qr/` page**:
  Clicking this button invokes a native Windows shell file dialog which causes Google Chrome under automation on Windows to crash at the C++ level (`Crashpad .dmp`), killing the browser process.
- **Direct Canvas Locator Capture**:
  Locate `<canvas id="qr-code-image">` directly on the DOM and take a screenshot with a 1:1 square crop and ~28px quiet zone padding.
- Do NOT add `window.scrollY` to Playwright viewport coordinates.

## 3. Zero-Window Background Service on Windows
- When executing the bot in background/silent mode:
  - NEVER spawn child processes through `cmd.exe` or with `shell: true`, because Windows `cmd.exe` does not propagate `SW_HIDE` to grandchildren and forces visible console windows.
  - Spawn `process.execPath` and native `cloudflared.exe` directly with `detached: true`, `shell: false`, and `windowsHide: true`.
- Any Windows launcher or GUI dialog must use UTF-8 with BOM (`0xEF, 0xBB, 0xBF`) to prevent mojibake.

## 4. Native LINE Image Delivery for 1-Tap Save (📥 Download Button)
- LINE Flex Messages do NOT support LINE's native in-chat fullscreen photo viewer (`media_1788526737163.jpg`). Opening a Flex Message image triggers a browser/webview preview (`media_1788526737162.jpg`) which lacks the built-in 📥 download button.
- To allow customers to save the payment QR code directly to their phone gallery in 1 tap (identical to banking slips), ALWAYS deliver the payment QR as a native LINE Image Message (`type: 'image'`) paired with the Flex Message order summary card (`[imageMsg, flexMsg]`).
- Tapping the native Image Message opens LINE's built-in image viewer where the native 📥 download button is prominently located at the bottom-right corner.

## 5. Live Quota Synchronization
- Do not rely solely on local ticket decrementing in `quota.json`.
- Automatically synchronize quota from `https://n3.glolotteryshop.com/landing/` by parsing `คุณขายสลากฯ ได้อีก ... ใบ` and `ยอดขายร้านค้า ... / 2,000 ใบ` after orders and on landing page navigation.
- Use `QuotaManager.getInstance()` singleton to maintain cache coherence across processes.

## 6. Lifecycle Notifications
- When the bot starts, always send a push notification to `CONFIG.LINE_ADMIN_USER_ID` with the active Webhook URL.
- When the bot stops unexpectedly or crashes, always send an emergency stop alert to the admin LINE chat so failures never go unnoticed.

## 7. Mobile-First Image Saving & LINE Webview Compatibility Invariant
- **`<a download>` Webview Block Invariant**:
  In mobile In-App Webviews (especially LINE Webview on iOS & Android), synthetic clicks on `<a href="data:image/png;base64,..." download="...">` or `blob:` URLs fail silently without downloading any file or alerting the user.
- **3-Tier Mobile Image Saving Strategy**:
  1. **Direct Touch & Hold (Long-Press)**: Render actual `<img>` elements with `-webkit-touch-callout: default !important;` and `user-select: auto !important;` inside an interactive preview modal (`#modal-image-saver`) with clear high-contrast Thai guidance: *"แตะค้างที่รูปภาพ (Long-press) แล้วเลือก 'บันทึกรูปภาพ' ลงแกลเลอรี"*.
  2. **Native Web Share API Level 2**: Support `navigator.share({ files: [file] })` so mobile users can open the native OS Share Sheet and tap "Save Image" directly into Photos in 1 tap.
  3. **External Browser Redirection (`?openExternalBrowser=1`)**: All external promotional and dream links distributed via LINE Rich Menus or Flex Messages must append `?openExternalBrowser=1` to prompt LINE to open the site directly in Safari or Chrome where file downloads work natively.


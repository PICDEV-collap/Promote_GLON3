# GLO N3 System Invariants & Safeguards

These invariants are permanent engineering principles learned from live operation of the GLO N3 Dealer Portal (`https://n3.glolotteryshop.com/`) and LINE Official Account Bot (`@586xxhlx` ร้านสลาก N3 ธนกิจนำโชค). Any code change or automated action MUST follow these rules without exception.

---

## 1. Multi-Ticket Cart Accumulation
- **Single Navigation**: When ordering multiple lottery numbers (e.g., `334=5, 447=6, 778=3` or `สั่งซื้อ 325 1 ใบ, 929 1 ใบ`), NEVER reload or navigate to a new page between items.
- Always navigate to `https://n3.glolotteryshop.com/lotto-search/?position=1` once at the beginning of the order.
- Clear previous digits using GLO's native "ล้างค่า" button or clear visible input elements.
- Adjust ticket quantities by targeting the actual stepper element: `img[src*="plus-icon"]` and `<input type="number">` using React's native property descriptor setter (`Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set`) to ensure React controlled state updates.
- Only after all numbers have been accumulated in the cart should the bot click "ตรวจสอบสลากฯ" -> "สร้าง QR ซื้อ-ขายสลากฯ" -> "ยืนยัน".

---

## 2. Crash-Proof 1:1 QR Code Capture
- **NEVER click the "บันทึก" (Save) button on GLO's `/qr/` page**:
  Clicking this button invokes a native Windows shell file dialog which causes Google Chrome under automation on Windows to crash at the C++ level (`Crashpad .dmp`), killing the browser process.
- **Direct Canvas Capture**:
  Locate `<canvas id="qr-code-image">` directly on the DOM and extract high-resolution image data or take a screenshot with a 1:1 square crop and ~28-48px Quiet Zone padding.
- Do NOT add `window.scrollY` to Playwright viewport coordinates.

---

## 3. Session Expiration & Kickout Handling
- **GLO Session Kickout Detection**:
  When GLO sessions expire or are replaced, GLO displays a modal overlay:
  `"ไม่สามารถทำรายการได้ หากต้องการทำรายการต่อบนอุปกรณ์นี้ กรุณาเข้าสู่ระบบใหม่อีกครั้ง"` with a `"ตกลง"` button.
- **Auto-Dismiss & Redirect**:
  Any session checker or order execution MUST detect this modal, click `"ตกลง"` to navigate to `/login/`, and return `isSessionValid = false`.
- **Immediate Admin Alert**:
  Immediately trigger `triggerAdminLoginQR` to send a fresh Paotang Login QR code to `CONFIG.ADMIN_LINE_USER_ID`, while sending a polite notification to the customer to re-order shortly.

---

## 4. LINE Messaging API Safe Payload Guarantee
- **Strict 4,000 Character Text Limit**:
  LINE Messaging API has a strict 5,000 character limit for `type: 'text'` messages. Any error or retry log from Playwright easily exceeds this limit, causing `HTTPFetchError: 400 - Bad Request (Length must be between 0 and 5000)`.
- **Sanitizer Enforcement**:
  Every text message sent via `reply`, `push`, or `pushToAdmin` must pass through `LineReplyHandler.sanitizeMessages()` to truncate long messages to <= 4,000 characters and guarantee non-empty content.

---

## 5. Native LINE Image Delivery for 1-Tap Save (📥 Download Button)
- LINE Flex Messages do NOT support LINE's native in-chat fullscreen photo viewer. Opening a Flex Message image triggers a browser/webview preview which lacks the built-in 📥 download button.
- To allow customers to save the payment QR code directly to their phone gallery in 1 tap (identical to banking slips), ALWAYS deliver the payment QR as a native LINE Image Message (`type: 'image'`) paired with the Flex Message order summary card (`[imageMsg, flexMsg]`).
- Tapping the native Image Message opens LINE's built-in image viewer where the native 📥 download button is prominently located at the bottom-right corner.

---

## 6. Zero-Window Background Service on Windows
- When executing the bot in background/silent mode:
  - NEVER spawn child processes through `cmd.exe` or with `shell: true`, because Windows `cmd.exe` does not propagate `SW_HIDE` to grandchildren and forces visible console windows.
  - Spawn `process.execPath` and native `cloudflared.exe` directly with `detached: true`, `shell: false`, and `windowsHide: true`.
- Any Windows launcher or GUI dialog must set `chcp 65001 >nul` and use UTF-8 with BOM (`0xEF, 0xBB, 0xBF`) to prevent mojibake.

---

## 7. Live Quota Synchronization
- Do not rely solely on local ticket decrementing in `quota.json`.
- Automatically synchronize quota from `https://n3.glolotteryshop.com/landing/` by parsing `คุณขายสลากฯ ได้อีก ... ใบ` and `ยอดขายร้านค้า ... / 2,000 ใบ` after orders and on landing page navigation.
- Use `QuotaManager.getInstance()` singleton to maintain cache coherence across processes.

---

## 8. Mobile-First Image Saving & LINE Webview Compatibility
- **`<a download>` Webview Block Invariant**:
  In mobile In-App Webviews (especially LINE Webview on iOS & Android), synthetic clicks on `<a href="data:image/png;base64,..." download="...">` or `blob:` URLs fail silently without downloading any file or alerting the user.
- **3-Tier Mobile Image Saving Strategy**:
  1. **Direct Touch & Hold (Long-Press)**: Render actual `<img>` elements with `-webkit-touch-callout: default !important;` and `user-select: auto !important;` inside an interactive preview modal (`#modal-image-saver`) with clear high-contrast Thai guidance: *"แตะค้างที่รูปภาพ (Long-press) แล้วเลือก 'บันทึกรูปภาพ' ลงแกลเลอรี"*.
  2. **Native Web Share API Level 2**: Support `navigator.share({ files: [file] })` so mobile users can open the native OS Share Sheet and tap "Save Image" directly into Photos in 1 tap.
  3. **External Browser Redirection (`?openExternalBrowser=1`)**: All external promotional and dream links distributed via LINE Rich Menus or Flex Messages must append `?openExternalBrowser=1` to prompt LINE to open the site directly in Safari or Chrome where file downloads work natively.


# 🔌 เอกสารอ้างอิง API และ Webhook (API Reference)

เอกสารนี้ระบุ Endpoint ทั้งหมดที่ระบบรองรับ ทั้งในส่วนของ Bot Service และ Serverless Functions

---

## 1. Bot Service Endpoints (Port 3333)

### 1.1 `POST /webhook`
จุดรับเหตุการณ์ (Webhook Receiver) จาก LINE Messaging API Platform

* **Headers ที่จำเป็น**:
  * `Content-Type: application/json`
  * `x-line-signature: <Base64 HMAC-SHA256 Signature>`
* **การประมวลผล**:
  * ตรวจสอบลายเซ็นด้วย `LINE_CHANNEL_SECRET`
  * บันทึกหรืออัปเดตสถานะผู้ใช้ใน `CustomerRegistry`
  * รองรับข้อความสั่งซื้อสลาก (เช่น `334=5, 447=6`), คำขอตรวจผลรางวัล (`ผลรางวัล`), คำขอคำแนะนำ (`วิธีสั่งซื้อ`, `วิธีชำระเงิน`), และคำสั่งควบคุมของแอดมิน

---

### 1.2 `GET /api/campaign/stats`
ดึงข้อมูลสถิติลูกค้าและข้อมูลงวดการออกรางวัลถัดไป

* **Response Example**:
```json
{
  "success": true,
  "stats": {
    "total": 3,
    "active": 1,
    "blocked": 2
  },
  "upcomingDraw": {
    "drawDate": "2026-09-16",
    "thaiDate": "16 กันยายน 2569",
    "period": "งวดประจำวันที่ 16 กันยายน 2569"
  },
  "timestamp": "2026-09-05T06:32:29.414Z"
}
```

---

### 1.3 `POST /api/campaign/lucky-teaser`
สั่งยิงแคมเปญเลขมงคลกระจายไม่ซ้ำให้ลูกค้า

* **Query Parameters / Body**:
  * `dryRun` (boolean): โหมดจำลอง ไม่ส่งข้อความจริงไปยัง LINE
  * `target` / `targetUserId` (string, optional): ระบุ User ID เพื่อทดสอบส่งเฉพาะราย
  * `force` (boolean, optional): บังคับส่งแม้จะเคยได้รับแล้วในงวดนี้
* **Headers**:
  * `x-api-key: <ADMIN_API_KEY>` (ถ้ามีการตั้งค่าไว้ใน `.env`)

---

### 1.4 `POST /api/campaign/draw-results`
สั่งบรอดแคสต์ผลการออกรางวัลสลาก N3 ล่าสุดให้ลูกค้า

* **Query Parameters / Body**:
  * `dryRun` (boolean): โหมดจำลอง
  * `target` / `targetUserId` (string, optional): ระบุ User ID เพื่อทดสอบ
  * `force` (boolean, optional): บังคับส่งซ้ำ
* **Headers**:
  * `x-api-key: <ADMIN_API_KEY>` (ถ้ามีการตั้งค่าไว้ใน `.env`)

---

## 2. Vercel Serverless Function

### 2.1 `GET /api/draw-schedule`
ให้บริการข้อมูลตารางวันและเวลาออกรางวัลสลากกินแบ่งรัฐบาลอย่างเป็นทางการ

* **URL**: `https://promote-glon-3.vercel.app/api/draw-schedule`
* **Response Example**:
```json
{
  "success": true,
  "source": "สำนักงานสลากกินแบ่งรัฐบาล (GLO)",
  "upcoming": {
    "date": "2026-09-16",
    "thaiDate": "16 กันยายน 2569",
    "drawTime": "14:30",
    "period": "งวดประจำวันที่ 16 กันยายน 2569",
    "isPostponed": false
  },
  "latest": {
    "drawDate": "2026-09-01",
    "drawDateThai": "1 กันยายน 2569",
    "straight3": "212",
    "shuffle3": ["122", "221"],
    "straight2": "04"
  }
}
```

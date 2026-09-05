# 🎯 N3-MANAGER : ระบบตัวแทนและบอทจำหน่ายสลากดิจิทัล N3 (ธนกิจนำโชค)

[![GLO N3 Verified](https://img.shields.io/badge/GLO%20N3-Verified%20Dealer-0056b3.svg)](#)
[![LINE Bot Active](https://img.shields.io/badge/LINE%20Bot-%40586xxhlx-06c755.svg)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-3178c6.svg)](#)
[![Playwright](https://img.shields.io/badge/Playwright-1.50.1-2ead33.svg)](#)
[![Tests Passing](https://img.shields.io/badge/Tests-92%2F92%20Pass%20(100%25)-success.svg)](#)

ระบบเว็บแอปพลิเคชันและบอทอัตโนมัติครบวงจรสำหรับตัวแทนจำหน่ายสลากกินแบ่งรัฐบาลตัวเลขสามหลัก (GLO N3) ของร้าน **"สลาก N3 ธนกิจนำโชค"** (`@586xxhlx`) รองรับการสั่งซื้อสลากแบบหลายหมายเลขในบิลเดียว ทำนายฝัน AI สุ่มเลขมงคลกระจายไม่ซ้ำรายบุคคล และแจ้งผลการออกรางวัลอัตโนมัติ

---

## 📂 โครงสร้างโปรเจกต์ระดับมืออาชีพ (Professional Directory Structure)

```
d:\Promote_GLON3\
│
├── 📁 .agents/                  <-- กฎระเบียบและทักษะเฉพาะตัวของระบบอัตโนมัติ (Rules & Ops Skills)
├── 📁 api/                      <-- Vercel Serverless Function (draw-schedule.js ดึงปฏิทินหวยออกทางการ)
├── 📁 bot-service/              <-- ระบบแบ็กเอนด์ Node.js + TypeScript + Playwright
│   ├── src/                     <-- โค้ดต้นฉบับแบ่งโมดูล (automation, line, quota, dream, storage)
│   ├── data/                    <-- ข้อมูลเรียลไทม์ (customers.json, quota.json)
│   ├── dist/                    <-- ไฟล์ JavaScript คอมไพล์แล้วพร้อมทำงาน
│   └── package.json             <-- รายการ Dependencies และสคริปต์ของบอท
│
├── 📁 css/                      <-- สไตล์ชีทโมเดิร์น (style.css รองรับ Dark Mode & Glassmorphism)
├── 📁 data/                     <-- ข้อมูลสถิติและผลสลากทางการ (latest-lottery.json, official-draw-schedule.json)
├── 📁 docs/                     <-- 📚 เอกสารคู่มือระบบเชิงลึกระดับมืออาชีพ
│   ├── ARCHITECTURE.md          <-- แผนผังสถาปัตยกรรมและ Data Flow ระหว่าง Web, Bot, GLO และเป๋าตัง
│   ├── OPERATIONS_GUIDE.md      <-- คู่มือการใช้งานระบบสำหรับผู้ดูแลร้าน (Run, Stop, Monitor, Troubleshooting)
│   └── API_REFERENCE.md         <-- เอกสารอ้างอิง REST API และ Webhook Endpoints ทั้งหมด
│
├── 📁 images/                   <-- ตราสัญลักษณ์และภาพประกอบ (line-qr.png)
├── 📁 js/                       <-- โมดูล JavaScript ฝั่ง Frontend (14 โมดูล: Dream, Tarot, Countdown, ImageSaver)
├── 📁 public/                   <-- ไฟล์สาธารณะสำหรับเว็บและบอท
│   ├── qrcodes/                 <-- แคชเก็บภาพ QR Code ชำระเงินคมชัด 1:1
│   ├── richmenu.jpg             <-- ภาพ Rich Menu ความละเอียดสูง 2500x1686 px
│   └── line-qr.png              <-- QR Code สำหรับเพิ่มเพื่อน LINE Official
│
├── 📁 scripts/                  <-- เครื่องมืออัตโนมัติและ DevOps
│   ├── n3-engine.js             <-- เครื่องยนต์หลัก (Dashboard, Tunnel, Clean, Watchdog)
│   ├── setup-richmenu.js        <-- เครื่องมือเรนเดอร์และอัปโหลด LINE Rich Menu ขึ้น LINE CDN
│   ├── test-all-scenarios.js    <-- ชุดทดสอบระบบรอบด้าน 6 ฉากทัศน์ (End-to-End Test Suite)
│   ├── test-countdown-official.js <-- ชุดทดสอบนับถอยหลังวันหวยออกทางการ
│   ├── show-popup.ps1           <-- ป๊อปอัปแจ้งเตือน Webhook บน Windows แบบ Native
│   └── create-desktop-shortcuts.ps1 <-- ตัวสร้างไอคอนทางลัดบน Desktop อัตโนมัติ
│
├── 🌐 index.html                <-- เว็บไซต์โปรโมทสลาก N3 / ทำนายฝัน AI / เช็คผลรางวัล
├── 🛒 order.html                <-- ตารางกรอกหมายเลขและจำนวนใบ (Multi-ticket Order Table)
├── 📱 manifest.json             <-- การตั้งค่า Progressive Web App (PWA)
├── ⚙️ sw.js                     <-- Service Worker สำหรับแคชและรองรับออฟไลน์
├── ☁️ vercel.json               <-- การตั้งค่า Production Deployment บน Vercel
├── 📦 package.json              <-- สคริปต์ npm มาตรฐานระดับ Workspace
├── 📄 README.md                 <-- เอกสารสรุปภาพรวมและวิธีใช้งานระบบ
│
└── 🚀 Windows Desktop Launchers (ดับเบิลคลิกใช้งานได้ทันที):
    ├── N3-MANAGER.bat           <-- แผงควบคุมระบบบอท ตรวจเช็คโควต้า และตั้งค่าระบบสลาก N3
    ├── START-BOT.bat            <-- เปิดบอทแบบแสดงหน้าจอคอนโซล (ดู Log สด)
    ├── START-BOT-SILENT.bat     <-- ตัวเปิดโหมดเงียบ (เรียกใช้ START-BOT-HIDDEN.vbs)
    ├── START-BOT-HIDDEN.vbs     <-- เริ่มต้นบอทโหมดซ่อนหน้าต่าง 100% (ไร้หน้าจอกวนสายตา)
    ├── STOP-BOT.bat             <-- สั่งหยุดการทำงานของบอทและล้างพอร์ต 3333 ทันที
    ├── RESTART-BOT.bat          <-- รีสตาร์ทเฉพาะบอทโดยไม่เปลี่ยน Webhook URL เดิม
    ├── UPDATE-BOT.bat           <-- อัปเดตโค้ดและรีสตาร์ทบอทในเบื้องหลัง
    └── CREATE-DESKTOP-SHORTCUTS.bat <-- สร้างทางลัด 5 ตัวบน Desktop อัตโนมัติ
```

---

## 🌟 ฟังก์ชันเด่นของระบบ (Core Features)

1. **การสั่งซื้อสลาก N3 ทีละหลายเบอร์ในบิลเดียว (`order.html`)**:
   - ตารางกรอกเลข 3 หลัก พร้อมปุ่มบวกลบจำนวนใบ และปุ่มลบรายการ
   - คำนวณยอดเงินรวมอัตโนมัติ (ใบละ 20 บาท)
   - ส่งคำสั่งซื้อเข้าห้องแชท LINE ในรูปแบบ `334=5, 447=6, 778=3`
2. **ระบบบอทสะสมตะกร้าแบบ Single-Navigation**:
   - บอทเปิดหน้าจำหน่ายสลากของกองสลาก (`n3.glolotteryshop.com`) เพียงครั้งเดียวและสะสมทุกหมายเลขลงตะกร้าก่อนสร้าง QR ชำระเงิน
   - จับภาพ Canvas QR Code แบบคมชัด 1:1 ส่งให้ลูกค้าคู่กับการ์ด Flex Message
   - ลูกค้าบันทึกภาพใน 1 คลิก แล้วเปิดแอป **"เป๋าตัง"** เพื่อสแกนชำระเงิน
3. **ระบบสุ่มเลขมงคลเปิดดวงเฉพาะบุคคล (Zero-Collision Lucky Teaser)**:
   - สุ่มเลข 3 หลักกระจายไม่ซ้ำกัน 100% ก่อนวันออกรางวัล ไม่ให้ลูกค้าได้รับเลขชนกัน
   - พร้อมชุดเลขโต๊ด (สลับหลัก) และเลข 2 ตัวตรง พร้อมปุ่ม "สั่งซื้อเลขนี้ทันที"
4. **แจ้งผลรางวัลทางการอัตโนมัติ (Official Draw Results)**:
   - บรอดแคสต์ผลรางวัลครบทั้ง 4 ประเภท: 3 ตัวตรง, 3 ตัวโต๊ด, 2 ตัวตรง, แจ็กพอตพิเศษ และสลาก L6
   - เมนู **"ผลการออกรางวัล"** บน LINE Rich Menu v2 แตะ 1 ครั้งดูผลรางวัลได้ทันที
5. **ทำนายฝัน AI & ไพ่ทาโรต์นำโชค**:
   - วิเคราะห์ความฝัน ตีตัวเลขมงคลแม่นยำ พร้อมคำกลอนทำนายดวงชะตา
6. **ซิงค์โควต้าเรียลไทม์ (Live Quota Synchronization)**:
   - ดึงยอดคงเหลือจริงจากหน้าเว็บตัวแทนจำหน่ายของกองสลาก (เต็ม 2,000 ใบ) ป้องกันการสั่งซื้อเกินโควต้า

---

## 🎮 การใช้งานผ่าน `N3-MANAGER.bat`

ดับเบิลคลิกที่ไฟล์ **`N3-MANAGER.bat`** เพื่อเปิดเมนูควบคุม (มีสถานะแสดงผลแบบเรียลไทม์):

| เมนู | รายละเอียดการทำงาน |
| :--- | :--- |
| **[1] 🚀 เริ่มต้นระบบบอทอัตโนมัติ** | รันบอท (Port 3333) + Cloudflare Tunnel พร้อมสร้าง LINE Webhook URL อัตโนมัติในหน้าต่างเดียว |
| **[2] 🖥️ เปิดเบราว์เซอร์ Chrome สดๆ** | เปิดหน้าต่าง Chrome บนหน้าจอคอมเพื่อสแกนเป๋าตังสดๆ บันทึก Session ลงเครื่อง |
| **[3] 🎫 ตรวจสอบสถานะและโควต้า** | ตรวจสอบโควต้าคงเหลือ (เต็ม 2,000 ใบ), พอร์ต 3333, PID, และ LINE Webhook URL |
| **[4] 🧹 ล้างไฟล์ขยะและคืนหน่วยความจำ** | ล้างไฟล์รูปภาพ QR ชั่วคราว และปิดโปรเซสตกค้างทั้งหมด |
| **[5] 🛠️ คอมไพล์ระบบ (Build)** | รันคำสั่ง `npm run build` อัปเดตโค้ด TypeScript ล่าสุด |
| **[6] 🚀 เริ่มต้นบอทในเบื้องหลัง (ซ่อนหน้าต่าง)** | รันบอทและ Tunnel แบบเงียบ 100% ไม่มีหน้าจอดำ CMD หรือ Chrome กวนใจ |
| **[7] 🛑 หยุดการทำงานของบอท** | ปิดบอทเบื้องหลังและ Tunnel ทั้งหมด พร้อมคืนพอร์ต 3333 สะอาดเรียบร้อย |
| **[8] 📁 เปิดโฟลเดอร์รูปภาพ QR** | เปิดโฟลเดอร์ `public\qrcodes` บน Windows Explorer |
| **[9] 🌐 เปิดหน้าเว็บไซต์โปรโมทสลาก** | เปิดหน้าเว็บ `index.html` บนเบราว์เซอร์ |
| **[S] 📌 สร้างทางลัดบน Desktop** | วางไอคอนทางลัดสำหรับเปิด/ปิดบอทบน Desktop เพื่อความสะดวกรวดเร็ว |
| **[0] ❌ ออกจากโปรแกรม** | ปิดและออกจากหน้าจอควบคุม |

---

## 💻 คำสั่ง NPM สำหรับนักพัฒนา (Developer CLI)

สามารถสั่งการผ่านเทอร์มินัลได้ที่ Root Directory:

```bash
# เริ่มต้นบอทและ Cloudflare Tunnel
npm start

# รันชุดทดสอบความถูกต้องทั้งหมด (92 tests)
npm test

# รันชุดทดสอบ End-to-End Scenarios
npm run test:e2e

# คอมไพล์โค้ด TypeScript
npm run build

# อัปเดตและซิงค์ LINE Rich Menu ขึ้น LINE CDN
npm run richmenu

# ล้างไฟล์ภาพชั่วคราวและแคช
npm run clean

# สร้างทางลัดบน Desktop
npm run shortcuts
```

---

## 📚 เอกสารเพิ่มเติมในระบบ
* [docs/ARCHITECTURE.md](file:///d:/Promote_GLON3/docs/ARCHITECTURE.md) - แผนผังสถาปัตยกรรมระบบโดยละเอียด
* [docs/OPERATIONS_GUIDE.md](file:///d:/Promote_GLON3/docs/OPERATIONS_GUIDE.md) - คู่มือการใช้งานสำหรับแอดมินร้าน
* [docs/API_REFERENCE.md](file:///d:/Promote_GLON3/docs/API_REFERENCE.md) - รายละเอียด REST API และ Webhooks

# N3 Bot Service (ระบบสั่งซื้อสลาก N3 อัตโนมัติผ่าน LINE OA)

ระบบบริการ Backend และ Browser Automation สำหรับสั่งซื้อสลาก N3 ผ่าน LINE OA เชื่อมต่อเว็บตัวแทน N3 ดึง QR Code เป๋าตังส่งให้ลูกค้า และบริหารโควต้า 2,000 ใบ

---

## ฟังก์ชันการทำงานหลัก (Features)

1. **LINE Webhook & Zero-Quota Optimization**:
   - รับคำสั่งซื้อจากลูกค้า (เช่น `789 2 ใบ`, `สั่ง 012 5`, `999 1`)
   - ส่งภาพ QR Code ชำระเงินผ่าน `replyMessage` (**ฟรี 100% ไม่เสียโควต้า Push Message 500 ข้อความ/เดือน**)
2. **ระบบความปลอดภัยล็อก URL (Strict Sandboxing)**:
   - บล็อกทราฟฟิกขาออกและ Navigation ทั้งหมดนอกเหนือจาก Domain N3 และ Krungthai Paotang OAuth
   - ห้ามเข้าถึงเว็บไซต์ภายนอก ป้องกันข้อมูลรั่วไหล
3. **ระบบจัดการโควต้า 2,000 ใบ (Quota Management)**:
   - ตรวจสอบโควต้าคงเหลือก่อนเข้าคิว
   - ตัดยอดโควต้าอัตโนมัติเมื่อสั่งซื้อสำเร็จ
   - รองรับการ Sync ยอดสลากคงเหลือจากหน้าเว็บจริง
   - ปิดรับออเดอร์อัตโนมัติ (Sold Out) เมื่อครบ 2,000 ใบ
4. **กระบวนการล็อกอินด้วยเป๋าตัง (Admin Login Flow)**:
   - มีคำสั่งดึง QR Code หน้า Login ส่งเข้า LINE แอดมิน
   - แอดมินใช้แอปเป๋าตังสแกนยืนยันตัวตน
   - บันทึก Session (Cookies + LocalStorage) ไว้ใช้งานยาวนาน
5. **High-Speed FIFO Order Queue**:
   - คิวเดี่ยวความเร็วสูง ประมวลผลคำสั่งซื้อทีละรายการ ป้องกันหน้าจอตะกร้าชนกัน
   - ส่ง QR ให้ลูกค้าแล้วจบงานทันทีในเวลาเพียง 4–6 วินาที

---

## วิธีติดตั้งและเริ่มใช้งาน (Quick Start)

### 1. ตั้งค่า Environment Variables
คัดลอก `.env.example` ไปเป็น `.env` แล้วระบุค่า:
```env
PORT=3000
BASE_URL=http://localhost:3000
LINE_CHANNEL_ACCESS_TOKEN=ใส่_Channel_Access_Token_จาก_LINE_Developers
LINE_CHANNEL_SECRET=ใส่_Channel_Secret_จาก_LINE_Developers
ADMIN_LINE_USER_ID=ใส่_User_ID_ของแอดมินสำหรับรับรูป_QR_Login
```

### 2. รันระบบ
```bash
# พัฒนา (Development)
npm run dev

# คอมไพล์และรันใช้งานจริง (Production)
npm run build
npm start
```

### 3. คำสั่งทดสอบสำคัญ
```bash
# ทดสอบเปิดหน้าเว็บ N3 และดึง QR Login เป๋าตัง
npm run test:login

# ทดสอบระบบตัดโควต้า 2,000 ใบ
npm run test:quota
```

### 4. การเชื่อมต่อ Webhook กับ LINE Official Account
- นำ URL ของเซิร์ฟเวอร์ (เช่น ผ่าน Cloudflare Tunnel, ngrok หรือ Public IP) ไปใส่ใน LINE Developers Console:
  `https://your-domain.com/webhook`

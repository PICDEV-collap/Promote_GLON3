import { messagingApi } from '@line/bot-sdk';

export class FlexMessageBuilder {
  /**
   * สร้างการ์ด Flex Message สำหรับส่ง QR Code ชำระเงิน N3 ให้ลูกค้า
   * พร้อมปุ่มลิงก์ไปยังระบบทำนายฝัน AI
   */
  public static buildPaymentQRMessage(
    qrImageUrl: string,
    lotteryNumber: string,
    quantity: number,
    totalPrice: number,
    expireMinutes: number = 10
  ): messagingApi.FlexMessage {
    return {
      type: 'flex',
      altText: `สลาก N3 เลข ${lotteryNumber} จำนวน ${quantity} ใบ - สแกนจ่ายด้วยแอปเป๋าตัง`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'สลากกินแบ่งรัฐบาล N3 (ธนกิจนำโชค)',
              weight: 'bold',
              color: '#d4af37',
              size: 'sm'
            },
            {
              type: 'text',
              text: 'QR Code ชำระเงิน',
              weight: 'bold',
              size: 'xl',
              color: '#ffffff'
            }
          ],
          backgroundColor: '#0c1b33',
          paddingAll: '16px'
        },
        hero: {
          type: 'image',
          url: qrImageUrl,
          size: 'full',
          aspectRatio: '1:1',
          aspectMode: 'fit',
          backgroundColor: '#ffffff'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'เลขที่สั่งซื้อ:', color: '#666666', size: 'md' },
                { type: 'text', text: lotteryNumber, weight: 'bold', color: '#0056b3', align: 'end', size: 'xl' }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'sm',
              contents: [
                { type: 'text', text: 'จำนวนสลาก:', color: '#666666', size: 'sm' },
                { type: 'text', text: `${quantity} ใบ`, weight: 'bold', color: '#111111', align: 'end', size: 'md' }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'sm',
              contents: [
                { type: 'text', text: 'ยอดชำระสุทธิ:', color: '#666666', size: 'sm' },
                { type: 'text', text: `${totalPrice} บาท`, weight: 'bold', color: '#28a745', align: 'end', size: 'xl' }
              ]
            },
            { type: 'separator', margin: 'lg' },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              contents: [
                {
                  type: 'text',
                  text: `⏳ สแกนจ่ายผ่านแอป "เป๋าตัง" ภายใน ${expireMinutes} นาที`,
                  size: 'sm',
                  color: '#e74c3c',
                  wrap: true,
                  weight: 'bold'
                },
                {
                  type: 'text',
                  text: '*บันทึกภาพนี้ แล้วนำไปเปิดสแกนในแอปเป๋าตังเพื่อรับสลากทันที',
                  size: 'xs',
                  color: '#888888',
                  wrap: true,
                  margin: 'xs'
                }
              ]
            }
          ],
          paddingAll: '16px'
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#d4af37',
              height: 'sm',
              action: {
                type: 'uri',
                label: '🔮 ทำนายฝัน หาเลขเด็ด N3',
                uri: 'https://promote-glon3.vercel.app/'
              }
            }
          ],
          paddingAll: '12px'
        }
      }
    };
  }

  public static buildQuotaExceededMessage(remaining: number): messagingApi.TextMessage {
    if (remaining <= 0) {
      return {
        type: 'text',
        text: 'ขออภัยเป็นอย่างยิ่งครับ สลาก N3 ของทางร้านในงวดนี้จำหน่ายครบตามโควต้าแล้ว (Sold Out) ขอบคุณที่ให้ความสนใจครับ 🙏\n\n🔮 คุณสามารถลองเข้าไปวิเคราะห์เลขเด็ดล่วงหน้าได้ที่เว็บทำนายฝัน AI ของเรา:\n👉 https://promote-glon3.vercel.app/'
      };
    } else {
      return {
        type: 'text',
        text: `ขออภัยครับ สลากของทางร้านเหลือน้อยกว่าจำนวนที่สั่ง (สลากคงเหลือ ${remaining} ใบ) กรุณาระบุจำนวนใหม่อีกครั้งครับ`
      };
    }
  }
}

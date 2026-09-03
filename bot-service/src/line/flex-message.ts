import { messagingApi } from '@line/bot-sdk';

export class FlexMessageBuilder {
  /**
   * สร้างการ์ด Flex Message สำหรับส่ง QR Code ชำระเงิน N3 ให้ลูกค้า
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
      altText: `สลาก N3 เลข ${lotteryNumber} จำนวน ${quantity} ใบ - กรุณาสแกนจ่ายด้วยแอปเป๋าตัง`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'สลากกินแบ่งรัฐบาล N3',
              weight: 'bold',
              color: '#d4af37',
              size: 'sm'
            },
            {
              type: 'text',
              text: 'ยืนยันคำสั่งซื้อสลาก',
              weight: 'bold',
              size: 'xl',
              color: '#ffffff'
            }
          ],
          backgroundColor: '#0c1b33',
          paddingAll: '15px'
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
                { type: 'text', text: 'เลขที่เลือก:', color: '#888888', size: 'sm' },
                { type: 'text', text: lotteryNumber, weight: 'bold', color: '#111111', align: 'end', size: 'md' }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'จำนวน:', color: '#888888', size: 'sm' },
                { type: 'text', text: `${quantity} ใบ`, weight: 'bold', color: '#111111', align: 'end', size: 'md' }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'ยอดชำระทั้งหมด:', color: '#888888', size: 'sm' },
                { type: 'text', text: `${totalPrice} บาท`, weight: 'bold', color: '#008000', align: 'end', size: 'lg' }
              ]
            },
            { type: 'separator', margin: 'md' },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              contents: [
                {
                  type: 'text',
                  text: `⏳ กรุณาบันทึกภาพแล้วสแกนจ่ายผ่านแอป "เป๋าตัง" ภายใน ${expireMinutes} นาที`,
                  size: 'xs',
                  color: '#e74c3c',
                  wrap: true,
                  weight: 'bold'
                },
                {
                  type: 'text',
                  text: '*เมื่อชำระสำเร็จ ระบบเป๋าตังจะออกสลากให้คุณอัตโนมัติ',
                  size: 'xxs',
                  color: '#999999',
                  wrap: true,
                  margin: 'xs'
                }
              ]
            }
          ],
          paddingAll: '15px'
        }
      }
    };
  }

  /**
   * สร้างข้อความแจ้งเตือนเมื่อโควต้าสลากหมด (Sold Out)
   */
  public static buildQuotaExceededMessage(remaining: number): messagingApi.TextMessage {
    if (remaining <= 0) {
      return {
        type: 'text',
        text: 'ขออภัยเป็นอย่างยิ่งครับ สลาก N3 ของทางร้านในงวดนี้จำหน่ายครบตามโควต้าแล้ว (Sold Out) ขอบคุณที่ให้ความสนใจครับ 🙏'
      };
    } else {
      return {
        type: 'text',
        text: `ขออภัยครับ สลากของทางร้านเหลือน้อยกว่าจำนวนที่สั่ง (สลากคงเหลือ ${remaining} ใบ) กรุณาระบุจำนวนใหม่อีกครั้งครับ`
      };
    }
  }
}

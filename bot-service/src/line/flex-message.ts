import { messagingApi } from '@line/bot-sdk';
import { CONFIG } from '../config';
import { OperatingHoursStatus } from '../guard/operating-hours';

export class FlexMessageBuilder {
  /**
   * 1. การ์ด QR Code ชำระเงิน N3 ส่งให้ลูกค้า
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
      altText: `สลาก N3 เลข ${lotteryNumber} (${quantity} ใบ) - สแกนจ่ายด้วยแอปเป๋าตัง`,
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
                  text: '*บันทึกภาพนี้ แล้วเปิดสแกนจากแกลเลอรีในแอปเป๋าตังเพื่อรับสลากทันที',
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
                uri: CONFIG.DREAM_PREDICTION_URL
              }
            }
          ],
          paddingAll: '12px'
        }
      }
    };
  }

  /**
   * 2. การ์ดแนะนำวิธีสั่งซื้อสลาก N3 ครอบคลุมทุกรูปแบบ
   */
  public static buildHowToOrderMessage(): messagingApi.FlexMessage {
    return {
      type: 'flex',
      altText: 'ยินดีต้อนรับสู่ร้านสลาก N3 ธนกิจนำโชค - วิธีพิมพ์สั่งซื้อ',
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
              text: '📌 วิธีการพิมพ์สั่งซื้อสลาก',
              weight: 'bold',
              size: 'lg',
              color: '#ffffff'
            }
          ],
          backgroundColor: '#0c1b33',
          paddingAll: '16px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'ท่านสามารถพิมพ์สั่งซื้อได้ง่ายๆ ดังนี้:',
              weight: 'bold',
              size: 'sm',
              color: '#333333'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              spacing: 'sm',
              contents: [
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: '• พิมพ์เลข 3 ตัวตรง:', size: 'xs', color: '#666666', flex: 4 },
                    { type: 'text', text: '123 (ได้ 1 ใบ)', size: 'xs', weight: 'bold', color: '#0056b3', flex: 5 }
                  ]
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: '• ระบุจำนวนใบ:', size: 'xs', color: '#666666', flex: 4 },
                    { type: 'text', text: '456 2 หรือ 456 2ใบ', size: 'xs', weight: 'bold', color: '#0056b3', flex: 5 }
                  ]
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: '• พิมพ์คำสั่งเต็ม:', size: 'xs', color: '#666666', flex: 4 },
                    { type: 'text', text: 'สั่ง 789 5 ใบ', size: 'xs', weight: 'bold', color: '#0056b3', flex: 5 }
                  ]
                }
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
                  text: '⏰ เวลาเปิดจำหน่ายสลาก N3:',
                  size: 'xs',
                  weight: 'bold',
                  color: '#555555'
                },
                {
                  type: 'text',
                  text: '- วันทั่วไป: 06:00 - 23:00 น.\n- วันออกรางวัล (1 และ 16): 06:00 - 14:00 น.',
                  size: 'xs',
                  color: '#777777',
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
                uri: CONFIG.DREAM_PREDICTION_URL
              }
            }
          ],
          paddingAll: '12px'
        }
      }
    };
  }

  /**
   * 3. การ์ดแจ้งเตือนอยู่นอกเวลาจำหน่ายตามระเบียบกองสลาก
   */
  public static buildOutsideOperatingHoursMessage(status: OperatingHoursStatus): messagingApi.FlexMessage {
    return {
      type: 'flex',
      altText: 'แจ้งเตือน: อยู่นอกเวลาจำหน่ายสลาก N3',
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
              text: '⏰ อยู่นอกเวลาจำหน่าย',
              weight: 'bold',
              size: 'lg',
              color: '#ffffff'
            }
          ],
          backgroundColor: '#8B0000',
          paddingAll: '16px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: status.reason,
              size: 'sm',
              color: '#333333',
              wrap: true,
              weight: 'bold'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              contents: [
                {
                  type: 'text',
                  text: '📌 ระเบียบเวลาจำหน่ายสำนักงานสลากฯ:',
                  size: 'xs',
                  weight: 'bold',
                  color: '#666666'
                },
                {
                  type: 'text',
                  text: '• วันทั่วไป: 06:00 - 23:00 น.\n• วันออกรางวัล (1 และ 16): 06:00 - 14:00 น.',
                  size: 'xs',
                  color: '#555555',
                  wrap: true,
                  margin: 'xs'
                },
                {
                  type: 'text',
                  text: `👉 ${status.nextOpenText}`,
                  size: 'xs',
                  color: '#28a745',
                  weight: 'bold',
                  margin: 'sm'
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
                label: '🔮 ทำนายฝัน หาเลขเด็ดล่วงหน้า',
                uri: CONFIG.DREAM_PREDICTION_URL
              }
            }
          ],
          paddingAll: '12px'
        }
      }
    };
  }

  /**
   * 4. ข้อความแจ้งเตือนโควต้าหมด
   */
  public static buildQuotaExceededMessage(remaining: number): messagingApi.TextMessage {
    if (remaining <= 0) {
      return {
        type: 'text',
        text: `ขออภัยเป็นอย่างยิ่งครับ สลาก N3 ของทางร้านในงวดนี้จำหน่ายครบตามโควต้าแล้ว (Sold Out) ขอบคุณที่ให้ความสนใจครับ 🙏\n\n🔮 ระหว่างนี้ท่านสามารถเข้าไปวิเคราะห์เลขเด็ดล่วงหน้าได้ที่เว็บทำนายฝัน AI ของเรา:\n👉 ${CONFIG.DREAM_PREDICTION_URL}`
      };
    } else {
      return {
        type: 'text',
        text: `ขออภัยครับ สลากของทางร้านเหลือน้อยกว่าจำนวนที่สั่ง (สลากคงเหลือ ${remaining} ใบ) กรุณาระบุจำนวนใหม่อีกครั้งครับ`
      };
    }
  }
}

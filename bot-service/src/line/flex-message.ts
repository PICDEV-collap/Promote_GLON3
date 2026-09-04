import { messagingApi } from '@line/bot-sdk';
import { CONFIG } from '../config';
import { OperatingHoursStatus } from '../guard/operating-hours';
import { OrderItem } from '../queue/order-queue';

export class FlexMessageBuilder {
  /**
   * 1. การ์ด QR Code ชำระเงิน N3 ส่งให้ลูกค้า (รองรับทั้งเลขเดียวและหลายเลข)
   */
  public static buildPaymentQRMessage(
    qrImageUrl: string,
    lotteryNumberOrItems: string | OrderItem[],
    quantity: number = 1,
    totalPrice: number = 20,
    expireMinutes: number = 10,
    downloadUrl?: string,
    outOfStockItems?: string[]
  ): messagingApi.FlexMessage {
    const targetActionUrl = downloadUrl || qrImageUrl;

    const isMulti = Array.isArray(lotteryNumberOrItems);
    const items: OrderItem[] = isMulti
      ? (lotteryNumberOrItems as OrderItem[])
      : [{ number: lotteryNumberOrItems as string, quantity: quantity > 0 ? quantity : 1 }];

    const calcTotalQty = items.reduce((sum, item) => sum + item.quantity, 0);
    const calcTotalPrice = items.reduce((sum, item) => sum + item.quantity * 20, 0);
    const finalTotalQty = isMulti
      ? (quantity > 1 ? quantity : calcTotalQty)
      : (quantity > 0 ? quantity : 1);
    const finalTotalPrice = isMulti
      ? (totalPrice > 20 ? totalPrice : calcTotalPrice)
      : (totalPrice > 0 ? totalPrice : finalTotalQty * 20);

    const altText = items.length === 1
      ? `สลาก N3 เลข ${items[0].number} (${items[0].quantity} ใบ) - สแกนจ่ายด้วยแอปเป๋าตัง`
      : `สลาก N3 (${finalTotalQty} ใบ) ${items.map(i => i.number).join(', ')} - สแกนจ่ายด้วยแอปเป๋าตัง`;

    // สร้างกล่องรายการสลาก
    const itemContents: messagingApi.FlexComponent[] = [];

    if (items.length === 1) {
      itemContents.push(
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: 'เลขที่สั่งซื้อ:', color: '#666666', size: 'md' },
            { type: 'text', text: items[0].number, weight: 'bold', color: '#0056b3', align: 'end', size: 'xl' }
          ]
        },
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'sm',
          contents: [
            { type: 'text', text: 'จำนวนสลาก:', color: '#666666', size: 'sm' },
            { type: 'text', text: `${items[0].quantity} ใบ`, weight: 'bold', color: '#111111', align: 'end', size: 'md' }
          ]
        }
      );
    } else {
      itemContents.push({
        type: 'text',
        text: '📋 รายการสลากที่สั่งซื้อ:',
        weight: 'bold',
        size: 'sm',
        color: '#333333'
      });

      for (const it of items) {
        itemContents.push({
          type: 'box',
          layout: 'horizontal',
          margin: 'xs',
          contents: [
            { type: 'text', text: `• เลข ${it.number}`, weight: 'bold', color: '#0056b3', size: 'sm', flex: 4 },
            { type: 'text', text: `${it.quantity} ใบ (${it.quantity * 20} บ.)`, weight: 'bold', color: '#333333', align: 'end', size: 'sm', flex: 6 }
          ]
        });
      }

      itemContents.push({
        type: 'box',
        layout: 'horizontal',
        margin: 'sm',
        contents: [
          { type: 'text', text: 'จำนวนสลากรวม:', color: '#666666', size: 'sm' },
          { type: 'text', text: `${finalTotalQty} ใบ`, weight: 'bold', color: '#111111', align: 'end', size: 'md' }
        ]
      });
    }

    // ยอดชำระสุทธิ
    itemContents.push({
      type: 'box',
      layout: 'horizontal',
      margin: 'sm',
      contents: [
        { type: 'text', text: 'ยอดชำระสุทธิ:', color: '#666666', size: 'sm' },
        { type: 'text', text: `${finalTotalPrice} บาท`, weight: 'bold', color: '#28a745', align: 'end', size: 'xl' }
      ]
    });

    // หากมีเลขที่หมดในระบบ แจ้งเตือนลูกค้า
    if (outOfStockItems && outOfStockItems.length > 0) {
      itemContents.push(
        { type: 'separator', margin: 'md' },
        {
          type: 'text',
          text: `⚠️ หมายเหตุ: สลากเลข ${outOfStockItems.join(', ')} หมดในระบบ ทางร้านจึงออก QR ยอดเฉพาะเลขที่มีให้ครับ`,
          size: 'xs',
          color: '#d9534f',
          wrap: true,
          margin: 'sm'
        }
      );
    }

    itemContents.push(
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
            text: '💡 แตะรูป QR ด้านบน หรือกดปุ่ม "ดาวน์โหลด" ด้านล่าง เพื่อบันทึกรูปลงเครื่อง แล้วเปิดแอปเป๋าตังเพื่อสแกนจ่ายได้ทันที',
            size: 'xs',
            color: '#0056b3',
            wrap: true,
            margin: 'xs'
          }
        ]
      }
    );

    return {
      type: 'flex',
      altText,
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
          aspectMode: 'cover',
          backgroundColor: '#ffffff',
          action: {
            type: 'uri',
            label: 'เปิดรูป QR Code',
            uri: targetActionUrl
          }
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: itemContents,
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
              color: '#00c300',
              height: 'sm',
              action: {
                type: 'uri',
                label: '📥 ดาวน์โหลด / บันทึก QR Code',
                uri: targetActionUrl
              }
            },
            {
              type: 'button',
              style: 'secondary',
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
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'message',
              label: '🛒 ตัวอย่างสั่งซื้อ',
              text: '334 2, 447 2'
            }
          },
          {
            type: 'action',
            action: {
              type: 'message',
              label: '📊 เช็คโควต้าสลาก',
              text: 'เช็คโควต้า'
            }
          },
          {
            type: 'action',
            action: {
              type: 'uri',
              label: '🔮 ทำนายฝัน AI',
              uri: CONFIG.DREAM_PREDICTION_URL
            }
          },
          {
            type: 'action',
            action: {
              type: 'message',
              label: '❓ วิธีสั่งซื้อ',
              text: 'วิธีสั่งซื้อ'
            }
          }
        ]
      },
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
                    { type: 'text', text: '• สั่งเลขเดี่ยว:', size: 'xs', color: '#666666', flex: 4 },
                    { type: 'text', text: '123 2 (ได้ 2 ใบ)', size: 'xs', weight: 'bold', color: '#0056b3', flex: 5 }
                  ]
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: '• สั่งหลายเลข (บิลเดียว):', size: 'xs', color: '#666666', flex: 4 },
                    { type: 'text', text: '123 2, 456 1, 789 3', size: 'xs', weight: 'bold', color: '#0056b3', flex: 5 }
                  ]
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: '• สั่งเท่ากันทุกเลข:', size: 'xs', color: '#666666', flex: 4 },
                    { type: 'text', text: '123 456 อย่างละ 2 ใบ', size: 'xs', weight: 'bold', color: '#0056b3', flex: 5 }
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
   * 2.1 การ์ดต้อนรับลูกค้าใหม่เมื่อเพิ่มเพื่อน (Welcome Card on Follow)
   */
  public static buildWelcomeMessage(): messagingApi.FlexMessage {
    return {
      type: 'flex',
      altText: '🎉 ยินดีต้อนรับสู่ร้านสลาก N3 ธนกิจนำโชค!',
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'message',
              label: '🛒 ตัวอย่างสั่งซื้อ',
              text: '334 2, 447 2'
            }
          },
          {
            type: 'action',
            action: {
              type: 'message',
              label: '📊 เช็คโควต้าสลาก',
              text: 'เช็คโควต้า'
            }
          },
          {
            type: 'action',
            action: {
              type: 'uri',
              label: '🔮 ทำนายฝัน AI',
              uri: CONFIG.DREAM_PREDICTION_URL
            }
          },
          {
            type: 'action',
            action: {
              type: 'message',
              label: '❓ วิธีสั่งซื้อ',
              text: 'วิธีสั่งซื้อ'
            }
          }
        ]
      },
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🎉 ยินดีต้อนรับสู่',
              weight: 'bold',
              color: '#d4af37',
              size: 'sm'
            },
            {
              type: 'text',
              text: 'ร้านสลาก N3 ธนกิจนำโชค',
              weight: 'bold',
              size: 'lg',
              color: '#ffffff'
            },
            {
              type: 'text',
              text: 'ตัวแทนจำหน่ายสลากกินแบ่งรัฐบาลตัวเลขสามหลัก (N3)',
              size: 'xxs',
              color: '#a0b2c6',
              margin: 'xs'
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
              text: '✨ สลาก N3 ใบละ 20 บาท ถูกกฎหมาย 100%',
              weight: 'bold',
              size: 'sm',
              color: '#0056b3'
            },
            {
              type: 'text',
              text: 'ลุ้นได้ถึง 4 รางวัลใหญ่ใน 1 ใบ ออกรางวัลทุกวันที่ 1 และ 16:',
              size: 'xs',
              color: '#555555',
              margin: 'xs'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              spacing: 'xs',
              backgroundColor: '#f8f9fa',
              paddingAll: '10px',
              cornerRadius: 'md',
              contents: [
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: '🥇 สามตรง:', size: 'xxs', weight: 'bold', color: '#b8860b', flex: 3 },
                    { type: 'text', text: 'ตรงเลข ตรงหลัก', size: 'xxs', color: '#444444', flex: 7 }
                  ]
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: '🥈 สามสลับหลัก:', size: 'xxs', weight: 'bold', color: '#708090', flex: 3 },
                    { type: 'text', text: 'ตรงเลข สลับตำแหน่ง (โต๊ด)', size: 'xxs', color: '#444444', flex: 7 }
                  ]
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: '🥉 สองตรง:', size: 'xxs', weight: 'bold', color: '#cd7f32', flex: 3 },
                    { type: 'text', text: 'ตรงเลขท้าย 2 ตัว ตรงหลัก', size: 'xxs', color: '#444444', flex: 7 }
                  ]
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: '🎁 รางวัลพิเศษ:', size: 'xxs', weight: 'bold', color: '#d9534f', flex: 3 },
                    { type: 'text', text: 'แจ็กพอตสุ่มจากผู้ถูกรางวัลสามตรง', size: 'xxs', color: '#444444', flex: 7 }
                  ]
                }
              ]
            },
            { type: 'separator', margin: 'md' },
            {
              type: 'text',
              text: '🛒 วิธีการสั่งซื้อสลากง่ายๆ:',
              weight: 'bold',
              size: 'xs',
              color: '#333333',
              margin: 'md'
            },
            {
              type: 'text',
              text: 'ท่านสามารถพิมพ์เลขที่ต้องการในแชทนี้ได้ทันที เช่น:\n• สั่งเลขเดียว: 123 2 (ได้ 2 ใบ)\n• สั่งหลายเลข: 334 2, 447 3\n• สั่งเท่ากัน: 111 222 อย่างละ 2 ใบ',
              size: 'xxs',
              color: '#666666',
              wrap: true,
              margin: 'xs'
            },
            {
              type: 'text',
              text: '⏰ เวลาจำหน่าย: 06:00 - 23:00 น. (วันหวยออกปิด 14:00 น.)',
              size: 'xxs',
              color: '#888888',
              margin: 'md'
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
                label: '🔮 ทำนายฝัน หาเลขเด็ด AI',
                uri: CONFIG.DREAM_PREDICTION_URL
              }
            },
            {
              type: 'button',
              style: 'secondary',
              color: '#0056b3',
              height: 'sm',
              action: {
                type: 'message',
                label: '🛒 ทดลองสั่งซื้อ (ตัวอย่าง 334 2 ใบ)',
                text: '334 2'
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

  /**
   * 5. การ์ดแจ้งเตือนลำดับคิวและเวลารอโดยประมาณ (Queue Notification Card)
   */
  public static buildQueueStatusMessage(
    queuePosition: number,
    estimatedSeconds: number,
    number: string,
    quantity: number
  ): messagingApi.FlexMessage {
    const totalPrice = quantity * 20;

    return {
      type: 'flex',
      altText: `รับออเดอร์เลข ${number} แล้ว (อยู่ในคิวที่ ${queuePosition})`,
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'สลากกินแบ่งรัฐบาล N3 (ธนกิจนำโชค)',
              color: '#d4af37',
              size: 'xs',
              weight: 'bold'
            },
            {
              type: 'text',
              text: `🎫 รับออเดอร์แล้ว (คิวที่ ${queuePosition})`,
              color: '#ffffff',
              size: 'lg',
              weight: 'bold',
              margin: 'xs'
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
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'เลขที่สั่ง:', size: 'sm', color: '#666666', flex: 3 },
                { type: 'text', text: `${number}`, size: 'md', weight: 'bold', color: '#00875a', flex: 4 }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'sm',
              contents: [
                { type: 'text', text: 'จำนวน:', size: 'sm', color: '#666666', flex: 3 },
                { type: 'text', text: `${quantity} ใบ (${totalPrice} บาท)`, size: 'sm', weight: 'bold', color: '#333333', flex: 4 }
              ]
            },
            { type: 'separator', margin: 'md' },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              backgroundColor: '#f0fdf4',
              cornerRadius: '8px',
              paddingAll: '12px',
              contents: [
                {
                  type: 'text',
                  text: `⏳ กำลังเตรียม QR Code ชำระเงินให้ท่าน`,
                  size: 'xs',
                  weight: 'bold',
                  color: '#166534'
                },
                {
                  type: 'text',
                  text: `⏱️ คาดว่าจะได้รับ QR Code ในอีกประมาณ ~${estimatedSeconds} วินาที`,
                  size: 'xs',
                  color: '#15803d',
                  margin: 'xs'
                },
                {
                  type: 'text',
                  text: 'ระบบจะส่ง QR Code ให้ท่านทันทีเมื่อถึงคิวครับ ขอบพระคุณที่รอคอยครับ 🙏',
                  size: 'xxs',
                  color: '#666666',
                  margin: 'sm',
                  wrap: true
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
                label: '🔮 ทำนายฝัน หาเลขเด็ดรอคิว',
                uri: CONFIG.DREAM_PREDICTION_URL
              }
            }
          ],
          paddingAll: '12px'
        }
      }
    };
  }
}

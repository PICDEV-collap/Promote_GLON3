import { messagingApi } from '@line/bot-sdk';
import { CONFIG } from '../config';
import { OperatingHoursStatus } from '../guard/operating-hours';
import { OrderItem } from '../queue/order-queue';
import { DreamPredictionResult } from '../dream/dream-engine';
import { DistributedLuckyItem } from '../dream/lucky-distributor';

export class FlexMessageBuilder {
  /**
   * 0. แถบปุ่มเมนูด่วน (Quick Reply Buttons)
   * ปิดใช้งานปุ่ม popup ลอย เพื่อไม่ให้แสดงผลซ้ำซ้อนกับ LINE Rich Menu ที่อยู่ด้านล่าง
   */
  public static getDefaultQuickReply(): messagingApi.QuickReply | undefined {
    return undefined;
  }

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
    outOfStockItems?: string[],
    includeHeroImage: boolean = false
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
        backgroundColor: '#fff3cd',
        cornerRadius: 'md',
        paddingAll: '10px',
        contents: [
          {
            type: 'text',
            text: '⚠️ ข้อสำคัญ: ชำระผ่านแอป "เป๋าตัง" เท่านั้น',
            size: 'xs',
            weight: 'bold',
            color: '#856404'
          },
          {
            type: 'text',
            text: '❌ ไม่สามารถใช้แอปธนาคารทั่วไปสแกนได้\n💡 แตะที่รูป QR ด้านบน แล้วกดปุ่ม 📥 ที่มุมขวาล่าง หรือกดปุ่มเขียว "📥 ดาวน์โหลด" ด้านล่างนี้เพื่อบันทึกรูปลงเครื่อง แล้วเปิดแอปเป๋าตังเข้าเมนูสแกนจ่ายเงินได้ทันที',
            size: 'xxs',
            color: '#856404',
            wrap: true,
            margin: 'xs'
          }
        ]
      },
      {
        type: 'box',
        layout: 'vertical',
        margin: 'sm',
        contents: [
          {
            type: 'text',
            text: `⏳ สแกนจ่ายภายใน ${expireMinutes} นาที (ใบละ 20 บาท)`,
            size: 'sm',
            color: '#e74c3c',
            wrap: true,
            weight: 'bold'
          }
        ]
      }
    );

    const bubble: messagingApi.FlexBubble = {
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
            text: includeHeroImage ? 'QR Code ชำระเงิน' : 'สรุปคำสั่งซื้อสลาก N3',
            weight: 'bold',
            size: 'xl',
            color: '#ffffff'
          }
        ],
        backgroundColor: '#0c1b33',
        paddingAll: '16px'
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
            style: 'primary',
            color: '#28a745',
            height: 'sm',
            action: {
              type: 'uri',
              label: '🛒 สั่งซื้อสลาก N3',
              uri: CONFIG.ORDER_LIFF_URL || CONFIG.ORDER_FORM_URL
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
          },
          {
            type: 'button',
            style: 'secondary',
            color: '#555555',
            height: 'sm',
            action: {
              type: 'message',
              label: '🏠 เมนูหลัก',
              text: 'เมนู'
            }
          }
        ],
        paddingAll: '12px'
      }
    };

    if (includeHeroImage) {
      bubble.hero = {
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
      };
    }

    return {
      type: 'flex',
      altText,
      contents: bubble
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
              backgroundColor: '#fff3cd',
              cornerRadius: 'md',
              paddingAll: '8px',
              contents: [
                {
                  type: 'text',
                  text: '👛 ชำระเงินผ่านแอป "เป๋าตัง" เท่านั้น',
                  size: 'xs',
                  weight: 'bold',
                  color: '#856404'
                },
                {
                  type: 'text',
                  text: 'ใบละ 20 บาท (ไม่สามารถใช้แอปธนาคารอื่นสแกนได้)',
                  size: 'xxs',
                  color: '#856404',
                  margin: 'xs'
                }
              ]
            },
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
              color: '#28a745',
              height: 'sm',
              action: {
                type: 'uri',
                label: '🛒 สั่งซื้อสลาก N3',
                uri: CONFIG.ORDER_LIFF_URL || CONFIG.ORDER_FORM_URL
              }
            },
            {
              type: 'button',
              style: 'primary',
              color: '#0056b3',
              height: 'sm',
              action: {
                type: 'message',
                label: '📲 วิธีการชำระเงิน (เป๋าตัง)',
                text: 'วิธีชำระเงิน'
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
            },
            {
              type: 'button',
              style: 'secondary',
              color: '#555555',
              height: 'sm',
              action: {
                type: 'message',
                label: '🏠 เมนูหลัก',
                text: 'เมนู'
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
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              backgroundColor: '#fff3cd',
              cornerRadius: 'md',
              paddingAll: '8px',
              contents: [
                {
                  type: 'text',
                  text: '👛 การชำระเงิน: จ่ายผ่านแอป "เป๋าตัง" เท่านั้น',
                  size: 'xs',
                  weight: 'bold',
                  color: '#856404'
                },
                {
                  type: 'text',
                  text: 'สแกนจ่ายง่าย รวดเร็ว ปลอดภัย สลากเข้าเมนู "สลากของฉัน" ทันที',
                  size: 'xxs',
                  color: '#856404',
                  margin: 'xs'
                }
              ]
            },
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
              color: '#28a745',
              height: 'sm',
              action: {
                type: 'uri',
                label: '🛒 สั่งซื้อสลาก N3',
                uri: CONFIG.ORDER_LIFF_URL || CONFIG.ORDER_FORM_URL
              }
            },
            {
              type: 'button',
              style: 'primary',
              color: '#0056b3',
              height: 'sm',
              action: {
                type: 'message',
                label: '📲 วิธีการชำระเงิน (เป๋าตัง)',
                text: 'วิธีชำระเงิน'
              }
            },
            {
              type: 'button',
              style: 'secondary',
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
              color: '#555555',
              height: 'sm',
              action: {
                type: 'message',
                label: '❓ วิธีการสั่งซื้อสลาก',
                text: 'วิธีสั่งซื้อ'
              }
            }
          ],
          paddingAll: '12px'
        }
      }
    };
  }

  /**
   * 2.2 การ์ดเมนูหลัก (Main Menu Card) ให้ลูกค้าเลือกทำรายการได้ทันที
   */
  public static buildMainMenuMessage(): messagingApi.FlexMessage {
    return {
      type: 'flex',
      altText: '🏪 เมนูหลักร้านสลาก N3 ธนกิจนำโชค - เลือกทำรายการ',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🏪 เมนูหลัก (Main Menu)',
              weight: 'bold',
              color: '#d4af37',
              size: 'sm'
            },
            {
              type: 'text',
              text: 'ร้านสลาก N3 ธนกิจนำโชค',
              weight: 'bold',
              size: 'lg',
              color: '#ffffff',
              margin: 'xs'
            },
            {
              type: 'text',
              text: 'สลากกินแบ่งรัฐบาลตัวเลขสามหลัก ใบละ 20 บาท ถูกกฎหมาย 100%',
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
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#fff3cd',
              cornerRadius: 'md',
              paddingAll: '10px',
              contents: [
                {
                  type: 'text',
                  text: '👛 ชำระเงินผ่านแอป "เป๋าตัง" เท่านั้น',
                  size: 'xs',
                  weight: 'bold',
                  color: '#856404'
                },
                {
                  type: 'text',
                  text: 'สลาก N3 ผูกกับเป๋าตังของผู้ซื้อโดยตรง ถูกรางวัลรับเงินโอนเข้าเป๋าตังทันที!',
                  size: 'xxs',
                  color: '#856404',
                  wrap: true,
                  margin: 'xs'
                }
              ]
            },
            { type: 'separator', margin: 'md' },
            {
              type: 'text',
              text: '👇 กรุณาเลือกเมนูที่ต้องการทำรายการ:',
              weight: 'bold',
              size: 'xs',
              color: '#333333',
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'vertical',
              spacing: 'sm',
              margin: 'md',
              contents: [
                {
                  type: 'button',
                  style: 'primary',
                  color: '#28a745',
                  height: 'sm',
                  action: {
                    type: 'uri',
                    label: '🛒 สั่งซื้อสลาก N3',
                    uri: CONFIG.ORDER_LIFF_URL || CONFIG.ORDER_FORM_URL
                  }
                },
                {
                  type: 'button',
                  style: 'primary',
                  color: '#4f46e5',
                  height: 'sm',
                  action: {
                    type: 'message',
                    label: '🏆 ตรวจผลรางวัล',
                    text: 'ผลรางวัล'
                  }
                },
                {
                  type: 'button',
                  style: 'primary',
                  color: '#0056b3',
                  height: 'sm',
                  action: {
                    type: 'message',
                    label: '📲 วิธีการชำระเงิน (เป๋าตัง)',
                    text: 'วิธีชำระเงิน'
                  }
                },
                {
                  type: 'button',
                  style: 'secondary',
                  color: '#555555',
                  height: 'sm',
                  action: {
                    type: 'message',
                    label: '❓ วิธีการสั่งซื้อสลาก',
                    text: 'วิธีสั่งซื้อ'
                  }
                },
                {
                  type: 'button',
                  style: 'secondary',
                  color: '#8e44ad',
                  height: 'sm',
                  action: {
                    type: 'uri',
                    label: '🔮 ทำนายฝัน AI หาเลขเด็ด',
                    uri: CONFIG.DREAM_PREDICTION_URL
                  }
                },
                {
                  type: 'button',
                  style: 'secondary',
                  color: '#17a2b8',
                  height: 'sm',
                  action: {
                    type: 'message',
                    label: '📊 เช็คโควต้าสลากคงเหลือ',
                    text: 'เช็คโควต้า'
                  }
                }
              ]
            }
          ],
          paddingAll: '16px'
        }
      }
    };
  }

  /**
   * 2.3 การ์ดแนะนำวิธีการชำระเงินผ่านแอป "เป๋าตัง" เท่านั้น
   */
  public static buildPaymentGuideMessage(): messagingApi.FlexMessage {
    return {
      type: 'flex',
      altText: '📲 ขั้นตอนการชำระเงินสลาก N3 ผ่านแอปเป๋าตังเท่านั้น',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '📲 วิธีการชำระเงิน (Payment Guide)',
              weight: 'bold',
              color: '#d4af37',
              size: 'sm'
            },
            {
              type: 'text',
              text: 'ร้านสลาก N3 ธนกิจนำโชค',
              weight: 'bold',
              size: 'lg',
              color: '#ffffff',
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
              layout: 'vertical',
              backgroundColor: '#fff2f0',
              cornerRadius: 'md',
              paddingAll: '10px',
              borderColor: '#ffccc7',
              borderWidth: '1px',
              contents: [
                {
                  type: 'text',
                  text: '🚨 ข้อควรระวังสำคัญมาก:',
                  size: 'xs',
                  weight: 'bold',
                  color: '#cf1322'
                },
                {
                  type: 'text',
                  text: 'การชำระเงินต้องทำผ่านแอป "เป๋าตัง" เท่านั้น!\n❌ ไม่สามารถใช้แอปธนาคารทั่วไป (กสิกร, SCB, กรุงเทพ, Krungthai NEXT ฯลฯ) สแกนจ่ายได้ เนื่องจากเป็นระบบเฉพาะของสำนักงานสลากฯ',
                  size: 'xxs',
                  color: '#cf1322',
                  wrap: true,
                  margin: 'xs'
                }
              ]
            },
            { type: 'separator', margin: 'md' },
            {
              type: 'text',
              text: '📋 5 ขั้นตอนการชำระเงินง่ายๆ:',
              weight: 'bold',
              size: 'xs',
              color: '#111111',
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'vertical',
              spacing: 'sm',
              margin: 'sm',
              contents: [
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: '1️⃣', size: 'xs', flex: 1 },
                    {
                      type: 'box',
                      layout: 'vertical',
                      flex: 9,
                      contents: [
                        { type: 'text', text: 'บันทึกรูปภาพ QR Code', size: 'xs', weight: 'bold', color: '#0056b3' },
                        { type: 'text', text: 'แตะที่รูป QR หรือกดปุ่ม "ดาวน์โหลด QR" เพื่อบันทึกรูปลงเครื่องโทรศัพท์', size: 'xxs', color: '#555555', wrap: true }
                      ]
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: '2️⃣', size: 'xs', flex: 1 },
                    {
                      type: 'box',
                      layout: 'vertical',
                      flex: 9,
                      contents: [
                        { type: 'text', text: 'เปิดแอป "เป๋าตัง"', size: 'xs', weight: 'bold', color: '#0056b3' },
                        { type: 'text', text: 'เข้าสู่แอปเป๋าตัง เลือกบริการ "G-Wallet" หรือกดปุ่ม "สแกน QR"', size: 'xxs', color: '#555555', wrap: true }
                      ]
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: '3️⃣', size: 'xs', flex: 1 },
                    {
                      type: 'box',
                      layout: 'vertical',
                      flex: 9,
                      contents: [
                        { type: 'text', text: 'เลือกรูปจากคลังภาพ', size: 'xs', weight: 'bold', color: '#0056b3' },
                        { type: 'text', text: 'แตะไอคอน "รูปภาพ" ในหน้าสแกน แล้วเลือกรูป QR Code ที่บันทึกไว้', size: 'xxs', color: '#555555', wrap: true }
                      ]
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: '4️⃣', size: 'xs', flex: 1 },
                    {
                      type: 'box',
                      layout: 'vertical',
                      flex: 9,
                      contents: [
                        { type: 'text', text: 'ตรวจสอบยอดและยืนยันชำระเงิน', size: 'xs', weight: 'bold', color: '#0056b3' },
                        { type: 'text', text: 'ตรวจสอบความถูกต้อง (ใบละ 20 บาท) แล้วกดยืนยันชำระเงินภายใน 10 นาที', size: 'xxs', color: '#555555', wrap: true }
                      ]
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: '5️⃣', size: 'xs', flex: 1 },
                    {
                      type: 'box',
                      layout: 'vertical',
                      flex: 9,
                      contents: [
                        { type: 'text', text: 'รับสลากดิจิทัลเข้าบัญชีทันที', size: 'xs', weight: 'bold', color: '#28a745' },
                        { type: 'text', text: 'สลากจะถูกบันทึกในเมนู "สลากของฉัน" ในแอปเป๋าตัง มีผลทางกฎหมาย 100% ถูกรางวัลเงินโอนเข้าเป๋าตังโดยตรง!', size: 'xxs', color: '#555555', wrap: true }
                      ]
                    }
                  ]
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
              color: '#28a745',
              height: 'sm',
              action: {
                type: 'uri',
                label: '🛒 สั่งซื้อสลาก N3',
                uri: CONFIG.ORDER_LIFF_URL || CONFIG.ORDER_FORM_URL
              }
            },
            {
              type: 'button',
              style: 'secondary',
              color: '#555555',
              height: 'sm',
              action: {
                type: 'message',
                label: '❓ วิธีสั่งซื้อสลาก',
                text: 'วิธีสั่งซื้อ'
              }
            },
            {
              type: 'button',
              style: 'secondary',
              color: '#d4af37',
              height: 'sm',
              action: {
                type: 'uri',
                label: '🔮 ทำนายฝัน AI หาเลขเด็ด',
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
   * 2.4 การ์ดแนะนำการสั่งซื้อสลาก N3 และตัวอย่างการพิมพ์
   */
  public static buildOrderGuidanceMessage(): messagingApi.FlexMessage {
    return {
      type: 'flex',
      altText: '🛒 วิธีการสั่งซื้อสลาก N3 ร้านธนกิจนำโชค',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🛒 สั่งซื้อสลาก N3',
              weight: 'bold',
              color: '#d4af37',
              size: 'sm'
            },
            {
              type: 'text',
              text: 'ร้านสลาก N3 ธนกิจนำโชค',
              weight: 'bold',
              size: 'lg',
              color: '#ffffff',
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
              text: 'ท่านสามารถเปิดตารางสั่งซื้อ หรือพิมพ์เลข 3 หลักในแชทนี้ได้ทันที:',
              size: 'xs',
              color: '#333333',
              weight: 'bold'
            },
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#0c1b33',
              cornerRadius: 'md',
              paddingAll: '10px',
              margin: 'sm',
              borderWidth: '1px',
              borderColor: '#d4af37',
              contents: [
                {
                  type: 'text',
                  text: '📋 ตัวอย่างตารางสั่งซื้อ (สั่งได้หลายเลขในบิลเดียว)',
                  weight: 'bold',
                  size: 'xxs',
                  color: '#fde68a'
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  margin: 'xs',
                  contents: [
                    { type: 'text', text: 'เลข 3 ตัว', size: 'xxs', color: '#aaaaaa', flex: 3 },
                    { type: 'text', text: 'จำนวน', size: 'xxs', color: '#aaaaaa', flex: 2, align: 'center' },
                    { type: 'text', text: 'รวมเงิน', size: 'xxs', color: '#aaaaaa', flex: 3, align: 'end' }
                  ]
                },
                { type: 'separator', margin: 'xs', color: '#334155' },
                {
                  type: 'box',
                  layout: 'horizontal',
                  margin: 'xs',
                  contents: [
                    { type: 'text', text: '🎯 334', size: 'xs', weight: 'bold', color: '#ffffff', flex: 3 },
                    { type: 'text', text: '2 ใบ', size: 'xs', color: '#ffffff', flex: 2, align: 'center' },
                    { type: 'text', text: '40 บาท', size: 'xs', weight: 'bold', color: '#10b981', flex: 3, align: 'end' }
                  ]
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  margin: 'xs',
                  contents: [
                    { type: 'text', text: '🎯 447', size: 'xs', weight: 'bold', color: '#ffffff', flex: 3 },
                    { type: 'text', text: '3 ใบ', size: 'xs', color: '#ffffff', flex: 2, align: 'center' },
                    { type: 'text', text: '60 บาท', size: 'xs', weight: 'bold', color: '#10b981', flex: 3, align: 'end' }
                  ]
                },
                { type: 'separator', margin: 'xs', color: '#334155' },
                {
                  type: 'box',
                  layout: 'horizontal',
                  margin: 'xs',
                  contents: [
                    { type: 'text', text: 'ยอดรวม (5 ใบ):', size: 'xs', weight: 'bold', color: '#fde68a', flex: 5 },
                    { type: 'text', text: '100 บาท', size: 'xs', weight: 'bold', color: '#10b981', flex: 5, align: 'end' }
                  ]
                }
              ]
            },
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#f8f9fa',
              cornerRadius: 'md',
              paddingAll: '10px',
              margin: 'sm',
              spacing: 'xs',
              contents: [
                {
                  type: 'text',
                  text: '• เลขเดียว: 123 2 (ได้เลข 123 จำนวน 2 ใบ)',
                  size: 'xxs',
                  color: '#444444'
                },
                {
                  type: 'text',
                  text: '• หลายเลข: 334 2, 447 3 (คั่นด้วยจุลภาค)',
                  size: 'xxs',
                  color: '#444444'
                },
                {
                  type: 'text',
                  text: '• จำนวนเท่ากัน: 111 222 อย่างละ 2 ใบ',
                  size: 'xxs',
                  color: '#444444'
                },
                {
                  type: 'text',
                  text: '• สั่ง 1 ใบ: พิมพ์เฉพาะเลข เช่น 999',
                  size: 'xxs',
                  color: '#444444'
                }
              ]
            },
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#fff3cd',
              cornerRadius: 'md',
              paddingAll: '8px',
              margin: 'md',
              contents: [
                {
                  type: 'text',
                  text: '⚠️ จ่ายผ่านแอป "เป๋าตัง" เท่านั้น (ใบละ 20 บาท)',
                  size: 'xxs',
                  weight: 'bold',
                  color: '#856404'
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
              color: '#28a745',
              height: 'sm',
              action: {
                type: 'uri',
                label: '🛒 สั่งซื้อสลาก N3 (เปิดตาราง)',
                uri: CONFIG.ORDER_LIFF_URL || CONFIG.ORDER_FORM_URL
              }
            },
            {
              type: 'button',
              style: 'primary',
              color: '#0056b3',
              height: 'sm',
              action: {
                type: 'message',
                label: '🛒 สั่งซื้อตัวอย่าง 334 2 ใบ',
                text: '334 2'
              }
            },
            {
              type: 'button',
              style: 'secondary',
              color: '#555555',
              height: 'sm',
              action: {
                type: 'message',
                label: '📲 วิธีการชำระเงิน (เป๋าตัง)',
                text: 'วิธีชำระเงิน'
              }
            },
            {
              type: 'button',
              style: 'secondary',
              color: '#d4af37',
              height: 'sm',
              action: {
                type: 'uri',
                label: '🔮 ทำนายฝัน AI หาเลขเด็ด',
                uri: CONFIG.DREAM_PREDICTION_URL
              }
            },
            {
              type: 'button',
              style: 'secondary',
              color: '#555555',
              height: 'sm',
              action: {
                type: 'message',
                label: '🏠 เมนูหลัก',
                text: 'เมนู'
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
              color: '#28a745',
              height: 'sm',
              action: {
                type: 'uri',
                label: '🛒 สั่งซื้อสลาก N3',
                uri: CONFIG.ORDER_LIFF_URL || CONFIG.ORDER_FORM_URL
              }
            },
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
            },
            {
              type: 'button',
              style: 'secondary',
              color: '#555555',
              height: 'sm',
              action: {
                type: 'message',
                label: '🏠 เมนูหลัก',
                text: 'เมนู'
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
            },
            {
              type: 'button',
              style: 'secondary',
              color: '#555555',
              height: 'sm',
              action: {
                type: 'message',
                label: '🏠 เมนูหลัก',
                text: 'เมนู'
              }
            }
          ],
          paddingAll: '12px'
        }
      }
    };
  }

  /**
   * 8. การ์ดผลวิเคราะห์และทำนายฝัน AI พร้อมปุ่มสั่งซื้อสลาก N3 1-Click
   */
  public static buildDreamPredictionMessage(pred: DreamPredictionResult): messagingApi.FlexMessage {
    const directNum = pred.n3Direct || '789';
    const todNums = pred.allTods && pred.allTods.length > 0
      ? pred.allTods
      : (pred.n3Tod ? pred.n3Tod.split(',').map(s => s.trim()) : []);
    const twoDigit = pred.n2Digit || directNum.slice(-2);

    // คำนวณแพ็กเกจ 3 ตรง + ทุกโต๊ด
    const allComboNums = [directNum, ...todNums.filter(n => n !== directNum)];
    const comboCount = allComboNums.length;
    const comboPrice = comboCount * 20;
    const comboOrderText = `สั่งซื้อ ` + allComboNums.map(n => `${n} 1 ใบ`).join(', ');

    const dreamParam = encodeURIComponent(pred.dreamText || '');
    const webFullUrl = `${CONFIG.DREAM_PREDICTION_URL}${CONFIG.DREAM_PREDICTION_URL.includes('?') ? '&' : '?'}dream=${dreamParam}&openExternalBrowser=1`;

    return {
      type: 'flex',
      altText: `🔮 ทำนายฝัน AI: "${pred.dreamText}" -> เลขเด็ด 3 ตรง ${directNum} (ใบละ 20 บ. เป๋าตัง)`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#2d1152',
          paddingAll: '16px',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: '🔮 AI ทำนายฝัน & เลขเด็ด N3',
                  weight: 'bold',
                  color: '#e0aaff',
                  size: 'xs',
                  flex: 8
                },
                {
                  type: 'text',
                  text: `${pred.confidence}`,
                  weight: 'bold',
                  color: '#4ade80',
                  size: 'xs',
                  align: 'end',
                  flex: 4
                }
              ]
            },
            {
              type: 'text',
              text: `"${pred.dreamText}"`,
              weight: 'bold',
              size: 'md',
              color: '#ffffff',
              margin: 'sm',
              wrap: true
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'xs',
              contents: [
                {
                  type: 'text',
                  text: `🌟 ${pred.element || 'ธาตุสิริมงคล'}`,
                  size: 'xxs',
                  color: '#ffd166',
                  flex: 1
                }
              ]
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '16px',
          contents: [
            // ไฮไลต์ 3 ตัวตรง (เต็ง)
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#fffbeb',
              cornerRadius: '8px',
              paddingAll: '12px',
              borderWidth: '1px',
              borderColor: '#fde68a',
              contents: [
                {
                  type: 'text',
                  text: '🎯 เลขเด่น 3 ตัวตรง (ลุ้นสามตรง & แจ็กพอต)',
                  size: 'xxs',
                  weight: 'bold',
                  color: '#b45309',
                  align: 'center'
                },
                {
                  type: 'text',
                  text: `${directNum}`,
                  size: '3xl',
                  weight: 'bold',
                  color: '#d97706',
                  align: 'center',
                  margin: 'xs'
                },
                {
                  type: 'text',
                  text: 'รางวัลสามตรง / รับสิทธิสุ่มแจ็กพอต N3',
                  size: 'xxs',
                  color: '#92400e',
                  align: 'center'
                }
              ]
            },
            // กล่องสองช่อง: 3 ตัวโต๊ด & 2 ตัวท้าย
            {
              type: 'box',
              layout: 'horizontal',
              spacing: 'md',
              margin: 'md',
              contents: [
                {
                  type: 'box',
                  layout: 'vertical',
                  backgroundColor: '#f3e8ff',
                  cornerRadius: '8px',
                  paddingAll: '8px',
                  flex: 6,
                  contents: [
                    {
                      type: 'text',
                      text: '🔄 3 ตัวโต๊ด',
                      size: 'xxs',
                      weight: 'bold',
                      color: '#6b21a8'
                    },
                    {
                      type: 'text',
                      text: `${pred.n3Tod || 'ไม่มี'}`,
                      size: 'xs',
                      weight: 'bold',
                      color: '#7e22ce',
                      margin: 'xs',
                      wrap: true
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  backgroundColor: '#ecfdf5',
                  cornerRadius: '8px',
                  paddingAll: '8px',
                  flex: 4,
                  contents: [
                    {
                      type: 'text',
                      text: '✌️ 2 ตัวท้าย',
                      size: 'xxs',
                      weight: 'bold',
                      color: '#065f46'
                    },
                    {
                      type: 'text',
                      text: `${twoDigit}`,
                      size: 'xl',
                      weight: 'bold',
                      color: '#047857',
                      margin: 'xs',
                      align: 'center'
                    }
                  ]
                }
              ]
            },
            { type: 'separator', margin: 'md' },
            // ความหมายตามศาสตร์โบราณ
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              contents: [
                {
                  type: 'text',
                  text: '📖 คำทำนายตามตำราโบราณ:',
                  size: 'xs',
                  weight: 'bold',
                  color: '#1e293b'
                },
                {
                  type: 'text',
                  text: `${pred.meaning}`,
                  size: 'xxs',
                  color: '#475569',
                  wrap: true,
                  margin: 'xs'
                }
              ]
            },
            // เคล็ดมงคลเสริมดวง
            {
              type: 'box',
              layout: 'vertical',
              margin: 'sm',
              contents: [
                {
                  type: 'text',
                  text: '✨ เคล็ดมงคลเปิดทรัพย์:',
                  size: 'xs',
                  weight: 'bold',
                  color: '#1e293b'
                },
                {
                  type: 'text',
                  text: `${pred.blessing}`,
                  size: 'xxs',
                  color: '#475569',
                  wrap: true,
                  margin: 'xs'
                }
              ]
            },
            // กลอนมงคล
            ...(pred.poem ? [{
              type: 'box' as const,
              layout: 'vertical' as const,
              margin: 'sm' as const,
              backgroundColor: '#f8fafc',
              cornerRadius: '6px',
              paddingAll: '8px',
              contents: [
                {
                  type: 'text' as const,
                  text: `${pred.poem}`,
                  size: 'xxs' as const,
                  color: '#64748b',
                  wrap: true,
                  align: 'center' as const
                }
              ]
            }] : []),
            // ป้ายเตือนเป๋าตัง 20 บาท
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              backgroundColor: '#fff3cd',
              cornerRadius: '6px',
              paddingAll: '8px',
              contents: [
                {
                  type: 'text',
                  text: '👛 สลาก N3 ใบละ 20 บาท | ชำระผ่านแอปเป๋าตังเท่านั้น',
                  size: 'xxs',
                  weight: 'bold',
                  color: '#856404',
                  align: 'center'
                }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          paddingAll: '12px',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#d4af37',
              height: 'sm',
              action: {
                type: 'message',
                label: `🎯 ซื้อ 3 ตรง (${directNum}) 20บ.`,
                text: `สั่งซื้อ ${directNum} 1 ใบ`
              }
            },
            {
              type: 'button',
              style: 'primary',
              color: '#7e22ce',
              height: 'sm',
              action: {
                type: 'message',
                label: `🔄 ซื้อ 3ตรง+ทุกโต๊ด (${comboCount}ใบ ${comboPrice}บ.)`,
                text: comboOrderText
              }
            },
            {
              type: 'button',
              style: 'secondary',
              color: '#059669',
              height: 'sm',
              action: {
                type: 'message',
                label: `✌️ ลุ้น 2 ตัวท้าย (${twoDigit}) 20บ.`,
                text: `สั่งซื้อ ${directNum} 1 ใบ`
              }
            },
            {
              type: 'button',
              style: 'primary',
              color: '#28a745',
              height: 'sm',
              action: {
                type: 'uri',
                label: '🛒 สั่งซื้อสลาก N3',
                uri: CONFIG.ORDER_LIFF_URL || CONFIG.ORDER_FORM_URL
              }
            },
            {
              type: 'button',
              style: 'link',
              color: '#0056b3',
              height: 'sm',
              action: {
                type: 'uri',
                label: '🔮 เปิดเว็บทำนายฝัน AI ฉบับเต็ม',
                uri: webFullUrl
              }
            },
            {
              type: 'button',
              style: 'link',
              color: '#666666',
              height: 'sm',
              action: {
                type: 'message',
                label: '🏠 เมนูหลัก',
                text: 'เมนู'
              }
            }
          ]
        }
      }
    };
  }

  /**
   * 8.1 การ์ดแนะนำการใช้งานทำนายฝัน AI (เมื่อลูกค้าพิมพ์ "ทำนายฝัน" โดยยังไม่ระบุความฝัน)
   */
  public static buildDreamPromptGuidanceMessage(): messagingApi.FlexMessage {
    return {
      type: 'flex',
      altText: '🔮 บริการทำนายฝัน & คำนวณเลขเด็ด N3 ด้วยระบบ AI',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#2d1152',
          paddingAll: '16px',
          contents: [
            {
              type: 'text',
              text: '🔮 AI ทำนายฝัน & คำนวณเลขเด็ด N3',
              weight: 'bold',
              color: '#e0aaff',
              size: 'sm'
            },
            {
              type: 'text',
              text: 'วิเคราะห์นิมิตมงคล 45+ หมวดหมู่แม่นยำ',
              size: 'xxs',
              color: '#d8b4fe',
              margin: 'xs'
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '16px',
          contents: [
            {
              type: 'text',
              text: '💬 พิมพ์ความฝันของท่านในแชทนี้ได้ทันที!',
              weight: 'bold',
              size: 'sm',
              color: '#1e293b'
            },
            {
              type: 'text',
              text: 'ระบบ AI จะวิเคราะห์ธาตุสิริมงคล แปลงสัญลักษณ์เป็นชุดตัวเลข 3 ตัวตรง, 3 ตัวโต๊ด และ 2 ตัวท้าย พร้อมปุ่มกดสั่งซื้อสลาก N3 ทันที',
              size: 'xs',
              color: '#555555',
              margin: 'xs',
              wrap: true
            },
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#f8fafc',
              cornerRadius: '8px',
              paddingAll: '10px',
              margin: 'md',
              spacing: 'xs',
              contents: [
                {
                  type: 'text',
                  text: 'ตัวอย่างข้อความที่สามารถพิมพ์ได้:',
                  size: 'xxs',
                  weight: 'bold',
                  color: '#334155'
                },
                {
                  type: 'text',
                  text: '• "ฝันเห็นงู 2 ตัว"',
                  size: 'xxs',
                  color: '#64748b'
                },
                {
                  type: 'text',
                  text: '• "ฝันว่าจับปลาตัวใหญ่"',
                  size: 'xxs',
                  color: '#64748b'
                },
                {
                  type: 'text',
                  text: '• "ฝันเห็นพระพุทธรูปทองคำ"',
                  size: 'xxs',
                  color: '#64748b'
                },
                {
                  type: 'text',
                  text: '• "ฝันเห็นรถชน ทะเบียน 954"',
                  size: 'xxs',
                  color: '#64748b'
                }
              ]
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              backgroundColor: '#fff3cd',
              cornerRadius: '6px',
              paddingAll: '8px',
              contents: [
                {
                  type: 'text',
                  text: '👛 สลาก N3 ใบละ 20 บาท | ชำระผ่านแอปเป๋าตังเท่านั้น',
                  size: 'xxs',
                  weight: 'bold',
                  color: '#856404',
                  align: 'center'
                }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          paddingAll: '12px',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#28a745',
              height: 'sm',
              action: {
                type: 'uri',
                label: '🛒 สั่งซื้อสลาก N3',
                uri: CONFIG.ORDER_LIFF_URL || CONFIG.ORDER_FORM_URL
              }
            },
            {
              type: 'button',
              style: 'primary',
              color: '#7e22ce',
              height: 'sm',
              action: {
                type: 'uri',
                label: '🔮 เปิดเว็บทำนายฝัน AI ฉบับเต็ม',
                uri: CONFIG.DREAM_PREDICTION_URL
              }
            },
            {
              type: 'button',
              style: 'secondary',
              color: '#555555',
              height: 'sm',
              action: {
                type: 'message',
                label: '🏠 เมนูหลัก',
                text: 'เมนู'
              }
            }
          ]
        }
      }
    };
  }

  /**
   * 11. การ์ดเลขมงคลเฉพาะบุคคล (Pre-Draw Personalized Lucky Teaser)
   * ส่งให้ลูกค้าแต่ละคนก่อนหวยออก โดยสุ่มเลขกระจายไม่ซ้ำกัน
   */
  public static buildPersonalizedLuckyTeaserMessage(item: DistributedLuckyItem): messagingApi.FlexMessage {
    const todText = item.tods && item.tods.length > 0 ? item.tods.join(', ') : 'เลขเบิ้ล/ไม่มีโต๊ด';
    const altText = `🌟 เลขมงคลเฉพาะคุณ: ${item.number} (สลาก N3 งวด ${item.drawDateThai})`;

    return {
      type: 'flex',
      altText,
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#0f172a',
          paddingAll: '16px',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: '🌟 เลขมงคลเฉพาะคุณ',
                  weight: 'bold',
                  size: 'md',
                  color: '#fbbf24',
                  flex: 1
                },
                {
                  type: 'text',
                  text: item.element,
                  size: 'xxs',
                  color: item.elementColor || '#f59e0b',
                  align: 'end',
                  weight: 'bold'
                }
              ]
            },
            {
              type: 'text',
              text: `งวดประจำวันที่ ${item.drawDateThai} • ร้านธนกิจนำโชค`,
              size: 'xxs',
              color: '#94a3b8',
              margin: 'xs'
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#0b1120',
          paddingAll: '16px',
          spacing: 'md',
          contents: [
            // กล่องเลขเด็ด 3 ตัวตรง
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#1e293b',
              cornerRadius: '12px',
              paddingAll: '16px',
              alignItems: 'center',
              borderColor: '#f59e0b',
              borderWidth: '1.5px',
              contents: [
                {
                  type: 'text',
                  text: '🎯 เลขเด็ด 3 ตัวตรงเปิดดวง',
                  size: 'xs',
                  color: '#fbbf24',
                  weight: 'bold'
                },
                {
                  type: 'text',
                  text: item.number,
                  size: '3xl',
                  weight: 'bold',
                  color: '#fef08a',
                  margin: 'sm'
                },
                {
                  type: 'separator',
                  color: '#334155',
                  margin: 'md'
                },
                // แถบ 3 ตัวโต๊ด & 2 ตัวท้าย
                {
                  type: 'box',
                  layout: 'horizontal',
                  margin: 'md',
                  contents: [
                    {
                      type: 'box',
                      layout: 'vertical',
                      flex: 6,
                      contents: [
                        {
                          type: 'text',
                          text: '🔄 ชุดเลขโต๊ด:',
                          size: 'xxs',
                          color: '#38bdf8'
                        },
                        {
                          type: 'text',
                          text: todText,
                          size: 'xs',
                          color: '#ffffff',
                          weight: 'bold',
                          wrap: true
                        }
                      ]
                    },
                    {
                      type: 'box',
                      layout: 'vertical',
                      flex: 4,
                      contents: [
                        {
                          type: 'text',
                          text: '✨ 2 ตัวตรง:',
                          size: 'xxs',
                          color: '#34d399',
                          align: 'end'
                        },
                        {
                          type: 'text',
                          text: item.n2,
                          size: 'md',
                          color: '#34d399',
                          weight: 'bold',
                          align: 'end'
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            // กล่องคำทำนายสิริมงคล
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#1e1b4b',
              cornerRadius: '8px',
              paddingAll: '10px',
              borderColor: '#4338ca',
              borderWidth: '1px',
              contents: [
                {
                  type: 'text',
                  text: item.blessing,
                  size: 'xxs',
                  color: '#c7d2fe',
                  wrap: true,
                  align: 'center'
                }
              ]
            },
            // ข้อความแจ้งเงื่อนไข
            {
              type: 'text',
              text: '👛 สลาก N3 ใบละ 20 บาท | จ่ายผ่านแอปเป๋าตัง รับเงินรางวัลทันที',
              size: 'xxs',
              color: '#64748b',
              align: 'center'
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#0f172a',
          spacing: 'sm',
          paddingAll: '12px',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#059669',
              height: 'sm',
              action: {
                type: 'message',
                label: '⚡ ซื้อเลขนี้ (20บ.)',
                text: item.quickOrderCommand
              }
            },
            {
              type: 'button',
              style: 'primary',
              color: '#0284c7',
              height: 'sm',
              action: {
                type: 'message',
                label: `🔄 ซื้อ 3ตรง+ทุกโต๊ด`,
                text: item.comboOrderCommand
              }
            },
            {
              type: 'button',
              style: 'primary',
              color: '#28a745',
              height: 'sm',
              action: {
                type: 'uri',
                label: '🛒 สั่งซื้อสลาก N3',
                uri: CONFIG.ORDER_LIFF_URL || CONFIG.ORDER_FORM_URL
              }
            },
            {
              type: 'button',
              style: 'secondary',
              color: '#334155',
              height: 'sm',
              action: {
                type: 'message',
                label: '🔮 ทำนายฝัน / ขอเลข',
                text: 'ทำนายฝัน'
              }
            }
          ]
        }
      }
    };
  }

  /**
   * 12. การ์ดแจ้งผลการออกรางวัลสลากกินแบ่ง N3 ทางการ (Official Draw Results Announcement)
   * ส่งให้ลูกค้าทุกคนหลังผลรางวัลออกครบถ้วน
   */
  public static buildDrawResultsMessage(lotteryData: any): messagingApi.FlexMessage {
    const drawDateThai = lotteryData.drawDateThai || lotteryData.period || 'ล่าสุด';
    const altText = `🏆 ผลการออกรางวัลสลากกินแบ่ง N3 งวดประจำวันที่ ${drawDateThai}`;

    const n3 = lotteryData.n3 || {};
    const straight3 = n3.straight3 || { number: '-', prizeText: '-' };
    const shuffle3 = n3.shuffle3 || { numbers: ['-'], prizeText: '-' };
    const straight2 = n3.straight2 || { number: '-', prizeText: '-' };
    const jackpot = n3.specialJackpot || { ticketNumber: '-', prizeText: '-' };
    const glo = lotteryData.gloStandard || {};

    const shuffleText = Array.isArray(shuffle3.numbers) ? shuffle3.numbers.join(', ') : '-';

    return {
      type: 'flex',
      altText,
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#1e1b4b',
          paddingAll: '16px',
          contents: [
            {
              type: 'text',
              text: '🏆 ผลการออกรางวัลสลาก N3',
              weight: 'bold',
              size: 'md',
              color: '#facc15'
            },
            {
              type: 'text',
              text: `งวดประจำวันที่ ${drawDateThai} (สำนักงานสลากฯ)`,
              size: 'xxs',
              color: '#c7d2fe',
              margin: 'xs'
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#ffffff',
          paddingAll: '14px',
          spacing: 'sm',
          contents: [
            // 3 ตัวตรง
            {
              type: 'box',
              layout: 'horizontal',
              backgroundColor: '#fef3c7',
              cornerRadius: '8px',
              paddingAll: '10px',
              contents: [
                {
                  type: 'box',
                  layout: 'vertical',
                  flex: 5,
                  contents: [
                    { type: 'text', text: '🎯 3 ตัวตรง', size: 'xs', color: '#b45309', weight: 'bold' },
                    { type: 'text', text: straight3.number, size: 'xxl', color: '#78350f', weight: 'bold' }
                  ]
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  flex: 5,
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  contents: [
                    { type: 'text', text: 'รางวัลละ', size: 'xxs', color: '#b45309' },
                    { type: 'text', text: straight3.prizeText || '-', size: 'sm', color: '#047857', weight: 'bold' }
                  ]
                }
              ]
            },
            // 3 ตัวโต๊ด
            {
              type: 'box',
              layout: 'horizontal',
              backgroundColor: '#e0f2fe',
              cornerRadius: '8px',
              paddingAll: '10px',
              contents: [
                {
                  type: 'box',
                  layout: 'vertical',
                  flex: 6,
                  contents: [
                    { type: 'text', text: '🔄 3 ตัวโต๊ด (สลับหลัก)', size: 'xxs', color: '#0369a1', weight: 'bold' },
                    { type: 'text', text: shuffleText, size: 'sm', color: '#0c4a6e', weight: 'bold', wrap: true }
                  ]
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  flex: 4,
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  contents: [
                    { type: 'text', text: 'รางวัลละ', size: 'xxs', color: '#0369a1' },
                    { type: 'text', text: shuffle3.prizeText || '-', size: 'sm', color: '#047857', weight: 'bold' }
                  ]
                }
              ]
            },
            // 2 ตัวตรง
            {
              type: 'box',
              layout: 'horizontal',
              backgroundColor: '#ecfdf5',
              cornerRadius: '8px',
              paddingAll: '10px',
              contents: [
                {
                  type: 'box',
                  layout: 'vertical',
                  flex: 5,
                  contents: [
                    { type: 'text', text: '✨ 2 ตัวตรง (ท้าย)', size: 'xs', color: '#047857', weight: 'bold' },
                    { type: 'text', text: straight2.number, size: 'xl', color: '#064e3b', weight: 'bold' }
                  ]
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  flex: 5,
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  contents: [
                    { type: 'text', text: 'รางวัลละ', size: 'xxs', color: '#047857' },
                    { type: 'text', text: straight2.prizeText || '-', size: 'sm', color: '#047857', weight: 'bold' }
                  ]
                }
              ]
            },
            // แจ็กพอต
            {
              type: 'box',
              layout: 'horizontal',
              backgroundColor: '#fdf2f8',
              cornerRadius: '8px',
              paddingAll: '10px',
              contents: [
                {
                  type: 'box',
                  layout: 'vertical',
                  flex: 5,
                  contents: [
                    { type: 'text', text: '👑 แจ็กพอตพิเศษ', size: 'xxs', color: '#be185d', weight: 'bold' },
                    { type: 'text', text: jackpot.ticketNumber || '-', size: 'xxs', color: '#831843' }
                  ]
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  flex: 5,
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  contents: [
                    { type: 'text', text: jackpot.prizeText || '-', size: 'sm', color: '#be185d', weight: 'bold' }
                  ]
                }
              ]
            },
            // อ้างอิงสลากหกหลัก L6
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#f8fafc',
              cornerRadius: '6px',
              paddingAll: '6px',
              contents: [
                {
                  type: 'text',
                  text: `สลาก L6: รางวัลที่ 1 [${glo.firstPrize?.number || '-'}] • เลขท้าย 2 ตัว [${glo.last2?.number || '-'}]`,
                  size: 'xxs',
                  color: '#64748b',
                  align: 'center'
                }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#f1f5f9',
          spacing: 'sm',
          paddingAll: '12px',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#7e22ce',
              height: 'sm',
              action: {
                type: 'uri',
                label: '🔍 ตรวจรางวัลของฉัน',
                uri: CONFIG.DREAM_PREDICTION_URL
              }
            },
            {
              type: 'button',
              style: 'primary',
              color: '#059669',
              height: 'sm',
              action: {
                type: 'uri',
                label: '🛒 สั่งซื้อสลาก N3',
                uri: CONFIG.ORDER_LIFF_URL || CONFIG.ORDER_FORM_URL
              }
            },
            {
              type: 'button',
              style: 'secondary',
              color: '#64748b',
              height: 'sm',
              action: {
                type: 'message',
                label: '🏠 เมนูหลัก',
                text: 'เมนู'
              }
            }
          ]
        }
      }
    };
  }
}


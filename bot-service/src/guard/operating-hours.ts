import { CONFIG } from '../config';

export interface OperatingHoursStatus {
  isOpen: boolean;
  reason: string;
  currentHoursText: string;
  nextOpenText: string;
}

export class OperatingHoursGuard {
  /**
   * ตรวจสอบว่าขณะนี้อยู่ในเวลาจำหน่ายสลาก N3 ตามระเบียบสำนักงานสลากกินแบ่งรัฐบาลหรือไม่
   * - วันทั่วไป: เปิด 06:00 - 23:00 น.
   * - วันออกรางวัล (วันที่ 1 และ 16): เปิด 06:00 - 14:00 น.
   */
  public static checkSalesStatus(dateObj?: Date): OperatingHoursStatus {
    const now = dateObj || new Date();
    const bkkTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));

    const dayOfMonth = bkkTime.getDate();
    const hours = bkkTime.getHours();
    const minutes = bkkTime.getMinutes();
    const currentDecimalHour = hours + (minutes / 60);

    const isDrawDay = CONFIG.SALES_HOURS.DRAW_DATES.includes(dayOfMonth);
    const openHour = CONFIG.SALES_HOURS.NORMAL_OPEN; // 6
    const closeHour = isDrawDay ? CONFIG.SALES_HOURS.DRAW_DAY_CLOSE : CONFIG.SALES_HOURS.NORMAL_CLOSE; // 14 หรือ 23

    const currentHoursText = isDrawDay 
      ? '06:00 - 14:00 น. (วันออกรางวัล)'
      : '06:00 - 23:00 น. (วันทั่วไป)';

    if (currentDecimalHour >= openHour && currentDecimalHour < closeHour) {
      return {
        isOpen: true,
        reason: 'อยู่ในช่วงเวลาจำหน่ายปกติ',
        currentHoursText,
        nextOpenText: ''
      };
    }

    let reason = '';
    let nextOpenText = 'เปิดจำหน่ายวันถัดไป เวลา 06:00 น.';

    if (currentDecimalHour < openHour) {
      reason = `ขณะนี้ยังไม่ถึงเวลาเปิดระบบจำหน่ายสลาก N3 (${currentHoursText})`;
      nextOpenText = 'เปิดจำหน่ายวันนี้ เวลา 06:00 น.';
    } else {
      if (isDrawDay) {
        reason = `สลาก N3 งวดนี้ปิดรับคำสั่งซื้อแล้วเนื่องจากเป็นวันออกรางวัล (ปิดเวลา 14:00 น.)`;
        nextOpenText = 'เปิดจำหน่ายงวดถัดไป เวลา 06:00 น.';
      } else {
        reason = `ขณะนี้อยู่นอกเวลาจำหน่ายสลาก N3 ประจำวันแล้ว (ปิดเวลา 23:00 น.)`;
        nextOpenText = 'เปิดจำหน่ายวันพรุ่งนี้ เวลา 06:00 น.';
      }
    }

    return {
      isOpen: false,
      reason,
      currentHoursText,
      nextOpenText
    };
  }
}

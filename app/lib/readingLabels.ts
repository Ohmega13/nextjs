export type TarotMode = 'threeCards' | 'weighOptions' | 'classic10';

export const TAROT_MODE_LABEL_TH: Record<TarotMode, string> = {
  threeCards: 'ถามเรื่องเดียว 3 ใบ',
  weighOptions: 'เปรียบเทียบ/ชั่งน้ำหนัก (1 ใบ/ตัวเลือก)',
  classic10: 'แบบคลาสสิก 10 ใบ',
};

// กรณีอนาคตมีระบบดูดวงอื่น ๆ (เช่น ลายมือ โหงวเฮ้ง ฯลฯ)
export const READING_TYPE_LABEL_TH: Record<string, string> = {
  tarot: 'ไพ่ยิปซี',
  // palm: 'ลายมือ',
  // natal: 'ดวงกำเนิด',
};

export function renderReadingTypeTH(row: { type?: string | null; mode?: string | null }): string {
  if (row?.type === 'tarot') {
    const m = (row.mode ?? '') as TarotMode;
    return TAROT_MODE_LABEL_TH[m] ?? 'ไพ่ยิปซี';
  }
  if (row?.type) return READING_TYPE_LABEL_TH[row.type] ?? row.type;
  return 'ไพ่ยิปซี';
}
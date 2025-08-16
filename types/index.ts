// types/index.ts

export type Client = {
  id: string;            // uid() (ใช้เป็น "โฟลเดอร์เสมือน")
  name: string;
  nickname?: string;
  contact?: string;
  birthDate?: string;
  birthTime?: string;
  birthPlace?: string;
  timezone?: string;
  gender?: string;
  createdAt: string;
};

export type ReadingRecord = {
  id: string;
  date: string;
  clientId: string;      // เปลี่ยนจากชื่อ → ใช้ id อ้างอิงตรง
  clientName: string;    // เก็บซ้ำเพื่อแสดงเร็ว
  topic: string;
  mode: string;

  // Tarot
  cards?: { name: string; reversed?: boolean }[];
  per_card?: { name: string; meaning: string }[];

  // สรุป/คำแนะนำ (ใช้ร่วมทุกศาสตร์)
  summary?: string;
  advices?: string[];

  // Astrology (ทั้งไทย/ตะวันตก)
  astrology?: {
    system: "thai" | "western";
    natal_summary: string;
    life_periods: { from: number; to: number; theme: string; notes?: string }[]; // อายุ
    lucky_numbers: string[];
    avoid_numbers: string[];
    phone_tip: { should_include: string[]; should_avoid: string[] };
    remedies: string[];
  };

  // Palm
  palm?: {
    leftImageId?: string;   // IndexedDB key
    rightImageId?: string;
    sections: {
      personality: string[];
      career: string[];
      finance: string[];
      love: string[];
      health: string[];
      future: string[];
    };
  };
};
// Default sizes in mm (see docs/planner-sizes.md). The day-area sizes for
// ジブン手帳 and ほぼ日手帳 are estimates and can be changed in the UI.
export const planners = [
  {
    id: "jibun-weekly",
    group: "ジブン手帳",
    label: "A5スリム ウィークリー1日分",
    w: 24,
    h: 168,
    bind: 0,
  },
  {
    id: "hobonichi-original-daily",
    group: "ほぼ日手帳",
    label: "オリジナル デイリー",
    w: 88,
    h: 122,
    bind: 0,
  },
  {
    id: "hobonichi-cousin-daily",
    group: "ほぼ日手帳",
    label: "カズン デイリー",
    w: 130,
    h: 184,
    bind: 0,
  },
  {
    id: "hobonichi-cousin-weekly",
    group: "ほぼ日手帳",
    label: "カズン ウィークリー1日分",
    w: 120,
    h: 24,
    bind: 0,
  },
  {
    // 8-hole refill: the left edge is kept clear for the punch holes.
    id: "sysdiary",
    group: "システムダイアリー",
    label: "リフィル（82×140mm）",
    w: 82,
    h: 140,
    bind: 7,
  },
  // Common ring-binder refill sizes (6 or 5 holes on the left edge).
  ...(
    [
      ["system-bible", "バイブル（95×170mm）", 95, 170],
      ["system-narrow", "バイブルナロー（80×170mm）", 80, 170],
      ["system-a5", "A5（148×210mm）", 148, 210],
      ["system-mini6", "ミニ6穴（64×127mm）", 64, 127],
      ["system-m5", "M5（62×105mm）", 62, 105],
    ] as const
  ).map(([id, label, w, h]) => ({
    id,
    group: "システム手帳",
    label,
    w,
    h,
    bind: 7,
  })),
] as const;
export type PlannerId = (typeof planners)[number]["id"];
export interface PaperSize {
  w: number;
  h: number;
  bind: number;
}
export function validateSize(s: PaperSize) {
  if (
    !Number.isFinite(s.w) ||
    !Number.isFinite(s.h) ||
    s.w < 15 ||
    s.h < 15 ||
    s.w > 190 ||
    s.h > 277
  )
    throw new Error("幅と高さは15mm以上、A4に収まる大きさにしてください。");
}

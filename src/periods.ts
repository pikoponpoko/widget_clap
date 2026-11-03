export type PeriodUnit = "week" | "month" | "year";
export interface PeriodBucket {
  key: string;
  claps: number;
  messages: number;
  visitors: number;
  reactions?: Record<string, number>;
}
export interface PeriodStats {
  unit: PeriodUnit;
  buckets: PeriodBucket[];
  visitors: number;
}
// Weeks and months show the latest 12; years go back to the first data.
const span = 12;
const addDays = (day: string, n: number) =>
  new Date(Date.parse(day + "T00:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
export const periodUnits = ["week", "month", "year"] as const;
// Weeks start on Monday. Keys: week "YYYY-MM-DD" (its Monday), month "YYYY-MM", year "YYYY".
export function periodKey(unit: PeriodUnit, day: string) {
  if (unit === "year") return day.slice(0, 4);
  if (unit === "month") return day.slice(0, 7);
  const weekday = new Date(day + "T00:00:00Z").getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}
export function periodKeys(unit: PeriodUnit, today: string, first?: string) {
  const last = periodKey(unit, today);
  if (unit === "week")
    return Array.from({ length: span }, (_, i) =>
      addDays(last, (i - span + 1) * 7),
    );
  if (unit === "month") {
    const [y, m] = last.split("-").map(Number);
    return Array.from({ length: span }, (_, i) => {
      const d = new Date(Date.UTC(y, m - 1 - (span - 1 - i), 1));
      return d.toISOString().slice(0, 7);
    });
  }
  const from = Math.min(Number(first || last), Number(last));
  return Array.from({ length: Number(last) - from + 1 }, (_, i) =>
    String(from + i),
  );
}
// The first day counted, or null when every day counts (years).
export function periodStart(unit: PeriodUnit, today: string) {
  if (unit === "year") return null;
  const first = periodKeys(unit, today)[0];
  return unit === "month" ? first + "-01" : first;
}

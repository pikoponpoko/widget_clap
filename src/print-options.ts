export interface PrintOptions {
  layout: "a4" | "card";
  marginX: number;
  marginY: number;
  gapX: number;
  gapY: number;
  offsetX: number;
  offsetY: number;
  cropMarks: boolean;
}
export const defaultPrint: PrintOptions = {
  layout: "a4",
  marginX: 14,
  marginY: 7,
  gapX: 0,
  gapY: 2,
  offsetX: 0,
  offsetY: 0,
  cropMarks: true,
};

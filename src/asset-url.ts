import { previewMode } from "./mode";
import { previewAssetUrl } from "./preview-api";
export const assetUrl = (id: string) =>
  previewMode
    ? previewAssetUrl(id)
    : "/api/public/assets/" + encodeURIComponent(id);
/** Pixel density from a Retina-style file name such as "button@2x.webp". */
export const densityOf = (name: string) =>
  Number(/@([23])x(?:\.[a-z0-9]+)?$/i.exec(name)?.[1] ?? 1);

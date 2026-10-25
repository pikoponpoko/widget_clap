import { previewMode } from "./mode";
import { previewAssetUrl } from "./preview-api";
export const assetUrl = (id: string) =>
  previewMode
    ? previewAssetUrl(id)
    : "/api/public/assets/" + encodeURIComponent(id);

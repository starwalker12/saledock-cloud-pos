export const PRODUCT_IMAGE_BUCKET = "product-images";
export const PRODUCT_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const PRODUCT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

const PRODUCT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateProductImageFile(file: File): string | null {
  if (file.size === 0) return "Choose an image to upload.";
  if (!PRODUCT_IMAGE_TYPES.has(file.type)) {
    return "Use a JPG, PNG, or WebP image.";
  }
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
    return "Product images must be 2 MB or smaller.";
  }
  return null;
}

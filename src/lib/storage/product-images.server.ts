import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PRODUCT_IMAGE_BUCKET,
  validateProductImageFile,
} from "./product-image-rules";

type ProductImageUploadResult =
  | { path: string; error: null }
  | { path: null; error: string };

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function hasExpectedImageSignature(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (file.type === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (file.type === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

export async function uploadProductImage(
  supabase: SupabaseClient,
  organizationId: string,
  productId: string,
  file: File,
): Promise<ProductImageUploadResult> {
  const validationError = validateProductImageFile(file);
  if (validationError) return { path: null, error: validationError };
  if (!(await hasExpectedImageSignature(file))) {
    return { path: null, error: "The selected file is not a valid product image." };
  }

  const extension = EXTENSION_BY_TYPE[file.type];
  const path = `${organizationId}/products/${productId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    return {
      path: null,
      error: "The product image could not be uploaded. Please try again.",
    };
  }
  return { path, error: null };
}

export async function removeProductImage(
  supabase: SupabaseClient,
  path: string | null | undefined,
): Promise<void> {
  if (!path) return;
  await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
}

export function getProductImagePublicUrl(
  supabase: SupabaseClient,
  path: string | null | undefined,
): string | null {
  if (!path) return null;
  return supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

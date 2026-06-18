export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;

export type UploadResult = {
  publicUrl: string | null;
  error: string | null;
};

export function validateImageFile(file: File): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Only PNG, JPG, and WebP images are allowed.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return "File must be under 5 MB.";
  }
  const name = file.name.toLowerCase();
  if (name.endsWith(".svg")) {
    return "SVG files are not allowed.";
  }
  return null;
}

export async function uploadImage(
  bucket: "profile-pictures" | "public-branding",
  folderPath: string,
  file: File,
): Promise<UploadResult> {
  try {
    const validationError = validateImageFile(file);
    if (validationError) {
      return { publicUrl: null, error: validationError };
    }

    const { publicUrl, error } = await uploadViaServerAction(bucket, folderPath, file);
    if (error) return { publicUrl: null, error };
    return { publicUrl, error: null };
  } catch (err) {
    console.error("[uploadImage]", err);
    return { publicUrl: null, error: "Upload could not complete. Please try again." };
  }
}

async function uploadViaServerAction(
  bucket: "profile-pictures" | "public-branding",
  folderPath: string,
  file: File,
): Promise<UploadResult> {
  const { uploadImageAction } = await import("./upload-action");
  return uploadImageAction(bucket, folderPath, file);
}

export async function resolveImagePreviewUrl(
  bucket: "profile-pictures" | "public-branding",
  storedUrl: string,
): Promise<{ previewUrl: string | null; error: string | null }> {
  try {
    const { resolveImagePreviewUrlAction } = await import("./upload-action");
    return resolveImagePreviewUrlAction(bucket, storedUrl);
  } catch (err) {
    console.error("[resolveImagePreviewUrl]", err);
    return { previewUrl: null, error: null };
  }
}

export async function removeImage(
  bucket: "profile-pictures" | "public-branding",
  path: string,
): Promise<string | null> {
  try {
    const { removeImageAction } = await import("./upload-action");
    return removeImageAction(bucket, path);
  } catch (err) {
    console.error("[removeImage]", err);
    return "Upload could not complete. Please try again.";
  }
}

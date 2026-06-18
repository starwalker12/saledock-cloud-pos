"use server";

import { createClient } from "@/lib/supabase/server";
import { validateImageFile } from "./upload";

type UploadActionResult =
  | { publicUrl: string; error: null }
  | { publicUrl: null; error: string };

export async function uploadImageAction(
  bucket: "profile-pictures" | "public-branding",
  folderPath: string,
  file: File,
): Promise<UploadActionResult> {
  try {
    const validationError = validateImageFile(file);
    if (validationError) {
      return { publicUrl: null, error: validationError };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { publicUrl: null, error: "You must be signed in to upload images." };
    }

    const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
    const safeExt = ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp" ? ext : "png";
    const filename = `${crypto.randomUUID()}.${safeExt}`;
    const fullPath = `${folderPath}/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fullPath, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      const msg = uploadError.message;
      if (/failed to fetch|networkerror|load failed/i.test(msg)) {
        return { publicUrl: null, error: "Could not connect to storage. Please check your connection and try again." };
      }
      return { publicUrl: null, error: msg };
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fullPath);
    if (!urlData?.publicUrl) {
      return { publicUrl: null, error: "Upload succeeded but could not generate a public URL." };
    }

    return { publicUrl: urlData.publicUrl, error: null };
  } catch (err) {
    console.error("[uploadImageAction]", err);
    return { publicUrl: null, error: "Upload could not complete. Please try again." };
  }
}

/**
 * Extract the storage object path from a stored image URL (or accept a bare path).
 * The app stores profile pictures as a "public-format" URL even though the bucket
 * is private, so we strip the `/object/public/<bucket>/` (or signed) prefix to get
 * the path we can sign or re-resolve.
 */
function extractStoragePath(
  urlOrPath: string,
  bucket: "profile-pictures" | "public-branding",
): string | null {
  if (!urlOrPath) return null;
  // Bare path (no scheme, no leading slash) — use as-is.
  if (!urlOrPath.includes("://") && !urlOrPath.startsWith("/")) {
    return urlOrPath.replace(/^\/+/, "");
  }
  const markers = [
    `/storage/v1/object/public/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
    `/object/public/${bucket}/`,
    `/object/sign/${bucket}/`,
  ];
  for (const marker of markers) {
    const index = urlOrPath.indexOf(marker);
    if (index !== -1) {
      let path = urlOrPath.substring(index + marker.length);
      const queryIndex = path.indexOf("?");
      if (queryIndex !== -1) path = path.substring(0, queryIndex);
      try {
        return decodeURIComponent(path);
      } catch {
        return path;
      }
    }
  }
  return null;
}

/**
 * Resolve a loadable preview URL for a stored image.
 * - public-branding (public bucket): returns the public URL (already loadable).
 * - profile-pictures (private bucket): returns a short-lived signed URL so the
 *   preview can render without exposing a permanent/public link.
 * The canonical stored value is never changed by this — it only produces a URL
 * suitable for an <img> tag.
 */
export async function resolveImagePreviewUrlAction(
  bucket: "profile-pictures" | "public-branding",
  storedUrl: string,
): Promise<{ previewUrl: string | null; error: string | null }> {
  try {
    if (!storedUrl) return { previewUrl: null, error: null };

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { previewUrl: null, error: "You must be signed in to preview images." };
    }

    const path = extractStoragePath(storedUrl, bucket);
    if (!path) return { previewUrl: null, error: null };

    if (bucket === "public-branding") {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      return { previewUrl: data?.publicUrl ?? null, error: null };
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      return { previewUrl: null, error: null };
    }
    return { previewUrl: data.signedUrl, error: null };
  } catch (err) {
    console.error("[resolveImagePreviewUrlAction]", err);
    return { previewUrl: null, error: null };
  }
}

export async function removeImageAction(
  bucket: "profile-pictures" | "public-branding",
  path: string,
): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return "You must be signed in to remove images.";
    }

    const { error } = await supabase.storage.from(bucket).remove([path]);
    return error?.message ?? null;
  } catch (err) {
    console.error("[removeImageAction]", err);
    return "Upload could not complete. Please try again.";
  }
}

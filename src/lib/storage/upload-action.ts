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

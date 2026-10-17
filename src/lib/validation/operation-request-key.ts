import { z } from "zod";

export function operationRequestKey(formData: FormData): string | null {
  const parsed = z.uuid().safeParse(formData.get("request_key"));
  return parsed.success ? parsed.data : null;
}

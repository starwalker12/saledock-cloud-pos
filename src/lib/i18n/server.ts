import { cookies } from "next/headers";
import { getDictionary } from "./translations";

export async function getServerLang(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore.get("saledock_lang")?.value || "en";
}

export async function getServerDict() {
  const lang = await getServerLang();
  return { lang, dict: getDictionary(lang) };
}

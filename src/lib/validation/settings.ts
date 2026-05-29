import { z } from "zod";

const optionalText = (max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string") return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().max(max).optional(),
  );

const optionalEmail = z.preprocess(
  (value) => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z.string().email("Enter a valid email address.").max(160).optional(),
);

const optionalUrlPath = z.preprocess(
  (value) => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z
    .string()
    .max(500)
    .refine(
      (value) =>
        value.startsWith("/") ||
        value.startsWith("https://") ||
        value.startsWith("http://"),
      "Use a site path or a full URL.",
    )
    .optional(),
);

export const PRINT_FORMATS = ["a4", "80mm_planned"] as const;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #3B82F6").nullable().optional();

export const settingsSchema = z.object({
  shopName: z.string().trim().min(2, "Shop name is required.").max(120),
  ownerName: optionalText(120),
  phone: optionalText(50),
  whatsappSupport: optionalText(50).transform((value) =>
    value ? value.replace(/[^\d+]/g, "") : undefined,
  ),
  email: optionalEmail,
  address: optionalText(300),
  branchName: z.string().trim().min(2, "Branch name is required.").max(120),
  branchPhone: optionalText(50),
  branchAddress: optionalText(300),
  currencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .min(3)
    .max(3)
    .default("PKR"),
  timezone: z.string().trim().min(2).max(80).default("Asia/Karachi"),
  logoUrl: optionalUrlPath.default("/saledock-logo-full.png"),
  appLogoUrl: optionalUrlPath,
  invoiceFooter: optionalText(500),
  receiptTerms: optionalText(1200),
  printFormat: z.enum(PRINT_FORMATS).default("a4"),
  lowStockDefaultThreshold: z.coerce.number().int().min(0).max(9999).default(5),
  primaryColor: hexColor,
  accentColor: hexColor,
  defaultTheme: z.enum(["light", "dark", "system"]).nullable().optional(),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

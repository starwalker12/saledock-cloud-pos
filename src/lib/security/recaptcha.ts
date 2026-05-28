export async function verifyRecaptchaToken(
  token: string | null | undefined,
): Promise<{ success: boolean; error?: string }> {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;

  if (!secretKey) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[recaptcha] RECAPTCHA_SECRET_KEY missing. Skipping verification in development.",
      );
      return { success: true };
    }
    return {
      success: false,
      error: "Security check unavailable. Please try again later.",
    };
  }

  if (!token) {
    return { success: false, error: "Please complete the security check." };
  }

  try {
    const response = await fetch(
      "https://www.google.com/recaptcha/api/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          secret: secretKey,
          response: token,
        }),
      },
    );

    const data = await response.json();

    if (data.success === true) {
      return { success: true };
    }

    return { success: false, error: "Security check failed. Please try again." };
  } catch {
    return { success: false, error: "Security check failed. Please try again." };
  }
}

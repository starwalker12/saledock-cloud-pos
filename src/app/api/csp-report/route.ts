import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    // Accept standard reports from both CSP (application/csp-report) and Report-To (application/reports+json)
    if (
      !contentType.includes("application/json") &&
      !contentType.includes("application/csp-report") &&
      !contentType.includes("application/reports+json")
    ) {
      return new NextResponse(null, { status: 415 }); // Unsupported Media Type
    }

    const bodyText = await request.text();
    if (!bodyText || bodyText.length > 50000) {
      // Ignore empty or overly large payloads to prevent abuse
      return new NextResponse(null, { status: 400 });
    }

    const payload = JSON.parse(bodyText);

    // Standard console log for Vercel logging collection
    console.warn("CSP Violation Report Received:", JSON.stringify(payload, null, 2));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    // Safely ignore malformed bodies or parsing errors without crashing
    console.error("Failed parsing CSP report:", error);
    return new NextResponse(null, { status: 400 });
  }
}

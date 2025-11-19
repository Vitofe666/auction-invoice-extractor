
import type { InvoiceData } from "../types";
import { normalizeInvoiceData } from "./normalizeInvoiceData";

/**
 * Client now POSTs the image to the server-side proxy instead of calling Gemini directly.
 * Field name: "image" (multipart/form-data)
 *
 * @param imageFile - image File to send
 * @param endpoint - optional override for the endpoint (defaults to configured apiEndpoint)
 */
export const extractInvoiceData = async (
  imageFile: File,
  endpoint: string = "/api/extract-invoice"
): Promise<InvoiceData> => {
  const form = new FormData();
  form.append("image", imageFile);

  const res = await fetch(endpoint, {
    method: "POST",
    body: form,
  });

  // Read raw body once to avoid "Unexpected end of JSON input"
  const raw = await res.text();

  // If the body is empty
  if (!raw) {
    if (!res.ok) {
      throw new Error(`Server error ${res.status}: ${res.statusText || "empty response"}`);
    }
    throw new Error("Empty response from server");
  }

  // Try to parse JSON and give a helpful error if it fails
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON response from server: ${msg}. Raw response: ${raw}`);
  }

  if (!res.ok) {
    // If parsed is an object with message or error, include it in the thrown error
    let bodyMsg = "";
    try {
      if (parsed && typeof parsed === "object") {
        const p = parsed as Record<string, unknown>;
        if (typeof p.message === "string") bodyMsg = `: ${p.message}`;
        else if (typeof p.error === "string") bodyMsg = `: ${p.error}`;
      }
    } catch {
      // ignore parsing for error message
    }
    throw new Error(`Server error ${res.status}${bodyMsg}`);
  }

  return normalizeInvoiceData(parsed as Partial<InvoiceData>);
};

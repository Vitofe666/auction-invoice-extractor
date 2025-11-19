import type { InvoiceData } from "../types";
import { normalizeInvoiceData } from "./normalizeInvoiceData";

/**
 * Client now POSTs the image to the server-side proxy instead of calling Gemini directly.
 * Field name: "image" (multipart/form-data)
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
    // If server returned JSON error payload, prefer that message
    const body = parsed as { error?: string; message?: string } | null;
    throw new Error(`Server error ${res.status}: ${body?.error ?? body?.message ?? res.statusText}`);
  }

  return normalizeInvoiceData(parsed as Partial<InvoiceData>);
};

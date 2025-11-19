
import type { InvoiceData } from "../types";

const normalizeBaseUrl = (url: string | undefined): string => {
  if (!url) return "";
  return url.endsWith("/") ? url.slice(0, -1) : url;
};

const baseUrl = normalizeBaseUrl(import.meta.env?.VITE_BACKEND_URL as string | undefined);
const apiEndpoint = baseUrl ? `${baseUrl}/api/extract-invoice` : "/api/extract-invoice";

/**
 * Client now POSTs the image to the server-side proxy instead of calling Gemini directly.
 * Field name: "image" (multipart/form-data)
 *
 * @param imageFile - image File to send
 * @param endpoint - optional override for the endpoint (defaults to configured apiEndpoint)
 */
export const extractInvoiceData = async (
  imageFile: File,
  endpoint?: string
): Promise<InvoiceData> => {
  const form = new FormData();
  form.append("image", imageFile);

  const endpointToUse = endpoint ?? apiEndpoint;

  const res = await fetch(endpointToUse, {
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

  return parsed as InvoiceData;
};

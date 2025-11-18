import type { InvoiceData } from "../types";

/**
 * Client now POSTs the image to the server-side proxy instead of calling Gemini directly.
 * Field name: "image" (multipart/form-data)
 */
export const extractInvoiceData = async (imageFile: File): Promise<InvoiceData> => {
  const form = new FormData();
  form.append("image", imageFile);

  const res = await fetch("/api/extract-invoice", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    // Try to parse returned JSON for error details, otherwise include status text
    const body = await res.json().catch(() => ({}));
    throw new Error(`Server error ${res.status}: ${body?.error ?? res.statusText}`);
  }

  const data = await res.json();
  return data as InvoiceData;
};

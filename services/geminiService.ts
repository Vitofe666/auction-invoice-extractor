import type { InvoiceData } from "../types";

export const extractInvoiceData = async (imageFile: File): Promise<InvoiceData> => {
  const form = new FormData();
  form.append('image', imageFile);

  const res = await fetch('/api/extract-invoice', { method: 'POST', body: form });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Server error ${res.status}: ${body?.error ?? res.statusText}`);
  }

  const data = await res.json();
  return data as InvoiceData;
};

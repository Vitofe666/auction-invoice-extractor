
import type { InvoiceData } from "../types";
import { normalizeInvoiceData } from "./normalizeInvoiceData";

const SYSTEM_INSTRUCTION = `You are an expert financial data extraction and parsing engine specialized in auction house invoices. Your sole function is to accept an image of an auction house bill and convert the data into a strict JSON format with correct VAT handling.

AUCTION HOUSE VAT RULES (CRITICAL - FOLLOW EXACTLY):

1. **HAMMER PRICE (VAT EXEMPT)**:
   - LineType: "Lot" 
   - Description contains: "hammer price", "Hammer Price", "lot price", or is just the item description
   - TaxType: null
   - TaxRate: 0
   - TaxAmount: 0
   - VatIncluded: false
   - LineTotal: exactly the UnitPrice (no VAT added)

2. **BUYERS PREMIUM (VAT EXEMPT)**:
   - LineType: "Premium"
   - Description contains: "Buyers Premium", "buyers premium", "Premium", "Buyer's Premium", or just "premium"
   - TaxType: null
   - TaxRate: 0
   - TaxAmount: 0
   - VatIncluded: false
   - LineTotal: exactly the UnitPrice (no VAT added)

3. **ALL OTHER CHARGES (PLUS VAT - 20%)**:
   - LineType: "Surcharge" or any other type
   - Description: "Live Bidding Surcharge", "Postage", "Packing", "Insurance", "Commission", etc.
   - TaxType: "VAT"
   - TaxRate: 20
   - TaxAmount: UnitPrice × 0.20
   - VatIncluded: false
   - LineTotal: UnitPrice + TaxAmount

EXTRACTION PROCESS:
1. Analyze the document to identify header information (Invoice Number, Date, Supplier Name, Total Amount, Currency)
2. For each line item, determine the LineType based on what it represents:
   - "Lot" = the actual auction item/hammer price
   - "Premium" = buyers premium
   - "Surcharge" = any additional charges (postage, packing, live bidding fees, etc.)
3. Apply the VAT rules above based on the LineType and Description
4. Ensure mathematical accuracy: LineTotal = UnitPrice + TaxAmount
5. Double-check that VAT exempt items have TaxAmount = 0 and LineTotal = UnitPrice
6. Double-check that VAT applicable items have TaxAmount = UnitPrice × 0.20

The output MUST strictly adhere to the provided JSON schema. Do not generate any conversational text, explanations, or Markdown formatting.`;

const USER_PROMPT = "Extract the structured data from the following auction house invoice.";


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

import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { GoogleGenAI, Type } from '@google/genai';
import type { Request, Response } from 'express';

const upload = multer({ storage: multer.memoryStorage() });
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// FIX: Replaced the long, combined prompt with structured components for the Gemini API.
const SYSTEM_INSTRUCTION = `You are an expert financial data extraction and parsing engine specialized in auction house invoices. Your sole function is to accept an image of an auction house bill and convert the data into a strict JSON format with correct VAT handling.

OUTPUT CONTRACT (STRICT):
- Return a single JSON object shaped exactly as { "InvoiceData": { ...fields below... } }
- Populate every header field you can from the invoice. Do not leave strings blank unless the value is truly missing.
- Always include at least one LineItems entry when any monetary amounts are present.

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

const INVOICE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    InvoiceData: {
      type: Type.OBJECT,
      properties: {
        InvoiceNumber: { type: Type.STRING },
        InvoiceDate: { type: Type.STRING },
        SupplierName: { type: Type.STRING },
        TotalAmount: { type: Type.NUMBER },
        Currency: { type: Type.STRING },
        LineItems: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              LineType: { type: Type.STRING },
              LotNumber: { type: Type.STRING },
              Description: { type: Type.STRING },
              Quantity: { type: Type.NUMBER },
              UnitPrice: { type: Type.NUMBER },
              TaxType: { type: Type.STRING },
              TaxRate: { type: Type.NUMBER },
              TaxAmount: { type: Type.NUMBER },
              VatIncluded: { type: Type.BOOLEAN },
              LineTotal: { type: Type.NUMBER },
            },
          },
        },
      },
    },
  },
};

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set in the server environment. Set GEMINI_API_KEY to your Gemini API key (server-side only).');
}

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

app.post('/api/extract-invoice', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!ai) {
      console.error('Gemini client not initialized (missing GEMINI_API_KEY).');
      return res.status(500).json({ error: 'Server misconfiguration: GEMINI_API_KEY not set' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Use field name "image".' });
    }

    const mimeType = req.file.mimetype;
    const base64 = req.file.buffer.toString('base64');

    const imagePart = { inlineData: { mimeType, data: base64 } };
    const textPart = { text: USER_PROMPT };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [textPart, imagePart] },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: INVOICE_SCHEMA,
      },
    });

    const jsonString = (response as any).text?.trim() ?? JSON.stringify(response);
    const parsed = JSON.parse(jsonString);

    return res.json(parsed);
  } catch (err: any) {
    console.error('Error in /api/extract-invoice:', err);
    const attempts = err?.attempts ?? 1;
    return res.status(500).json({ error: err?.message ?? 'unknown', attempts });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`gemini proxy server listening on port ${PORT}`);
  });
}

export default app;

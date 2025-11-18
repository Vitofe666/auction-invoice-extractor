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

const SYSTEM_INSTRUCTION = `You are an expert financial data extraction and parsing engine specialized in auction house invoices. Your sole function is to accept an image of an auction house bill and extract structured data following specific VAT rules.

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
    InvoiceNumber: { type: Type.STRING },
    InvoiceDate: { type: Type.STRING },
    SupplierName: { type: Type.STRING },
    TotalAmount: { type: Type.NUMBER },
    Currency: { type: Type.STRING },
    LineItems: { type: Type.ARRAY },
  },
};

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set in the server environment. Set GEMINI_API_KEY to your Gemini API key (server-side only).');
}

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

app.post('/api/extract-invoice', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!ai) return res.status(500).json({ error: 'Server misconfiguration: GEMINI_API_KEY not set' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded. Use field name "image".' });

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

export function startServer() {
  app.listen(PORT, () => console.log(`gemini proxy server listening on port ${PORT}`));
}

// Auto-start when run directly (works in both ES modules and CommonJS)
// @ts-ignore - handle both module systems
if (typeof require !== 'undefined' && require.main === module) {
  startServer();
}

export default app;
import express, { Request, Response } from 'express';
import multer from 'multer';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import type { InvoiceData } from '../types';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Enable CORS for all origins (adjust as needed for production)
// TODO: In production, configure specific allowed origins instead of allowing all
// Example: app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }))
app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY environment variable is required');
  process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// System instruction for Gemini to extract invoice data
const SYSTEM_INSTRUCTION = `You are an expert at extracting structured data from auction house invoices.
Extract all relevant information and return it as valid JSON matching the InvoiceSchema.
Pay special attention to:
- Lot numbers and descriptions
- VAT/tax handling (some items may have VAT included, others may have it added separately)
- Premium charges (buyer's premium, etc.)
- Surcharges
- Currency symbols and amounts`;

// User prompt for invoice extraction
const USER_PROMPT = `Please extract the invoice data from this image and return it as JSON matching this schema:
{
  "InvoiceNumber": "string",
  "InvoiceDate": "YYYY-MM-DD",
  "SupplierName": "string",
  "TotalAmount": number,
  "Currency": "string",
  "LineItems": [
    {
      "LineType": "Lot" | "Premium" | "Surcharge",
      "LotNumber": "string",
      "Description": "string",
      "Quantity": number,
      "UnitPrice": number,
      "TaxType": "string | null",
      "TaxRate": "number | null",
      "TaxAmount": "number | null",
      "VatIncluded": boolean,
      "LineTotal": number
    }
  ]
}

Return ONLY the JSON object, no markdown formatting or additional text.`;

// Minimal invoice schema for Gemini response format
const INVOICE_SCHEMA = {
  type: 'object',
  properties: {
    InvoiceNumber: { type: 'string' },
    InvoiceDate: { type: 'string' },
    SupplierName: { type: 'string' },
    TotalAmount: { type: 'number' },
    Currency: { type: 'string' },
    LineItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          LineType: { type: 'string' },
          LotNumber: { type: 'string' },
          Description: { type: 'string' },
          Quantity: { type: 'number' },
          UnitPrice: { type: 'number' },
          TaxType: { type: ['string', 'null'] },
          TaxRate: { type: ['number', 'null'] },
          TaxAmount: { type: ['number', 'null'] },
          VatIncluded: { type: 'boolean' },
          LineTotal: { type: 'number' },
        },
      },
    },
  },
};

/**
 * POST /api/extract-invoice
 * Accepts multipart/form-data with 'image' field
 * Returns extracted invoice data as JSON
 */
app.post('/api/extract-invoice', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const imageBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;

    // Convert buffer to base64 for Gemini
    const base64Image = imageBuffer.toString('base64');

    let attempts = 0;
    const maxAttempts = 3;
    let lastError: Error | null = null;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const response = await genAI.models.generateContent({
          model: 'gemini-1.5-pro',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Image,
                  },
                },
                { text: USER_PROMPT },
              ],
            },
          ],
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: INVOICE_SCHEMA,
          },
        });

        const text = response.text;

        // Parse the JSON response
        let invoiceData: InvoiceData;
        try {
          invoiceData = JSON.parse(text);
        } catch (parseError) {
          // If JSON parsing fails, try to extract JSON from the text
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            invoiceData = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('Failed to parse JSON response from Gemini');
          }
        }

        // Successfully extracted data
        return res.json(invoiceData);
      } catch (error) {
        lastError = error as Error;
        console.error(`Attempt ${attempts} failed:`, error);

        if (attempts < maxAttempts) {
          // Wait before retrying (exponential backoff)
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempts) * 1000));
        }
      }
    }

    // All attempts failed
    return res.status(500).json({
      error: 'Failed to extract invoice data after multiple attempts',
      details: lastError?.message,
      attempts,
    });
  } catch (error) {
    console.error('Error processing invoice:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Export the app for testing
export default app;

// Start server only when run directly (not when imported)
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Gemini proxy server listening on port ${PORT}`);
  });
}

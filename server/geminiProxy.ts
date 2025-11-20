import express from 'express';
import multer from 'multer';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import type { Request, Response } from 'express';

const upload = multer({ storage: multer.memoryStorage() });
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Log startup configuration
console.log('=== Gemini Proxy Server Startup ===');
console.log(`Server Port: ${PORT}`);
console.log(`Node Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`GEMINI_API_KEY present: ${!!process.env.GEMINI_API_KEY}`);
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ CRITICAL: GEMINI_API_KEY environment variable is not set!');
  console.error('   The server will reject all requests. Please set GEMINI_API_KEY.');
} else {
  const keyLength = process.env.GEMINI_API_KEY.length;
  console.log(`✓ GEMINI_API_KEY configured (length: ${keyLength} characters)`);
}
console.log('===================================\n');

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

const USER_PROMPT = "Extract the structured data from the following auction house invoice. Return ONLY valid JSON matching the schema, with no markdown formatting or additional text.";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY is not set in the server environment. Set ANTHROPIC_API_KEY to your Claude API key (server-side only).');
}

const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

app.post('/api/extract-invoice', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!anthropic) return res.status(500).json({ error: 'Server misconfiguration: ANTHROPIC_API_KEY not set' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded. Use field name "image".' });

    const mimeType = req.file.mimetype;
    const base64 = req.file.buffer.toString('base64');

    // Map common mime types to Claude's supported formats
    let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
      mediaType = 'image/jpeg';
    } else if (mimeType === 'image/png') {
      mediaType = 'image/png';
    } else if (mimeType === 'image/gif') {
      mediaType = 'image/gif';
    } else if (mimeType === 'image/webp') {
      mediaType = 'image/webp';
    } else {
      return res.status(400).json({ error: 'Unsupported image format. Please use JPEG, PNG, GIF, or WebP.' });
    }

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: SYSTEM_INSTRUCTION,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: 'text',
              text: USER_PROMPT,
            },
          ],
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      console.error('Unexpected response type from Claude API:', content.type);
      return res.status(500).json({ 
        error: 'Unexpected response type from Claude API',
        type: content.type
      });
    }

    const jsonString = content.text.trim();
    if (!jsonString) {
      console.error('Empty response from Claude API:', response);
      return res.status(500).json({ 
        error: 'Empty response from Claude API',
        response: JSON.stringify(response)
      });
    }
    
    // Parse JSON, handling potential markdown code blocks
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (parseError) {
      // Try to extract JSON from markdown code blocks (```json ... ```)
      const jsonMatch = jsonString.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          parsed = JSON.parse(jsonMatch[1].trim());
        } catch {
          throw new Error('Failed to parse JSON response from Claude API');
        }
      } else {
        throw new Error('Failed to parse JSON response from Claude API');
      }

      const errorInfo = categorizeError(apiError);
      console.error(`[${requestId}] Error category: ${errorInfo.category}`);
      console.error(`[${requestId}] Is retryable: ${errorInfo.isRetryable}`);

      return res.status(500).json({
        error: 'Gemini API call failed',
        details: errorInfo.message,
        category: errorInfo.category,
        technicalDetails: apiError?.message || String(apiError),
        isRetryable: errorInfo.isRetryable,
        requestId,
      });
    }
    
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error in /api/extract-invoice:', error);
    return res.status(500).json({ 
      error: error?.message ?? 'Unknown error', 
      details: error?.toString() 
    });
  }
});

export function startServer() {
  app.listen(PORT, () => console.log(`Claude proxy server listening on port ${PORT}`));
}

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    geminiApiConfigured: !!ai,
    environment: process.env.NODE_ENV || 'development',
  };
  
  console.log('Health check:', health);
  res.json(health);
});

// Export the app for testing
export default app;

// Auto-start when run directly (works in both ES modules and CommonJS)
// @ts-ignore - handle both module systems
if (typeof require !== 'undefined' && require.main === module) {
  startServer();
}

// Auto-start when run directly
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if this module is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export default app;

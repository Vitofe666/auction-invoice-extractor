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
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

/**
 * Helper function to get error category and user-friendly message
 */
function categorizeError(error: any): { category: string; message: string; isRetryable: boolean } {
  const errorMessage = error?.message || String(error);
  const errorString = JSON.stringify(error);

  // Check for API key issues
  if (errorMessage.includes('API key') || errorMessage.includes('authentication') || errorMessage.includes('401')) {
    return {
      category: 'AUTHENTICATION_ERROR',
      message: 'Invalid or missing GEMINI_API_KEY. Please check your API key configuration.',
      isRetryable: false,
    };
  }

  // Check for quota/rate limiting
  if (errorMessage.includes('quota') || errorMessage.includes('rate limit') || errorMessage.includes('429')) {
    return {
      category: 'RATE_LIMIT_ERROR',
      message: 'Gemini API rate limit exceeded. Please try again later.',
      isRetryable: true,
    };
  }

  // Check for network/timeout issues
  if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('network')) {
    return {
      category: 'NETWORK_ERROR',
      message: 'Network error connecting to Gemini API. Please check your internet connection and try again.',
      isRetryable: true,
    };
  }

  // Check for invalid file format
  if (errorMessage.includes('unsupported') || errorMessage.includes('invalid format') || errorMessage.includes('mime type')) {
    return {
      category: 'INVALID_FILE_FORMAT',
      message: 'The uploaded file format is not supported. Please upload a valid image file (JPEG, PNG, etc.).',
      isRetryable: false,
    };
  }

  // Check for content policy violations
  if (errorMessage.includes('content policy') || errorMessage.includes('safety')) {
    return {
      category: 'CONTENT_POLICY_ERROR',
      message: 'The image was rejected by Gemini content policies.',
      isRetryable: false,
    };
  }

  // Check for service unavailable
  if (errorMessage.includes('503') || errorMessage.includes('service unavailable')) {
    return {
      category: 'SERVICE_UNAVAILABLE',
      message: 'Gemini API service is temporarily unavailable. Please try again later.',
      isRetryable: true,
    };
  }

  // Default to generic error
  return {
    category: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred while processing the invoice.',
    isRetryable: true,
  };
}

/**
 * Validate that the response has expected structure
 */
function validateResponseStructure(response: any): { isValid: boolean; error?: string } {
  if (!response) {
    return { isValid: false, error: 'Response object is null or undefined' };
  }

  // Check if response has text property
  if (!response.text && !response.candidates) {
    return { isValid: false, error: 'Response missing both "text" and "candidates" properties' };
  }

  return { isValid: true };
}

/**
 * POST /api/extract-invoice
 * Accepts multipart/form-data with 'image' field
 * Returns extracted invoice data as JSON
 */
app.post('/api/extract-invoice', upload.single('image'), async (req: Request, res: Response) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`\n[${requestId}] === New Invoice Extraction Request ===`);
  console.log(`[${requestId}] Timestamp: ${new Date().toISOString()}`);

  try {
    // Check if API client is initialized
    if (!ai) {
      console.error(`[${requestId}] ❌ ERROR: Gemini AI client not initialized`);
      console.error(`[${requestId}]   Reason: GEMINI_API_KEY environment variable not set`);
      console.error(`[${requestId}]   Solution: Set GEMINI_API_KEY in your environment variables`);
      return res.status(500).json({ 
        error: 'Server misconfiguration',
        details: 'GEMINI_API_KEY not configured on server',
        category: 'CONFIGURATION_ERROR',
        requestId,
      });
    }

    // Check if file was uploaded
    if (!req.file) {
      console.warn(`[${requestId}] ⚠️  WARNING: No file uploaded`);
      return res.status(400).json({ 
        error: 'No file uploaded',
        details: 'Request must include a file with field name "image"',
        category: 'INVALID_REQUEST',
        requestId,
      });
    }

    const mimeType = req.file.mimetype;
    const fileSize = req.file.buffer.length;
    const fileSizeKB = (fileSize / 1024).toFixed(2);

    console.log(`[${requestId}] File received:`);
    console.log(`[${requestId}]   - MIME type: ${mimeType}`);
    console.log(`[${requestId}]   - Size: ${fileSizeKB} KB`);
    console.log(`[${requestId}]   - Original name: ${req.file.originalname || 'N/A'}`);

    // Validate MIME type
    const validMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validMimeTypes.includes(mimeType.toLowerCase())) {
      console.error(`[${requestId}] ❌ ERROR: Invalid MIME type`);
      console.error(`[${requestId}]   - Received: ${mimeType}`);
      console.error(`[${requestId}]   - Expected one of: ${validMimeTypes.join(', ')}`);
      return res.status(400).json({
        error: 'Invalid file type',
        details: `File type ${mimeType} is not supported. Please upload a JPEG, PNG, GIF, or WebP image.`,
        category: 'INVALID_FILE_FORMAT',
        requestId,
      });
    }

    const base64 = req.file.buffer.toString('base64');
    const base64Length = base64.length;
    console.log(`[${requestId}]   - Base64 length: ${base64Length} characters`);

    const imagePart = { inlineData: { mimeType, data: base64 } };
    const textPart = { text: USER_PROMPT };

    console.log(`[${requestId}] Calling Gemini API...`);
    console.log(`[${requestId}]   - Model: gemini-2.5-flash`);
    console.log(`[${requestId}]   - Response format: application/json`);
    console.log(`[${requestId}]   - System instruction length: ${SYSTEM_INSTRUCTION.length} characters`);

    const apiCallStartTime = Date.now();

    let response: any;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [textPart, imagePart] },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: INVOICE_SCHEMA,
        },
      });
    } catch (apiError: any) {
      const apiCallDuration = Date.now() - apiCallStartTime;
      console.error(`[${requestId}] ❌ Gemini API call failed after ${apiCallDuration}ms`);
      console.error(`[${requestId}] Error type: ${apiError?.constructor?.name || 'Unknown'}`);
      console.error(`[${requestId}] Error message: ${apiError?.message || 'No message'}`);
      
      if (apiError?.stack) {
        console.error(`[${requestId}] Stack trace:`);
        console.error(apiError.stack);
      }
      
      if (apiError?.response) {
        console.error(`[${requestId}] API Response data:`, JSON.stringify(apiError.response, null, 2));
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

    const apiCallDuration = Date.now() - apiCallStartTime;
    console.log(`[${requestId}] ✓ Gemini API call completed in ${apiCallDuration}ms`);

    // Validate response structure
    const validation = validateResponseStructure(response);
    if (!validation.isValid) {
      console.error(`[${requestId}] ❌ ERROR: Invalid response structure from Gemini API`);
      console.error(`[${requestId}]   Validation error: ${validation.error}`);
      console.error(`[${requestId}]   Response object keys: ${response ? Object.keys(response).join(', ') : 'N/A'}`);
      console.error(`[${requestId}]   Full response:`, JSON.stringify(response, null, 2));

      return res.status(500).json({
        error: 'Invalid API response structure',
        details: validation.error,
        category: 'INVALID_RESPONSE_STRUCTURE',
        responseKeys: response ? Object.keys(response) : [],
        requestId,
      });
    }

    // Extract text from response
    const jsonString = (response as any).text?.trim();
    
    if (!jsonString) {
      console.error(`[${requestId}] ❌ ERROR: Empty response text from Gemini API`);
      console.error(`[${requestId}]   Response has "text" property: ${response.hasOwnProperty('text')}`);
      console.error(`[${requestId}]   Text value: ${JSON.stringify((response as any).text)}`);
      
      if (response.candidates) {
        console.error(`[${requestId}]   Candidates array length: ${response.candidates.length}`);
        console.error(`[${requestId}]   Candidates:`, JSON.stringify(response.candidates, null, 2));
      }
      
      console.error(`[${requestId}]   Full response object:`, JSON.stringify(response, null, 2));

      return res.status(500).json({ 
        error: 'Empty response from Gemini API',
        details: 'The Gemini API returned a response but the text content was empty. This may indicate the model could not process the image or extract meaningful data.',
        category: 'EMPTY_RESPONSE',
        responseStructure: {
          hasText: response.hasOwnProperty('text'),
          hasCandidates: response.hasOwnProperty('candidates'),
          candidatesCount: response.candidates?.length || 0,
        },
        requestId,
      });
    }

    console.log(`[${requestId}] Response text received (length: ${jsonString.length} characters)`);
    console.log(`[${requestId}] First 200 characters: ${jsonString.substring(0, 200)}...`);

    // Parse JSON response
    let parsed: any;
    try {
      parsed = JSON.parse(jsonString);
      console.log(`[${requestId}] ✓ JSON parsing successful`);
      
      // Log parsed data structure
      if (parsed) {
        console.log(`[${requestId}] Parsed data structure:`);
        console.log(`[${requestId}]   - InvoiceNumber: ${parsed.InvoiceNumber || 'N/A'}`);
        console.log(`[${requestId}]   - SupplierName: ${parsed.SupplierName || 'N/A'}`);
        console.log(`[${requestId}]   - TotalAmount: ${parsed.TotalAmount || 'N/A'}`);
        console.log(`[${requestId}]   - Currency: ${parsed.Currency || 'N/A'}`);
        console.log(`[${requestId}]   - LineItems count: ${parsed.LineItems?.length || 0}`);
      }
    } catch (parseError: any) {
      console.error(`[${requestId}] ❌ ERROR: JSON parsing failed`);
      console.error(`[${requestId}]   Parse error: ${parseError.message}`);
      console.error(`[${requestId}]   Response text that failed to parse:`, jsonString);
      
      return res.status(500).json({
        error: 'Failed to parse JSON response',
        details: 'The Gemini API returned invalid JSON. This may indicate an error in the response format.',
        category: 'JSON_PARSE_ERROR',
        parseError: parseError.message,
        responseText: jsonString.substring(0, 500), // First 500 chars for debugging
        requestId,
      });
    }

    console.log(`[${requestId}] ✓ Invoice extraction successful`);
    console.log(`[${requestId}] === Request Complete ===\n`);

    return res.json(parsed);

  } catch (error: any) {
    console.error(`[${requestId}] ❌ UNEXPECTED ERROR in request handler`);
    console.error(`[${requestId}] Error type: ${error?.constructor?.name || 'Unknown'}`);
    console.error(`[${requestId}] Error message: ${error?.message || 'No message'}`);
    
    if (error?.stack) {
      console.error(`[${requestId}] Stack trace:`);
      console.error(error.stack);
    }

    const errorInfo = categorizeError(error);
    console.error(`[${requestId}] Error category: ${errorInfo.category}`);

    return res.status(500).json({ 
      error: 'Internal server error',
      details: errorInfo.message,
      category: errorInfo.category,
      technicalDetails: error?.message || String(error),
      requestId,
    });
  }
});

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

export function startServer() {
  app.listen(PORT, () => {
    console.log(`\n🚀 Gemini proxy server listening on port ${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
    console.log(`   API endpoint: POST http://localhost:${PORT}/api/extract-invoice\n`);
  });
}

// Auto-start when run directly (works in both ES modules and CommonJS)
// @ts-ignore - handle both module systems
if (typeof require !== 'undefined' && require.main === module) {
  startServer();
}

export default app;

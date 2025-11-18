import { GoogleGenAI, Type } from "@google/genai";
import type { InvoiceData } from "../types";
import { callWithRetry } from "./retry";

// FIX: Replaced the long, combined prompt with structured components for the Gemini API.
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

// FIX: Defined a strict JSON schema for the model's response.
const INVOICE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    InvoiceNumber: { type: Type.STRING },
    InvoiceDate: {
      type: Type.STRING,
      description: 'The invoice date in YYYY-MM-DD format.'
    },
    SupplierName: { type: Type.STRING },
    TotalAmount: { type: Type.NUMBER },
    Currency: { type: Type.STRING },
    LineItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          LineType: {
            type: Type.STRING,
            description: 'Type of the line item. Must be one of: "Lot", "Premium", "Surcharge".'
          },
          LotNumber: { type: Type.STRING },
          Description: { type: Type.STRING },
          Quantity: { type: Type.NUMBER },
          UnitPrice: { 
            type: Type.NUMBER,
            description: 'The base unit price before any VAT/tax.'
          },
          TaxType: { 
            type: Type.STRING, 
            description: "Set to 'VAT' for items with 20% VAT (surcharges), or null for VAT exempt items (lots and buyers premium)." 
          },
          TaxRate: {
            type: Type.NUMBER,
            description: "Tax rate: 20 for surcharges with VAT, 0 for VAT exempt lots and buyers premium."
          },
          TaxAmount: { 
            type: Type.NUMBER, 
            description: "Amount of VAT: UnitPrice × 0.20 for surcharges, 0 for lots and buyers premium." 
          },
          VatIncluded: {
            type: Type.BOOLEAN,
            description: "Always false for auction houses - VAT is either exempt or added separately."
          },
          LineTotal: { 
            type: Type.NUMBER,
            description: 'Total amount: UnitPrice + TaxAmount. For VAT exempt items, equals UnitPrice. For VAT items, equals UnitPrice + (UnitPrice × 0.20).'
          }
        },
        required: ['LineType', 'LotNumber', 'Description', 'Quantity', 'UnitPrice', 'TaxType', 'TaxRate', 'TaxAmount', 'VatIncluded', 'LineTotal']
      }
    }
  },
  required: ['InvoiceNumber', 'InvoiceDate', 'SupplierName', 'TotalAmount', 'Currency', 'LineItems']
};


const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix e.g. "data:image/png;base64,"
      resolve(result.split(',')[1]);
    };
    reader.onerror = (error) => reject(error);
  });
};

export const extractInvoiceData = async (imageFile: File): Promise<InvoiceData> => {
  // Get API key from environment variables (defined in vite.config.ts)
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    throw new Error("VITE_API_KEY environment variable is not set. Please add your Gemini API key to your .env.local file or Render environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey: apiKey });

  try {
    const base64Image = await fileToBase64(imageFile);

    const imagePart = {
      inlineData: {
        mimeType: imageFile.type,
        data: base64Image,
      },
    };
    
    const textPart = {
      text: USER_PROMPT,
    };

    // FIX: Updated generateContent call to use systemInstruction and responseSchema.
    // Wrap the API call with retry logic to handle transient 503 errors
    const maxRetries = parseInt(process.env.VITE_MAX_RETRIES || '5', 10);
    const response = await callWithRetry(
      async () => {
        return await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: { parts: [textPart, imagePart] },
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: INVOICE_SCHEMA,
          },
        });
      },
      { 
        maxRetries, 
        baseDelayMs: 300, 
        retryableStatusCodes: [503, 429] }
      {
        maxRetries: parseInt(process.env.VITE_MAX_RETRIES || '5', 10),
        baseDelayMs: 300,
        retryableStatusCodes: [503, 429]
      }
    );
    
    // FIX: Simplified JSON parsing logic as responseSchema ensures format.
    const jsonString = response.text.trim();
    const parsedData = JSON.parse(jsonString);

    return parsedData as InvoiceData;

  } catch (error: any) {
    console.error("Error calling Gemini API:", error);
    
    // Include retry attempts in error message if available
    const attemptsInfo = error.attempts ? ` (after ${error.attempts} attempt(s))` : '';
    
    if (error instanceof Error) {
        throw new Error(`Failed to extract data${attemptsInfo}: ${error.message}`);
    }
    throw new Error(`An unknown error occurred while communicating with the AI${attemptsInfo}.`);
  } catch (error) {
    const attempts = (error as any)?.attempts || 1;
    console.error(`Error calling Gemini API (attempts: ${attempts}):`, error);
    if (error instanceof Error) {
        throw new Error(`Failed to extract data after ${attempts} attempt(s): ${error.message}`);
    }
    throw new Error(`An unknown error occurred while communicating with the AI after ${attempts} attempt(s).`);
  }
};

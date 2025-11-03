import { GoogleGenAI, Type } from "@google/genai";
import type { InvoiceData } from "../types";

// FIX: Replaced the long, combined prompt with structured components for the Gemini API.
const SYSTEM_INSTRUCTION = `You are an expert financial data extraction and parsing engine. Your sole function is to accept an image of a purchase invoice, specifically auction house bills that contain itemized "lots," and convert the data into a strict JSON format.

Your process must be:
1. Analyze the document to identify the key header information and the itemized line-item details (lots).
2. Extract Header Information: Find the Invoice Number, Invoice Date, Supplier Name, and Total Invoice Amount (including VAT/Tax).
3. Extract Line Items (Lots): For each "Lot" listed, carefully analyze:
   - Extract the Lot Number, Description, and amounts
   - CRITICALLY IMPORTANT: Determine if each line item amount is "plus VAT" or "including VAT":
     * Look for indicators like "plus VAT", "+ VAT", "excl. VAT", "net" = amount is BEFORE tax (VatIncluded: false)
     * Look for indicators like "inc. VAT", "including VAT", "gross", or if VAT is already calculated in the total = amount is AFTER tax (VatIncluded: true)
     * If no clear indication, assume UK auction house standard: amounts typically INCLUDE VAT (VatIncluded: true)
   - For TaxRate: Use the VAT rate shown on invoice (typically 20% in UK), or 20 as default
   - For TaxAmount: Calculate the actual VAT amount that applies to this line
   - For UnitPrice: always provide the base price before any VAT calculation
   - For LineTotal: this should represent UnitPrice + TaxAmount (the total including VAT)
   - For VAT calculation consistency:
     * If VatIncluded=true: TaxAmount = LineTotal - (LineTotal / (1 + TaxRate/100))
     * If VatIncluded=false: TaxAmount = UnitPrice * (TaxRate/100), LineTotal = UnitPrice + TaxAmount
   - Ensure VatIncluded is set correctly as this affects downstream processing
4. The output MUST strictly adhere to the provided JSON schema. Do not generate any conversational text, explanations, or Markdown formatting.`;

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
            description: "Type of tax applied (e.g., 'VAT', 'GST'). Return null if not applicable." 
          },
          TaxRate: {
            type: Type.NUMBER,
            description: "Tax rate as a percentage (e.g., 20 for 20% VAT). Return null if not applicable."
          },
          TaxAmount: { 
            type: Type.NUMBER, 
            description: "Amount of tax in currency units. Return null if not applicable." 
          },
          VatIncluded: {
            type: Type.BOOLEAN,
            description: "True if the LineTotal includes VAT/tax, false if VAT is to be added on top."
          },
          LineTotal: { 
            type: Type.NUMBER,
            description: 'The total amount for this line: UnitPrice + TaxAmount (including any VAT/tax).'
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
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [textPart, imagePart] },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: INVOICE_SCHEMA,
      },
    });
    
    // FIX: Simplified JSON parsing logic as responseSchema ensures format.
    const jsonString = response.text.trim();
    const parsedData = JSON.parse(jsonString);

    return parsedData as InvoiceData;

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    if (error instanceof Error) {
        throw new Error(`Failed to extract data: ${error.message}`);
    }
    throw new Error("An unknown error occurred while communicating with the AI.");
  }
};

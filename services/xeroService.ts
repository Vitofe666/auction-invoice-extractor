import type { InvoiceData, XeroBill } from '../types';

// Use environment variable for backend URL, fallback to correct production URL
const PROXY_URL = process.env.VITE_BACKEND_URL || 
  (process.env.NODE_ENV === 'development' ? 'http://localhost:3002' : 'https://auction-invoice-extractor-1.onrender.com');

/**
 * Normalizes a date string to ISO format (YYYY-MM-DD) for Xero API compatibility.
 * Supports common date formats: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 * Also handles two-digit years (e.g., 20/11/25 -> 2025-11-20).
 * 
 * @param dateStr - The date string to normalize.
 * @returns The normalized date in YYYY-MM-DD format, or the original string if parsing fails.
 */
export const formatDateForXero = (dateStr: string | undefined | null): string | undefined | null => {
  if (!dateStr || typeof dateStr !== 'string') {
    return dateStr;
  }

  const trimmedDate = dateStr.trim();
  
  // Check if already in ISO format (YYYY-MM-DD)
  const isoPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
  const isoMatch = trimmedDate.match(isoPattern);
  if (isoMatch) {
    return trimmedDate; // Already in correct format
  }

  // Try to parse DD/MM/YYYY, DD-MM-YYYY, or DD.MM.YYYY formats
  const ddmmyyyyPattern = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/;
  const ddmmyyyyMatch = trimmedDate.match(ddmmyyyyPattern);
  
  if (ddmmyyyyMatch) {
    let day = ddmmyyyyMatch[1].padStart(2, '0');
    let month = ddmmyyyyMatch[2].padStart(2, '0');
    let year = ddmmyyyyMatch[3];
    
    // Handle two-digit years (assume 2000s for years 00-99)
    if (year.length === 2) {
      const yearNum = parseInt(year, 10);
      // Assume years 00-99 are 2000-2099
      year = (2000 + yearNum).toString();
    }
    
    const normalizedDate = `${year}-${month}-${day}`;
    console.info(`[xeroService] Normalized date: "${dateStr}" -> "${normalizedDate}"`);
    return normalizedDate;
  }

  // Fallback: try to parse using Date constructor and extract components
  // This is a last resort and may have timezone issues, so we avoid using toISOString
  try {
    const parsed = new Date(trimmedDate);
    if (!isNaN(parsed.getTime())) {
      // Use toISOString and slice to get YYYY-MM-DD (UTC date)
      const normalizedDate = parsed.toISOString().slice(0, 10);
      console.info(`[xeroService] Normalized date (fallback): "${dateStr}" -> "${normalizedDate}"`);
      return normalizedDate;
    }
  } catch {
    // Parsing failed
  }

  // If all parsing attempts fail, log a warning and return original
  console.warn(`[xeroService] Could not normalize date: "${dateStr}". Proceeding with original value.`);
  return dateStr;
};

/**
 * Maps the extracted invoice data to the format required by the Xero API for creating a bill.
 * Note: Xero uses the 'Invoices' endpoint for both AR and AP, with the type 'ACCPAY' for bills.
 * @param invoiceData The extracted data from the invoice.
 * @param accountCode The default Xero expense account code for line items.
 * @returns A XeroBill object ready to be sent to the API.
 */
const mapToXeroBill = (invoiceData: InvoiceData, accountCode: string): XeroBill => {
  // Normalize dates to ISO format (YYYY-MM-DD) for Xero API compatibility
  const normalizedInvoiceDate = formatDateForXero(invoiceData.InvoiceDate) as string;
  
  return {
    Type: 'ACCPAY',
    Contact: {
      Name: invoiceData.SupplierName,
    },
    DateString: normalizedInvoiceDate,
    DueDateString: normalizedInvoiceDate, // You might want to calculate a real due date
    InvoiceNumber: invoiceData.InvoiceNumber,
    CurrencyCode: invoiceData.Currency,
    Status: 'DRAFT',
    LineItems: invoiceData.LineItems.map(item => {
      // For Xero, we need to send the pre-tax amounts only
      // The line total should be UnitPrice + TaxAmount (excluding VAT from the line amount)
      let preVatUnitAmount: number;
      let preVatLineAmount: number;
      
      // Based on your requirement: "line total should be Unit price + Tax amount, and no VAT"
      // This means Xero expects the pre-tax amount, and it will calculate VAT separately
      
      if (item.TaxAmount && item.TaxAmount > 0) {
        // If we have tax amount specified, the pre-tax amount is LineTotal - TaxAmount
        preVatLineAmount = item.LineTotal - item.TaxAmount;
        preVatUnitAmount = preVatLineAmount / item.Quantity;
      } else if (item.VatIncluded && item.TaxRate && item.TaxRate > 0) {
        // If VAT is included in the price, extract it using the tax rate
        preVatLineAmount = item.LineTotal / (1 + (item.TaxRate / 100));
        preVatUnitAmount = preVatLineAmount / item.Quantity;
      } else {
        // No VAT or VAT not included - use amounts as-is
        preVatUnitAmount = item.UnitPrice;
        preVatLineAmount = item.UnitPrice * item.Quantity;
      }
      
      // Round to 2 decimal places to avoid floating point precision issues
      preVatUnitAmount = Math.round(preVatUnitAmount * 100) / 100;
      preVatLineAmount = Math.round(preVatLineAmount * 100) / 100;
      
      // Ensure consistency: LineAmount = UnitAmount × Quantity
      // This is critical for Xero validation
      const calculatedLineAmount = Math.round((preVatUnitAmount * item.Quantity) * 100) / 100;
      
      // Determine the appropriate Xero tax type based on the invoice data
      let xeroTaxType = 'NONE'; // Default to no tax
      
      // Auction house specific logic: Lots and Premiums are VAT exempt
      if (item.LineType === 'Lot' || item.LineType === 'Premium') {
        // For VAT exempt auction items, use NONE instead of EXEMPTEXPENSES
        // EXEMPTEXPENSES is for specific exempt supplies, auction lots are zero-rated/exempt
        xeroTaxType = 'NONE'; // No VAT for auction lots and buyers premium
      } else if (item.TaxType === 'VAT' && item.TaxRate && item.TaxRate > 0) {
        // Map VAT rates to standard UK Xero tax types
        if (item.TaxRate === 20) {
          xeroTaxType = 'INPUT2'; // 20% VAT on Purchases (for bills/expenses)
        } else if (item.TaxRate === 5) {
          xeroTaxType = 'INPUT'; // 5% VAT on Purchases
        } else {
          // For other VAT rates, use the 20% rate as default
          xeroTaxType = 'INPUT2'; // 20% VAT on Purchases
        }
      } else if (item.TaxRate === 0 || item.TaxAmount === 0) {
        // Other VAT Exempt items - use NONE for zero-rated supplies
        xeroTaxType = 'NONE'; // No tax applicable
      } else {
        xeroTaxType = 'NONE'; // No tax applicable
      }
      
      // Log VAT processing for debugging
      console.log(`Processing line item: ${item.Description}`);
      console.log(`  LineType: ${item.LineType}, TaxRate: ${item.TaxRate}, TaxAmount: ${item.TaxAmount}`);
      console.log(`  Xero TaxType: ${xeroTaxType}, Pre-VAT Amount: ${preVatUnitAmount}`);
      console.log(`  Account Code: ${accountCode}`);
      
      return {
        Description: `${item.LineType} - ${item.LotNumber ? `Lot #${item.LotNumber}` : ''} - ${item.Description}`.trim(),
        Quantity: item.Quantity,
        UnitAmount: preVatUnitAmount,
        AccountCode: accountCode,
        LineAmount: calculatedLineAmount, // Use calculated amount to ensure consistency
        TaxType: xeroTaxType, // Add tax type for Xero
      };
    }),
  };
};

/**
 * Sends the formatted bill data to our backend proxy, which then uploads it to Xero.
 * @param invoiceData The extracted data from the invoice.
 * @param accountCode The default Xero expense account code.
 * @param originalFile The original invoice image file to attach to the Xero bill.
 * @returns A promise that resolves with a success message from the server.
 */
export const uploadBillToXero = async (invoiceData: InvoiceData, accountCode: string, originalFile?: File): Promise<string> => {
  console.log("Sending invoice data to backend proxy...");

  if (!accountCode.trim()) {
    throw new Error("Xero Account Code is required.");
  }

  const xeroBillPayload = mapToXeroBill(invoiceData, accountCode);

  // Create FormData to include both JSON and file
  const formData = new FormData();
  formData.append('billData', JSON.stringify(xeroBillPayload));
  
  if (originalFile) {
    formData.append('invoiceFile', originalFile);
    console.log("Including original invoice file:", originalFile.name);
  }

  const response = await fetch(`${PROXY_URL}/upload-bill`, {
    method: 'POST',
    body: formData, // Use FormData instead of JSON
    mode: 'cors'
  });

  const result = await response.json();

  if (!response.ok) {
    console.error("Upload failed:", response.status, response.statusText, result);
    
    // Enhanced error handling for Xero validation errors
    if (result.error && typeof result.error === 'object' && result.error.body) {
      const xeroError = result.error.body;
      if (xeroError.Elements && xeroError.Elements.length > 0) {
        const validationErrors = xeroError.Elements[0].ValidationErrors;
        if (validationErrors && validationErrors.length > 0) {
          const errorMessages = validationErrors.map(err => err.Message).join('; ');
          throw new Error(`Xero validation failed: ${errorMessages}`);
        }
      }
    }
    
    throw new Error(result.error || "Failed to upload bill via proxy.");
  }

  return `${result.message} (Invoice #: ${invoiceData.InvoiceNumber})`;
};

/**
 * Checks the connection status with the backend proxy.
 * @returns A promise that resolves with a boolean indicating the connection status.
 */
export const checkXeroConnection = async (): Promise<boolean> => {
    try {
        console.log('Checking Xero connection at:', `${PROXY_URL}/connection-status`);
        const response = await fetch(`${PROXY_URL}/connection-status`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            mode: 'cors'
        });
        console.log('Connection response status:', response.ok);
        if (!response.ok) {
            console.error('Response not ok:', response.status, response.statusText);
            return false;
        }
        const data = await response.json();
        console.log('Connection data:', data);
        return data.isConnected;
    } catch (err) {
        console.error("Failed to check Xero connection status:", err);
        return false;
    }
}

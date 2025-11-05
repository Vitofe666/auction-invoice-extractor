import type { InvoiceData, XeroBill } from '../types';

// Use environment variable for backend URL, fallback to production URL
const PROXY_URL = process.env.VITE_BACKEND_URL || 'https://vitofe666-auction-invoice-backend.onrender.com';

/**
 * Maps the extracted invoice data to the format required by the Xero API for creating a bill.
 * Note: Xero uses the 'Invoices' endpoint for both AR and AP, with the type 'ACCPAY' for bills.
 * @param invoiceData The extracted data from the invoice.
 * @param accountCode The default Xero expense account code for line items.
 * @returns A XeroBill object ready to be sent to the API.
 */
const mapToXeroBill = (invoiceData: InvoiceData, accountCode: string): XeroBill => {
  return {
    Type: 'ACCPAY',
    Contact: {
      Name: invoiceData.SupplierName,
    },
    DateString: invoiceData.InvoiceDate,
    DueDateString: invoiceData.InvoiceDate, // You might want to calculate a real due date
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
        xeroTaxType = 'EXEMPTEXPENSES'; // VAT Exempt for auction lots and premiums
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
        // Other VAT Exempt items
        xeroTaxType = 'EXEMPTEXPENSES'; // VAT Exempt for expenses
      } else {
        xeroTaxType = 'NONE'; // No tax applicable
      }
      
      // Log VAT processing for debugging
      console.log(`Processing line item: ${item.Description}`);
      console.log(`  LineType: ${item.LineType}, TaxRate: ${item.TaxRate}, TaxAmount: ${item.TaxAmount}`);
      console.log(`  Xero TaxType: ${xeroTaxType}, Pre-VAT Amount: ${preVatUnitAmount}`);
      
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

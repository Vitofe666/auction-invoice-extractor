import type { InvoiceData, XeroBill } from '../types';

// Always use the deployed backend for Xero operations
const PROXY_URL = 'https://auction-invoice-extractor-1.onrender.com';

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
      // Calculate the pre-tax unit amount and line amount
      let preVatUnitAmount: number;
      let preVatLineAmount: number;
      
      if (item.VatIncluded && item.TaxAmount && item.TaxAmount > 0) {
        // If VAT is included, calculate pre-tax amounts
        preVatLineAmount = item.LineTotal - item.TaxAmount;
        preVatUnitAmount = preVatLineAmount / item.Quantity;
      } else if (!item.VatIncluded) {
        // If VAT is not included, use amounts as-is
        preVatUnitAmount = item.UnitPrice;
        preVatLineAmount = item.LineTotal;
      } else if (item.TaxRate && item.TaxRate > 0) {
        // Calculate pre-tax amounts using tax rate
        preVatLineAmount = item.LineTotal / (1 + (item.TaxRate / 100));
        preVatUnitAmount = preVatLineAmount / item.Quantity;
      } else {
        // Fallback: assume 20% VAT is included
        preVatLineAmount = item.LineTotal / 1.2;
        preVatUnitAmount = preVatLineAmount / item.Quantity;
      }
      
      // Round to 2 decimal places to avoid floating point precision issues
      preVatUnitAmount = Math.round(preVatUnitAmount * 100) / 100;
      preVatLineAmount = Math.round(preVatLineAmount * 100) / 100;
      
      // Ensure consistency: LineAmount = UnitAmount × Quantity
      // This is critical for Xero validation
      const calculatedLineAmount = Math.round((preVatUnitAmount * item.Quantity) * 100) / 100;
      
      return {
        Description: `${item.LineType} - ${item.LotNumber ? `Lot #${item.LotNumber}` : ''} - ${item.Description}`.trim(),
        Quantity: item.Quantity,
        UnitAmount: preVatUnitAmount,
        AccountCode: accountCode,
        LineAmount: calculatedLineAmount, // Use calculated amount to ensure consistency
      };
    }),
  };
};

/**
 * Sends the formatted bill data to our backend proxy, which then uploads it to Xero.
 * @param invoiceData The extracted data from the invoice.
 * @param accountCode The default Xero expense account code.
 * @returns A promise that resolves with a success message from the server.
 */
export const uploadBillToXero = async (invoiceData: InvoiceData, accountCode: string): Promise<string> => {
  console.log("Sending invoice data to backend proxy...");

  if (!accountCode.trim()) {
    throw new Error("Xero Account Code is required.");
  }

  const xeroBillPayload = mapToXeroBill(invoiceData, accountCode);

  const response = await fetch(`${PROXY_URL}/upload-bill`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(xeroBillPayload),
  });

  const result = await response.json();

  if (!response.ok) {
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
        const response = await fetch(`${PROXY_URL}/connection-status`);
        console.log('Connection response status:', response.ok);
        if (!response.ok) return false;
        const data = await response.json();
        console.log('Connection data:', data);
        return data.isConnected;
    } catch (err) {
        console.error("Failed to check Xero connection status:", err);
        return false;
    }
}

export enum LineType {
  Lot = "Lot",
  Premium = "Premium",
  Surcharge = "Surcharge",
}

export interface LineItem {
  LineType: LineType;
  LotNumber: string;
  Description: string;
  Quantity: number;
  UnitPrice: number; // Base price before VAT
  TaxType: string | null;
  TaxRate: number | null; // Tax rate as percentage (e.g., 20 for 20%)
  TaxAmount: number | null;
  VatIncluded: boolean; // True if LineTotal includes VAT, false if VAT is to be added
  LineTotal: number; // Total amount as shown on invoice
}

export interface InvoiceData {
  InvoiceNumber: string;
  InvoiceDate: string; // YYYY-MM-DD
  SupplierName: string;
  TotalAmount: number;
  Currency: string;
  LineItems: LineItem[];
}

// Xero API specific types
export interface XeroContact {
  Name: string;
}

export interface XeroLineItem {
  Description: string;
  Quantity: number;
  UnitAmount: number;
  AccountCode: string;
  LineAmount: number;
}

export interface XeroBill {
  Type: 'ACCPAY';
  Contact: XeroContact;
  DateString: string;
  DueDateString?: string;
  InvoiceNumber: string;
  CurrencyCode: string;
  Status: 'DRAFT';
  LineItems: XeroLineItem[];
}
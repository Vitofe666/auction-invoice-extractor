import { InvoiceData, LineItem, LineType } from "../types";

type PartialInvoiceData = Partial<InvoiceData> & {
  LineItems?: Array<Partial<LineItem> | null | undefined> | null;
};

const isLineType = (value: unknown): value is LineType =>
  typeof value === "string" && Object.values(LineType).includes(value as LineType);

const toNumber = (value: unknown, fallback: number = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const toStringValue = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const toBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : fallback;

const normalizeLineItem = (item: Partial<LineItem> | null | undefined): LineItem => ({
  LineType: isLineType(item?.LineType) ? item!.LineType : LineType.Lot,
  LotNumber: toStringValue(item?.LotNumber, ""),
  Description: toStringValue(item?.Description, ""),
  Quantity: toNumber(item?.Quantity, 1),
  UnitPrice: toNumber(item?.UnitPrice, 0),
  TaxType: item?.TaxType && typeof item.TaxType === "string" ? item.TaxType : null,
  TaxRate: toNullableNumber(item?.TaxRate),
  TaxAmount: toNullableNumber(item?.TaxAmount),
  VatIncluded: toBoolean(item?.VatIncluded, false),
  LineTotal: toNumber(item?.LineTotal, 0),
});

export const normalizeInvoiceData = (payload: PartialInvoiceData | null | undefined): InvoiceData => ({
  InvoiceNumber: toStringValue(payload?.InvoiceNumber, ""),
  InvoiceDate: toStringValue(payload?.InvoiceDate, ""),
  SupplierName: toStringValue(payload?.SupplierName, ""),
  TotalAmount: toNumber(payload?.TotalAmount, 0),
  Currency: toStringValue(payload?.Currency, ""),
  LineItems: Array.isArray(payload?.LineItems)
    ? payload!.LineItems.filter(Boolean).map(normalizeLineItem)
    : [],
});

export default normalizeInvoiceData;

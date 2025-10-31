
import React from 'react';
import type { InvoiceData } from '../types';

interface DataDisplayProps {
  data: InvoiceData;
}

const DataDisplay: React.FC<DataDisplayProps> = ({ data }) => {
  const formatCurrency = (amount: number | null | undefined, currency: string) => {
    if (amount === null || amount === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency }).format(amount);
  };

  return (
    <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
      <h3 className="text-xl font-bold text-cyan-400 mb-6">Invoice Summary</h3>

      {/* Header Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <InfoCard label="Supplier" value={data.SupplierName} />
        <InfoCard label="Invoice Number" value={data.InvoiceNumber} />
        <InfoCard label="Invoice Date" value={data.InvoiceDate} />
        <InfoCard label="Total Amount" value={formatCurrency(data.TotalAmount, data.Currency)} isHighlighted={true} />
      </div>

      {/* Line Items Table */}
      <h4 className="text-lg font-semibold text-gray-300 mb-4">Line Items</h4>
      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="w-full text-sm text-left text-gray-300">
          <thead className="text-xs text-cyan-300 uppercase bg-gray-700">
            <tr>
              <th scope="col" className="px-4 py-3">Type</th>
              <th scope="col" className="px-4 py-3">Lot #</th>
              <th scope="col" className="px-4 py-3">Description</th>
              <th scope="col" className="px-4 py-3 text-right">Unit Price</th>
              <th scope="col" className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.LineItems.map((item, index) => (
              <tr key={index} className="border-b border-gray-700 hover:bg-gray-700/50 transition-colors">
                <td className="px-4 py-3 font-medium whitespace-nowrap">{item.LineType}</td>
                <td className="px-4 py-3">{item.LotNumber || '–'}</td>
                <td className="px-4 py-3 min-w-[200px]">{item.Description}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(item.UnitPrice, data.Currency)}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatCurrency(item.LineTotal, data.Currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const InfoCard: React.FC<{label: string, value: string, isHighlighted?: boolean}> = ({label, value, isHighlighted = false}) => (
    <div className={`p-4 rounded-lg ${isHighlighted ? 'bg-cyan-900/50' : 'bg-gray-700/50'}`}>
        <p className="text-sm text-gray-400">{label}</p>
        <p className={`font-bold text-lg truncate ${isHighlighted ? 'text-cyan-300' : 'text-gray-100'}`}>{value}</p>
    </div>
)


export default DataDisplay;

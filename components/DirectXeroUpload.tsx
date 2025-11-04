import React, { useState } from 'react';
import { uploadBillToXero } from '../services/xeroService';
import type { InvoiceData } from '../types';
import { CheckCircleIcon } from './icons';
import Loader from './Loader';

interface DirectXeroUploadProps {
  invoiceData: InvoiceData | null;
  originalFile?: File;
}

const DirectXeroUpload: React.FC<DirectXeroUploadProps> = ({ invoiceData, originalFile }) => {
  const [accountCode, setAccountCode] = useState<string>('429');
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleUploadToXero = async () => {
    if (!invoiceData) {
      setStatusMessage({ type: 'error', text: 'No invoice data available. Please extract data first in Step 3.' });
      return;
    }

    if (!accountCode.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter an account code.' });
      return;
    }

    setIsUploading(true);
    setStatusMessage(null);

    try {
      const successMessage = await uploadBillToXero(invoiceData, accountCode, originalFile);
      setStatusMessage({ type: 'success', text: successMessage });
    } catch (err) {
      setStatusMessage({ 
        type: 'error', 
        text: err instanceof Error ? err.message : 'Failed to upload to Xero' 
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 mt-6">
      <h3 className="text-xl font-bold text-cyan-400 mb-4">5. Quick Upload JSON to Xero</h3>
      
      {!invoiceData ? (
        <div className="text-center py-8">
          <p className="text-gray-400 mb-4">📋 No extracted data available</p>
          <p className="text-sm text-gray-500">
            Complete Steps 1-3 to extract invoice data, then use this section to upload the JSON data to Xero.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-gray-700/50 p-4 rounded-lg">
            <h4 className="font-semibold text-green-400 mb-2">✅ JSON Data Ready for Upload</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Invoice #:</span>
                <span className="ml-2 text-white">{invoiceData.InvoiceNumber}</span>
              </div>
              <div>
                <span className="text-gray-400">Supplier:</span>
                <span className="ml-2 text-white">{invoiceData.SupplierName}</span>
              </div>
              <div>
                <span className="text-gray-400">Date:</span>
                <span className="ml-2 text-white">{invoiceData.InvoiceDate}</span>
              </div>
              <div>
                <span className="text-gray-400">Total:</span>
                <span className="ml-2 text-white">{invoiceData.Currency} {invoiceData.TotalAmount}</span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-400">Line Items:</span>
                <span className="ml-2 text-white">{invoiceData.LineItems.length} items</span>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="accountCode" className="block text-sm font-medium text-gray-300 mb-1">
              Default Expense Account Code
            </label>
            <input
              type="text"
              id="accountCode"
              value={accountCode}
              onChange={(e) => setAccountCode(e.target.value)}
              placeholder="e.g., 429 for General Expenses"
              className="block w-full bg-gray-900 border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm p-2"
              disabled={isUploading}
            />
          </div>

          {originalFile && (
            <div className="bg-blue-900/30 p-3 rounded-lg">
              <p className="text-sm text-blue-300">
                📎 <strong>File attachment ready:</strong> {originalFile.name}
              </p>
              <p className="text-xs text-blue-400 mt-1">
                The original invoice file will be attached to the Xero bill
              </p>
            </div>
          )}

          <button
            onClick={handleUploadToXero}
            disabled={!accountCode || isUploading}
            className="w-full flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-gray-900 bg-cyan-400 hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 focus:ring-offset-gray-900 transition-all duration-300"
          >
            {isUploading ? (
              <>
                <Loader />
                <span className="ml-2">Uploading to Xero{originalFile ? ' with attachment' : ''}...</span>
              </>
            ) : (
              `📤 Upload JSON${originalFile ? ' + File' : ''} to Xero`
            )}
          </button>

          {statusMessage && (
            <div className={`mt-4 p-3 rounded-md text-sm ${
              statusMessage.type === 'success' 
                ? 'bg-green-900/50 text-green-300' 
                : 'bg-red-900/50 text-red-300'
            }`}>
              {statusMessage.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DirectXeroUpload;
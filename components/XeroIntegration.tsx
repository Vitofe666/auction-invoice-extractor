import React, { useState, useEffect } from 'react';
import { uploadBillToXero, checkXeroConnection } from '../services/xeroService';
import type { InvoiceData } from '../types';
import { ExternalLinkIcon, CheckCircleIcon } from './icons';
import Loader from './Loader';

interface XeroIntegrationProps {
  invoiceData: InvoiceData;
}

const XeroIntegration: React.FC<XeroIntegrationProps> = ({ invoiceData }) => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState<boolean>(true);
  const [accountCode, setAccountCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // Check connection status when the component mounts or invoice data changes
    const verifyConnection = async () => {
      setIsCheckingStatus(true);
      const status = await checkXeroConnection();
      setIsConnected(status);
      setIsCheckingStatus(false);
    };
    
    verifyConnection();
    setStatusMessage(null); // Reset status on new data
  }, [invoiceData]);
  
  const handleUpload = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const successMessage = await uploadBillToXero(invoiceData, accountCode);
      setStatusMessage({ type: 'success', text: successMessage });
    } catch (err) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'An unknown error occurred.' });
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingStatus) {
    return (
        <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 mt-6 text-center">
            <Loader />
            <p className="mt-2 text-gray-400">Checking Xero connection...</p>
        </div>
    );
  }

  return (
    <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 mt-6">
      <h3 className="text-xl font-bold text-cyan-400 mb-4">4. Upload to Xero</h3>
      {!isConnected ? (
        <div className="text-center">
          <p className="text-gray-400 mb-4">Connect your Xero account to upload this invoice as a bill.</p>
          <a
            href="http://localhost:3002/connect"
            className="inline-flex items-center px-6 py-2 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-gray-900 transition-colors"
          >
            <ExternalLinkIcon className="w-5 h-5 mr-2" />
            Connect to Xero
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center p-3 rounded-md bg-green-900/50 text-green-300">
            <CheckCircleIcon className="w-6 h-6 mr-3" />
            <p className="font-semibold">Connected to Xero</p>
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
              disabled={isLoading}
            />
          </div>
          <button
            onClick={handleUpload}
            disabled={!accountCode || isLoading}
            className="w-full flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-gray-900 bg-cyan-400 hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 focus:ring-offset-gray-900 transition-all duration-300"
          >
            {isLoading ? (
              <>
                <Loader />
                <span className="ml-2">Uploading...</span>
              </>
            ) : (
              'Upload to Xero as Draft Bill'
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

export default XeroIntegration;

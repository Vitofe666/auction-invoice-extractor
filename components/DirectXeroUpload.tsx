import React, { useState } from 'react';
import { extractInvoiceData } from '../services/geminiService';
import { uploadBillToXero } from '../services/xeroService';
import type { InvoiceData } from '../types';
import { UploadCloudIcon, CheckCircleIcon } from './icons';
import Loader from './Loader';
import DataDisplay from './DataDisplay';
import JsonViewer from './JsonViewer';

const DirectXeroUpload: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState<InvoiceData | null>(null);
  const [accountCode, setAccountCode] = useState<string>('429');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [step, setStep] = useState<'upload' | 'extract' | 'review' | 'complete'>('upload');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setStep('extract');
      setStatusMessage(null);
    }
  };

  const handleExtractAndUpload = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setStatusMessage(null);

    try {
      // Step 1: Extract data from image
      setStep('extract');
      const data = await extractInvoiceData(selectedFile);
      setExtractedData(data);
      setStep('review');

      // Step 2: Upload to Xero automatically
      setTimeout(async () => {
        try {
          const successMessage = await uploadBillToXero(data, accountCode);
          setStatusMessage({ type: 'success', text: successMessage });
          setStep('complete');
        } catch (err) {
          setStatusMessage({ 
            type: 'error', 
            text: err instanceof Error ? err.message : 'Failed to upload to Xero' 
          });
        } finally {
          setIsProcessing(false);
        }
      }, 1000); // Small delay to show the extracted data

    } catch (err) {
      setStatusMessage({ 
        type: 'error', 
        text: err instanceof Error ? err.message : 'Failed to extract data from image' 
      });
      setIsProcessing(false);
    }
  };

  const resetUpload = () => {
    setSelectedFile(null);
    setExtractedData(null);
    setStatusMessage(null);
    setStep('upload');
    setIsProcessing(false);
  };

  return (
    <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 mt-6">
      <h3 className="text-xl font-bold text-cyan-400 mb-4">5. Quick Upload to Xero</h3>
      
      {step === 'upload' && (
        <div className="space-y-4">
          <p className="text-gray-400 mb-4">Upload an invoice image and it will be automatically processed and sent to Xero.</p>
          
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
              className="block w-full bg-gray-900 border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm p-2 mb-4"
            />
          </div>

          <label className="relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-cyan-500 hover:bg-gray-700/50 transition-colors">
            <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
              <UploadCloudIcon className="w-8 h-8 mb-2 text-gray-400" />
              <p className="mb-2 text-sm text-gray-400">
                <span className="font-semibold text-cyan-400">Click to upload invoice</span>
              </p>
              <p className="text-xs text-gray-500">PDF, PNG, JPG up to 10MB</p>
            </div>
            <input 
              type="file" 
              className="hidden"
              onChange={handleFileSelect}
              accept="image/png, image/jpeg, image/gif, application/pdf"
            />
          </label>
        </div>
      )}

      {(step === 'extract' || step === 'review') && selectedFile && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-cyan-400">Selected File:</h4>
              <p className="text-sm text-gray-300">{selectedFile.name}</p>
            </div>
            <button
              onClick={resetUpload}
              className="text-sm text-gray-400 hover:text-white transition-colors"
              disabled={isProcessing}
            >
              Change File
            </button>
          </div>

          {step === 'extract' && (
            <div className="text-center">
              <button
                onClick={handleExtractAndUpload}
                disabled={!accountCode || isProcessing}
                className="w-full flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-gray-900 bg-cyan-400 hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 focus:ring-offset-gray-900 transition-all duration-300"
              >
                {isProcessing ? (
                  <>
                    <Loader />
                    <span className="ml-2">Processing & Uploading...</span>
                  </>
                ) : (
                  'Extract Data & Upload to Xero'
                )}
              </button>
            </div>
          )}

          {isProcessing && step === 'extract' && (
            <div className="text-center">
              <Loader />
              <p className="mt-2 text-sm text-gray-400">Extracting invoice data...</p>
            </div>
          )}

          {extractedData && step === 'review' && (
            <div className="space-y-4">
              <div className="text-center">
                <Loader />
                <p className="mt-2 text-sm text-gray-400">Uploading to Xero...</p>
              </div>
              <DataDisplay data={extractedData} />
              <JsonViewer data={{ InvoiceData: extractedData }} />
            </div>
          )}
        </div>
      )}

      {step === 'complete' && extractedData && (
        <div className="space-y-4">
          <div className="flex items-center p-3 rounded-md bg-green-900/50 text-green-300">
            <CheckCircleIcon className="w-6 h-6 mr-3" />
            <p className="font-semibold">Successfully uploaded to Xero!</p>
          </div>
          
          <DataDisplay data={extractedData} />
          
          <button
            onClick={resetUpload}
            className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm transition-colors"
          >
            Upload Another Invoice
          </button>
        </div>
      )}

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
  );
};

export default DirectXeroUpload;
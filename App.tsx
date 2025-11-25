import React, { useState, useCallback } from 'react';
import type { InvoiceData } from './types';
import { extractInvoiceData } from './services/geminiService';
import Header from './components/Header';
import FileUpload from './components/FileUpload';
import DataDisplay from './components/DataDisplay';
import JsonViewer from './components/JsonViewer';
import Loader from './components/Loader';
import XeroIntegration from './components/XeroIntegration';
import { ImageIcon, AlertTriangleIcon, FileTextIcon } from './components/icons';

interface InvoiceItem {
  file: File;
  data: InvoiceData | null;
  error: string | null;
  isProcessing: boolean;
}

const normalizeBaseUrl = (url: string | undefined): string => {
  if (!url) return '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
};

// OLD:
// const configuredBackend = normalizeBaseUrl(import.meta.env?.VITE_BACKEND_URL as string | undefined);
// const extractEndpoint = configuredBackend ? `${configuredBackend}/api/extract-invoice` : '/api/extract-invoice';

// NEW: use a Gemini-specific env var
const configuredGeminiBackend = normalizeBaseUrl(
  import.meta.env?.VITE_GEMINI_BACKEND_URL as string | undefined
);
const extractEndpoint = configuredGeminiBackend
  ? `${configuredGeminiBackend}/api/extract-invoice`
  : '/api/extract-invoice';

const App: React.FC = () => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<InvoiceData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState<boolean>(false);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);

  const handleFileChange = (fileOrFiles: File | File[]) => {
    console.log('App.tsx - handleFileChange called with:', fileOrFiles);
    
    if (Array.isArray(fileOrFiles)) {
      // Batch mode
      console.log('App.tsx - Batch mode activated with', fileOrFiles.length, 'files');
      setBatchMode(true);
      setInvoiceItems(fileOrFiles.map(file => ({
        file,
        data: null,
        error: null,
        isProcessing: false
      })));
      setImageFile(null);
      setExtractedData(null);
      setError(null);
    } else if (fileOrFiles) {
      // Single mode
      console.log('App.tsx - Single mode activated with file:', fileOrFiles.name, fileOrFiles.type);
      setBatchMode(false);
      setInvoiceItems([]);
      setImageFile(fileOrFiles);
      if (fileOrFiles.type.startsWith('image/')) {
        setPreviewUrl(URL.createObjectURL(fileOrFiles));
      } else {
        setPreviewUrl(null);
      }
      setExtractedData(null);
      setError(null);
    }
  };

  const handleExtract = useCallback(async () => {
    if (batchMode && invoiceItems.length > 0) {
      // Batch processing
      setIsLoading(true);
      setError(null);
      
      for (let i = 0; i < invoiceItems.length; i++) {
        setInvoiceItems(prev => prev.map((item, idx) => 
          idx === i ? { ...item, isProcessing: true } : item
        ));
        
        try {
          const data = await extractInvoiceData(invoiceItems[i].file, extractEndpoint);
          setInvoiceItems(prev => prev.map((item, idx) => 
            idx === i ? { ...item, data, isProcessing: false } : item
          ));
        } catch (err) {
          console.error(err);
          setInvoiceItems(prev => prev.map((item, idx) => 
            idx === i ? { 
              ...item, 
              error: err instanceof Error ? err.message : "Extraction failed",
              isProcessing: false 
            } : item
          ));
        }
      }
      
      setIsLoading(false);
    } else if (!batchMode && imageFile) {
      // Single file processing
      setIsLoading(true);
      setError(null);
      setExtractedData(null);

      try {
        const data = await extractInvoiceData(imageFile, extractEndpoint);
        setExtractedData(data);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "An unknown error occurred during data extraction.");
      } finally {
        setIsLoading(false);
      }
    } else {
      setError("Please select file(s) first.");
    }
  }, [imageFile, batchMode, invoiceItems]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col font-sans">
      <Header />
      <main className="flex-grow container mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Input */}
        <div className="flex flex-col space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-cyan-400">1. Upload Invoice (Image or PDF)</h2>
            <label className="flex items-center space-x-2 text-sm">
              <input 
                type="checkbox" 
                checked={batchMode} 
                onChange={(e) => {
                  setBatchMode(e.target.checked);
                  if (!e.target.checked) {
                    setInvoiceItems([]);
                  } else {
                    setImageFile(null);
                    setExtractedData(null);
                  }
                }}
                disabled={isLoading}
                className="w-4 h-4"
              />
              <span className="text-gray-300">Batch Mode (Multiple Files)</span>
            </label>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <FileUpload onFileSelect={handleFileChange} disabled={isLoading} multiple={batchMode} />
          </div>
          {batchMode && invoiceItems.length > 0 && (
            <div className="mt-4 flex flex-col bg-gray-800 p-4 rounded-lg shadow-lg">
              <h3 className="text-lg font-semibold mb-4 text-gray-300">Files Selected: {invoiceItems.length}</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {invoiceItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-gray-700 rounded text-sm">
                    <span className="truncate flex-1">{item.file.name}</span>
                    {item.isProcessing && <span className="text-yellow-400 text-xs ml-2">Processing...</span>}
                    {item.data && <span className="text-green-400 text-xs ml-2">✓ Extracted</span>}
                    {item.error && <span className="text-red-400 text-xs ml-2">✗ Failed</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {!batchMode && imageFile && (
            <div className="mt-4 flex flex-col bg-gray-800 p-4 rounded-lg shadow-lg">
              <h3 className="text-lg font-semibold mb-4 text-gray-300">File Preview</h3>
              <div className="relative w-full h-96 rounded-md border-2 border-gray-700 flex items-center justify-center p-2">
                {imageFile.type.startsWith('image/') && previewUrl ? (
                  <img src={previewUrl} alt="Invoice preview" className="max-w-full max-h-full object-contain" />
                ) : (
                  <div className="text-center text-gray-400 flex flex-col items-center">
                    <FileTextIcon className="w-24 h-24 text-gray-500" />
                    <p className="mt-4 font-semibold break-all">{imageFile.name}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="mt-6">
            <button
              onClick={handleExtract}
              disabled={(!imageFile && invoiceItems.length === 0) || isLoading}
              className="w-full flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-gray-900 bg-cyan-400 hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 focus:ring-offset-gray-900 transition-all duration-300"
            >
              {isLoading ? `Extracting Data... ${invoiceItems.filter(i => i.data || i.error).length}/${invoiceItems.length}` : '2. Extract Data'}
            </button>
          </div>
        </div>

        {/* Right Column: Output */}
        <div className="flex flex-col space-y-6">
          <h2 className="text-2xl font-bold text-cyan-400">3. Extracted Data</h2>
          <div className="bg-gray-800 rounded-lg shadow-lg min-h-[600px] flex flex-col p-6 relative">
            {isLoading && (
              <div className="absolute inset-0 bg-gray-800 bg-opacity-75 flex flex-col justify-center items-center rounded-lg z-10">
                <Loader />
                <p className="mt-4 text-lg font-semibold text-cyan-400">Analyzing Invoice...</p>
              </div>
            )}
            {!isLoading && !extractedData && !error && invoiceItems.length === 0 && (
              <div className="m-auto text-center text-gray-500">
                <ImageIcon className="mx-auto h-16 w-16" />
                <p className="mt-4 text-lg">Upload an invoice image or PDF and click "Extract Data" to see the results here.</p>
              </div>
            )}
            {!isLoading && batchMode && invoiceItems.length > 0 && (
              <div className="space-y-4 overflow-y-auto">
                {invoiceItems.map((item, idx) => (
                  <div key={idx} className="border border-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-cyan-400 truncate">{item.file.name}</h3>
                      {item.isProcessing && <span className="text-yellow-400 text-sm">Processing...</span>}
                      {item.data && <span className="text-green-400 text-sm">✓ Success</span>}
                      {item.error && <span className="text-red-400 text-sm">✗ Failed</span>}
                    </div>
                    {item.data && (
                      <div className="mt-2 space-y-4">
                        <DataDisplay data={item.data} />
                        <JsonViewer 
                          data={{ InvoiceData: item.data }} 
                          editable={true}
                          onDataChange={(newData) => {
                            if (newData.InvoiceData) {
                              setInvoiceItems(prev => prev.map((prevItem, i) => 
                                i === idx ? { ...prevItem, data: newData.InvoiceData } : prevItem
                              ));
                            }
                          }}
                        />
                        <XeroIntegration invoiceData={item.data} originalFile={item.file} />
                      </div>
                    )}
                    {item.error && (
                      <p className="text-red-300 text-sm mt-2">{item.error}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {error && (
              <div className="m-auto text-center text-red-400">
                <AlertTriangleIcon className="mx-auto h-16 w-16" />
                <p className="mt-4 text-lg font-semibold">Extraction Failed</p>
                <p className="text-sm text-red-300 mt-2">{error}</p>
              </div>
            )}
            {extractedData && (
              <div className="flex flex-col space-y-6 overflow-y-auto">
                <DataDisplay data={extractedData} />
                <JsonViewer 
                  data={{ InvoiceData: extractedData }} 
                  editable={true}
                  onDataChange={(newData) => {
                    if (newData.InvoiceData) {
                      setExtractedData(newData.InvoiceData);
                    }
                  }}
                />
                <XeroIntegration invoiceData={extractedData} originalFile={imageFile} />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;

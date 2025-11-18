import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { InvoiceData, LineType } from '../types';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Example Express Server with Request Logging and Static Asset Serving
 * 
 * This example demonstrates:
 * - Request logging middleware (logs method, path, and key headers)
 * - Serving static files from a public directory with correct MIME types
 * - POST /api/extract-invoice endpoint using multer (memory storage)
 * - Robust error handling with JSON responses
 * 
 * Usage:
 * 1. Build: npx tsc examples/server.ts --outDir dist/examples --esModuleInterop --moduleResolution node --module commonjs
 * 2. Run: node dist/examples/server.js
 * 
 * Or with tsx for development:
 * npx tsx examples/server.ts
 */

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const path = req.path;
  
  // Log key headers
  const headers = {
    'content-type': req.get('content-type'),
    'content-length': req.get('content-length'),
    'user-agent': req.get('user-agent'),
  };
  
  console.log(`[${timestamp}] ${method} ${path}`);
  console.log('  Headers:', JSON.stringify(headers, null, 2));
  
  next();
});

// Parse JSON bodies
app.use(express.json());

// Serve static files from 'public' directory with correct MIME types
// express.static automatically sets correct Content-Type headers based on file extensions
const publicPath = path.join(__dirname, '..', 'public');
console.log(`Serving static files from: ${publicPath}`);
app.use(express.static(publicPath));

/**
 * Placeholder function to simulate invoice processing
 * 
 * TODO: Replace this with actual invoice extraction logic using Gemini API or other service
 * 
 * @param imageBuffer - The uploaded image buffer
 * @param mimeType - The MIME type of the uploaded image
 * @returns Promise<InvoiceData> - Simulated invoice data
 */
async function processImageBuffer(imageBuffer: Buffer, mimeType: string): Promise<InvoiceData> {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Return simulated invoice data
  const simulatedInvoice: InvoiceData = {
    InvoiceNumber: 'INV-2024-001',
    InvoiceDate: '2024-01-15',
    SupplierName: 'Example Auction House',
    TotalAmount: 1440.00,
    Currency: 'GBP',
    LineItems: [
      {
        LineType: LineType.Lot,
        LotNumber: '123',
        Description: 'Antique Vase',
        Quantity: 1,
        UnitPrice: 1000.00,
        TaxType: null,
        TaxRate: 0,
        TaxAmount: 0,
        VatIncluded: false,
        LineTotal: 1000.00,
      },
      {
        LineType: LineType.Premium,
        LotNumber: '123',
        Description: 'Buyers Premium (20%)',
        Quantity: 1,
        UnitPrice: 200.00,
        TaxType: null,
        TaxRate: 0,
        TaxAmount: 0,
        VatIncluded: false,
        LineTotal: 200.00,
      },
      {
        LineType: LineType.Surcharge,
        LotNumber: '123',
        Description: 'Live Bidding Surcharge',
        Quantity: 1,
        UnitPrice: 200.00,
        TaxType: 'VAT',
        TaxRate: 20,
        TaxAmount: 40.00,
        VatIncluded: false,
        LineTotal: 240.00,
      },
    ],
  };
  
  console.log(`  Processed image: ${imageBuffer.length} bytes, type: ${mimeType}`);
  console.log(`  Returning simulated invoice data for: ${simulatedInvoice.InvoiceNumber}`);
  
  return simulatedInvoice;
}

/**
 * POST /api/extract-invoice
 * 
 * Accepts multipart/form-data with field name "image"
 * Returns extracted invoice data as JSON
 */
app.post('/api/extract-invoice', upload.single('image'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('  POST /api/extract-invoice - Processing request...');
    
    if (!req.file) {
      console.log('  ERROR: No file uploaded');
      return res.status(400).json({ 
        error: 'No file uploaded',
        details: 'Please provide an image file using the field name "image"'
      });
    }
    
    console.log(`  File received: ${req.file.originalname}`);
    console.log(`  File size: ${req.file.size} bytes`);
    console.log(`  MIME type: ${req.file.mimetype}`);
    
    // Process the image buffer
    const invoiceData = await processImageBuffer(req.file.buffer, req.file.mimetype);
    
    console.log('  SUCCESS: Invoice data extracted');
    
    // Return the extracted data as JSON
    return res.json(invoiceData);
    
  } catch (error) {
    console.error('  ERROR in /api/extract-invoice:', error);
    next(error);
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * Catch-all route for undefined endpoints
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    message: `The requested endpoint ${req.method} ${req.path} does not exist`
  });
});

/**
 * Central error handler - always returns JSON
 */
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error handler caught:', err);
  
  // Check if response has already been sent
  if (res.headersSent) {
    return next(err);
  }
  
  // Handle multer errors
  if (err instanceof multer.MulterError) {
    if ((err as any).code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'File too large',
        details: 'Maximum file size is 10MB'
      });
    }
    return res.status(400).json({
      error: 'File upload error',
      details: err.message
    });
  }
  
  // Handle general errors
  res.status(500).json({
    error: 'Internal server error',
    details: err.message || 'An unexpected error occurred'
  });
});

/**
 * Start the server
 */
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`Example Express Server is running on port ${PORT}`);
  console.log('='.repeat(60));
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API endpoint: POST http://localhost:${PORT}/api/extract-invoice`);
  console.log(`Static files: http://localhost:${PORT}/ (from ./public directory)`);
  console.log('='.repeat(60));
  console.log('');
  console.log('To test the API endpoint:');
  console.log(`curl -X POST -F "image=@path/to/invoice.jpg" http://localhost:${PORT}/api/extract-invoice`);
  console.log('');
});

export default app;

require('dotenv').config();
var express = require('express');
var cors = require('cors');
var crypto = require('crypto');
var multer = require('multer');
var { XeroClient } = require('xero-node');
var { formatDateForXero } = require('./utils/dateUtils');
var app = express();

console.log('Starting server setup...');

// Configure multer for file uploads (store in memory)
const upload = multer({ 
   storage: multer.memoryStorage(),
   limits: {
      fileSize: 10 * 1024 * 1024 // 10MB limit
   }
});

// Validate environment variables
console.log('Environment variables check:');
console.log('XERO_CLIENT_ID:', process.env.XERO_CLIENT_ID ? '✓ Set' : '❌ Missing');
console.log('XERO_CLIENT_SECRET:', process.env.XERO_CLIENT_SECRET ? '✓ Set' : '❌ Missing');
console.log('XERO_REDIRECT_URI:', process.env.XERO_REDIRECT_URI || '❌ Missing');
console.log('XERO_WEBHOOK_KEY:', process.env.XERO_WEBHOOK_KEY ? '✓ Set' : '❌ Missing');

// Initialize Xero client
const xero = new XeroClient({
   clientId: process.env.XERO_CLIENT_ID,
   clientSecret: process.env.XERO_CLIENT_SECRET,
   redirectUris: [process.env.XERO_REDIRECT_URI],
   scopes: 'openid profile email accounting.transactions accounting.contacts accounting.attachments offline_access'.split(' ')
});

console.log('✓ Xero client initialized');

// Store tokens in memory (for demo - use a database in production)
let tokenSet = null;
let activeTenantId = null;

// Enable CORS for all routes
app.use(cors({
   origin: [
      'http://localhost:5173', 
      'http://localhost:3000',
      'https://vitofe666-auction-frontend.onrender.com',
      'https://auction-invoice-extractor.onrender.com',
      'https://auction-invoice-frontend.onrender.com',
      /\.onrender\.com$/
   ],
   credentials: true,
   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
   allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Capture raw body for webhook signature verification.
// IMPORTANT: do not modify the raw body before computing the signature.
app.use(express.json({
   verify: function (req, _res, buf) {
      req.rawBody = buf;
   }
}));

// Also capture raw body for urlencoded payloads (if any)
app.use(express.urlencoded({ extended: true, verify: function (req, _res, buf) { req.rawBody = buf; } }));

const port = process.env.PORT || 3002;

// Xero webhook endpoint
// Simple in-memory queue for background processing (for demo only)
const eventQueue = [];

app.post('/api/webhooks/xero', function (req, res) {
   console.log("-------------- New Xero Webhook --------------");

   // Xero sends signature in header 'X-Xero-Signature' (base64)
   const xeroSignature = req.headers['x-xero-signature'];
   const signingKey = process.env.XERO_WEBHOOK_KEY;

   console.log('Signature present:', !!xeroSignature);
   console.log('Signing key present:', !!signingKey);
   if (signingKey) {
      console.log('Signing key length:', signingKey.length);
   }

   // Signature verification is REQUIRED for Xero webhooks
   if (!xeroSignature) {
      console.error('No X-Xero-Signature header present; returning 401');
      return res.status(401).json({ error: 'Missing signature' });
   }

   if (!signingKey) {
      console.error('XERO_WEBHOOK_KEY not set; returning 401');
      return res.status(401).json({ error: 'Webhook key not configured' });
   }

   if (!req.rawBody) {
      console.error('Raw body not available for signature verification');
      return res.status(401).json({ error: 'Raw body unavailable for signature verification' });
   }

   // Verify the signature
   try {
      const computed = crypto.createHmac('sha256', signingKey).update(req.rawBody).digest('base64');
      if (computed !== xeroSignature) {
         console.warn('Signature mismatch. Computed:', computed, 'Received:', xeroSignature);
         return res.status(401).json({ error: 'Invalid signature' });
      }
      console.log('✓ Signature verified successfully');
   } catch (err) {
      console.error('Error computing signature:', err);
      return res.status(500).json({ error: 'Signature verification error' });
   }

   // Log headers and body (for debugging)
   console.log('Headers:', JSON.stringify(req.headers, null, 2));
   console.log('Webhook Raw Body:', req.rawBody ? req.rawBody.toString('utf8') : '<no raw body>');
   console.log('Parsed Body:', JSON.stringify(req.body, null, 2));

   // Acknowledge receipt quickly (Xero expects 200 within a short time)
   res.status(200).json({ status: 'received' });

   // Queue the event for background processing to keep the webhook response fast
   try {
      eventQueue.push({ receivedAt: Date.now(), headers: req.headers, body: req.body });
   } catch (err) {
      console.error('Failed to queue event:', err);
   }
});

// OAuth: Start authentication
app.get('/connect', async function (req, res) {
   try {
      const consentUrl = await xero.buildConsentUrl();
      res.redirect(consentUrl);
   } catch (err) {
      console.error('Error building consent URL:', err);
      res.status(500).send('Error initiating Xero authentication');
   }
});

// OAuth: Callback handler
app.get('/callback', async function (req, res) {
   console.log("-------------- OAuth Callback --------------");
   console.log('Request URL:', req.url);
   console.log('Query params:', req.query);
   
   try {
      console.log('Attempting Xero API callback...');
      tokenSet = await xero.apiCallback(req.url);
      console.log('✓ Token set received:', !!tokenSet);
      
      console.log('Updating tenants...');
      await xero.updateTenants();
      
      const tenants = xero.tenants;
      console.log('Available tenants:', tenants.length);
      
      if (tenants.length > 0) {
         activeTenantId = tenants[0].tenantId;
         console.log('✓ Connected to Xero tenant:', tenants[0].tenantName);
         console.log('✓ Tenant ID:', activeTenantId);
      } else {
         console.warn('⚠ No tenants found');
      }
      
      res.send('<h1>Successfully connected to Xero!</h1><p>You can close this window and return to your app.</p>');
   } catch (err) {
      console.error('❌ Error in OAuth callback:', err);
      console.error('Error details:', {
         message: err.message,
         stack: err.stack,
         response: err.response?.data || 'No response data'
      });
      res.status(500).send(`Error completing Xero authentication: ${err.message}`);
   }
});

// Handle bill upload from frontend (with optional file attachment)
app.post('/upload-bill', upload.single('invoiceFile'), async function (req, res) {
   console.log("-------------- New Bill Upload Request --------------");
   
   // Parse the bill data from form data
   let billData;
   try {
      billData = JSON.parse(req.body.billData);
      console.log("Bill Data:", JSON.stringify(billData, null, 2));
   } catch (err) {
      console.error("Error parsing bill data:", err);
      return res.status(400).json({ error: 'Invalid bill data format' });
   }
   
   // Log file info if present
   if (req.file) {
      console.log("File attachment:", {
         originalName: req.file.originalname,
         mimeType: req.file.mimetype,
         size: req.file.size
      });
   }
   
   // Check if connected to Xero
   if (!tokenSet || !activeTenantId) {
      return res.status(401).json({ 
         error: 'Not connected to Xero. Please authenticate first.',
         needsAuth: true
      });
   }
   
   try {
      // Refresh token if needed
      await xero.refreshToken();
      
      // Normalize dates to ISO format (YYYY-MM-DD) for Xero API compatibility
      const normalizedDateString = formatDateForXero(billData.DateString);
      const normalizedDueDateString = formatDateForXero(billData.DueDateString);
      
      // Prepare the invoice data in Xero's expected format
      const invoice = {
         type: billData.Type || 'ACCPAY',
         contact: {
            name: billData.Contact?.Name || billData.Contact?.name
         },
         date: normalizedDateString,
         dueDate: normalizedDueDateString,
         invoiceNumber: billData.InvoiceNumber,
         currencyCode: billData.CurrencyCode || 'GBP',
         status: billData.Status || 'DRAFT',
         lineItems: billData.LineItems?.map(item => ({
            description: item.Description,
            quantity: item.Quantity,
            unitAmount: item.UnitAmount,
            accountCode: item.AccountCode,
            lineAmount: item.LineAmount,
            taxType: item.TaxType || 'NONE' // Include tax type, default to NONE if not specified
         })) || []
      };
      
      console.log('Sending invoice to Xero:', JSON.stringify(invoice, null, 2));
      
      const response = await xero.accountingApi.createInvoices(activeTenantId, {
         invoices: [invoice]
      });
      
      const createdInvoice = response.body.invoices[0];
      const invoiceId = createdInvoice.invoiceID;
      
      console.log('✓ Bill uploaded to Xero:', invoiceId);
      
      // If a file was uploaded, attach it to the invoice
      if (req.file && invoiceId) {
         try {
            console.log('Attaching file to Xero invoice...');
            
            const attachmentResponse = await xero.accountingApi.createInvoiceAttachmentByFileName(
               activeTenantId,
               invoiceId,
               req.file.originalname,
               req.file.buffer,
               {
                  headers: {
                     'Content-Type': req.file.mimetype
                  }
               }
            );
            
            console.log('✓ File attached to Xero invoice:', attachmentResponse.body.attachments[0].attachmentID);
         } catch (attachError) {
            console.error('⚠ Error attaching file to Xero invoice:', attachError.response?.body || attachError);
            // Don't fail the whole request if attachment fails
         }
      }
      
      res.json({ 
         success: true, 
         message: "Bill successfully uploaded to Xero" + (req.file ? " with attachment" : ""),
         invoiceId: invoiceId,
         hasAttachment: !!req.file
      });
   } catch (err) {
      console.error('Error uploading bill to Xero:', err.response?.body || err);
      res.status(500).json({ 
         error: 'Failed to upload bill to Xero',
         details: err.response?.body?.message || err.message
      });
   }
});

// Check connection status
app.get('/connection-status', function (req, res) {
   console.log("-------------- Connection Status Check --------------");
   const isConnected = !!(tokenSet && activeTenantId);
   res.json({ 
      isConnected: isConnected,
      message: isConnected ? "Xero connection active" : "Not connected to Xero"
   });
});

// Handle Xero bill upload (alternative endpoint)
app.post('/api/xero/bills', function (req, res) {
   console.log("-------------- New Bill Upload Request (API) --------------");
   console.log("Headers:", JSON.stringify(req.headers, null, 2));
   console.log("Bill Data:", JSON.stringify(req.body, null, 2));
   res.json({ success: true, message: "Bill received for processing" });
});

// Default handler for other routes
app.all('/*', function (req, res) {
   console.log("-------------- New Request --------------");
   console.log("Headers:"+ JSON.stringify(req.headers, null, 2));
   console.log("Body:"+ JSON.stringify(req.body, null, 2));
   res.json({ message: "Request received" });
})

// Start the server
app.listen(port, function () {
   console.log(`\n✓ Server is running and listening on port ${port}`);
   console.log(`  Local: http://localhost:${port}`);
   console.log('\n========================================');
   console.log('NGROK SETUP:');
   console.log('Start ngrok in a separate terminal with:');
   console.log(`  ngrok http ${port}`);
   console.log('\nThen use the ngrok HTTPS URL for Xero webhook:');
   console.log('  https://your-ngrok-url.ngrok-free.dev/api/webhooks/xero');
   console.log('========================================\n');
}).on('error', function(err) {
   if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Please try a different port or close the application using this port.`);
   } else {
      console.error('Error starting server:', err);
   }
   process.exit(1);
});

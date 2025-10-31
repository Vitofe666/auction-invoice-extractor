# Auction Invoice Extractor

An intelligent tool that uses Gemini AI to extract and parse data from auction house invoices into structured JSON format, with direct integration to Xero accounting software.

## Features

- 🤖 **AI-Powered Extraction**: Uses Google Gemini to intelligently parse invoice images
- 📊 **Structured JSON Output**: Converts unstructured invoice data into clean, structured format
- 💰 **VAT Handling**: Automatically detects and calculates VAT/tax amounts
- 🔗 **Xero Integration**: Direct upload to Xero as bills/purchases
- 🖼️ **Image Upload**: Supports various image formats for invoice processing

## Deployment on Render

### Frontend (Static Site)
1. Create a new **Static Site** on Render
2. Connect your GitHub repository
3. Configure:
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
   - **Environment Variables**:
     - `VITE_API_KEY`: Your Google Gemini API key

### Backend (Web Service)
1. Create a new **Web Service** on Render
2. Connect your GitHub repository
3. Configure:
   - **Build Command**: `npm install --prefix backend`
   - **Start Command**: `node backend/app.js`
   - **Environment Variables**:
     - `PORT`: 10000
     - `NODE_ENV`: production
     - `XERO_CLIENT_ID`: Your Xero app client ID
     - `XERO_CLIENT_SECRET`: Your Xero app client secret
     - `XERO_REDIRECT_URI`: https://your-backend-url.onrender.com/callback
     - `XERO_WEBHOOK_KEY`: Your Xero webhook key

## Local Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables in `.env`
4. Start frontend: `npm run dev`
4. Start backend: `cd backend && node app.js`

## Tech Stack

- **Frontend**: React, TypeScript, Vite
- **Backend**: Node.js, Express
- **AI**: Google Gemini API
- **Accounting**: Xero API
- **Deployment**: Render

# Auction Invoice Extractor

An intelligent tool that uses Gemini AI to extract and parse data from auction house invoices into structured JSON format, with direct integration to Xero accounting software.

## Features

- 🤖 **AI-Powered Extraction**: Uses Google Gemini to intelligently parse invoice images
- 📊 **Structured JSON Output**: Converts unstructured invoice data into clean, structured format
- 💰 **VAT Handling**: Automatically detects and calculates VAT/tax amounts
- 🔗 **Xero Integration**: Direct upload to Xero as bills/purchases
- 🖼️ **Image Upload**: Supports various image formats for invoice processing

## Server-side Gemini Proxy

### Why Use Server-side Proxy?

- Keeps the Gemini API key secret (server-only)
- Avoids build-time vs runtime environment variable issues with Vite
- More secure architecture with API key never exposed to the browser

### Environment Configuration

Set `GEMINI_API_KEY` in your Render (or server) runtime environment variables. This key must NOT be exposed to the browser.

**For Render deployment:**
1. Go to your Web Service dashboard
2. Navigate to Environment section
3. Add environment variable: `GEMINI_API_KEY` with your Gemini API key value

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the root directory with:
   ```
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. Run the server (development mode with ts-node):
   ```bash
   npm run dev:server
   ```

4. In a separate terminal, run the Vite client:
   ```bash
   npm run dev
   ```

5. For production build of the server:
   ```bash
   npm run build:server
   npm run start:server
   ```

### How It Works

1. The client uploads the invoice image (multipart/form-data with field name "image") to `POST /api/extract-invoice`
2. The server receives the image, calls Gemini API using the server-side `GEMINI_API_KEY`
3. Server returns structured JSON invoice data to the client

## Deployment on Render

### Frontend (Static Site)
1. Create a new **Static Site** on Render
2. Connect your GitHub repository
3. Configure:
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`

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

## Tech Stack

- **Frontend**: React, TypeScript, Vite
- **Backend**: Node.js, Express
- **AI**: Google Gemini API
- **Accounting**: Xero API
- **Deployment**: Render

# Auction Invoice Extractor

An intelligent tool that uses Claude AI to extract and parse data from auction house invoices into structured JSON format, with direct integration to Xero accounting software.

## Features

- 🤖 **AI-Powered Extraction**: Uses Anthropic Claude to intelligently parse invoice images
- 📊 **Structured JSON Output**: Converts unstructured invoice data into clean, structured format
- 💰 **VAT Handling**: Automatically detects and calculates VAT/tax amounts
- 🔗 **Xero Integration**: Direct upload to Xero as bills/purchases
- 🖼️ **Image Upload**: Supports various image formats for invoice processing

## Server-side Claude Proxy

### Why Use Server-side Proxy?

- Keeps the Claude API key secret (server-only)
- Avoids build-time vs runtime environment variable issues with Vite
- More secure architecture with API key never exposed to the browser

### Environment Configuration

Set `ANTHROPIC_API_KEY` in your Render (or server) runtime environment variables. This key must NOT be exposed to the browser.

**For Render deployment:**
1. Go to your Web Service dashboard
2. Navigate to Environment section
3. Add environment variable: `ANTHROPIC_API_KEY` with your Anthropic API key value

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the root directory with:
   ```
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
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
2. The server receives the image, calls Claude API using the server-side `ANTHROPIC_API_KEY`
3. Server returns structured JSON invoice data to the client

## Deployment on Render

### Claude Proxy Server (Web Service)
1. Create a new **Web Service** on Render
2. Connect your GitHub repository
3. Configure:
   - **Build Command**: `npm install && npm run build:server`
   - **Start Command**: `npm run start:server`
   - **Environment Variables**:
     - `ANTHROPIC_API_KEY`: Your Anthropic Claude API key (keep this secret, server-side only)
     - `PORT`: 3001 (or as required by Render)
     - `NODE_ENV`: production

### Frontend (Static Site)
1. Create a new **Static Site** on Render
2. Connect your GitHub repository
3. Configure:
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
   - **Note**: No VITE_API_KEY needed - the frontend now proxies through the server

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

### Server-side Claude Proxy

**Why use a server-side proxy?**
- Keeps the Claude API key secret (server-only, never exposed to the browser)
- Avoids build-time vs runtime environment variable issues with Vite
- Better security and control over API usage

**Setup:**

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set environment variable:
   ```bash
   export ANTHROPIC_API_KEY=your_api_key_here
   # Or add to .env file: ANTHROPIC_API_KEY=your_api_key_here
   ```

3. Run the Claude proxy server (development):
   ```bash
   npm run dev:server
   ```
   This runs on port 3001 by default using ts-node for development.

4. In a separate terminal, run the Vite client:
   ```bash
   npm run dev
   ```

**How it works:**
- The client uploads the invoice image (multipart/form-data with field name "image") to POST `/api/extract-invoice`
- The server receives the image, calls Anthropic Claude API using the server-side ANTHROPIC_API_KEY
- The server returns structured JSON invoice data to the client
- The API key never leaves the server and is not exposed to the browser

### Xero Backend

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables in `.env`
4. Start frontend: `npm run dev`
5. Start backend: `cd backend && node app.js`

## Tech Stack

- **Frontend**: React, TypeScript, Vite
- **Backend**: Node.js, Express
- **AI**: Anthropic Claude API
- **Accounting**: Xero API
- **Deployment**: Render

# Auction Invoice Extractor

An intelligent tool that uses Gemini AI to extract and parse data from auction house invoices into structured JSON format, with direct integration to Xero accounting software.

## Architecture Overview

This application consists of **THREE separate services**:

1. **Gemini Proxy Server** (`/server`) - Handles file upload and AI extraction (PORT 3000)
2. **Frontend** (React/Vite) - User interface (PORT 5173 in dev)
3. **Xero Backend** (`/backend`) - Handles Xero accounting integration (PORT 10000)

**Important:** The Gemini Proxy Server is REQUIRED for the webapp to work. Without it, file uploads will fail between step 2 (upload) and step 3 (AI analysis).

## Quick Start (Local Development)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create a `.env` file** in the root directory:
   ```bash
   GEMINI_API_KEY=your_gemini_api_key_here
   PORT=3000
   NODE_ENV=development
   ```

3. **Start the Gemini Proxy Server** (in one terminal):
   ```bash
   npm run dev:server
   ```
   This will start on http://localhost:3000

4. **Start the Frontend** (in another terminal):
   ```bash
   npm run dev
   ```
   This will start on http://localhost:5173

5. **Access the app** at http://localhost:5173

**Note:** For local development, the frontend will automatically proxy requests to `http://localhost:3000` if `VITE_BACKEND_URL` is not set.

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
   > The frontend automatically detects a `VITE_BACKEND_URL` environment variable. Leave it unset for same-origin development, or
   > set it (e.g., `VITE_BACKEND_URL=http://localhost:3000`) when the Gemini proxy runs on a different host/port.

5. The frontend automatically detects a `VITE_BACKEND_URL` environment variable. Leave it unset for same-origin development, or set it (e.g., `VITE_BACKEND_URL=http://localhost:3000`) when the Gemini proxy runs on a different host/port.
   
### Error Handling and Logging

The Gemini proxy server includes comprehensive error handling and logging to help diagnose issues:

#### Startup Logging
When the server starts, it logs:
- Server port and environment
- GEMINI_API_KEY configuration status
- Clear warnings if the API key is missing

#### Request Logging
Each request is tracked with:
- Unique request ID for tracing
- Timestamp
- File details (MIME type, size, filename)
- API call duration
- Response characteristics

#### Error Categories
Errors are categorized for easy diagnosis:
- `AUTHENTICATION_ERROR` - Invalid or missing API key
- `RATE_LIMIT_ERROR` - API quota exceeded
- `NETWORK_ERROR` - Connection or timeout issues
- `INVALID_FILE_FORMAT` - Unsupported file type
- `CONTENT_POLICY_ERROR` - Content policy violation
- `SERVICE_UNAVAILABLE` - Gemini API temporarily unavailable
- `EMPTY_RESPONSE` - API returned empty content
- `JSON_PARSE_ERROR` - Invalid JSON in response
- `CONFIGURATION_ERROR` - Server misconfiguration

Each error response includes:
- User-friendly error message
- Technical details for debugging
- Request ID for tracing
- Whether the error is retryable

#### Health Check
Check server status at `/health` endpoint:
```bash
curl http://localhost:3000/health
```

Returns:
```json
{
  "status": "ok",
  "timestamp": "2025-11-18T15:05:19.425Z",
  "geminiApiConfigured": true,
  "environment": "development"
}
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

**Important:** This application requires **THREE separate services** on Render:

### 1. Gemini Proxy Server (Web Service) - **REQUIRED FOR FILE UPLOAD**
This server handles invoice image uploads and Gemini AI extraction.
1. Create a new **Web Service** on Render
2. Connect your GitHub repository
3. Use the configuration file: **`render-gemini-proxy.yaml`**
4. Or configure manually:
   - **Build Command**: `npm install && npm run build:server`
   - **Start Command**: `npm run start:server`
   - **Environment Variables**:
     - `GEMINI_API_KEY`: Your Google Gemini API key (keep this secret, server-side only)
     - `PORT`: 3000 (Render will assign a port)
     - `NODE_ENV`: production
5. **Note the deployed URL** (e.g., `https://auction-invoice-extractor-1.onrender.com`) - you'll need it for the frontend configuration

### 2. Frontend (Static Site)
This is the user-facing web interface.
1. Create a new **Static Site** on Render
2. Connect your GitHub repository
3. Use the configuration file: **`render-frontend.yaml`**
4. Or configure manually:
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
   - **Environment Variables**:
     - `VITE_BACKEND_URL`: URL of your Gemini Proxy Server (e.g., `https://auction-invoice-extractor-1.onrender.com`)
     - `NODE_ENV`: production
   - **Note**: No VITE_API_KEY needed - the frontend proxies through the Gemini Proxy Server

### 3. Xero Backend (Web Service)
This server handles Xero accounting integration.
1. Create a new **Web Service** on Render
2. Connect your GitHub repository
3. Use the configuration file: **`render-backend.yaml`**
4. Or configure manually:
   - **Build Command**: `npm install --prefix backend`
   - **Start Command**: `node backend/app.js`
   - **Environment Variables**:
     - `PORT`: 10000
     - `NODE_ENV`: production
     - `XERO_CLIENT_ID`: Your Xero app client ID
     - `XERO_CLIENT_SECRET`: Your Xero app client secret
     - `XERO_REDIRECT_URI`: https://your-xero-backend-url.onrender.com/callback
     - `XERO_WEBHOOK_KEY`: Your Xero webhook key

## Local Development

### Server-side Gemini Proxy

**Why use a server-side proxy?**
- Keeps the Gemini API key secret (server-only, never exposed to the browser)
- Avoids build-time vs runtime environment variable issues with Vite
- Better security and control over API usage

**Setup:**

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set environment variable:
   ```bash
   export GEMINI_API_KEY=your_api_key_here
   # Or add to .env file: GEMINI_API_KEY=your_api_key_here
   ```

3. Run the Gemini proxy server (development):
   ```bash
   npm run dev:server
   ```
   This runs on port 3001 by default using ts-node for development.

4. In a separate terminal, run the Vite client (set `VITE_BACKEND_URL` if the proxy is not served from the same origin):
   ```bash
   VITE_BACKEND_URL=http://localhost:3001 npm run dev
   ```

**How it works:**
- The client uploads the invoice image (multipart/form-data with field name "image") to POST `/api/extract-invoice`
- The server receives the image, calls Google Gemini API using the server-side GEMINI_API_KEY
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
- **AI**: Google Gemini API
- **Accounting**: Xero API
- **Deployment**: Render

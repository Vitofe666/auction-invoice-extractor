# 🚀 Deployment Troubleshooting Guide

## ⚠️ CRITICAL SECURITY ISSUE
**Your Google Gemini API key was exposed in the repository!**

### Immediate Actions Required:

1. **Revoke the exposed API key immediately:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   - Find the key: `AIzaSyCHXMJKxw6eS-u1hfgGVB9wzBfQn3bAjzI`
   - Delete or regenerate it

2. **Generate a new API key:**
   - Create a new API key in Google Cloud Console
   - Restrict it to the Generative AI API only
   - Add domain restrictions if possible

## 🔧 Fixed Issues

### 1. Environment Variables
- ✅ Fixed hardcoded URLs in `XeroIntegration.tsx`
- ✅ Fixed hardcoded URL in `xeroService.ts`
- ✅ Updated Vite config to handle `VITE_BACKEND_URL`
- ✅ Removed exposed API key from `render-frontend.yaml`
- ✅ Created `render-gemini-proxy.yaml` for Gemini proxy server deployment

### 2. Render Deployment Setup

**IMPORTANT: This application requires THREE separate Render services:**

#### 1. Gemini Proxy Server (Web Service) - **REQUIRED**
This server handles file uploads and Gemini AI extraction.

**Render Configuration File:** `render-gemini-proxy.yaml`

1. **Environment Variables in Render Dashboard:**
   ```
   GEMINI_API_KEY=your_new_google_gemini_api_key
   PORT=3000
   NODE_ENV=production
   ```

2. **Build Settings:**
   - Build Command: `npm install && npm run build:server`
   - Start Command: `npm run start:server`

3. **Note the deployed URL** - this is your `VITE_BACKEND_URL` for the frontend

#### 2. Frontend (Static Site)
**Render Configuration File:** `render-frontend.yaml`

1. **Environment Variables in Render Dashboard:**
   ```
   VITE_BACKEND_URL=https://[your-gemini-proxy-url].onrender.com
   NODE_ENV=production
   ```
   
   **NOTE:** `VITE_BACKEND_URL` must point to the Gemini Proxy Server URL, NOT the Xero backend!

2. **Build Settings:**
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist`

#### 3. Xero Backend (Web Service)
**Render Configuration File:** `render-backend.yaml`

1. **Environment Variables in Render Dashboard:**
   ```
   XERO_CLIENT_ID=your_xero_client_id
   XERO_CLIENT_SECRET=your_xero_client_secret
   XERO_REDIRECT_URI=https://[your-xero-backend-url].onrender.com/callback
   XERO_WEBHOOK_KEY=your_xero_webhook_key
   PORT=10000
   NODE_ENV=production
   ```

2. **Build Settings:**
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && node app.js`

## 🐛 Common Issues & Solutions

### Issue 1: "File upload fails between step 2 and step 3"
**Symptoms:** File uploads successfully but nothing happens, or you get a network error
**Root Cause:** The Gemini Proxy Server is not deployed or `VITE_BACKEND_URL` is incorrect
**Solution:** 
1. Ensure you've deployed the Gemini Proxy Server using `render-gemini-proxy.yaml`
2. Verify `GEMINI_API_KEY` is set in the Gemini Proxy Server environment variables
3. Confirm `VITE_BACKEND_URL` in the frontend points to the Gemini Proxy Server (not the Xero backend)
4. Check the Gemini Proxy Server logs for errors

### Issue 2: "VITE_API_KEY environment variable is not set"
**Solution:** This is outdated - the app now uses a server-side proxy. Remove any references to `VITE_API_KEY` from frontend environment variables.

### Issue 3: Frontend can't connect to backend
**Solution:** 
- Check that `VITE_BACKEND_URL` points to your **Gemini Proxy Server** URL (e.g., `https://auction-invoice-extractor-1.onrender.com`)
- Do NOT point it to the Xero backend URL

### Issue 4: Xero integration not working
**Solution:** Verify all Xero environment variables are set correctly in the **Xero Backend** service (separate from Gemini Proxy Server)

### Issue 5: Build fails with TypeScript errors
**Solution:** Run `npm run build` locally first to identify issues

## ✅ Testing Checklist

### Local Testing:
- [ ] Frontend runs: `npm run dev`
- [ ] Backend runs: `cd backend && node app.js`
- [ ] Build succeeds: `npm run build`
- [ ] No console errors in browser

### Production Testing:
- [ ] Frontend loads without errors
- [ ] File upload works
- [ ] AI extraction works (with valid API key)
- [ ] Xero connection can be established
- [ ] Invoice upload to Xero works

## 📱 Debug Commands

```bash
# Check if frontend builds
npm run build

# Test backend locally
cd backend && node app.js

# Check environment variables in Render logs
console.log('Environment check:', {
  hasApiKey: !!process.env.API_KEY,
  hasBackendUrl: !!process.env.VITE_BACKEND_URL,
  nodeEnv: process.env.NODE_ENV
});
```

## 🔐 Security Best Practices

1. **Never commit API keys** to version control
2. **Use environment variables** for all sensitive data
3. **Rotate API keys** regularly
4. **Set up API key restrictions** in Google Cloud Console
5. **Monitor API usage** for suspicious activity

## 📞 Support

If issues persist:
1. Check Render deployment logs
2. Check browser console for errors
3. Verify all environment variables are set
4. Test API endpoints individually
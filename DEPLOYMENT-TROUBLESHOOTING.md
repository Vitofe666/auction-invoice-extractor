# 🚀 Deployment Troubleshooting Guide

## ⚠️ CRITICAL SECURITY ISSUE
**Your Anthropic Claude API key was exposed in the repository!**

### Immediate Actions Required:

1. **Revoke the exposed API key immediately:**
   - Go to [Anthropic Console](https://console.anthropic.com/)
   - Find and delete the exposed API key
   - Generate a new API key

2. **Generate a new API key:**
   - Create a new API key in Anthropic Console
   - Store it securely in environment variables only

## 🔧 Fixed Issues

### 1. Environment Variables
- ✅ Fixed hardcoded URLs in `XeroIntegration.tsx`
- ✅ Fixed hardcoded URL in `xeroService.ts`
- ✅ Updated Vite config to handle `VITE_BACKEND_URL`
- ✅ Removed exposed API key from `render-frontend.yaml`

### 2. Render Deployment Setup

#### Frontend Deployment:
1. **Environment Variables in Render Dashboard:**
   ```
   VITE_BACKEND_URL=https://vitofe666-auction-invoice-backend.onrender.com
   NODE_ENV=production
   ```

2. **Build Settings:**
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist`

#### Claude Proxy Server Deployment:
1. **Environment Variables in Render Dashboard:**
   ```
   ANTHROPIC_API_KEY=your_anthropic_api_key
   PORT=3001
   NODE_ENV=production
   ```

2. **Build Settings:**
   - Build Command: `npm install && npm run build:server`
   - Start Command: `npm run start:server`

#### Backend Deployment:
1. **Environment Variables in Render Dashboard:**
   ```
   XERO_CLIENT_ID=your_xero_client_id
   XERO_CLIENT_SECRET=your_xero_client_secret
   XERO_REDIRECT_URI=https://vitofe666-auction-invoice-backend.onrender.com/callback
   XERO_WEBHOOK_KEY=your_xero_webhook_key
   PORT=10000
   NODE_ENV=production
   ```

2. **Build Settings:**
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && node app.js`

## 🐛 Common Issues & Solutions

### Issue 1: "ANTHROPIC_API_KEY environment variable is not set"
**Solution:** Set the API key in Render's environment variables dashboard (not in code)

### Issue 2: Frontend can't connect to backend
**Solution:** Check that `VITE_BACKEND_URL` matches your backend's deployed URL

### Issue 3: Xero integration not working
**Solution:** Verify all Xero environment variables are set correctly in backend

### Issue 4: Build fails with TypeScript errors
**Solution:** Run `npm run build` locally first to identify issues

### Issue 5: Claude API returns error
**Solution:** Verify ANTHROPIC_API_KEY is valid and has sufficient credits

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

# Check if server builds
npm run build:server

# Test server locally (requires ANTHROPIC_API_KEY in .env)
npm run dev:server

# Test backend locally
cd backend && node app.js

# Check environment variables in Render logs
console.log('Environment check:', {
  hasApiKey: !!process.env.ANTHROPIC_API_KEY,
  hasBackendUrl: !!process.env.VITE_BACKEND_URL,
  nodeEnv: process.env.NODE_ENV
});
```

## 🔐 Security Best Practices

1. **Never commit API keys** to version control
2. **Use environment variables** for all sensitive data
3. **Rotate API keys** regularly
4. **Monitor API usage** for suspicious activity in Anthropic Console
5. **Use server-side proxy** to keep API keys secure (never expose to frontend)

## 📞 Support

If issues persist:
1. Check Render deployment logs
2. Check browser console for errors
3. Verify all environment variables are set
4. Test API endpoints individually
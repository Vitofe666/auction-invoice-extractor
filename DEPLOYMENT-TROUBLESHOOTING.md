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

### 2. Render Deployment Setup

#### Frontend Deployment:
1. **Environment Variables in Render Dashboard:**
   ```
   VITE_API_KEY=your_new_google_gemini_api_key
   VITE_BACKEND_URL=https://vitofe666-auction-invoice-backend.onrender.com
   NODE_ENV=production
   ```

2. **Build Settings:**
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist`

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

### Issue 1: "VITE_API_KEY environment variable is not set"
**Solution:** Set the API key in Render's environment variables dashboard (not in code)

### Issue 2: Frontend can't connect to backend
**Solution:** Check that `VITE_BACKEND_URL` matches your backend's deployed URL

### Issue 3: Xero integration not working
**Solution:** Verify all Xero environment variables are set correctly in backend

### Issue 4: Build fails with TypeScript errors
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
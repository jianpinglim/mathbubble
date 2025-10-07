# Railway Deployment Guide for MathBubble

## Quick Deploy to Railway

1. **Sign up for Railway**: Go to [railway.app](https://railway.app)
2. **New Project**: Click "New Project" → "Deploy from GitHub repo"
3. **Select Repository**: Choose your `mathbubble` repository
4. **Auto-Deploy**: Railway will automatically deploy your app

## Environment Variables Setup

After deployment, set these environment variables in Railway dashboard:

```bash
SUPABASE_URL=https://tmgssumdikxtgcdaykyu.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtZ3NzdW1kaWt4dGdjZGF5a3l1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NjMwNDcsImV4cCI6MjA3NTIzOTA0N30.e3T1XokoA5Nb0quLEHsS9VXixgVK6SdMUYojBEvs0ug
NODE_ENV=production
```

## Google OAuth Configuration

1. **Get Railway URL**: After deployment, Railway will give you a URL like `mathbubble-production-xxxx.up.railway.app`
2. **Update Google Console**:
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Navigate to "APIs & Services" → "Credentials"
   - Edit your OAuth 2.0 Client ID
   - Add your Railway URL to "Authorized redirect URIs":
     ```
     https://your-railway-url.up.railway.app/
     ```

3. **Update Supabase**:
   - Go to your Supabase dashboard
   - Navigate to "Authentication" → "URL Configuration"
   - Add your Railway URL to "Redirect URLs":
     ```
     https://your-railway-url.up.railway.app/
     ```

## Why Railway > Render?

- ✅ Faster deployments
- ✅ Better developer experience
- ✅ More reliable uptime
- ✅ Automatic HTTPS
- ✅ Better logging and monitoring
- ✅ Easier environment variable management

## Custom Domain (Optional)

Railway supports custom domains:
1. Go to your project settings
2. Add your custom domain
3. Update DNS records as instructed
4. Railway handles SSL certificates automatically

## Monitoring

Railway provides built-in monitoring:
- View logs in real-time
- Monitor resource usage
- Track deployment history
- Set up alerts
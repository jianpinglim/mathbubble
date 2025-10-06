# MathBubble - Google OAuth Setup Guide

## Setting up Google OAuth with Supabase

### 1. Configure Google OAuth in Supabase Dashboard

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project (`tmgssumdikxtgcdaykyu`)
3. Navigate to **Authentication** → **Providers**
4. Find **Google** and click **Enable**

### 2. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the **Google+ API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure OAuth consent screen if prompted
6. For **Application type**, select **Web application**
7. Add these URLs:

   **Authorized JavaScript origins:**
   ```
   http://localhost:3000
   https://your-domain.com
   ```

   **Authorized redirect URIs:**
   ```
   https://tmgssumdikxtgcdaykyu.supabase.co/auth/v1/callback
   ```

8. Copy the **Client ID** and **Client Secret**

### 3. Configure Supabase Provider

Back in Supabase Dashboard:
1. Paste the **Client ID** and **Client Secret** from Google
2. Save the configuration

### 4. Update Site URL (Optional)

1. Go to **Authentication** → **URL Configuration**
2. Set **Site URL** to your production domain
3. Add your localhost for development:
   ```
   http://localhost:8000/*
   https://your-domain.com/*
   ```

### 5. Test the Integration

1. Start your local server:
   ```bash
   http-server -p 8000
   ```

2. Navigate to `http://localhost:8000/login.html`
3. Click "Continue with Google"
4. Complete the OAuth flow
5. You should be redirected to the quiz page

## Files Structure

```
MathBubble_web/
├── login.html          # Login page
├── login.css           # Login page styles
├── auth.js             # Authentication logic
├── quiz_page.html      # Main quiz page
├── quiz.css            # Quiz page styles  
├── quiz.js             # Quiz functionality
└── README.md           # This file
```

## Features

✅ **Google OAuth Login** - Secure authentication with Google  
✅ **Guest Mode** - Play without signing up  
✅ **User Profiles** - Display user info and avatar  
✅ **Session Management** - Persistent login state  
✅ **Responsive Design** - Works on mobile and desktop  
✅ **Duolingo-style UI** - Clean, modern interface  

## Usage

### For Regular Users:
1. Click "Continue with Google" to sign in
2. Complete Google OAuth flow
3. Start taking quizzes with saved progress

### For Guest Users:
1. Click "Continue as Guest"
2. Play immediately without account
3. Progress won't be saved

## Security Notes

- All authentication is handled by Supabase
- User data is stored securely in Supabase database
- Guest sessions are local only
- OAuth tokens are managed by Supabase client

## Troubleshooting

**OAuth Error: "redirect_uri_mismatch"**
- Make sure redirect URI in Google Console matches Supabase callback URL exactly

**User not redirected after login**
- Check that Site URL is configured correctly in Supabase

**Localhost not working**
- Ensure you're using `http-server` or similar (not `file://`)
- Add localhost to authorized origins in Google Console
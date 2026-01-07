---
description: Setup Google Cloud Configuration for POTracker
---

# Google Cloud OAuth Setup Guide

To enable "Sign in with Google," email sending (Gmail API), and Google Forms integration, you need to set up a Google Cloud Project.

## 1. Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown (top left) and select **New Project**.
3. Name it "POTracker" (or similar) and click **Create**.
4. Select the newly created project.

## 2. Enable Required APIs

You need to enable the APIs that the app uses.

1. Go to **APIs & Services** > **Library**.
2. Search for and enable the following APIs:
   - **Gmail API** (for sending emails)
   - **Google Forms API** (for creating forms)
   - **Google Drive API** (required by Forms API)

> **Note:** The "Google Drive API" is technically required for the Forms API to work properly, even if we don't use Drive features directly.

## 3. Configure OAuth Consent Screen

1. Go to **APIs & Services** > **OAuth consent screen**.
2. Select **External** (if you want to allow any Google account) or **Internal** (only for your Organization, if you have a Workspace).
   - *Recommendation:* Choose **External** for personal testing.
3. Click **Create**.
4. Fill in:
   - **App Name:** POTracker
   - **User Support Email:** Your email
   - **Developer Contact Email:** Your email
5. Click **Save and Continue**.
6. **Scopes:** Click **Add or Remove Scopes** and select:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `.../auth/gmail.send`
   - `.../auth/forms.body`
   - `.../auth/forms.responses.readonly`
   - *If you don't see them, manually paste:* `https://www.googleapis.com/auth/forms.body` etc.
7. Click **Save and Continue**.
8. **Test Users:** (Important for "External" apps in Testing mode)
   - Click **Add Users** and add your own Google email address.
   - *Only added users can sign in while the app is in "Testing" status.*
9. Click **Save and Continue**.

## 4. Create Credentials (Client ID & Secret)

1. Go to **APIs & Services** > **Credentials**.
2. Click **Create Credentials** > **OAuth client ID**.
3. **Application Type:** Select **Web application** (for localhost) OR **Desktop app**.
   - *For local development (recommended):* Select **Web application**.
   - **Name:** POTracker Local
   - **Authorized redirect URIs:** Add `http://localhost` (Note: The app explicitly uses `http://localhost`).
4. Click **Create**.
5. You will see a popup with your **Client ID** and **Client Secret**.

## 5. Configure the Application

1. Copy the **Client ID** and **Client Secret**.
2. Create a file named `.env` in the root of your project (copy from `.env.example`).
3. Paste the values:

```bash
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_SECRET=your-client-secret
```

4. Restart the application:
```bash
npm run tauri dev
```

## Troubleshooting

- **Access Blocked / App not verified:** This is normal for unverified apps. Click "Advanced" > "Go to POTracker (unsafe)".
- **Error 400: redirect_uri_mismatch:** Ensure `http://localhost` is exactly in the Authorized Redirect URIs list in Cloud Console.

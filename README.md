# veera.devopssec

This repo now uses a simple static site setup for Vercel.

## Files

- `index.html` for the homepage
- `write.html` for the Firebase-powered editor
- `styles.css` for styling
- `firebase-site.js` for Firebase Auth and Firestore logic
- `api/firebase-config.js` for serving Firebase web config from Vercel environment variables
- `firestore.rules` template for Firestore access rules

## Deploy

Vercel can deploy this directly as a static site.

## Firebase

Make sure these are set correctly:

- Vercel env vars:
  - `FIREBASE_API_KEY`
  - `FIREBASE_AUTH_DOMAIN`
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_STORAGE_BUCKET`
  - `FIREBASE_MESSAGING_SENDER_ID`
  - `FIREBASE_APP_ID`
- `firestore.rules` in Firebase Console

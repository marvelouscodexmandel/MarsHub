# MASS HUB - JIPPED EDITION

Exclusive luxury chat app demo.

Environment variables (create a .env file):

PORT=3000
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
SESSION_SECRET=supersecret
WHATSAPP_VERIFY_TOKEN=optional

Run locally:

npm install
npm start

Open http://localhost:3000

Notes:
- Google OAuth requires credentials and valid callback URL registered in Google Cloud Console.
- Uploads are stored in /uploads (this folder is gitignored).
- This is a demo in-memory server. For production, add a database and persistent session store.

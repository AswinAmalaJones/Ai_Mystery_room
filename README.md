# AI Mystery Room

An AI powered detective case file. Players generate a fictional mystery, inspect suspects and evidence, use limited hints, make one final accusation, and receive a persisted reveal and score.

## Prerequisites

- Node.js 20 or later and npm
- MongoDB running locally or a MongoDB connection string
- A Google Gemini API key for mystery generation

## Setup

1. Copy `server/.env.example` to `server/.env` and set `MONGODB_URI`, `GEMINI_API_KEY`, and a random `SESSION_SECRET` of at least 32 characters. Copy `client/.env.example` to `client/.env` if the API is not at its default URL.
2. Run `npm install` from the repository root.
3. Run `npm run dev` to start the API on port 5000 and the Vite client on port 5173.
4. Open `http://localhost:5173`.

The API validates configuration at startup. A missing Gemini key is reported as a safe generation error when a user creates a case. The Gemini model is configured with `GEMINI_MODEL`.

## Commands

- `npm run dev` — run client and API
- `npm run dev:client` / `npm run dev:server` — run one app
- `npm run build` — build both apps
- `npm run typecheck` — type check both apps
- `npm run lint` — lint both apps

## Architecture

`client/` is a React, TypeScript, and Vite single page app. `server/` is an Express API backed by MongoDB and Mongoose. Gemini is called only by the server. Passwords use bcrypt hashes; browser sessions use HTTP only, SameSite cookies. Case ownership is checked on every private route.

The `Mystery` model stores canonical solution, hints, and required clue IDs in fields excluded from normal Mongoose projections. API responses are explicit DTOs. Clue descriptions are returned only after discovery. The reveal is returned when the accusation is recorded and on later reads of a completed attempt. Score calculation and attempt completion are server side.

## Privacy and safety

Account profile, case content, and gameplay progress are stored in MongoDB. Mysteries are fictional. Do not include personal or confidential information in premises. The app does not currently offer account deletion. Keep `.env` private; only `VITE_` variables may be exposed to the client.

## Deployment Guide

You can deploy AI Mystery Room as:
1. **Unified Full-Stack Service (Recommended)**: Render, Railway, or Docker where Express serves both the API and the React SPA. This avoids CORS complexity and third-party cookie restrictions.
2. **Decoupled Architecture**: Frontend on Vercel / Netlify and backend API on Render / Railway.

### 1. Prerequisites for Production
- **MongoDB Atlas** (Free Cluster):
  1. Create a free cluster at [MongoDB Atlas](https://www.mongodb.com/atlas).
  2. Create a Database User with read/write credentials.
  3. Under **Network Access**, add `0.0.0.0/0` (Allow Access from Anywhere), as cloud hosts use dynamic IP pools.
  4. Obtain the connection string: `mongodb+srv://<user>:<password>@cluster0.mongodb.net/ai_mystery_room?retryWrites=true&w=majority`.
- **Google Gemini API Key**:
  - Get a free key at [Google AI Studio](https://aistudio.google.com/).
- **Session Secret**:
  - Generate a secure 32+ character string (e.g. using `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).

### 2. Option A: Deploy on Render (Recommended - Free & Easy)
1. Push your repository to GitHub.
2. Log in to [Render](https://render.com/) and click **New > Web Service**.
3. Connect your repository.
4. Configure service settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/v1/health`
5. Add the following **Environment Variables**:
   - `NODE_ENV`: `production`
   - `MONGODB_URI`: your MongoDB Atlas connection string
   - `GEMINI_API_KEY`: your Gemini API key
   - `GEMINI_MODEL`: `gemini-2.5-flash`
   - `SESSION_SECRET`: your 32+ character random secret
   - *(Optional)* `CLIENT_ORIGIN`: your Render service URL (e.g., `https://ai-mystery-room.onrender.com`)
6. Click **Create Web Service**. Render will build and deploy your app.

### 3. Option B: Deploy with Docker / Railway / Fly.io
A production multi-stage [Dockerfile](file:///c:/Users/ADMIN/OneDrive/Desktop/AI%20Mystery%20Room/Dockerfile) is included:
```bash
docker build -t ai-mystery-room .
docker run -p 5000:5000 \
  -e MONGODB_URI="your_mongodb_uri" \
  -e GEMINI_API_KEY="your_api_key" \
  -e SESSION_SECRET="your_secret" \
  ai-mystery-room
```

### 4. Option C: Decoupled (Vercel Frontend + Render Backend)
- **Backend on Render**: Set `CLIENT_ORIGIN=https://your-app.vercel.app` and `COOKIE_SAME_SITE=none`.
- **Frontend on Vercel**: Connect the repo. The included [vercel.json](file:///c:/Users/ADMIN/OneDrive/Desktop/AI%20Mystery%20Room/vercel.json) rewrites `/api/*` requests to your backend, maintaining seamless same-origin session cookies.

## Windows commands

In PowerShell environments where script execution is disabled, use `npm.cmd` rather than `npm`:

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build
```

To run one application, use `npm.cmd run dev:server` or `npm.cmd run dev:client` from the repository root. The backend loads `server/.env` explicitly, regardless of whether it is started from the root workspace or the `server` directory.

## MongoDB Atlas DNS troubleshooting

The Atlas `mongodb+srv` URL depends on an SRV DNS lookup. If Windows `nslookup` works but Node reports `querySrv`, `ECONNREFUSED`, or `ETIMEOUT`, the DNS resolver used by Node is being blocked, intercepted, or timing out. This is commonly caused by a local DNS proxy, VPN, security product, firewall, router, or network policy.

Do not add public DNS resolvers in application code or weaken TLS. Confirm the active network can resolve the SRV record and reach Atlas on port 27017. If that network cannot support SRV records, copy the exact **Standard connection string** generated by the Atlas dashboard as a temporary alternative; do not construct replica-set hosts manually. Also confirm the cluster is running and the current public IP is permitted in Atlas Network Access.

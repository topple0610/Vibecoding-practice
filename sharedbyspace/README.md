# Shared by Space

A visual second brain for a team's video ideas, backed by Firebase Authentication, Cloud Firestore, Cloud Storage, and Cloud Functions.

## Included Features

- Google sign-in through Firebase Authentication
- Masonry idea library with image-first YouTube, X, Instagram, article, screenshot, reference, hook, reaction, and loose-idea cards
- Link enrichment through a Cloud Function for YouTube thumbnails/titles, tweet-style content, and Open Graph previews where providers expose them
- Image and screenshot uploads to Firebase Storage
- Categories, planned film dates, full-text client filtering, editing, and deletion
- Profile-based agent instruction block with revocable bearer credentials
- Server-side agent API for reading, creating, editing, and deleting ideas
- Firestore and Storage rules plus Firebase Hosting configuration
- Private-network URL blocking for server-side preview fetching
- Explicit approved-email access control for people and their issued agent credentials

## Local Development

Prerequisites: Node.js 20 or later and the Firebase CLI.

```bash
npm install
npm --prefix functions install
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with your Firebase web app configuration before starting Vite. The production MiniMax key is not a Vite environment variable; keep it in Firebase Secret Manager as `MINIMAX_API_KEY`.

## Deploy

From this directory:

```bash
npm run build
firebase login
firebase deploy
```

The deployment publishes the web app, Firestore rules, Storage rules, and Cloud Functions.

## Collections

- `ideas`: saved library cards, previews, categories, notes, and film dates
- `users`: signed-in collaborator profile metadata
- `approvedEmails`: one document per approved Google account email, used as the workspace allowlist
- `agentTokens`: hashed, revocable API tokens; readable only by Cloud Functions

## Agent API

After deployment, a signed-in user can open Profile and generate a token. The displayed instruction block gives an agent the endpoint and bearer credential.

Endpoint:

```text
https://us-central1-sharedbyspace.cloudfunctions.net/agentApi
```

Supported operations:

```text
GET    /ideas?search=<term>&category=<category>
POST   /ideas
PATCH  /ideas/{id}
DELETE /ideas/{id}
```

## Access Policy

Google sign-in identifies people; the app's `approvedEmails` allowlist grants library access. For the first login, sign in with your Google account and select **Create owner workspace**. A server-side transaction securely makes that first verified account the workspace owner; subsequent users cannot claim ownership.

To add teammates later, add documents in Cloud Firestore with each approved user's lowercase email address as its document ID:

```text
approvedEmails/you@example.com
  active: true
  role: "owner"

approvedEmails/teammate@example.com
  active: true
  role: "member"
```

Only approved accounts can read or modify ideas, upload or read visual assets, request preview enrichment, or create agent credentials. Set `active` to `false` or remove the document to revoke both human access and any agent tokens issued by that user.

## Preview Availability

YouTube metadata and thumbnail retrieval works through its public preview endpoint. X and Instagram may restrict preview data over time; when a rich preview is unavailable, a user can provide the title, attribution, or uploaded visual directly in the capture form.

# Advanced ProShop Hub — Load & Capacity Dashboard

Internal dashboard for Advanced Machining. Visualizes monthly work center load vs available capacity, pulled from ProShop ERP CSV exports.

---

## Local Development

```bash
# Install dependencies
npm install

# Run locally (http://localhost:3000)
npm run dev
```

---

## Deploy to Railway from GitHub

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial deploy"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### Step 2 — Create Railway Project

1. Go to [railway.app](https://railway.app) and log in
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your repository
4. Railway auto-detects Node.js and runs `npm start`

### Step 3 — Get Your URL

1. In Railway dashboard → click your service → **Settings** tab
2. Under **Networking** → click **Generate Domain**
3. Your dashboard is live at `https://your-app.up.railway.app`

### Step 4 — Auto-Deploy on Push

Railway automatically re-deploys whenever you push to `main`. To update the dashboard with a new CSV import:

1. Replace `public/index.html` with the new exported HTML
2. `git add public/index.html && git commit -m "Update dashboard" && git push`
3. Railway deploys in ~30 seconds

---

## Project Structure

```
├── server.js          # Express server (serves /public)
├── package.json       # Node dependencies & start script
├── railway.toml       # Railway deployment config
├── .gitignore
└── public/
    └── index.html     # The ProShop Hub dashboard (single-file app)
```

---

## Updating Data

The dashboard is a self-contained HTML file with seed data baked in. To refresh:

1. Export the latest WO list from ProShop as CSV
2. Open the live dashboard → **Import** tab → drop the CSV → Confirm
3. The charts and table update in-browser immediately

For a permanent update (so the new data persists for all users), re-export the updated `index.html` from the build pipeline and push to GitHub.

---

## Environment Variables

None required for basic hosting. If you add ProShop GraphQL integration later, set:

| Variable | Description |
|---|---|
| `PROSHOP_API_URL` | Cloudflare Worker proxy endpoint |
| `PROSHOP_CLIENT_ID` | OAuth2 client ID |
| `PROSHOP_CLIENT_SECRET` | OAuth2 client secret |

---

## Tech Stack

- **Frontend**: Vanilla JS, Chart.js 4.4.1, Barlow + JetBrains Mono fonts
- **Server**: Node.js + Express (static file server)
- **Hosting**: Railway (auto-deploy from GitHub)
- **Data**: ProShop ERP CSV export, Available Hours xlsx (baked into seed data)

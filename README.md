# Production Schedule Dashboard

Self-hosted production scheduling dashboard. Upload your two Excel files once — data persists in a committed SQLite database, surviving redeploys with **zero Railway configuration**.

---

## Project Structure

```
prod-schedule/
├── server.js          ← Express API + Excel parsing
├── Procfile           ← Railway process definition
├── package.json
├── .gitignore
├── data.db            ← SQLite database (committed to Git)
└── public/
    └── index.html     ← Dashboard frontend
```

---

## Deploy to Railway (3 steps, no volume, no env vars)

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOU/prod-schedule.git
git push -u origin main
```

### 2. Connect to Railway

1. railway.app → New Project → Deploy from GitHub repo
2. Select your repo
3. Done — Railway detects Node.js and runs npm start

### 3. Upload your files

Open your Railway URL, drop in the two Excel files. Done.

---

## How persistence works

data.db is a SQLite file committed to your repo. On each upload the
server writes to it on Railway's container filesystem. Data survives
restarts within the same deploy.

To make uploads permanent across future deploys, commit the DB after uploading:

  git add data.db
  git commit -m "Update production data"
  git push

---

## Local Development

  npm install
  npm start
  open http://localhost:3000

# Deploying WOS Hero Optimizer — GitHub + Vercel

About 10 minutes the first time. You need free accounts on [GitHub](https://github.com) and
[Vercel](https://vercel.com) (sign in to Vercel with GitHub — it makes step 2 one click).

No database, no API keys, no environment variables. Everything a player enters is saved in
**local storage** in their own browser.

---

## 1. GitHub — put the code in a repository

**Easiest (no terminal): GitHub Desktop**
1. Unzip `wos-hero-optimizer-deploy.zip`.
2. Install [GitHub Desktop](https://desktop.github.com) and sign in.
3. *File → Add Local Repository…* → choose the unzipped `wos-hero-optimizer` folder.
   It says the folder isn't a repository yet → click **create a repository** → **Create Repository**
   (keep the name; the included `.gitignore` is used automatically).
4. Click **Publish repository**. Untick "Keep this code private" only if you want it public.

**Or with a terminal**
```bash
cd wos-hero-optimizer
git init -b main
git add .
git commit -m "WOS Hero Optimizer"
git remote add origin https://github.com/<you>/wos-hero-optimizer.git
git push -u origin main
```
(Create the empty repository on github.com first, without a README.)

After the push, the **Actions** tab runs the checks in `.github/workflows/ci.yml`
(type-check, tests, production build). A green tick means it's safe to deploy.

---

## 2. Vercel — publish the site

1. [vercel.com](https://vercel.com) → **Add New… → Project** → import the GitHub repository.
2. Framework is detected as **Next.js**. Leave every setting as it is — no environment variables.
3. **Deploy**. You get `https://<your-app>.vercel.app`.

From now on, every push to `main` redeploys automatically, and every pull request gets its own
preview link. To use your own domain: Vercel → Project → **Settings → Domains**.

---

## 3. Check it works

- Open the site: “1. Your Heroes” is empty, with **Scan roster** and **+ Add Hero**.
- Add a hero, reload the page — the hero is still there (saved in local storage).
- Scan a screenshot: the first scan takes a few seconds while the text reader downloads
  (from jsDelivr); it is cached after that. Screenshots never leave the phone.

## 4. Install on phones

Open the site in Safari (iPhone: Share → Add to Home Screen) or Chrome (Android: ⋮ →
Install app). App icons aren't included yet — see the README's remaining work.

---

## How saving works (local storage)

- Saved automatically on every change, in the browser's local storage under the key
  `wos-hero-optimizer:state` (roster, gear, inventory, strategy).
- **Per device and per browser.** Your phone and your computer each keep their own copy;
  Safari and Chrome on the same phone are separate too.
- **Private / incognito windows** don't keep it after the window closes.
- **Clearing the browser's site data** for your Vercel address deletes it.
- Nothing is sent to any server; alliance members can't see each other's data.
- Older saves are upgraded automatically when the app changes (see
  `lib/storage/savedState.ts` → `migrateSavedState`).

---

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
npm test
npm run typecheck
npm run build
```

## What's where

| Path | What |
|---|---|
| `app/` | Pages (Next.js App Router) |
| `lib/optimizer/` | Hero EXP, gear, Top 3 enhancement, Mastery / Legendary planning |
| `lib/storage/savedState.ts` | Local-storage save + migration of older saves |
| `imageRecognition/`, `screenshotParser/` | Screenshot scanning (runs in the browser) |
| `public/assets/heroes/portraits/` | Hero portrait library |
| `.github/workflows/ci.yml` | Checks on every push |
| `preview/` | Optional static single-file build (`npm run build:preview`) |

## Troubleshooting

- **Vercel build fails** → open the failing deployment's log; the same check runs in GitHub
  Actions, so the Actions tab usually shows the cause first.
- **Data disappeared** → site data was cleared, or it was a private window, or a different
  browser/device. Local storage can't be recovered.
- **Scanning never finishes** → the text reader couldn't download; check the connection
  and try again.

# Darryl Wednesdays

Daily Darryl card packs: 1 free pack a day (3 on Wednesdays), streak and referral bonus packs,
numbered parallels with serials that are unique across everyone, one Gold 1/1, a live feed and a leaderboard.

## Put it online (about 10 minutes)

1. **GitHub:** create a new repository (private is fine), click "uploading an existing file",
   and drag in everything inside this folder (`index.html`, `package.json`, `vercel.json`,
   and the `api`, `lib`, `img`, `scripts` folders). Commit.
2. **Vercel:** sign up with your GitHub account, click **Add New → Project**, import the repo,
   leave the framework as **Other**, and click **Deploy**.
3. **Database:** in the Vercel project open **Storage → Create Database → Upstash for Redis**,
   pick the free plan, and connect it to the project (all environments).
4. **Redeploy:** go to **Deployments**, open the menu on the latest one and click **Redeploy**.
   The red "database isn't connected" banner on the site should be gone.
5. **Email codes (Brevo):** sign-up needs an email code, one account per email. In Vercel open
   **Settings → Environment Variables** and add `BREVO_API_KEY` (from Brevo → SMTP & API → API Keys)
   and `MAIL_FROM` (a sender email you verified in Brevo). Redeploy after adding them.
6. Open your site, sign up with your email, and send your invite link to friends.

## Changing things

- Card list and names: `CARDS` in `index.html`. Card IDs must match `lib/cards.js`.
- Odds, packs per day, referral and streak rules, timezone: `lib/cards.js`.
- New photos: add `img/dNN.jpg` (600x800), then add the card in both files above.
- Local preview without a database: `node scripts/dev-server.mjs`, then open http://localhost:3000

# SupplyWala

Karachi's supplier for medical, hospital, cleaning, hardware and industrial supplies. www.supplywala.store

## Files
- index.html : the whole store and the admin dashboard (open www.supplywala.store/#admin).
- robots.txt : search engine rules. Points to sitemap.xml.
- sitemap.xml : list of pages for Google (home page + every product).
- CNAME : tells GitHub Pages to serve the site at www.supplywala.store.

## Update the live site
1. GitHub repo, click Add file, then Upload files.
2. Drag in the changed files (same names replace the old ones). Click Commit changes.
3. Wait 1-2 minutes, open www.supplywala.store and press Cmd+Shift+R.

## First-time GitHub Pages setup (already done for this site)
1. Repo, Settings, Pages. Source: Deploy from a branch. Branch: main, folder: / (root). Save.
2. Custom domain: www.supplywala.store. Save. Tick Enforce HTTPS.
3. At the domain provider: CNAME record, www pointing to <your-github-username>.github.io

## When you add a new product
sitemap.xml does not update itself. Ask Hark for a fresh sitemap.xml, or add a line like:
  <url><loc>https://www.supplywala.store/?product=PRODUCT-SLUG</loc></url>
Then upload it and, in Google Search Console, submit https://www.supplywala.store/sitemap.xml

## Security notes
- The Supabase publishable key in index.html is meant to be public. Admin access is protected by
  Supabase Auth, the admins table and row-level security.
- Never put a service role key, secret key, Resend key or Cloudinary API secret in this repo.
- Database and server code live in the separate supabase/ folder. Do NOT upload that folder to GitHub Pages.

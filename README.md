# SupplyWala

Karachi's supplier for medical, hospital, cleaning, hardware and industrial supplies. www.supplywala.store

## Files
- index.html : the whole store and the admin dashboard (open www.supplywala.store/#admin).
- tools/build-seo.mjs : builds a real Google-friendly page for every product and category.
- .github/workflows/seo.yml : runs the builder and publishes the site automatically.
- robots.txt, CNAME : search engine rules and your domain.

## How publishing works
GitHub Actions publishes the site (Settings, Pages, Source: GitHub Actions). It runs:
- every time you upload a file to this repo, and
- every 6 hours on its own, so new or edited products get their own page and appear in sitemap.xml.
To publish right now: Actions tab, "Build SEO pages and publish", Run workflow.
A brand-new product works immediately anyway; its Google page appears after the next run.

## Page addresses
/product/<slug>/   /category/<key>/   /products/   /faq/   /about/   /contact/   /delivery/   /shipping/   /refund/   /privacy/
sitemap.xml and 404.html are created automatically. Do not upload your own sitemap.xml.

## Update the store
1. Add file, Upload files, drag in the changed files, Commit changes.
2. Wait about 2 minutes (Actions tab shows a green tick), open the site and press Cmd+Shift+R.

## Security notes
- The Supabase publishable key in index.html is meant to be public. Admin access is protected by
  Supabase Auth, the admins table and row-level security. The builder uses only that public key.
- Never put a service role key, secret key, Resend key or Cloudinary API secret in this repo.
- Database and server code live in the separate supabase/ folder. Do NOT upload that folder to GitHub.

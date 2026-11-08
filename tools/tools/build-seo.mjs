// ═══════════════════════════════════════════════════════════════
// SupplyWala · SEO page builder
// Reads index.html (the app) and the live products from Supabase, then
// writes a real page for every product and category so Google can find
// and rank each one:
//   /product/<slug>/   /category/<key>/   /products/   /faq/  /about/ ...
// plus sitemap.xml (with product images) and 404.html.
// Each page is the full app with its own title, description, links and
// structured data, so visitors get the normal store instantly.
//
// Run:  node tools/build-seo.mjs --out _site
// GitHub Actions runs it automatically (see .github/workflows/seo.yml).
// Only the public (publishable) key is used. No secrets needed.
// ═══════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const SITE = "https://www.supplywala.store";
const ROOT = process.cwd();
const outArg = process.argv.indexOf("--out");
const OUT = join(ROOT, outArg > -1 ? process.argv[outArg + 1] : "_site");
const TEMPLATE = readFileSync(join(ROOT, "index.html"), "utf8");

const SUPABASE_URL = (TEMPLATE.match(/const SUPABASE_URL\s*=\s*'([^']+)'/) || [])[1];
const SUPABASE_KEY = (TEMPLATE.match(/const SUPABASE_ANON_KEY\s*=\s*'([^']+)'/) || [])[1];
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Could not find SUPABASE_URL / SUPABASE_ANON_KEY in index.html");

const DEFAULT_CATS = {
  medical: "Medical & Hospital", cleaning: "Cleaning & Janitorial", hardware: "Hardware & Tools",
  industrial: "Industrial Supplies", safety: "Safety & Security", trolleys: "Trolleys & Handling",
  furniture: "Hospital Furniture",
};
const INFO = {
  faq:      { title: "FAQ & Help: Ordering, Delivery & Payment | SupplyWala Karachi", desc: "Answers about ordering, delivery charges, cash on delivery, JazzCash and EasyPaisa payment, returns and bulk orders at SupplyWala, Karachi." },
  about:    { title: "About SupplyWala: 15 Years Supplying Karachi Hospitals & Businesses", desc: "SupplyWala brings medical, hospital, cleaning, hardware and industrial supplies to Karachi at honest local prices, backed by 15 years of supply experience." },
  contact:  { title: "Contact SupplyWala Karachi: WhatsApp +92 332 7894533", desc: "Contact SupplyWala on WhatsApp +92 332 7894533, call +92 311 1074617 or email info@supplywala.store. Lohar Street, Saddar, Karachi. Mon to Sat, 8am to 7pm." },
  delivery: { title: "Delivery Info: Delivery Across Karachi in 2-4 Days | SupplyWala", desc: "SupplyWala delivers across Karachi in 2 to 4 working days. Rs. 200 delivery, free on orders of Rs. 5,000 or more. Cash on delivery available." },
  shipping: { title: "Shipping Policy | SupplyWala Karachi", desc: "SupplyWala shipping policy: delivery areas, timeframes, charges and order tracking for Karachi." },
  refund:   { title: "Refund & Return Policy | SupplyWala Karachi", desc: "Damaged or wrong item? Message SupplyWala within 7 days for a free pickup or replacement. Refunds in 3 to 5 business days." },
  privacy:  { title: "Privacy Policy | SupplyWala", desc: "How SupplyWala collects and protects your name, phone number, address and email." },
};

// ── helpers ──
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const text = (html) => String(html ?? "").replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|div|li|h\d)>/gi, " ").replace(/<[^>]*>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, " ").trim();
const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");
const rs = (n) => "Rs. " + Math.round(Number(n) || 0).toLocaleString("en-US");
const https = (u) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : null);
// Pakistani shoppers search "<product> price in Pakistan"; keep titles within ~65 characters
function productTitle(name) {
  for (const t of [`${name} Price in Pakistan | Buy in Karachi | SupplyWala`, `${name} Price in Pakistan | SupplyWala`, `${name} | SupplyWala`])
    if (t.length <= 65) return t;
  return clip(name, 52) + " | SupplyWala";
}
// Whole sentences only, never cut mid-sentence
function fitSentences(t, n) {
  let out = "";
  for (const s of String(t).split(/(?<=[.!?])\s+/)) {
    const next = (out + " " + s.trim()).trim();
    if (next.length > n) break;
    out = next;
  }
  return out;
}
function productDesc(name, priceText, descText) {
  const head = `Buy ${name} in Karachi ${priceText}.`;
  const tail = "Cash on delivery, 2-4 day delivery, free over Rs. 5,000.";
  const mid = fitSentences(descText, 158 - head.length - tail.length - 2);
  return [head, mid, tail].filter(Boolean).join(" ").slice(0, 160);
}
const jsonld = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

async function api(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

function variationPrices(p) {
  const raw = Array.isArray(p.variations) ? p.variations : p.variations && (p.variations.options || Object.values(p.variations));
  if (!Array.isArray(raw)) return [];
  return raw.filter((v) => v && typeof v === "object" && v.price !== null && v.price !== undefined && v.price !== "")
    .map((v) => Number(v.price)).filter((n) => n > 0);
}
function variationNames(p) {
  const raw = Array.isArray(p.variations) ? p.variations : p.variations && (p.variations.options || Object.values(p.variations));
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => (v && typeof v === "object" ? v.name : v)).filter(Boolean).map(String);
}
// image_urls is the ordered list (first = main photo); image_url is only an old fallback
const images = (p) => [...new Set((Array.isArray(p.image_urls) && p.image_urls.length ? p.image_urls : [p.image_url]).map(https).filter(Boolean))];
// The real brand (Dettol, 3M ...). Empty when unknown: Google is never told SupplyWala made it.
const brandOf = (p) => {
  if (p.brand && String(p.brand).trim()) return String(p.brand).trim();
  const s = Array.isArray(p.specs) ? p.specs.find((x) => /brand/i.test(String(x?.label || ""))) : null;
  return s && s.value ? String(s.value).trim() : "";
};
const altOf = (p, i) => {
  const a = Array.isArray(p.image_alts) ? String(p.image_alts[i] ?? "").trim() : "";
  return a || (i ? `${p.name} - photo ${i + 1}` : `${p.name} - buy in Karachi`);
};
const ytId = (u) => (String(u || "").match(/^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i) || [])[1] || "";
const list = (v) => (Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : []);

// ── page assembly ──
const FAQ_RE = /<!-- FAQ Schema -->\s*<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/;
function page({ path, title, desc, image, ogType = "website", product = null, breadcrumb = null, extraLd = [], ssr = "", showId = null, noindex = false, keepFaq = false }) {
  const url = SITE + path;
  let h = TEMPLATE;
  if (!keepFaq) h = h.replace(FAQ_RE, "");
  const set = (re, val) => { if (!re.test(h)) throw new Error("template changed, missing: " + re); h = h.replace(re, val); };
  set(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  set(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`);
  set(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${esc(url)}">`);
  set(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`);
  set(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`);
  set(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${esc(url)}">`);
  set(/<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${esc(ogType)}">`);
  if (image) {
    set(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${esc(image)}">`);
    set(/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${esc(image)}">`);
  }
  set(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(title)}">`);
  set(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${esc(desc)}">`);
  h = h.replace(/<link rel="alternate" hreflang="(en-PK|x-default)" href="[^"]*">/g, (_m, l) => `<link rel="alternate" hreflang="${l}" href="${esc(url)}">`);
  if (noindex) h = h.replace(/<meta name="robots" content="[^"]*">/, `<meta name="robots" content="noindex, follow">`);
  set(/<script id="schemaProduct" type="application\/ld\+json">[\s\S]*?<\/script>/, `<script id="schemaProduct" type="application/ld+json">${product ? jsonld(product) : "{}"}</script>`);
  set(/<script id="schemaBreadcrumb" type="application\/ld\+json">[\s\S]*?<\/script>/, `<script id="schemaBreadcrumb" type="application/ld+json">${breadcrumb ? jsonld(breadcrumb) : "{}"}</script>`);
  const extra = extraLd.map((o) => `<script type="application/ld+json">${jsonld(o)}</script>`).join("\n");
  const style = path === "/" ? "" : `<style id="sw-route-style">#page-home{display:none!important}${showId ? `#${showId}{display:block!important}` : ""}</style>`;
  h = h.replace("</head>", `${extra}\n${style}\n</head>`);
  if (ssr) {
    const i = h.indexOf("</header>");
    if (i < 0) throw new Error("template changed: no </header>");
    h = h.slice(0, i + 9) + `\n<main id="sw-ssr" class="sw-ssr">${ssr}</main>` + h.slice(i + 9);
  }
  const file = path === "/" ? join(OUT, "index.html") : path === "/404.html" ? join(OUT, "404.html") : join(OUT, path, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, h);
}

const crumbsLd = (items) => ({
  "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + path })),
});
const crumbsHtml = (items) => `<nav class="sw-crumbs" aria-label="Breadcrumb">${items.map(([n, p], i) =>
  i === items.length - 1 ? `<span>${esc(n)}</span>` : `<a href="${esc(p)}">${esc(n)}</a> › `).join("")}</nav>`;
const card = (p) => {
  const img = images(p)[0];
  return `<a class="sw-pcard" href="/product/${encodeURIComponent(p.slug)}/">${img ? `<img src="${esc(img)}" alt="${esc(altOf(p, 0))}" loading="lazy" width="200" height="160">` : ""}
<strong>${esc(p.name)}</strong><br><span>${rs(p.price)}</span></a>`;
};

// ── main ──
const [products, catsDb, reviews] = await Promise.all([
  api("products?select=*&active=eq.true&order=created_at.desc"),
  api("categories?select=*&order=sort_order.asc").catch(() => []),
  api("reviews?select=product_id,rating,reviewer_name,review_text,created_at&status=eq.approved&order=created_at.desc").catch(() => []),
]);
const live = products.filter((p) => p.slug && (p.status ?? "published") === "published");
if (!live.length) throw new Error("No products returned. Stopping so the live site keeps its pages.");

const catName = (k) => (catsDb.find((c) => c.key === k)?.name) || DEFAULT_CATS[k] || (k ? k[0].toUpperCase() + k.slice(1) : "Products");
const catDesc = (k) => (catsDb.find((c) => c.key === k)?.description) || "";
const catKeys = [...new Set(live.map((p) => p.category).filter(Boolean))];
const byCat = (k) => live.filter((p) => p.category === k);
const revFor = (id) => reviews.filter((r) => Number(r.product_id) === Number(id));
const priceValidUntil = `${new Date().getUTCFullYear() + 1}-12-31`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// copy the repo's own files (images, CNAME, robots.txt, ...)
const SKIP = new Set(["_site", "tools", "node_modules", "supabase", "README.md", "sitemap.xml", "404.html"]);
function copyTree(from, to, top) {
  for (const name of readdirSync(from)) {
    if (name.startsWith(".") || (top && (SKIP.has(name) || join(from, name) === OUT))) continue;
    const src = join(from, name);
    if (statSync(src).isDirectory()) { mkdirSync(join(to, name), { recursive: true }); copyTree(src, join(to, name), false); }
    else copyFileSync(src, join(to, name));
  }
}
copyTree(ROOT, OUT, true);

const sitemap = [];
const addUrl = (path, priority, imgs = []) => sitemap.push({ path, priority, imgs });

// home (FAQ data only belongs on /faq/)
page({ path: "/", title: (TEMPLATE.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.replace(/&amp;/g, "&") || "SupplyWala",
  desc: (TEMPLATE.match(/<meta name="description" content="([^"]*)">/) || [])[1]?.replace(/&amp;/g, "&") || "", image: null });
addUrl("/", "1.0");

// products
for (const p of live) {
  const path = `/product/${encodeURIComponent(p.slug)}/`;
  const cat = p.category;
  const cname = catName(cat);
  const imgs = images(p);
  const prices = variationPrices(p);
  const low = prices.length ? Math.min(...prices) : Number(p.price);
  const high = prices.length ? Math.max(...prices) : Number(p.price);
  const inStock = p.stock_status !== "out_of_stock";
  const descText = text(p.description);
  const title = p.seo_title && p.seo_title.trim().length >= 10 ? p.seo_title.trim() : productTitle(p.name);
  const metaDesc = p.seo_description && p.seo_description.trim().length >= 50 ? p.seo_description.trim()
    : productDesc(p.name, (low !== high ? "from " : "for ") + rs(low), descText);
  const rv = revFor(p.id);
  const avg = rv.length ? rv.reduce((a, r) => a + Number(r.rating || 0), 0) / rv.length : 0;
  const shipping = {
    "@type": "OfferShippingDetails",
    shippingRate: { "@type": "MonetaryAmount", value: low >= 5000 ? 0 : 200, currency: "PKR" },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: "PK", addressRegion: "Sindh" },
    deliveryTime: { "@type": "ShippingDeliveryTime",
      handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
      transitTime: { "@type": "QuantitativeValue", minValue: 2, maxValue: 4, unitCode: "DAY" } },
  };
  const returns = { "@type": "MerchantReturnPolicy", applicableCountry: "PK",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow", merchantReturnDays: 7 };
  const offerBase = { priceCurrency: "PKR", availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    url: SITE + path, itemCondition: "https://schema.org/NewCondition", priceValidUntil,
    seller: { "@type": "Organization", name: "SupplyWala" }, shippingDetails: shipping, hasMerchantReturnPolicy: returns };
  const brand = brandOf(p);
  const highlights = list(p.highlights);
  const inBox = list(p.in_the_box);
  const faqs = (Array.isArray(p.product_faqs) ? p.product_faqs : []).filter((f) => f && f.q && f.a);
  const extraProps = [
    p.warranty && { "@type": "PropertyValue", name: "Warranty", value: String(p.warranty) },
    p.dimensions && { "@type": "PropertyValue", name: "Dimensions", value: String(p.dimensions) },
    inBox.length && { "@type": "PropertyValue", name: "What's in the box", value: inBox.join(", ") },
  ].filter(Boolean);
  const productLd = {
    "@context": "https://schema.org", "@type": "Product", name: p.name,
    description: clip(descText || highlights.join(". ") || metaDesc, 4900), sku: p.sku || String(p.id), url: SITE + path,
    category: cname,
    ...(brand ? { brand: { "@type": "Brand", name: brand } } : {}),
    ...(p.mpn ? { mpn: String(p.mpn) } : {}),
    ...(p.gtin ? { gtin: String(p.gtin) } : {}),
    ...(p.country_of_origin ? { countryOfOrigin: String(p.country_of_origin) } : {}),
    ...(Number(p.weight) > 0 ? { weight: { "@type": "QuantitativeValue", value: Number(p.weight), unitCode: "KGM" } } : {}),
    ...(extraProps.length ? { additionalProperty: extraProps } : {}),
    ...(imgs.length ? { image: imgs } : {}),
    offers: low !== high
      ? { "@type": "AggregateOffer", lowPrice: low, highPrice: high, offerCount: prices.length, ...offerBase }
      : { "@type": "Offer", price: low, ...offerBase },
    ...(rv.length ? {
      aggregateRating: { "@type": "AggregateRating", ratingValue: Math.round(avg * 10) / 10, reviewCount: rv.length, bestRating: 5, worstRating: 1 },
      review: rv.slice(0, 5).map((r) => ({ "@type": "Review", author: { "@type": "Person", name: String(r.reviewer_name || "Customer") },
        reviewRating: { "@type": "Rating", ratingValue: Number(r.rating), bestRating: 5 }, reviewBody: clip(text(r.review_text), 500),
        ...(r.created_at ? { datePublished: String(r.created_at).slice(0, 10) } : {}) })),
    } : {}),
  };
  const crumbs = [["Home", "/"], [cname, `/category/${encodeURIComponent(cat)}/`], [p.name, path]];
  const specs = Array.isArray(p.specs) ? p.specs.filter((s) => s && s.label && s.value) : [];
  const detailRows = [
    brand && ["Brand", brand], p.mpn && ["Model number", p.mpn], ["SKU", p.sku || ""], p.gtin && ["Barcode (GTIN)", p.gtin],
    p.dimensions && ["Dimensions", p.dimensions], Number(p.weight) > 0 && ["Weight", `${Number(p.weight)} kg`],
    p.country_of_origin && ["Country of origin", p.country_of_origin], p.warranty && ["Warranty", p.warranty],
  ].filter((r) => r && r[1]).map(([l, v]) => [l, String(v)]);
  for (const s of specs) {
    if (/brand/i.test(s.label) && brand) continue;
    if (!detailRows.some(([l]) => l.toLowerCase() === String(s.label).toLowerCase())) detailRows.push([String(s.label), String(s.value)]);
  }
  const names = variationNames(p);
  const tiers = Array.isArray(p.bulk_pricing) ? p.bulk_pricing : [];
  const related = byCat(cat).filter((x) => x.id !== p.id).slice(0, 8);
  const waText = encodeURIComponent(`Hi SupplyWala! I want to order: ${p.name}`);
  const ssr = `${crumbsHtml(crumbs)}
<div class="sw-pmain">
  <div>${imgs[0] ? `<img src="${esc(imgs[0])}" alt="${esc(altOf(p, 0))}" width="600" height="420">` : ""}</div>
  <div>
    <h1>${esc(p.name)}</h1>
    ${brand ? `<p>Brand: <strong>${esc(brand)}</strong></p>` : ""}
    <div class="sw-price">${low !== high ? "From " : ""}${rs(low)}${Number(p.original_price) > low ? ` <s style="font-size:15px;color:#94a3b8;font-weight:500;">${rs(p.original_price)}</s>` : ""}</div>
    <p><strong>${inStock ? "In stock" : "Out of stock"}</strong>${p.unit ? ` · ${esc(p.unit)}` : ""}${Number(p.min_order_qty) > 1 ? ` · Minimum order ${Number(p.min_order_qty)}` : ""}</p>
    ${highlights.length ? `<h2>About this item</h2><ul>${highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
    ${names.length ? `<p>Options: ${names.map(esc).join(", ")}</p>` : ""}
    ${tiers.length ? `<p>Bulk prices: ${tiers.map((t) => `${esc(t.min_qty ?? t.qty ?? t.min ?? "")}+ for ${rs(t.price)}`).join(", ")}</p>` : ""}
    ${descText ? `<p>${esc(descText)}</p>` : ""}
    <p>Delivery across Karachi in 2-4 working days. Rs. 200 delivery, free on orders of Rs. 5,000 or more. Pay by cash on delivery, bank transfer, JazzCash or EasyPaisa.</p>
    <p><a href="https://wa.me/923327894533?text=${waText}" rel="noopener">Order on WhatsApp</a></p>
  </div>
</div>
${detailRows.length ? `<h2>Specifications</h2><table>${detailRows.map(([l, v]) => `<tr><th style="text-align:left;padding:4px 12px 4px 0;">${esc(l)}</th><td>${esc(v)}</td></tr>`).join("")}</table>` : ""}
${inBox.length ? `<h2>What's in the box</h2><ul>${inBox.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
${ytId(p.video_url) ? `<h2>Product video</h2><p><a href="https://www.youtube.com/watch?v=${ytId(p.video_url)}" rel="noopener">Watch the ${esc(p.name)} video on YouTube</a></p>` : ""}
${faqs.length ? `<h2>Questions &amp; answers</h2>${faqs.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}` : ""}
${rv.length ? `<h2>Customer reviews (${rv.length})</h2>${rv.slice(0, 5).map((r) => `<p><strong>${esc(r.reviewer_name)}</strong> · ${"★".repeat(Number(r.rating) || 0)}<br>${esc(clip(text(r.review_text), 400))}</p>`).join("")}` : ""}
${related.length ? `<h2>More ${esc(cname)}</h2><div class="sw-pgrid">${related.map(card).join("")}</div>` : ""}`;
  page({ path, title, desc: metaDesc, image: imgs[0] || null, ogType: "product", product: productLd, breadcrumb: crumbsLd(crumbs), ssr });
  addUrl(path, "0.8", imgs.slice(0, 10).map((u, i) => ({ loc: u, title: altOf(p, i) })));
}

// categories
for (const k of catKeys) {
  const path = `/category/${encodeURIComponent(k)}/`;
  const name = /suppl/i.test(catName(k)) ? catName(k) : catName(k) + " Supplies";
  const list = byCat(k);
  let examples = "";
  for (const p of list) { const n = examples ? examples + ", " + p.name : p.name; if (n.length > 70) break; examples = n; }
  const desc = `Buy ${name} in Karachi at honest local prices${examples ? ": " + examples : ""}. Cash on delivery, free delivery over Rs. 5,000.`;
  const ctitle = [`${name} in Karachi | Price in Pakistan | SupplyWala`, `${name} in Karachi | SupplyWala`].find((t) => t.length <= 65) || `${name} | SupplyWala`;
  const crumbs = [["Home", "/"], ["Products", "/products/"], [name, path]];
  const others = catKeys.filter((x) => x !== k);
  const ssr = `${crumbsHtml(crumbs)}
<h1>${esc(name)} in Karachi</h1>
<p>${esc(catDesc(k) ? catDesc(k) + ". " : "")}${list.length} product${list.length === 1 ? "" : "s"} with prices in Pakistani rupees, delivered across Karachi in 2-4 working days.</p>
<div class="sw-pgrid">${list.map(card).join("")}</div>
${others.length ? `<h2>Other categories</h2><p>${others.map((o) => `<a href="/category/${encodeURIComponent(o)}/">${esc(catName(o))}</a>`).join(" · ")}</p>` : ""}`;
  page({ path, title: ctitle, desc, image: images(list[0] || {})[0] || null,
    breadcrumb: crumbsLd(crumbs), ssr,
    extraLd: [{ "@context": "https://schema.org", "@type": "CollectionPage", name: `${name} in Karachi`, url: SITE + path,
      mainEntity: { "@type": "ItemList", itemListElement: list.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/product/${encodeURIComponent(p.slug)}/`, name: p.name })) } }] });
  addUrl(path, "0.9");
}

// all products
{
  const crumbs = [["Home", "/"], ["All Products", "/products/"]];
  const ssr = `${crumbsHtml(crumbs)}<h1>All Products: Medical, Cleaning, Hardware & Industrial Supplies in Karachi</h1>
<p>${catKeys.map((k) => `<a href="/category/${encodeURIComponent(k)}/">${esc(catName(k))}</a>`).join(" · ")}</p>
<div class="sw-pgrid">${live.map(card).join("")}</div>`;
  page({ path: "/products/", title: "All Products: Medical, Cleaning & Industrial Supplies Karachi | SupplyWala",
    desc: `Browse ${live.length}+ medical, hospital, cleaning, hardware and industrial supplies with prices in Karachi. Cash on delivery, free delivery over Rs. 5,000.`,
    breadcrumb: crumbsLd(crumbs), ssr });
  addUrl("/products/", "0.9");
}

// info pages (their content is already in the app; just give each its own URL + title)
for (const [k, v] of Object.entries(INFO)) {
  page({ path: `/${k}/`, title: v.title, desc: v.desc, breadcrumb: crumbsLd([["Home", "/"], [v.title.split(/[:|]/)[0].trim(), `/${k}/`]]),
    showId: `page-${k}`, keepFaq: k === "faq" });
  addUrl(`/${k}/`, k === "privacy" ? "0.3" : k === "faq" ? "0.7" : "0.5");
}

// 404: the full app, so links to brand-new products still work before the next build
page({ path: "/404.html", title: "Page not found | SupplyWala", desc: "This page could not be found. Browse medical, cleaning, hardware and industrial supplies at SupplyWala, Karachi.", noindex: true });
{
  // on a 404 the app reads the address itself; do not hide the home page
  const f = join(OUT, "404.html");
  writeFileSync(f, readFileSync(f, "utf8").replace(/<style id="sw-route-style">[\s\S]*?<\/style>/, ""));
}

// sitemap with product images
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${sitemap.map((u) => `  <url><loc>${esc(SITE + u.path)}</loc><priority>${u.priority}</priority>${u.imgs.map((i) => `<image:image><image:loc>${esc(i.loc)}</image:loc></image:image>`).join("")}</url>`).join("\n")}
</urlset>
`;
writeFileSync(join(OUT, "sitemap.xml"), xml);
if (!existsSync(join(OUT, "robots.txt"))) writeFileSync(join(OUT, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
writeFileSync(join(OUT, ".nojekyll"), "");

// Renamed products: old links send visitors (and Google) to the new page. Cloudflare Pages reads _redirects.
{
  const taken = new Set(live.map((p) => p.slug));
  const lines = [];
  for (const p of live) {
    for (const old of (Array.isArray(p.old_slugs) ? p.old_slugs : [])) {
      if (!old || taken.has(old) || !/^[a-z0-9-]+$/.test(old)) continue;
      taken.add(old);
      lines.push(`/product/${old}/ /product/${encodeURIComponent(p.slug)}/ 301`, `/product/${old} /product/${encodeURIComponent(p.slug)}/ 301`);
    }
  }
  if (lines.length) writeFileSync(join(OUT, "_redirects"), lines.join("\n") + "\n");
  console.log(`Redirects for renamed products: ${lines.length / 2}`);
}

console.log(`Built ${live.length} product pages, ${catKeys.length} category pages, ${Object.keys(INFO).length} info pages, sitemap with ${sitemap.length} URLs -> ${OUT}`);

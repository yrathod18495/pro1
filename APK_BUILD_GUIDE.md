# Building an Android APK from 12Labs (PWA → TWA)

Everything in the codebase is already set up. This is the remaining
manual work, which all happens outside the repo.

---

## What's already done (in this codebase)

- **`src/app/manifest.ts`** — this is what actually serves
  `/manifest.webmanifest` (a Next.js manifest route overrides any static
  file of the same name). Now complete and PWABuilder-valid: `id`,
  `orientation`, `categories`, `lang`/`dir`, a maskable icon, and app
  shortcuts.
- **Icons switched to committed files.** The manifest used to build icon
  URLs on the fly from the admin-configurable Cloudinary logo in RTDB.
  For an installed app that's fragile — the RTDB read can time out, and
  changing the admin logo would silently change (or break) the installed
  app's icon. Now uses `public/icon-192x192.png` / `icon-512x512.png`.
- **Icon filenames fixed.** They were `icon-192#U00d7192.png` — the `×`
  (multiplication sign) had been mangled into a literal `#U00d7` in the
  filename, so these 404'd at their expected URLs. Renamed to
  `icon-192x192.png` / `icon-512x512.png`.
- **Service worker now actually registers.** PWABuilder reported "did not
  find a Service Worker" because `/sw.js` was only ever registered inside
  the push-notification flow — which required a logged-in user *and*
  already-granted notification permission, so a normal visit registered
  nothing. (`@ducanh2912/next-pwa` is in package.json but was never wired
  into `next.config.js`, so nothing generated one either.) It now
  registers on page load in `src/components/push-subscription-handler.tsx`.
- **Added a `fetch` handler to `public/sw.js`** — browsers require one
  before they'll treat an app as installable, and PWABuilder needs it to
  package. It's network-only with no page caching (this app is
  server-rendered with live auth/credit state — serving cached HTML could
  show stale or wrong data), plus a simple offline message when a
  navigation fails with no connection.
- **`public/sw.js` icon paths fixed too** — push notifications referenced
  `/icon-192?192.png`, another mangling of the filename below, so
  notification icons were broken as well.
- `theme_color` now matches `viewport.themeColor` in `src/app/layout.tsx`
  (`#2563eb`) — PWABuilder flags a mismatch.
- `public/.well-known/assetlinks.json` — placeholder file in place; you
  fill in two values in Step 3 below.
- A service worker already ships via `@ducanh2912/next-pwa`.

---

## Step 1 — Deploy first

The manifest/icon fixes above need to be live before PWABuilder reads
them. Deploy, then confirm these load in a browser:

- `https://www.12labs.in/manifest.webmanifest`
- `https://www.12labs.in/icon-192x192.png`
- `https://www.12labs.in/icon-512x512.png`

All three must return 200, not 404.

---

## Step 2 — Generate the package

1. Go to **https://www.pwabuilder.com**
2. Enter `https://www.12labs.in` and hit Start.
3. It scores the PWA and lists any warnings. Manifest/icons should pass
   now; anything left will be optional nice-to-haves.
4. Click **Package for stores → Android**.
5. Settings that matter:
   - **Package ID** — something like `in.twelvelabs.app`. Write this
     down, you need it in Step 3. It can never be changed after the
     first Play Store upload.
   - **Signing key** — choose "Create new". **Download the generated
     `.keystore` file and save it somewhere safe with its passwords.**
     If you lose it you can never update the app on Play Store again —
     you'd have to publish a whole new listing.
   - Leave "Include source code" on if you might want to customize later.
6. Download the zip. It contains:
   - `app-release-signed.apk` — installable directly on a phone for testing
   - `app-release-bundle.aab` — the file Play Store actually wants
   - `assetlinks.json` — the real one, with your fingerprint in it
   - `signing.keystore` (+ a readme with the passwords)

---

## Step 3 — Wire up Digital Asset Links (required)

Without this, the app opens with a browser address bar visible at the top
instead of looking like a real app.

1. Open the `assetlinks.json` that came in the PWABuilder zip.
2. Copy its contents over `public/.well-known/assetlinks.json` in this
   repo — or just replace the two placeholders in the existing file:
   - `REPLACE_WITH_YOUR_PACKAGE_NAME` → your Package ID from Step 2
   - `REPLACE_WITH_YOUR_SHA256_FINGERPRINT` → the SHA-256 fingerprint
     from the PWABuilder zip
3. Deploy again.
4. Verify it's live: `https://www.12labs.in/.well-known/assetlinks.json`
   must return that JSON.

---

## Step 4 — Test

Install `app-release-signed.apk` on an Android phone (enable "Install
unknown apps" for your file manager first). Check:

- App icon and name look right
- No browser address bar at the top (if there is one, Step 3 didn't take
  — the file isn't live, or the fingerprint/package name don't match)
- Login works, audio plays, everything behaves like the website

---

## Step 5 — Play Store (optional)

1. Google Play Console account — one-time $25.
2. Create the app, upload `app-release-bundle.aab`.
3. Fill in store listing, content rating, privacy policy URL
   (`https://www.12labs.in/privacy` already exists), data safety form.
4. Submit for review.

---

## Updating the app later

The app just loads the live website, so **normal website deploys update
the app instantly** — no new APK, no Play Store review. You only need to
rebuild and re-upload if you change the app icon, name, package ID, or
anything else in the manifest itself.

---

## One important caveat about payments

If you publish to Play Store and the app sells anything digital
(credits, paid music tracks), Google's policy generally requires their
own billing system — Razorpay checkout inside a TWA can get the listing
rejected or removed. Options: sell only on the website and keep the app
free-tier, or integrate Google Play Billing (that needs a real native
wrapper like Capacitor, not a TWA). Worth deciding before you submit,
not after a rejection.

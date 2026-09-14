# Fixes applied (latest update: theme_color reverted to white)

## Why the revert
You confirmed `#ffffff` worked correctly before — no washed-out icons, no
mismatch. Your page's own `--background` is already a near-white icy-blue
(`210 100% 98%`), so forcing the status bar to a vivid `#2563eb` created a
visible seam and depended on the OS/TWA correctly recalculating icon
contrast. White removes the mismatch entirely: the status bar area now
matches the content directly below it, and the OS picks dark icons for a
light background automatically — same as before.

**Changed to `#ffffff` in:**
- `src/app/manifest.ts` → `theme_color`
- `src/app/layout.tsx` → `viewport.themeColor`
- `src/app/globals.css` → `--status-bar-color` (used by `.status-bar-spacer`)
- `public/manifest.json` → `theme_color` (this file isn't actually linked
  anywhere — `layout.tsx` serves `/manifest.webmanifest` via `manifest.ts`,
  which wins over this static file — but updated for consistency so it
  doesn't confuse anyone reading it later)

The `.status-bar-spacer` div and safe-area CSS from the previous fix are
kept as-is (still useful structurally if the app ever renders edge-to-edge)
— only its color changed, from blue to white.

## ⚠️ Important — this needs a fresh APK, not just a redeploy
Your APK is a **TWA (Trusted Web Activity)** built via PWABuilder (see
`APK_BUILD_GUIDE.md`). A TWA's status bar color is a **native Android
setting baked in at package time** from your manifest — it is NOT
something the already-installed APK re-reads from your live site after
you deploy. Deploying this code updates your *website*, but the *APK
already on your phone* keeps whatever color it was packaged with.

To actually see this on the installed app:
1. Confirm the deploy is live: open
   `https://www.12labs.in/manifest.webmanifest` and check
   `"theme_color":"#ffffff"` is there.
2. Go to https://www.pwabuilder.com, enter your URL again, and generate a
   **new** Android package (Package for stores → Android).
3. Install that new APK (uninstall/replace the old one) and check the
   status bar again.

If you're instead just viewing this in a regular browser tab (not the
installed APK), the OS status bar there is not affected by theme_color at
all on most browsers/versions — you'd need to test on the installed app to
judge this properly.

---

(Earlier fixes — service worker caching, maintenance-guard timeout/cache,
chat notification prefetch — are unchanged from before; see git history /
prior summary if needed.)

---

## Landing page scroll-jump fix — `src/components/lazy-section.tsx`

**Problem:** each below-the-fold section on the landing page reserves a
placeholder height (`minHeight`, e.g. 500px) until it scrolls into view.
The moment it intersected, the code switched that to `minHeight: 'auto'`
in the same instant — before the section's own content (often its own
separately-downloaded `next/dynamic` chunk) had actually mounted. The box
briefly collapsed toward 0px, then snapped back out once the real content
arrived — a sudden layout shift right while you're scrolling through it,
which is what was throwing your scroll position off. Once every section
has been scrolled past once, everything's already mounted, so there's
nothing left to collapse — matching why it felt fine after one full
scroll.

**Fix:** `minHeight` now stays fixed permanently instead of switching to
`'auto'` after intersecting. A `min-height` can still grow if the real
content ends up taller (safe, gradual), but it can never collapse smaller
than the space already reserved — so nothing suddenly jumps mid-scroll.

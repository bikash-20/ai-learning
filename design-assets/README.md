# Design assets

This folder holds the **original, full-resolution brand artwork** that
the web app builds from. Files in here are intentionally outside the
`apps/web/public/` build pipeline so they don't ship to users.

## Source artwork

- `bg-login.jpg` — golden star-chart background for the sign-in screen.
  Source: 736×414, 28 KB JPEG. Processed into mobile + desktop WebP for
  the web (see `apps/web/public/img/`).
- `bg-explore.jpg` — calm constellation background for the protected
  app shell. Source: 1200×1006, 167 KB JPEG. Processed into mobile +
  desktop WebP for the web.

## Processed variants

The web build consumes these optimized copies (never the originals):

| Path                                          | Variant     | Bytes  |
| -------------------------------------------- | ----------- | ------ |
| `apps/web/public/img/bg-login-m.webp`        | mobile 800w | 16 KB   |
| `apps/web/public/img/bg-login-d.webp`        | desktop 1920w | 54 KB |
| `apps/web/public/img/bg-explore-m.webp`      | mobile 800w | 44 KB   |
| `apps/web/public/img/bg-explore-d.webp`      | desktop 1920w | 195 KB |

Re-running the build pipeline (sips resize → cwebp encode) is safe to
repeat; the scripts live in this repo's git history if you want to
restore them.

## Why outside `public/`?

Next.js serves everything under `apps/web/public/` at the site root.
Two reasons to keep the originals here:

1. **Build size**. The 3200×2080 desktop JPEG (and any future exports)
   shouldn't ride along on every deploy.
2. **Editing ergonomics**. Designers (or future-us) can edit the
   originals in place without touching the served copies.

If you regenerate the optimized WebPs, re-run your preferred image
pipeline (e.g. `sips -Z 800` + `cwebp -q 78`) and overwrite the files
in `apps/web/public/img/`. Keep both mobile and desktop variants in
sync — the CSS `image-set` rule in `globals.css` selects between them
based on viewport width.
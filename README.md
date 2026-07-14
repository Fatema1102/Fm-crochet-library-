# FM Crochet Library

A real, deployable version of the app — built with Vite + React,
using Supabase (database, auth, storage) as the backend.

**Current status: Phase 1 + Phase 2 complete.**
- Phase 1: Admin sidebar shell, full Website Content CMS (rich text editor,
  logo/favicon, SEO, contact, social links, footer), notifications, Settings
- Phase 2: Yarn Inventory, Materials, yarn-to-project linking with automatic
  stock deduction

## Database setup

Run these two files in your Supabase project's SQL Editor, **in order**:

1. `01_supabase_migration_initial.sql` — core tables (categories, projects,
   patterns, site_settings), RLS, storage bucket policies
2. `02_supabase_migration_phase2_yarn_materials.sql` — yarn_inventory,
   materials, project_yarn linking table, auto stock-deduction trigger, RLS

If you've already run the first one in a previous phase, just run the
second one — SQL files are safe to run once each; re-running the first
won't duplicate anything since it uses `if not exists`.

## Test it on your own computer first (recommended)

You'll need [Node.js](https://nodejs.org) installed (any recent version).

```bash
npm install
npm run dev
```

Then open the URL it prints (usually `http://localhost:5173`). Try
signing into Admin and uploading a photo.

## Deploy it for real (so others can visit it)

**Easiest: Netlify or Vercel, no command line needed**

1. Run `npm run build` — this creates a `dist` folder with the finished site
2. Go to [netlify.com](https://netlify.com) (or [vercel.com](https://vercel.com)) → sign up free
3. Drag the `dist` folder onto their dashboard ("Deploy manually" / "Add new site")
4. You'll get a live URL in about a minute

**Working from a phone / no laptop:** push this project to a GitHub repo
(GitHub's mobile web upload works fine for this), then open
`stackblitz.com/github/YOUR-USERNAME/YOUR-REPO` to run and test it live
in-browser, or connect the repo to Netlify/Vercel for automatic deploys.

## What's already configured

- Your Supabase project URL and publishable key are already in
  `src/FMCrochetLibrary.jsx` (near the top) — no extra setup needed
- Styling uses Tailwind's CDN build for now (zero config, works
  immediately). Fine for personal use; if this grows into something
  high-traffic later, ask to have Tailwind properly installed as a build
  step instead

## If something doesn't work

Since this is a real webpage (not Claude's preview sandbox), your
browser's dev tools (F12 → Console tab, or on mobile: your browser's
"desktop site" + remote inspect, or just describe what you see) will
show the actual error if something fails — share that exact text and
it'll say precisely what's wrong (wrong key, RLS policy, missing
migration, etc.).

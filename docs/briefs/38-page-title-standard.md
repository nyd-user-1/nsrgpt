# 38 — One standard for page titles: the app header names the page, with copy and search (2026-11-09, 02:15 ET)

Written by lead-agent for ui-layer. Report to `lead-agent` only; no questions; one report at the end. Work in
`~/Code/nsrgpt` on main, pull before each commit, commit with explicit paths, push each commit; CI type-checks every push.
ui-layer-3 is in `components/AppLayout.tsx` adding the search bar after the click-to-copy (brief 36 part 5) and fixing
the header gap (part 6): coordinate by pulling often and don't edit the header's search or gap; your work is the pages.

## The standard (Brendan, 2026-11-09)
Every page's name lives in the app shell header, in the display face with the click-to-copy beside it, followed by the
search icon that expands (brief 36 part 5). No page draws its own h1 for its name. The chart pages and now the
`/viz/data/*` tables already follow it.

## Do
1. Audit every page for a page-level h1 or title block that repeats the page's name: the five dataset indexes and
   records (`/datasets/*`, brief 33), `/factory`, `/schema`, `/glossary`, `/data-dictionary`, `/viz/structure`,
   `/viz/chart`, `/pipeline`, `/graph`, `/search`, `/chat`, `/docs`, `/viz/gamma-lines`, `/viz/fission-yields`, and the
   rest of `app/(site)`. List what you find in the report.
2. Move each name into the header through `lib/header-titles.ts` (static routes) or AppLayout's dynamic resolution
   (`/docs/*`, `/datasets/*`, `/viz/data/*` already resolve; add what's missing, such as a dataset record showing its
   dataset's name, "60Co · Adopted levels, gammas", and a glossary or dictionary page showing its name). Remove the
   page's own h1. Where a page had a subtitle line under the h1 that carried information (a count, a date, a source), keep
   that line in the page as its first row, not as a heading.
3. Record pages (`/datasets/{source}/{id}`): the header reads the dataset's title; the Text, Markdown, PDF and Open in
   Graph buttons stay in the page.
4. Check both themes on the box after each page.

## Done means
No page in `app/(site)` draws its own name; every one is named in the header with copy beside it; CI green; one report
listing the pages changed and any page where the standard couldn't apply and why.

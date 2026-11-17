# Upcoming — the keynote calendar

A static GitHub Pages website and subscribable calendar for public keynotes, launch presentations, developer announcements, and conferences with keynote programming. Companies and communities of every size are welcome. No npm, API keys, or backend. Interface icons use the pinned Phosphor web import script from jsDelivr; Google Fonts and Phosphor require a network connection.

## Local preview

```sh
python3 serve.py
```

Open http://localhost:8000. Refresh after editing; stop with Ctrl+C. Use `--port 8080` for another port. The server binds to localhost and serves the public assets and data only. Opening index.html directly will not load JSON.

## Calendar subscription

Permanent feed after GitHub Pages is enabled:

**https://mcv-s.github.io/upcoming-keynotes/keynotes.ics**

For clients that support it: **webcal://mcv-s.github.io/upcoming-keynotes/keynotes.ics**

Use your calendar app's **Subscribe / From URL** function. Importing a downloaded file is a snapshot and does not subscribe. Calendar clients choose how often to refresh; the feed requests 12-hour refreshes but cannot force them. The website's subscription button uses the public URL even during local preview. The **View ICS file** link serves the local file during testing.

`keynotes.ics` is a real, committed repository file generated from JSON. Its URL stays constant as the file changes. Stable UIDs, SEQUENCE, and LAST-MODIFIED support updated event details. Confirmed cancellations remain as STATUS:CANCELLED; removed records generate cancellation tombstones. Keep event records and IDs across reschedules, even if the year or event title changes. Do not rename the feed or change uidDomain after subscribers join.

## Changing content

All changing event and research details live in JSON:

- `events.json`: events, per-event `checked` dates, global research date `updated`, schedule caveats, cancellations.
- `companies.json`: an expanded set of companies/organizers, official research starting points, broad discovery queries, and non-exclusive coverage policy. Official homepages are research starting points, not claims of a scheduled keynote.
- `site.json`: public URL, feed filename/name, refresh and stale-data settings, research scope and schedule metadata.

`tracked-companies.txt` mirrors the companies in companies.json for convenient reading. Edit companies.json and regenerate the mirror. If a user adds names directly to the text file, add corresponding research entries to companies.json first; the generator refuses to discard text-only seeds. This list is **not an allowlist**: add verified keynotes from companies, communities, and regions absent from it. We include developer tools, open source, startups, hardware, AI, enterprise, games, consumer products, robotics, space, and mobility.

The HTML/CSS/JS stay static during routine maintenance. After editing JSON:

```sh
python3 generate_calendar.py
python3 check.py
python3 -m unittest test_calendar.py
python3 generate_calendar.py --check
```

Commit the changed JSON plus generated `keynotes.ics` and `tracked-companies.txt` together. The generator preserves revision metadata for unchanged events and increments it for changed events; repeated generation is byte-stable. Do not hand-edit ICS. Weekly Codex research runs are configured in the Codex app; site.json documents the intended schedule but does not execute jobs. The scheduled agent runs every Sunday at 9:00 AM America/New_York and researches, edits JSON, regenerates the feed, validates, commits, and pushes origin/main. Local scheduling requires the Codex app and this checkout to be available, with working GitHub credentials.

## Event fields

Required: unique stable `id`, `company`, `mark`, hex `color`, `title`, `category`, `kind` (`keynote` or `conference`), local host `date` (YYYY-MM-DD), `location`, `speaker`, `description`, official HTTPS `url`, and last actually verified `checked` date.

Optional:

- `start` / `end`: ISO 8601 timestamps with explicit UTC offsets, only if announced.
- `endDate`: inclusive final date of a multi-day conference.
- `source`: supporting official page when different from the event link.
- `note`: pending information, source discrepancies, or schedule caveats.
- `attendance`: `in_person`, `online`, `hybrid` (both), or `unknown`. Include `attendanceSource` and `attendanceNotes` with the official evidence. Recordings published later do not count as live online attendance. The format appears below the date and has its own filter; hybrid events match both the Online and In person filters.
- `status`: CONFIRMED (default), TENTATIVE, or CANCELLED. Cancelled events hide on the website but remain in the subscription.

Do not invent keynote times from conference dates, predict annual events, or add rumors. Date-only keynotes export as all-day placeholders; conferences cover their announced date range. Unknown end times are omitted. Keep older records so calendar subscribers retain event history. Past listings hide automatically on the website. Search, company/timezone filters, browser-local saved stars, and one-time calendar downloads remain available.

Each listing shows its own checked date. The edition warns when the global research date exceeds site.json staleAfterDays. AWS winter times currently follow Las Vegas local time despite the source's PDT label; NVIDIA main-page/FAQ date discrepancies are disclosed in their event notes.

Event cards show date, attendance, company, title, time and venue. Descriptions, speakers, caveats and verification links are under **Details**. Logos use explicit `iconName` slugs from JSON with the Phosphor web import (for example `open-ai-logo`, `figma-logo`, and `windows-logo`). Event values can override the company profile; `null` keeps a letter. Icon names are checked against the pinned Phosphor catalog rather than guessed. A missing icon or failed logo font keeps the existing letter mark; generic icons are never substituted for a brand.

Each company has an `audit` record with the attempt time, searches, source access, outcome, findings and blockers. `events.json.lastRefresh` reconciles the full initial research list and existing listings against actual coverage, including unresolved sources and discovery outside the list. A failed fetch or ambiguous date is recorded as unverified, never as proof that no keynote exists. The November 17 audit attempted all 154 initial organizations and rechecked all 34 existing listings; unresolved sources mean its `complete` flag remains false. Future scheduled runs must resolve or retain those gaps honestly.

## GitHub Pages deployment

1. Push the repo to `mcv-s/upcoming-keynotes` main.
2. In GitHub **Settings → Pages**, choose **Deploy from a branch**.
3. Select **main**, **/ (root)**, then Save.

The site will be at https://mcv-s.github.io/upcoming-keynotes/. No build is needed; root index.html, relative assets, and .nojekyll support branch-based Pages. Every later data/ICS push republishes through Pages. The subscription URL will only be usable after the first successful Pages deployment.

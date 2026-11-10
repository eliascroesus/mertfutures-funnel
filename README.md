# MertFutures funnel

NQ & ES order flow funnel for Mert ([@mertfutures](https://www.instagram.com/mertfutures/)), built the same way as the
Jean Ivan funnel (black and purple instead of black and gold). Each page is the `index.html` in its own folder. They
share `assets/site/style.css` (the design) and `assets/site/funnel.js` (the behaviour, with its settings in `CONFIG`
at the top):

1. **Opt-in** (`/discord`; the bare domain `/` redirects there): the headline, a white "Join The FREE Discord" form,
   then "What You Get Inside" the Discord.
2. **Page 2, A/B tested.** Each new opt-in is sent to one of two versions at random (50/50, `abSplitApply` in
   `CONFIG`) and keeps it if they come back. Add `?v=1` or `?v=2` to a link to see a specific one. Both start with the
   VSL (autoplays muted behind a "Click To Unmute" box), and people who just joined get a short purple confetti burst:
   - **`/apply`** (V1): the application one question at a time under the video, then the GoHighLevel calendar.
   - **`/apply-2`** (V2, iClose style): a short form beside the calendar, which stays blurred and locked until every
     answer is in.

   Investment answers in `CONFIG.disqualify` ("Under $1,000", "don't have the resources") get the free Discord
   instead of the calendar. Visitors who didn't opt in first give name, email and phone too.
3. **Booked** (`/booked`): "Your call is NOT confirmed yet", Step #1 the thank-you video, Step #2 "Confirm Your Call
   Now" (reply "Yes" to the email, reply to the text, add it to Google / Apple / Outlook calendar), Step #3 the FAQ
   videos, then "Inside Order Flow Elite".

Every page ends with the same footer as Jean Ivan's: **Privacy Policy** (`/privacy`), **Terms of Service** (`/terms`),
**Earnings & Risk Disclaimer** (`/disclaimer`), a Contact link, the earnings and trading-risk disclaimer and the
"not part of Facebook / Instagram / Meta" line. The legal pages are Jean Ivan's, rewritten for Mert and MertFutures
(styled by `assets/legal.css`).

There are no results on the pages yet: the results sections stay hidden until `PROOF` in `funnel.js` has entries
(images in `assets/mert/proof/`, upload steps in `assets/mert/testimonials/README.md`). Jean Ivan's "Meet Jean"
story section is replaced by cards about the Discord and the mentorship; send Mert's story and photos to add one.

## Before it goes live

| What | Where | Status |
| --- | --- | --- |
| Lead sheet | Set up `google-sheets/lead-capture.gs` (steps at the top), paste the Web app URL into `leadSheetUrl` | **Empty**: nothing is saved |
| Calendar | `ghlCalendarUrl` (GoHighLevel permanent link) | **Empty**: page 2 shows "Calendar goes here" |
| Videos | `videos.vsl`, `videos.nextSteps`, `faqVideos` (Vimeo links) | **Empty**: "Video coming soon" boxes |
| Discord invite | `discordUrl` | Empty |
| Contact email | Footer of every page, and the three legal pages (`support@mertfutures.com`) | **Placeholder**: replace with Mert's real address |
| Discord / mentorship cards | The cards under the forms in `discord/`, `apply/`, `apply-2/`, `booked/` | Check every line with Mert |
| Calendar file text | `api/ics.js` (title and text of the Apple Calendar file) | "Strategy Call With Mert" |
| Analytics | `/admin` (see below) | Needs the Upstash database and `ADMIN_PASSWORD` on Vercel |

## Hosting

Static pages plus four small Vercel functions in `api/` (analytics, tracked links, the calendar file). On Vercel,
import this repo with the default settings (Framework: Other). Every push to the production branch redeploys.
`vercel.json` redirects `/` to `/discord`, sends `/go/<name>` to the tracked-link function and sets caching.

## Leads to Google Sheets and GoHighLevel

Same as the Jean Ivan funnel. Every opt-in is a new row of the "Mert - Master Lead Sheet"; the application answers
and the booking time fill in that person's row (matched by email). The Version column says V1 (`/apply`) or V2
(`/apply-2`). `/apply` also fills **Evals Bought** and **Trading Schedule**.

The Apps Script sends every lead to GoHighLevel once the Script properties `GHL_TOKEN` and `GHL_LOCATION_ID` are
set (run `checkGhl`). Opt-ins land in the **Discord** pipeline, finished applications move to Applied (or Not
Qualified) with a note of every answer, and booked calls move to **1:1 Mentorship**. Tags: `mert-optin`,
`mert-applied`, `mert-not-qualified`, `mert-booked`. The sheet's **GoHighLevel** menu can push older rows.
Booked calls can also be posted to Telegram (setup at the bottom of `lead-capture.gs`).

## Analytics dashboard (/admin)

The same dashboard as Jean Ivan's: tracked links (`/go/ig-bio` and so on), the funnel step by step, video watch time,
the V1/V2 test, application answers, devices and a live list. Setup on Vercel: **Storage → Create Database →
Upstash for Redis** (free) connected to this project, then **Settings → Environment Variables → `ADMIN_PASSWORD`**,
then redeploy and open `/admin`. Until then the pages work as normal and simply don't count anything.

## Editing

Settings, videos, calendar, questions (`QUESTIONS` for `/apply`; the `/apply-2` questions are in
`apply-2/index.html`) are in `assets/site/funnel.js`. Copy is in each page's `index.html`. The purple is set by the
`--accent` colours at the top of `assets/site/style.css`. The logo is `assets/site/mert-logo.png` (also the
favicon and touch icon: white M on black with a purple bar).

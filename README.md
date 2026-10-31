# MertFutures funnel

ES & NQ order flow mentorship funnel for Mert ([@mertfutures](https://www.instagram.com/mertfutures/)). It's built the
same way as the Ricky and Jean Ivan funnels: all pages live in one file, `index.html`, and the URL picks the page.

1. **Opt-in** (`/`, also `/discord`): headline, Discord sign-up form, a preview of the Discord's channels and,
   once there is proof, the results gallery.
2. **Application**, A/B tested. Each new opt-in is sent to one of two versions at random (50/50, set by
   `abSplitV1` in `CONFIG`) and keeps that version if they come back:
   - **V1** (`/apply`): main video (autoplays muted, "Click to listen"), a short form beside the calendar. The
     calendar stays blurred until the form is filled in.
   - **V2** (`/apply-2`): main video, then one question at a time (Typeform style; the questions are in
     `APPLY2_QUESTIONS`). The calendar loads in the background and appears after the last answer.
   - Add `?v=1` or `?v=2` to a link to see a specific version; `?v=reset` gives a fresh 50/50 draw.
3. **Booked** (`/booked`): "your call is not confirmed yet" video, Confirm In Gmail / Outlook buttons, five FAQ
   videos and "How the 12 weeks work".
4. **Not qualified** (`/not-qualified`): where applicants land instead of the calendar when their investment
   answer is in `CONFIG.disqualify` ("Under $1,000" on V1, "don't have the resources" on V2). Their answers still
   go to the sheet. It points them to the free Discord (when `CONFIG.discordUrl` is set) and to Mert's Instagram.
5. **Waiting list** (`/waitlist`): the `/apply-2` questions without the video or calendar, ending on "You're on the
   waiting list". Asks for name, email and phone first unless page 1 already has them. The phone question has a
   searchable country picker and checks the number with libphonenumber-js (loaded from jsDelivr only on that
   question). Rows show **Waitlist** in the sheet's Version column. To send all traffic there while the 1-on-1
   spots are full, add `{ "source": "/", "destination": "/waitlist", "permanent": false }` to `redirects` in
   `vercel.json` (Jean Ivan's funnel does this).

`vercel.json` serves `index.html` at all of those paths.

## Before it goes live

Everything below lives in the `CONFIG` block near the end of `index.html` unless it says otherwise.

| What | Where | Status |
| --- | --- | --- |
| Lead sheet | Set up `google-sheets/lead-capture.gs` (steps at the top of that file), paste the Web app URL into `leadSheetUrl` | **Empty**: nothing is saved until it's set |
| Booking calendar | `ghlCalendarUrl` (GoHighLevel permanent link) or `calendlyUrl` | **Empty**: page 2 shows a "Calendar goes here" box |
| Videos | `videos.vsl`, `nextSteps` and the five `faq…` videos (Vimeo links get the custom player) | **Empty**: placeholders show |
| Discord invite | `discordUrl` | Empty: /not-qualified says "check your email + SMS" |
| Confirmation email | `confirmSubject` (and `confirmFrom` if the confirmation comes from a fixed address) | Set to "Strategy Call"; must match the calendar's confirmation email subject |
| Spots bar | `spotsLeft`, `spotsFill` | 3 left, 88% full: **set the real number** |
| Discord preview | `discordChannels` (the channel list under the page 1 form) | Example channels: **rename them to match the real server** |
| Program name | `program` | "Order Flow Elite" |
| The 12 weeks | The two cards under "Step #3" on `/booked` | Built from the offer as researched (8 developing + 4 following weeks); **check every bullet with Mert** |
| Process promise | `guarantee` | Off. Suggested wording is in the comment; only switch it on with wording Mert agrees to |
| "Just joined" toast | `recentJoins` | Off. Only ever feed it real sign-ups |
| Proof | `PROOF` (see `assets/mert/testimonials/README.md`) | Empty, so every results section is hidden |
| Footer links | Privacy Policy, Terms, Disclaimer (`#privacy`, `#terms`, `#disclaimer` in each footer) | Still `#`: point them at the real pages |
| Domain | `og:url`, `og:image` near the top of `index.html` | Set to `https://mertfutures.com/` |

## Hosting

It's a static site with no build step. On Vercel, import this repo with the default settings
(Framework: Other). Every push to the production branch redeploys.

## Leads to Google Sheets

Every opt-in on page 1 is added as a row of the "Mert - Master Lead Sheet" through the Apps Script in
`google-sheets/lead-capture.gs`. The page 2 answers and the booking time are then filled into that person's row,
matched by email. UTMs and the referring site are remembered for 30 days, so they still reach the sheet if the
person reloads or comes back later without the `?utm_…` in the link.

| Page | Columns filled |
| --- | --- |
| Opt-in (`/`) | Submitted At, Full Name, Email, Phone (+12015550123), Country, Funnel, Page URL, UTM Source/Medium/Campaign/Content/Term, Referrer, Device, Time Zone, Version |
| V1 (`/apply`) | Main Problem, Experience, Main Goal, Investment, Ready To Fix, Instagram, Application At |
| V2 (`/apply-2`) and `/waitlist` | Situation, Evals Bought, Trading Schedule, Biggest Goal, Obstacles, Instagram, Investment, Application At |
| Booking | Call Booked At |

V2 and the waiting list save each answer as it's given, so drop-offs show in the sheet. The "Version" column
(V1, V2 or Waitlist) shows which page each lead got, so the versions can be compared.

## Leads to GoHighLevel

The same Apps Script also sends every lead to GoHighLevel through its API (free, unlike the premium
Inbound Webhook trigger). It's off until the script has two Script properties, `GHL_TOKEN` (a sub-account
Private Integration token) and `GHL_LOCATION_ID`; run `checkGhl` in the script editor to see what it found.

- Every event creates or updates the contact (name, email, phone, country) and fills any contact custom
  field whose name matches a sheet column header, e.g. "Instagram", "Investment", "Main Problem", "Evals Bought".
- Opportunity custom fields with the same names are filled too. Lead cards in a pipeline can only show
  opportunity fields, so create the ones you want on cards (e.g. Investment, Evals Bought, Trading Schedule) as
  Opportunity fields.
- These funnel steps also add a tag and put the lead's opportunity in a pipeline. It's one opportunity per
  lead: opt-ins land in **Discord** (first stage) for the setters, and booking a call moves that same
  opportunity into **1:1 Mentorship** (first stage). It only ever moves forward, so stages a setter or closer
  moved someone to by hand are never undone.

| Funnel step | Pipeline / stage | Tag |
| --- | --- | --- |
| Opt-in on page 1 | Discord / first stage | `mert-optin` |
| Finished the waiting list | Discord / Waitlist, plus a note with every answer | `mert-waitlist` |
| Finished an application (`/apply` or `/apply-2`) | Discord / Applied, plus a note with every answer | `mert-applied` |
| "Don't qualify" investment answer | Discord / Not Qualified, plus a note with every answer | `mert-not-qualified` |
| Calendar booking | 1:1 Mentorship / first stage | `mert-booked` |

Create the **Discord** pipeline with the stages in that order (first stage, Waitlist, Applied, Not Qualified)
and a **1:1 Mentorship** pipeline. Pipeline names, stages and tags live in `GHL_PIPELINES` and `GHL_STEPS` in
`lead-capture.gs`.

## Booked calls to Telegram

Every booked call can be posted to a Telegram group with the lead's answers (investment, situation, evals
bought, when they can trade…). GoHighLevel's plain "Webhook" workflow action posts the booking to the Apps
Script, which sends the message. Setup is at the bottom of `lead-capture.gs` (`TELEGRAM_TOKEN`,
`TELEGRAM_CHAT_ID`, `WEBHOOK_KEY`; then run `checkTelegram`).

## Editing

Brand name, videos, the calendar link and the sheet URL are all in the `CONFIG` block. To swap a video
placeholder for a real video, paste its embed link into `CONFIG.videos`.

Vimeo videos play with Vimeo's own controls switched off (no title, name, picture, logo or share
buttons). The page draws its own play button, progress bar, sound and full-screen buttons on top, using
Vimeo's player library in `assets/vimeo-player.min.js`. The VSL and the `/booked` video start on their own,
muted, with a "Click to listen" box that restarts them with sound.

## Why the copy says what it says

The copy follows Jean Ivan's funnel, line for line where it can, aimed at the buyer in the research docs
(ICP / buyer avatar and competitor research):

- **Page 1 headline** uses Jean Ivan's formula: "Discover My [named strategy] That 9-5 Traders Are Using To [outcome]".
  The outcome is the market's loudest pain, blowing prop firm accounts, rather than a dollar figure. If Mert has a
  real, provable number (total payouts, funded accounts), it can go in the headline the way Jean Ivan's "$5k
  payouts" does.
- **Page 2** keeps Jean Ivan's three lines: check your email + SMS, "The Real Reason You Keep Blowing Prop Firm
  Accounts (It's Not Your Strategy)", then Step #1 and Step #2. The VSL should pay that off: the real reason is
  execution, not the strategy.
- **The application asks what the closer needs.** Main problem first (Mert's own quiz options), how many evals
  they bought in the last year (pain and budget in one), and when they can trade (the 9–5 objection).
- **The FAQs answer the market's objections:** "is Mert legit?" (best answered with an unedited live session,
  losses included), "can I do this with a job?" and "I've already bought courses".
- **No P&L, payout or win-rate screenshots in ads.** Meta rejects them and the FTC treats them as earnings claims.
  Mert's own disclaimer is in every footer.
- **Social proof only from real people.** The "just joined" toast stays off until it's fed real sign-ups, and the
  results sections stay hidden until there's real, consented proof.

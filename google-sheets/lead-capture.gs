/**
 * Lead capture for Mert's NQ & ES order flow funnel (MertFutures).
 *   - Page 1 opt-in        → adds a new row (name, email, phone, tracking, A/B version).
 *   - Page 2 application   → fills that person's answers into their row (matched by email).
 *                            V1 (/apply, one question at a time) fills Situation, Evals Bought, Trading Schedule,
 *                            Biggest Goal, Obstacles, Instagram, Investment;
 *                            V2 (/apply-2, form beside the calendar) fills Main Problem, Experience, Main Goal,
 *                            Investment, Ready To Fix, Instagram.
 *   - Booking a call       → stamps "Call Booked At" on their row.
 *   - Source Link          → the /go/… tracked link (or app/site) they came from, as on /admin.
 *   - GoHighLevel (optional) → the same lead also goes to GoHighLevel; see further down this file.
 *     Leads already in the sheet are sent with the sheet's "GoHighLevel" menu → "Push old leads to GoHighLevel".
 *   - Telegram (optional)  → booked calls are posted to a Telegram group; see the bottom of this file.
 *
 * Setup (once):
 *   1. Create a Google Sheet called "Mert - Master Lead Sheet" (sheets.new) and open it.
 *   2. Extensions → Apps Script. Delete what's there, paste this whole file, save.
 *   3. Pick "setup" in the function dropdown and click Run. Allow access when asked.
 *      This writes the column headers into row 1.
 *   4. Deploy → New deployment → type "Web app".
 *      Execute as: Me. Who has access: Anyone. Click Deploy.
 *   5. Copy the Web app URL (ends in /exec) and paste it into leadSheetUrl in CONFIG in
 *      assets/site/funnel.js.
 *
 * Updating this script later: paste the new code, save, run "setup" once (adds any new
 * column headers), then Deploy → Manage deployments → pencil icon → Version: New version
 * → Deploy. The Web app URL stays the same.
 */

const SHEET_NAME = 'Sheet1';

// [column header, form field name]. Names starting with "@" are filled by this script.
// New columns only ever go on the end, so existing rows stay lined up.
const COLUMNS = [
  ['Submitted At', '@created'],
  ['Full Name', 'name'],
  ['Email', 'email'],
  ['Phone', 'phone'],
  ['Country', 'country'],
  ['Funnel', 'funnel'],
  ['Page URL', 'page_url'],
  ['UTM Source', 'utm_source'],
  ['UTM Medium', 'utm_medium'],
  ['UTM Campaign', 'utm_campaign'],
  ['UTM Content', 'utm_content'],
  ['UTM Term', 'utm_term'],
  ['Referrer', 'referrer'],
  ['Device', 'device'],
  ['Time Zone', 'timezone'],
  ['Instagram', 'instagram'],
  ['Experience', 'experience'],
  ['Main Problem', 'reason'],
  ['Investment', 'investment'],
  ['Application At', '@application'],
  ['Call Booked At', '@booked'],
  ['Version', 'version'],
  ['Situation', 'situation'],
  ['Biggest Goal', 'goal'],
  ['Obstacles', 'obstacles'],
  ['Main Goal', 'motivation'],
  ['Ready To Fix', 'ready'],
  ['Sent To GHL', '@ghl'],   // when the lead was last sent to GoHighLevel; empty = not sent yet
  ['Source Link', 'source_link'],   // the /go/… link they came from, as on /admin (or the app/site)
  ['Evals Bought', 'evals'],
  ['Trading Schedule', 'schedule'],
];
const HEADERS = COLUMNS.map(([header]) => header);
const EMAIL_COL = COLUMNS.findIndex(([, field]) => field === 'email');

function setup() {
  ensureHeaders_(getSheet_());
}

function doPost(e) {
  const params = (e && e.parameter) || {};
  // GoHighLevel's (free) Webhook action posts here when a call is booked; see Telegram at the bottom.
  if (params.source === 'ghl-booked') return json_(telegramBooking_(e, params));
  const type = params.type || 'optin';
  let result;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    result = saveToSheet_(type, params);
  } catch (err) {
    result = { ok: false, error: String(err) };
  } finally {
    lock.releaseLock();
  }
  // GoHighLevel goes after the sheet is saved and unlocked, so it can never hold up or break the sheet.
  // "Sent To GHL" gets the time when it worked, and is emptied when it didn't, so the menu's
  // "Push old leads to GoHighLevel" picks that lead up again.
  // A row that was already in the sheet but never sent (a lead from before GoHighLevel was set up, or one
  // whose send failed) goes over whole on their next step, so GoHighLevel gets everything they did, not just this.
  try {
    const sent = result.unsent ? syncRow_(result.row) : syncToGhl_(type, params);
    if (sent && result.row) markSent_(result.row, new Date());
  } catch (err) {
    console.error('GoHighLevel: ' + err);
    if (result.row) markSent_(result.row, '');
  }
  return json_(result);
}

function saveToSheet_(type, params) {
  const sheet = getSheet_();
  ensureHeaders_(sheet);
  const now = new Date();

  if (type === 'optin') {
    sheet.appendRow(COLUMNS.map(([, field]) => (field === '@created' ? now : field[0] === '@' ? '' : clean_(params[field]))));
    return { ok: true, row: sheet.getLastRow() };
  }

  // "application" or "booked": update the person's latest row, or add one if we never saw their opt-in.
  let rowNum = findRowByEmail_(sheet, params.email);
  // Existing text is re-protected so "+1 555…" or "@handle" isn't read back in as a formula.
  const row = rowNum
    ? sheet.getRange(rowNum, 1, 1, COLUMNS.length).getValues()[0].map(v => (typeof v === 'string' ? clean_(v) : v))
    : COLUMNS.map(([, field]) => (field === '@created' ? now : ''));
  const unsent = !!rowNum && !row[COLUMNS.findIndex(([, f]) => f === '@ghl')];
  if (!rowNum) rowNum = sheet.getLastRow() + 1;

  COLUMNS.forEach(([, field], i) => {
    if (field[0] === '@') return;
    const value = clean_(params[field]);
    if (value !== '') row[i] = value;   // never wipe what the opt-in already saved
  });
  if (type === 'application') row[COLUMNS.findIndex(([, f]) => f === '@application')] = now;
  if (type === 'booked') row[COLUMNS.findIndex(([, f]) => f === '@booked')] = now;

  sheet.getRange(rowNum, 1, 1, COLUMNS.length).setValues([row]);
  return { ok: true, row: rowNum, unsent: unsent };
}

// Open the Web app URL in a browser to check the deployment is live.
function doGet() {
  return ContentService.createTextOutput('Lead capture is running.');
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
}

// Writes the header row if it's missing or out of date (e.g. after new columns were added).
function ensureHeaders_(sheet) {
  if (sheet.getLastRow() > 0) {
    const current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
    if (current.join('|') === HEADERS.join('|')) return;
    if (current[0] !== HEADERS[0]) sheet.insertRowBefore(1);   // row 1 is data, not headers
  }
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  const dataRows = Math.max(sheet.getMaxRows() - 1, 1);
  COLUMNS.forEach(([, field], i) => {
    if (field[0] === '@') sheet.getRange(2, i + 1, dataRows, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  });
}

// Latest row whose Email matches (case-insensitive), or 0.
function findRowByEmail_(sheet, email) {
  const wanted = String(email || '').trim().toLowerCase();
  const last = sheet.getLastRow();
  if (!wanted || last < 2) return 0;
  const emails = sheet.getRange(2, EMAIL_COL + 1, last - 1, 1).getValues();
  for (let i = emails.length - 1; i >= 0; i--) {
    if (String(emails[i][0]).trim().toLowerCase() === wanted) return i + 2;
  }
  return 0;
}

// Keep values as plain text: cap the length and stop "=", "+", "-" or "@" at the
// start from being read as a formula (phone numbers start with "+", handles with "@").
function clean_(value) {
  const text = value == null ? '' : String(value).trim().slice(0, 500);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- GoHighLevel (optional) ----------
 * Every lead also goes to GoHighLevel through its API, which is free (the Inbound Webhook trigger is a
 * paid premium trigger). It stays off until both Script properties are set
 * (Project Settings, the gear icon → Script properties):
 *   GHL_TOKEN        the sub-account's Private Integration token
 *   GHL_LOCATION_ID  the sub-account's Location ID
 * Then pick "checkGhl" in the function dropdown and Run it (or the sheet's GoHighLevel menu → Check the
 * connection): it shows what it found and what's missing.
 *
 * On every event it creates or updates the contact (GHL matches by email/phone, so it's always the same
 * contact): name, email, phone, country, and any contact custom field whose name matches a sheet column
 * header ("Instagram", "Investment", "Main Goal"…). Opportunity custom fields with a matching name are filled too
 * (lead cards in a pipeline can only show opportunity fields). On the funnel steps in GHL_STEPS it also adds that
 * step's tag and puts their opportunity in that step's pipeline and stage:
 *   - Opt-in on /discord   → the Discord pipeline, for the setters to reach out.
 *   - Waitlist contact info → the Discord pipeline too (name, email, phone given), even if they stop there.
 *   - Finished waitlist    → Waitlist in Discord, plus a note with all their answers.
 *   - Application          → Applied (or Not Qualified) in Discord, plus a note with all their answers.
 *   - Booked a call        → the same opportunity moves over to the 1:1 Mentorship pipeline.
 * Opportunities only move forward: 1:1 Mentorship counts as further along than Discord, and inside a
 * pipeline a stage further right counts as further along. So when a setter has moved someone along by
 * hand, the funnel never drags them back.
 */
const GHL_API = 'https://services.leadconnectorhq.com';
// Pipeline names as they are in GHL (capitals aside), from the start of the funnel to the end.
const GHL_PIPELINES = ['Discord', '1:1 Mentorship'];
// Funnel step → pipeline, stage and tag. Stage names must match GHL (capitals aside);
// leave a stage as '' to use the pipeline's first stage. If GHL doesn't have the stage, the first stage is used.
const GHL_STEPS = {
  optin:            { pipeline: 'Discord',        stage: '',              tag: 'mert-optin' },
  waitlist_started: { pipeline: 'Discord',        stage: '',              tag: 'mert-waitlist-started' },
  waitlist:         { pipeline: 'Discord',        stage: 'Waitlist',      tag: 'mert-waitlist' },
  applied:          { pipeline: 'Discord',        stage: 'Applied',       tag: 'mert-applied' },
  not_qualified:    { pipeline: 'Discord',        stage: 'Not Qualified', tag: 'mert-not-qualified' },
  booked:           { pipeline: '1:1 Mentorship', stage: '',              tag: 'mert-booked' },
};
// The application answers that go into the note on the contact, in this order.
const GHL_NOTE_FIELDS = ['situation', 'reason', 'experience', 'evals', 'schedule', 'motivation', 'goal', 'obstacles', 'ready', 'investment', 'instagram'];
// Sheet fields that go into GHL's own contact fields rather than custom fields.
const GHL_STANDARD = ['name', 'email', 'phone', 'country'];

// Sends one funnel event to GoHighLevel. Returns false when GoHighLevel isn't set up (nothing sent).
function syncToGhl_(type, params) {
  const ghl = ghlConfig_();
  if (!ghl || !params.email) return false;
  // The page marks a finished application with "stage"; an answer on its own only updates fields.
  const step = type === 'optin' || type === 'booked' ? type : GHL_STEPS[params.stage] ? params.stage : '';
  const setup = ghlSetup_(ghl);
  const contactId = ghlUpsertContact_(ghl, setup, params);
  if (!step) return true;
  ghl_(ghl, 'post', '/contacts/' + contactId + '/tags', { tags: [GHL_STEPS[step].tag] });
  ghlMoveOpportunity_(ghl, setup, contactId, params, step);
  if (step === 'applied' || step === 'not_qualified' || step === 'waitlist') ghlNote_(ghl, contactId, params, step);
  return true;
}

// A finished application also goes on the contact as one readable note, so setters and closers
// see every answer at a glance (Contact → Notes, or Notes on the opportunity).
function ghlNote_(ghl, contactId, params, step) {
  const lines = GHL_NOTE_FIELDS
    .map(field => [COLUMNS.find(([, f]) => f === field), String(params[field] || '').trim()])
    .filter(([col, value]) => col && value)
    .map(([col, value]) => col[0] + ': ' + value);
  if (!lines.length) return;
  const head = { applied: '✅ Application', not_qualified: '❌ Application (not qualified)', waitlist: '📝 Waiting list application' }[step]
    + (params.version ? ' · ' + params.version + ({ V1: ' /apply', V2: ' /apply-2', Waitlist: ' /waitlist' }[params.version] || '') : '');
  try {
    ghl_(ghl, 'post', '/contacts/' + contactId + '/notes', { body: head + '\n\n' + lines.join('\n') });
  } catch (err) {
    console.error('GoHighLevel note: ' + err);
  }
}

// Run this from the editor after adding the Script properties: checks the connection and lists what it matched.
function checkGhl() {
  ghlReport_().forEach(line => console.log(line));
}

function ghlReport_() {
  const ghl = ghlConfig_();
  if (!ghl) return ['Add GHL_TOKEN and GHL_LOCATION_ID under Project Settings → Script properties first.'];
  const setup = ghlSetup_(ghl, true), out = [];
  setup.errors.forEach(e => out.push('Problem: ' + e));
  out.push(setup.errors.length ? 'A 401 means a wrong token or Location ID; a 403 means the token is missing a scope.' : 'Connected.');
  GHL_PIPELINES.forEach(name => {
    const p = setup.pipelines[norm_(name)];
    out.push('Pipeline "' + name + '": ' + (p ? 'found, stages: ' + p.stages.map(s => s.name).join(' → ')
      : 'NOT FOUND (create it under Opportunities → Pipelines, or fix the name in GHL_PIPELINES)'));
  });
  Object.keys(GHL_STEPS).forEach(step => {
    const target = ghlTarget_(setup, step);
    out.push('  ' + step + ' → ' + (target ? '"' + target.pipeline.name + '" / "' + target.stage.name + '"'
      + (target.missing ? '  (no "' + GHL_STEPS[step].stage + '" stage yet, so the first stage for now)' : '')
      : 'NOT FOUND: check the pipeline names in GHL_PIPELINES') + ', tag ' + GHL_STEPS[step].tag);
  });
  const filled = [], skipped = [], onCards = [];
  COLUMNS.forEach(([header, field]) => {
    if (field[0] === '@' || GHL_STANDARD.indexOf(field) >= 0) return;
    (setup.fields[norm_(header)] ? filled : skipped).push(header);
    if ((setup.oppFields || {})[norm_(header)]) onCards.push(header);
  });
  out.push('Contact custom fields that will be filled: ' + (filled.join(', ') || 'none yet'));
  out.push('Sheet columns with no matching contact custom field (skipped): ' + (skipped.join(', ') || 'none'));
  out.push('Opportunity custom fields that will be filled (these can show on lead cards): ' + (onCards.join(', ') || 'none yet'));
  return out;
}

function ghlConfig_() {
  const props = PropertiesService.getScriptProperties();
  const token = String(props.getProperty('GHL_TOKEN') || '').trim();
  const locationId = String(props.getProperty('GHL_LOCATION_ID') || '').trim();
  return token && locationId ? { token: token, locationId: locationId } : null;
}

// One API call. Throws with GHL's own error message, which shows under Executions.
function ghl_(ghl, method, path, body) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ghl.token, Version: '2021-07-28', Accept: 'application/json' },
  };
  if (body) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }
  const res = UrlFetchApp.fetch(GHL_API + path, options);
  const code = res.getResponseCode(), text = res.getContentText();
  if (code >= 300) throw new Error(method.toUpperCase() + ' ' + path.split('?')[0] + ' → ' + code + ' ' + text.slice(0, 300));
  return text ? JSON.parse(text) : {};
}

// The pipelines and their stages, and the contact custom fields by name. Cached for 10 minutes.
// Each lookup can fail on its own (e.g. a missing token scope) without stopping the contact itself.
function ghlSetup_(ghl, fresh) {
  const cache = CacheService.getScriptCache(), cacheKey = 'ghl-setup3-' + ghl.locationId;
  const cached = !fresh && cache.get(cacheKey);
  if (cached) return JSON.parse(cached);
  const loc = encodeURIComponent(ghl.locationId), errors = [];
  const get = path => {
    try { return ghl_(ghl, 'get', path); } catch (err) { errors.push(String(err)); return {}; }
  };
  const pipelines = {};
  (get('/opportunities/pipelines?locationId=' + loc).pipelines || []).forEach(p => {
    const order = GHL_PIPELINES.findIndex(name => norm_(name) === norm_(p.name));
    if (order < 0) return;
    const stages = (p.stages || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
    pipelines[norm_(p.name)] = { id: p.id, name: p.name, order: order, stages: stages.map(s => ({ id: s.id, name: s.name })) };
  });
  const byName = model => {
    const out = {};
    (get('/locations/' + loc + '/customFields?model=' + model).customFields || [])
      .filter(f => !f.model || f.model === model)
      .forEach(f => { out[norm_(f.name)] = f.id; });
    return out;
  };
  const setup = { pipelines: pipelines, fields: byName('contact'), oppFields: byName('opportunity'), errors: errors };
  if (errors.length) errors.forEach(e => console.error('GoHighLevel: ' + e));
  else cache.put(cacheKey, JSON.stringify(setup), 600);
  return setup;
}

// The pipeline and stage a funnel step goes to, or null if GHL doesn't have the pipeline.
// A stage name GHL doesn't have falls back to the pipeline's first stage ("missing" says so).
function ghlTarget_(setup, step) {
  const want = GHL_STEPS[step], pipeline = setup.pipelines[norm_(want.pipeline)];
  if (!pipeline || !pipeline.stages.length) return null;
  const named = want.stage && pipeline.stages.find(s => norm_(s.name) === norm_(want.stage));
  return { pipeline: pipeline, stage: named || pipeline.stages[0], missing: !!want.stage && !named };
}

// How far along a pipeline + stage is: later pipelines first, then stages further right.
function ghlRank_(setup, pipelineId, stageId) {
  const pipeline = Object.keys(setup.pipelines).map(k => setup.pipelines[k]).find(p => p.id === pipelineId);
  if (!pipeline) return -1;
  return pipeline.order * 1000 + pipeline.stages.findIndex(s => s.id === stageId);
}

function ghlUpsertContact_(ghl, setup, params) {
  const body = { locationId: ghl.locationId, email: String(params.email).trim() };
  const [firstName, ...rest] = tidyName_(params.name).split(' ');
  if (firstName) body.firstName = firstName;
  if (rest.length) body.lastName = rest.join(' ');
  const phone = e164_(params.phone, params.timezone);
  if (phone) body.phone = phone;
  if (/^[A-Z]{2}$/.test(params.country || '')) body.country = params.country;
  if (params.version) body.source = 'Mert funnel ' + params.version;
  const customFields = ghlCustomFields_(setup.fields, params);
  if (customFields.length) body.customFields = customFields;
  try {
    return ghl_(ghl, 'post', '/contacts/upsert', body).contact.id;
  } catch (err) {
    // A number GHL can't read (e.g. an old row typed without its country code) shouldn't lose the lead:
    // the contact goes in without it, and the number stays in the sheet.
    if (!body.phone) throw err;
    console.warn('GoHighLevel: phone "' + params.phone + '" not accepted, sending ' + body.email + ' without it: ' + err);
    delete body.phone;
    return ghl_(ghl, 'post', '/contacts/upsert', body).contact.id;
  }
}

// "jordan lee" or "JORDAN LEE" → "Jordan Lee", so messages say "Hey Jordan". Names typed with their own
// capitals ("McKenzie", "de la Cruz") are left exactly as typed.
function tidyName_(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  if (name !== name.toLowerCase() && name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
}

// [{ id, field_value }] for every custom field (by id, from ghlSetup_) whose name matches a sheet column with an answer.
function ghlCustomFields_(fieldIds, params) {
  const out = [];
  COLUMNS.forEach(([header, field]) => {
    const id = (fieldIds || {})[norm_(header)], value = String(params[field] || '').trim();
    if (id && value && field[0] !== '@' && GHL_STANDARD.indexOf(field) < 0) out.push({ id: id, field_value: value });
  });
  return out;
}

// Creates their opportunity, or moves it to this step's pipeline and stage if that's further along.
// It's one opportunity per lead: booking a call moves their Discord opportunity into 1:1 Mentorship.
function ghlMoveOpportunity_(ghl, setup, contactId, params, step) {
  const target = ghlTarget_(setup, step);
  if (!target) return console.warn('GoHighLevel: no "' + GHL_STEPS[step].pipeline + '" pipeline; run checkGhl');
  const ours = Object.keys(setup.pipelines).map(k => setup.pipelines[k].id);
  const found = (ghl_(ghl, 'get', '/opportunities/search?location_id=' + encodeURIComponent(ghl.locationId)
    + '&contact_id=' + encodeURIComponent(contactId)).opportunities || [])
    .filter(o => (o.contactId === contactId || (o.contact && o.contact.id === contactId)) && ours.indexOf(o.pipelineId) >= 0);
  const customFields = ghlCustomFields_(setup.oppFields, params);
  if (!found.length) {
    const body = {
      locationId: ghl.locationId, pipelineId: target.pipeline.id, pipelineStageId: target.stage.id,
      contactId: contactId, name: tidyName_(params.name) || String(params.email).trim(), status: 'open',
    };
    if (customFields.length) body.customFields = customFields;
    ghl_(ghl, 'post', '/opportunities/', body);
    return;
  }
  // If they somehow have one in each pipeline, the one furthest along is theirs.
  const current = found.sort((a, b) => ghlRank_(setup, b.pipelineId, b.pipelineStageId) - ghlRank_(setup, a.pipelineId, a.pipelineStageId))[0];
  const update = {};
  if (ghlRank_(setup, target.pipeline.id, target.stage.id) > ghlRank_(setup, current.pipelineId, current.pipelineStageId)) {
    Object.assign(update, { pipelineId: target.pipeline.id, pipelineStageId: target.stage.id, status: 'open' });
  }
  if (customFields.length) update.customFields = customFields;
  if (Object.keys(update).length) ghl_(ghl, 'put', '/opportunities/' + current.id, update);
}

// "+1 5551234567" → "+15551234567". If they typed their own "+44…" in the number box, that one wins.
// With no "+" at all (early waiting-list rows, e.g. "7947275612"), the country code comes from their time zone
// ("Europe/London" → +447947275612); for a time zone not in TZ_CALLING_CODES the digits go as they are.
function e164_(phone, timezone) {
  const text = String(phone || '');
  const plus = text.lastIndexOf('+');
  let digits = (plus < 0 ? text : text.slice(plus)).replace(/\D/g, '');
  if (digits.length < 7) return '';
  if (plus >= 0) return '+' + digits;
  if (digits.startsWith('00')) return '+' + digits.slice(2);   // "0044…"
  const code = TZ_CALLING_CODES[String(timezone || '').trim()];
  if (!code) return digits;
  if (code === '1') return '+' + (digits.length === 11 && digits[0] === '1' ? digits : '1' + digits);
  if (digits.startsWith(code) && digits.length >= 11) return '+' + digits;   // code typed without the "+"
  return '+' + code + digits.replace(/^0/, '');   // national number: "07947…" → "+447947…"
}
// Time zone → country calling code, for numbers saved without one. Only zones that are a single country.
const TZ_CALLING_CODES = {
  'America/New_York': '1', 'America/Chicago': '1', 'America/Denver': '1', 'America/Los_Angeles': '1',
  'America/Phoenix': '1', 'America/Anchorage': '1', 'America/Detroit': '1', 'America/Indiana/Indianapolis': '1',
  'Pacific/Honolulu': '1', 'America/Toronto': '1', 'America/Vancouver': '1', 'America/Edmonton': '1',
  'America/Winnipeg': '1', 'America/Halifax': '1', 'America/Regina': '1', 'America/Jamaica': '1',
  'America/Puerto_Rico': '1', 'America/Port_of_Spain': '1', 'America/Nassau': '1', 'America/Barbados': '1',
  'Europe/London': '44', 'Europe/Dublin': '353', 'Europe/Berlin': '49', 'Europe/Paris': '33',
  'Europe/Amsterdam': '31', 'Europe/Brussels': '32', 'Europe/Madrid': '34', 'Europe/Lisbon': '351',
  'Europe/Zurich': '41', 'Europe/Vienna': '43', 'Europe/Copenhagen': '45', 'Europe/Stockholm': '46',
  'Europe/Oslo': '47', 'Europe/Helsinki': '358', 'Europe/Warsaw': '48', 'Europe/Athens': '30',
  'Europe/Istanbul': '90', 'Europe/Bucharest': '40',
  'Africa/Casablanca': '212', 'Africa/Algiers': '213', 'Africa/Tunis': '216', 'Africa/Tripoli': '218',
  'Africa/Cairo': '20', 'Africa/Lagos': '234', 'Africa/Accra': '233', 'Africa/Nairobi': '254',
  'Africa/Kampala': '256', 'Africa/Dar_es_Salaam': '255', 'Africa/Addis_Ababa': '251', 'Africa/Kigali': '250',
  'Africa/Johannesburg': '27', 'Africa/Harare': '263', 'Africa/Lusaka': '260', 'Africa/Mogadishu': '252',
  'Africa/Khartoum': '249', 'Africa/Dakar': '221', 'Africa/Abidjan': '225', 'Africa/Douala': '237',
  'Asia/Dubai': '971', 'Asia/Riyadh': '966', 'Asia/Qatar': '974', 'Asia/Kuwait': '965', 'Asia/Karachi': '92',
  'Asia/Kolkata': '91', 'Asia/Calcutta': '91', 'Asia/Manila': '63', 'Asia/Singapore': '65',
  'Australia/Sydney': '61', 'Australia/Melbourne': '61', 'Australia/Brisbane': '61', 'Australia/Perth': '61',
  'Australia/Adelaide': '61', 'Pacific/Auckland': '64',
  'America/Sao_Paulo': '55', 'America/Mexico_City': '52', 'America/Bogota': '57', 'America/Paramaribo': '597',
};

function norm_(text) {
  return String(text || '').trim().toLowerCase();
}

/* ---------- Leads already in the sheet → GoHighLevel ----------
 * Once GoHighLevel is set up, every new lead goes there as it comes in and gets a time in "Sent To GHL".
 * Leads from before that (and any whose send failed) have that column empty. They're only sent when you
 * choose to, from the sheet's menu: GoHighLevel → "Push old leads to GoHighLevel". Each one goes to the
 * furthest step it reached, with the tags of every step on the way (like a new lead), plus GHL_IMPORT_TAG
 * first, so a workflow can leave imported leads out ("Contact Tag" filter: doesn't have mert-imported).
 * Safe to run again: rows with a time in "Sent To GHL" are skipped. "Preview" only counts, it sends nothing.
 */
const GHL_IMPORT_TAG = 'mert-imported';
// Same as CONFIG.disqualify in assets/site/funnel.js and old/index.html: these investment answers are "not qualified".
const DISQUALIFY = ['Under $1,000', "I want to, but don't have the resources to fund my goals"];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('GoHighLevel')
    .addItem('Check the connection', 'checkGhlMenu')
    .addItem('Preview old leads (sends nothing)', 'previewOldLeads')
    .addItem('Push old leads to GoHighLevel', 'pushOldLeads')
    .addToUi();
}

function checkGhlMenu() {
  SpreadsheetApp.getUi().alert('GoHighLevel', ghlReport_().join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

// The rows not sent yet, each with its answers by form field and the funnel steps it reached.
function oldLeads_() {
  const sheet = getSheet_();
  ensureHeaders_(sheet);
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, COLUMNS.length).getValues()
    .map((cells, i) => rowLead_(cells, i + 2))
    .filter(lead => !lead['@ghl'] && lead.email);
}

// One sheet row as { form field: value }, plus its row number and the funnel steps it reached.
function rowLead_(cells, rowNum) {
  const lead = { row: rowNum };
  COLUMNS.forEach(([, field], c) => {
    const v = cells[c];
    lead[field] = v instanceof Date ? v : String(v == null ? '' : v).replace(/^'/, '').trim();
  });
  lead.steps = leadSteps_(lead);
  return lead;
}

// The funnel steps a sheet row shows they reached, in order. Like the funnel itself: a finished application
// is one with an investment answer (the last question), and a waiting-list visitor who stopped part way
// is in the Discord pipeline's first stage, like an opt-in.
function leadSteps_(lead) {
  const steps = [lead.version === 'Waitlist' ? 'waitlist_started' : 'optin'];
  if (lead.investment) steps.push(DISQUALIFY.indexOf(lead.investment) >= 0 ? 'not_qualified' : lead.version === 'Waitlist' ? 'waitlist' : 'applied');
  if (lead['@booked']) steps.push('booked');
  return steps;
}

function stepCounts_(leads) {
  const names = { optin: 'opted in only', waitlist_started: "started the waiting list but didn't finish",
    waitlist: 'finished the waiting list', applied: 'applied', not_qualified: 'not qualified', booked: 'booked a call', '': 'contact only' };
  const counts = {};
  leads.forEach(l => { const last = l.steps[l.steps.length - 1] || ''; counts[last] = (counts[last] || 0) + 1; });
  return Object.keys(counts).map(k => '  ' + counts[k] + ' ' + names[k] + (k ? ' → ' + GHL_STEPS[k].pipeline + ' / ' + (GHL_STEPS[k].stage || 'first stage') : ''));
}

function previewOldLeads() {
  const leads = oldLeads_(), ui = SpreadsheetApp.getUi();
  ui.alert('Old leads', leads.length
    ? leads.length + ' leads haven\'t been sent to GoHighLevel yet:\n' + stepCounts_(leads).join('\n') + '\n\nNothing was sent.'
    : 'Every lead in the sheet has already been sent to GoHighLevel.', ui.ButtonSet.OK);
}

function pushOldLeads() {
  const ui = SpreadsheetApp.getUi(), ghl = ghlConfig_();
  if (!ghl) return ui.alert('GoHighLevel isn\'t set up yet: add GHL_TOKEN and GHL_LOCATION_ID under Project Settings → Script properties.');
  const leads = oldLeads_();
  if (!leads.length) return ui.alert('Every lead in the sheet has already been sent to GoHighLevel.');
  const ok = ui.alert('Push old leads', 'Send ' + leads.length + ' leads to GoHighLevel now?\n' + stepCounts_(leads).join('\n')
    + '\n\nThey get the tag "' + GHL_IMPORT_TAG + '" too.', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  const result = pushLeads_(ghl, leads);
  ui.alert('Push old leads', 'Sent ' + result.sent + ' of ' + leads.length + '.'
    + (result.failed ? '\n' + result.failed + ' failed (details under Extensions → Apps Script → Executions); run it again to retry them.' : '')
    + (result.left ? '\n' + result.left + ' left because it ran out of time: run it again to send the rest.' : ''), ui.ButtonSet.OK);
}

// Sends each lead, stops before Apps Script's 6-minute limit. Returns how many were sent, failed and left.
function pushLeads_(ghl, leads) {
  const started = Date.now(), setup = ghlSetup_(ghl, true);
  let sent = 0, failed = 0, i = 0;
  for (; i < leads.length && Date.now() - started < 4.5 * 60 * 1000; i++) {
    const lead = leads[i];
    try {
      sendLead_(ghl, setup, lead, true);
      markSent_(lead.row, new Date());
      sent++;
    } catch (err) {
      console.error('Row ' + lead.row + ' (' + lead.email + '): ' + err);
      failed++;
    }
    Utilities.sleep(150);   // stays well under GoHighLevel's 100 requests per 10 seconds
  }
  return { sent: sent, failed: failed, left: leads.length - i };
}

// One sheet row to GoHighLevel: the contact, the tag of every step it reached, its opportunity at the furthest
// step and the application note. "imported" adds GHL_IMPORT_TAG first, before any step tag can start a workflow.
function sendLead_(ghl, setup, lead, imported) {
  const contactId = ghlUpsertContact_(ghl, setup, lead);
  if (imported) ghl_(ghl, 'post', '/contacts/' + contactId + '/tags', { tags: [GHL_IMPORT_TAG] });
  if (!lead.steps.length) return;
  ghl_(ghl, 'post', '/contacts/' + contactId + '/tags', { tags: lead.steps.map(s => GHL_STEPS[s].tag) });
  ghlMoveOpportunity_(ghl, setup, contactId, lead, lead.steps[lead.steps.length - 1]);
  const finished = lead.steps.filter(s => s === 'applied' || s === 'not_qualified' || s === 'waitlist')[0];
  if (finished) ghlNote_(ghl, contactId, lead, finished);
}

// A lead from before GoHighLevel was set up came back (finished their application, booked a call…): send
// their whole row now, as a live lead (no "mert-imported" tag). Returns false when GoHighLevel isn't set up.
function syncRow_(rowNum) {
  const ghl = ghlConfig_();
  if (!ghl) return false;
  const lead = rowLead_(getSheet_().getRange(rowNum, 1, 1, COLUMNS.length).getValues()[0], rowNum);
  if (!lead.email) return false;
  sendLead_(ghl, ghlSetup_(ghl), lead, false);
  return true;
}

function markSent_(rowNum, value) {
  getSheet_().getRange(rowNum, COLUMNS.findIndex(([, f]) => f === '@ghl') + 1).setValue(value);
}

/* ---------- Telegram (optional) ----------
 * Posts every booked call to a Telegram group, for free: GoHighLevel's plain "Webhook" workflow action (not the
 * premium "Custom webhook") sends the booking here, and this script sends the message with the lead's answers
 * from the sheet. Off until these Script properties are set (Project Settings → Script properties):
 *   TELEGRAM_TOKEN      the bot's token from @BotFather
 *   TELEGRAM_CHAT_ID    the group's chat id (starts with -100…)
 *   WEBHOOK_KEY         any long random text; it must also be in the webhook URL, so nobody else can post
 *   TELEGRAM_TIMEZONE   (optional) time zone the call time is shown in, e.g. America/New_York
 * Then run "checkTelegram" once: a test message should land in the group.
 * GHL workflow: trigger "Customer Booked Appointment" → action "Webhook", method POST, URL:
 *   <this Web app URL>?source=ghl-booked&key=<WEBHOOK_KEY>
 */
function telegramBooking_(e, params) {
  const props = PropertiesService.getScriptProperties();
  const key = String(props.getProperty('WEBHOOK_KEY') || '');
  if (!key || params.key !== key) return { ok: false, error: 'wrong key' };
  let data = {};
  try { data = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) {}
  const contact = data.contact || {};
  const email = String(data.email || contact.email || '').trim();
  const name = String(data.full_name || data.contact_name || [data.first_name, data.last_name].filter(Boolean).join(' ')
    || contact.name || '').trim();
  const phone = String(data.phone || contact.phone || '').trim();

  // Their answers, from their row in the sheet (matched by email).
  const sheet = getSheet_(), rowNum = findRowByEmail_(sheet, email);
  const row = rowNum ? sheet.getRange(rowNum, 1, 1, COLUMNS.length).getValues()[0] : [];
  const answer = header => { const i = HEADERS.indexOf(header); return i >= 0 && row[i] !== '' && row[i] != null ? String(row[i]) : ''; };
  const lines = [
    '📅 NEW CALL BOOKED',
    '',
    '👤 ' + (name || answer('Full Name') || '(no name)'),
    '🕒 ' + bookingTimeText_(data),
    '📱 ' + (phone || answer('Phone') || '-'),
    '📧 ' + (email || '-'),
  ];
  [['💰 Investment', 'Investment'], ['🧾 Evals bought (12 mo)', 'Evals Bought'], ['🕰 Can trade', 'Trading Schedule'],
   ['🎯 Goal', 'Main Goal'], ['🎯 Goal', 'Biggest Goal'], ['📍 Situation', 'Situation'],
   ['🧱 Experience', 'Experience'], ['⚠️ Problem', 'Main Problem'], ['⚠️ Obstacles', 'Obstacles'],
   ['📸 Instagram', 'Instagram'], ['🧪 Page', 'Version'], ['📣 Source', 'UTM Source']]
    .forEach(([label, header]) => { const v = answer(header); if (v) lines.push(label + ': ' + v); });
  try {
    telegram_(lines.join('\n'));
    return { ok: true };
  } catch (err) {
    console.error('Telegram: ' + err);
    return { ok: false, error: String(err) };
  }
}

// The call's time. Best: the workflow's Webhook action sends it as Custom data "start_time" =
// {{appointment.start_time}} (GHL fills in the readable time). Otherwise it's looked for in GHL's standard
// data, where it comes with an offset ("2026-10-30T15:00:00-04:00") or as a local time plus a time zone.
function bookingTimeText_(data) {
  const custom = data.customData || {};
  const given = data.start_time || custom.start_time;
  if (given) return String(given) + (data.timezone || custom.timezone ? ' (' + (data.timezone || custom.timezone) + ')' : '');
  const cal = data.calendar || data.appointment || {};
  const raw = cal.startTime || cal.start_time || data.startTime || data.appointment_start_time || '';
  if (!raw) return '(time not sent)';
  const tz = PropertiesService.getScriptProperties().getProperty('TELEGRAM_TIMEZONE') || Session.getScriptTimeZone();
  const text = String(raw);
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(text) || /^\d+$/.test(text)) {
    const d = /^\d+$/.test(text) ? new Date(Number(text)) : new Date(text);
    if (!isNaN(d)) return Utilities.formatDate(d, tz, "EEE MMM d, h:mm a '(" + tz + ")'");
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text)) return text;   // already readable
  return text.replace('T', ' ').slice(0, 16) + (cal.selectedTimezone ? ' (' + cal.selectedTimezone + ')' : '');
}

function telegram_(text) {
  const props = PropertiesService.getScriptProperties();
  const token = String(props.getProperty('TELEGRAM_TOKEN') || '').trim();
  const chatId = String(props.getProperty('TELEGRAM_CHAT_ID') || '').trim();
  if (!token || !chatId) throw new Error('Add TELEGRAM_TOKEN and TELEGRAM_CHAT_ID under Script properties');
  const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ chat_id: chatId, text: text, disable_web_page_preview: true }),
  });
  if (res.getResponseCode() >= 300) throw new Error(res.getResponseCode() + ' ' + res.getContentText().slice(0, 300));
}

// Run this from the editor after adding the Script properties: sends a test message to the group.
function checkTelegram() {
  telegram_('✅ Mert funnel is connected to this group. New booked calls will show up here.');
  console.log('Sent. Check the Telegram group.');
}

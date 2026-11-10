/* "Add to Apple Calendar" on /booked: /api/ics?start=…&end=… (ISO times) returns a one-event calendar file for the
   strategy call, which iPhones and Macs open straight in Calendar. Only the times come from the link; the title and
   description are fixed here, so nobody can use this address to hand out calendar files with their own text. */
const crypto = require("crypto");

const TITLE = "Strategy Call With Mert";
const DETAILS = "Your strategy call with Mert (MertFutures). The link to join is in your confirmation email and texts. "
  + "Need to change the time? Use the link in your confirmation email.";

const stamp = d => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const text = s => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// Calendar files keep lines to 75 characters; longer ones continue on the next line after a space.
const fold = line => line.length <= 74 ? line : line.match(/.{1,73}/g).join("\r\n ");

module.exports = (req, res) => {
  const q = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
  const start = new Date(String(q.start || "")), end = new Date(String(q.end || ""));
  const ok = !isNaN(start) && !isNaN(end) && end > start && end - start <= 864e5;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  if (!ok) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("This calendar link is missing the call time.");
  }
  const uid = crypto.createHash("sha256").update(stamp(start) + stamp(end)).digest("hex").slice(0, 24);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MertFutures//Strategy Call//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:" + uid + "@mertfutures.com",
    "DTSTAMP:" + stamp(new Date()),
    "DTSTART:" + stamp(start),
    "DTEND:" + stamp(end),
    "SUMMARY:" + text(TITLE),
    "DESCRIPTION:" + text(DETAILS),
    "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", "DESCRIPTION:" + text(TITLE + " in 1 hour"), "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="strategy-call.ics"');
  res.end(lines.map(fold).join("\r\n") + "\r\n");
};

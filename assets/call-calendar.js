/* "Add it to your calendar" on /booked (and /old/booked), plus reading the call time from GoHighLevel's calendar.
   Plain script, used by assets/site/funnel.js and old/index.html through window.callCalendar:
     callCalendar.fromMessage(data) → { start, end } (ISO times) when the calendar's "booking complete" message
                                      includes the call time, else null. GoHighLevel doesn't document what that
                                      message holds, so this looks for a start time anywhere in it.
     callCalendar.links({ start, end, minutes, title, details, email })
                                    → { google, outlook, apple }. Without a start time, Google and Outlook open a new
                                      event with the title filled in (they pick the time), and apple is null. */
(function () {
  "use strict";
  var DATE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
  function toDate(v) {
    if (typeof v === "number" && v > 1e9) return new Date(v < 1e12 ? v * 1000 : v);
    if (typeof v === "string" && DATE.test(v.trim())) return new Date(v.trim().replace(" ", "T"));
    return null;
  }
  function fromMessage(data) {
    if (typeof data === "string") { try { data = JSON.parse(data); } catch (e) { return null; } }
    var start = null, end = null, seen = [];
    (function walk(o, depth) {
      if (!o || typeof o !== "object" || depth > 5 || seen.indexOf(o) >= 0) return;
      seen.push(o);
      Object.keys(o).forEach(function (k) {
        var v = o[k];
        if (v && typeof v === "object") return walk(v, depth + 1);
        var d = toDate(v);
        if (!d || isNaN(d.getTime())) return;
        if (/end/i.test(k)) { if (!end) end = d; }
        else if (!start && /start|slot|selected|appointment_?time/i.test(k) && !/added|created|updated|booked|modified/i.test(k)) start = d;
      });
    })(Array.isArray(data) ? data.slice(1) : data, 0);
    var now = Date.now();
    // A call is always ahead of now (a time at about now is when it was booked, not when the call is).
    if (!start || start.getTime() < now + 5 * 6e4 || start.getTime() > now + 400 * 864e5) return null;
    if (!end || end <= start || end - start > 8 * 36e5) end = null;
    return { start: start.toISOString(), end: end ? end.toISOString() : null };
  }

  var stamp = function (d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); };   // 20261112T150000Z
  var query = function (o) {
    return Object.keys(o).filter(function (k) { return o[k] != null && o[k] !== ""; })
      .map(function (k) { return k + "=" + encodeURIComponent(o[k]); }).join("&");
  };
  function links(o) {
    var start = o.start ? new Date(o.start) : null;
    if (start && isNaN(start.getTime())) start = null;
    var end = start ? new Date(o.end || start.getTime() + (o.minutes || 30) * 6e4) : null;
    if (end && (isNaN(end.getTime()) || end <= start)) end = new Date(start.getTime() + (o.minutes || 30) * 6e4);
    var domain = String(o.email || "").split("@")[1] || "";
    // Work and school addresses use Microsoft 365's Outlook; everyone else Outlook.com.
    var personal = !domain || /^(outlook|hotmail|live|msn|gmail|googlemail|yahoo|icloud|me|mac|aol|proton(mail)?)\./i.test(domain);
    return {
      google: "https://calendar.google.com/calendar/render?" + query({
        action: "TEMPLATE", text: o.title, details: o.details, dates: start ? stamp(start) + "/" + stamp(end) : "",
      }),
      outlook: (personal ? "https://outlook.live.com" : "https://outlook.office.com") + "/calendar/0/deeplink/compose?" + query({
        path: "/calendar/action/compose", rru: "addevent", subject: o.title, body: o.details,
        startdt: start ? start.toISOString() : "", enddt: end ? end.toISOString() : "",
      }),
      // A calendar file from the site (api/ics.js): iPhones and Macs open it straight in Calendar.
      apple: start ? "/api/ics?" + query({ start: start.toISOString(), end: end.toISOString() }) : null,
    };
  }
  window.callCalendar = { fromMessage: fromMessage, links: links };
})();

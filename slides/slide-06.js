const pptxgen = require("pptxgenjs");

const slideConfig = {
  type: "content",
  index: 6,
  title: "Dual-Calendar Synchronization Engine Flow",
};

/**
 * Slide 6: Dual-Calendar Synchronization Engine Flow
 * Visualizing provider-neutral synchronization between Google Calendar, Outlook, and Postgres.
 */
function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };

  // Category Tracker
  slide.addText("CALENDAR SYNCHRONIZATION & MULTI-TENANCY", {
    x: 0.8,
    y: 0.45,
    w: 8.0,
    h: 0.25,
    fontSize: 10,
    fontFace: "Arial",
    color: theme.accent,
    bold: true,
  });

  // Action Title
  slide.addText("Dual-Calendar Engine: Google & Outlook Parity", {
    x: 0.8,
    y: 0.72,
    w: 8.4,
    h: 0.4,
    fontSize: 20,
    fontFace: "Arial",
    color: theme.primary,
    bold: true,
  });

  // Subtitle
  slide.addText(
    "Provider-neutral calendar abstraction with live FreeBusy interval queries and dynamic database mapping.",
    {
      x: 0.8,
      y: 1.15,
      w: 8.4,
      h: 0.25,
      fontSize: 11,
      fontFace: "Arial",
      color: theme.secondary,
    },
  );

  // 3 Feature/Flow Columns
  const startX = 0.8;
  const colW = 2.62;
  const colGap = 0.27;
  const colY = 1.55;
  const colH = 2.45;

  const columns = [
    {
      tag: "GOOGLE WORKSPACE",
      tagColor: "EA4335",
      title: "Google Calendar API v3",
      items: [
        { label: "FreeBusy Query: ", desc: "Executes batch queries to discover existing doctor appointments." },
        { label: "Token Rotation: ", desc: "OAuth 2.0 refresh flow cached in-memory with 5m proactive renewal." },
        { label: "RFC3339 UTC: ", desc: "Strict ISO normalization ensuring zero timezone calculation drift." },
      ],
      iconBg: "FEF2F2",
    },
    {
      tag: "MICROSOFT 365",
      tagColor: "0078D4",
      title: "Microsoft Graph Outlook",
      items: [
        { label: "CalendarView: ", desc: "Inspects dentist calendars via Entra ID authenticated Graph API." },
        { label: "NextLink Paging: ", desc: "Recursively drains multi-page @odata.nextLink busy blocks." },
        { label: "UTC Mapping: ", desc: "Converts MS Graph local strings to canonical UTC strings." },
      ],
      iconBg: "F0F9FF",
    },
    {
      tag: "DYNAMIC SETTINGS",
      tagColor: "16A34A",
      title: "Zero-Downtime DB Maps",
      items: [
        { label: "Database Table: ", desc: "Doctor calendar IDs stored in dentist_calendar_mappings table." },
        { label: "Live Reconfig: ", desc: "Managers update doctor calendars in UI without server redeployment." },
        { label: "Safe Fallback: ", desc: "Gracefully uses environment variables if DB connection is cold." },
      ],
      iconBg: "F0FDF4",
    },
  ];

  columns.forEach((col, idx) => {
    const x = startX + idx * (colW + colGap);

    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x,
      y: colY,
      w: colW,
      h: colH,
      fill: { color: "FFFFFF" },
      line: { color: "CBD5E1", width: 1.2 },
      rectRadius: 0.1,
    });

    // Tag header
    slide.addShape(pres.shapes.RECTANGLE, {
      x,
      y: colY,
      w: colW,
      h: 0.42,
      fill: { color: col.iconBg },
      line: { color: "CBD5E1", width: 0 },
    });

    slide.addText(col.tag, {
      x: x + 0.15,
      y: colY + 0.1,
      w: colW - 0.3,
      h: 0.22,
      fontSize: 8.5,
      fontFace: "Arial",
      color: col.tagColor,
      bold: true,
    });

    // Title
    slide.addText(col.title, {
      x: x + 0.15,
      y: colY + 0.52,
      w: colW - 0.3,
      h: 0.28,
      fontSize: 12,
      fontFace: "Arial",
      color: theme.primary,
      bold: true,
    });

    // Bullets
    col.items.forEach((it, itIdx) => {
      slide.addText(
        [
          { text: it.label, options: { bold: true, color: theme.primary } },
          { text: it.desc, options: { color: theme.secondary } },
        ],
        {
          x: x + 0.15,
          y: colY + 0.88 + itIdx * 0.48,
          w: colW - 0.3,
          h: 0.45,
          fontSize: 8.5,
          fontFace: "Arial",
          bullet: true,
        },
      );
    });
  });

  // Bottom Collision Flow Ribbon
  const ribY = 4.15;
  const ribH = 0.85;

  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: startX,
    y: ribY,
    w: 8.4,
    h: ribH,
    fill: { color: theme.light },
    line: { color: "BAE6FD", width: 1 },
    rectRadius: 0.08,
  });

  slide.addText("COLLISION PREVENTION ALGORITHM (ZERO DOUBLE-BOOKING)", {
    x: startX + 0.2,
    y: ribY + 0.1,
    w: 8.0,
    h: 0.2,
    fontSize: 9,
    fontFace: "Arial",
    color: theme.accent,
    bold: true,
  });

  slide.addText(
    "1. Read DB Appts  ->  2. Fetch Provider Busy Intervals  ->  3. Overlap Check (start < existingEnd && end > existingStart)  ->  4. Atomic DB Lock",
    {
      x: startX + 0.2,
      y: ribY + 0.35,
      w: 8.0,
      h: 0.35,
      fontSize: 9.5,
      fontFace: "Arial",
      color: theme.primary,
      bold: true,
      valign: "middle",
    },
  );

  // Page Badge
  slide.addShape(pres.shapes.OVAL, {
    x: 9.3,
    y: 5.1,
    w: 0.38,
    h: 0.38,
    fill: { color: theme.accent },
  });
  slide.addText("06", {
    x: 9.3,
    y: 5.1,
    w: 0.38,
    h: 0.38,
    fontSize: 11,
    fontFace: "Arial",
    color: "FFFFFF",
    bold: true,
    align: "center",
    valign: "middle",
  });

  return slide;
}

if (require.main === module) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  const theme = {
    primary: "0F172A",
    secondary: "334155",
    accent: "0284C7",
    light: "E0F2FE",
    bg: "F8FAFC",
  };
  createSlide(pres, theme);
  pres.writeFile({ fileName: "slide-06-preview.pptx" });
}

module.exports = { createSlide, slideConfig };

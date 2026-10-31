const pptxgen = require("pptxgenjs");

const slideConfig = {
  type: "cover",
  index: 1,
  title: "BrightSmile Dental AI",
};

/**
 * Slide 1: Cover Page
 * High-impact modern healthcare AI aesthetic with subtle card decoration and clear metadata.
 */
function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };

  // Decorative header accent bar
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0,
    y: 0,
    w: 10,
    h: 0.12,
    fill: { color: theme.accent },
    line: { color: theme.accent, width: 0 },
  });

  // Top Category Pill Tag
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 1.0,
    y: 1.1,
    w: 3.2,
    h: 0.38,
    fill: { color: theme.light },
    line: { color: theme.accent, width: 1 },
    rectRadius: 0.19,
  });

  slide.addText("NEXT-GEN CLINICAL AUTOMATION", {
    x: 1.0,
    y: 1.1,
    w: 3.2,
    h: 0.38,
    fontSize: 10,
    fontFace: "Arial",
    color: theme.accent,
    bold: true,
    align: "center",
    valign: "middle",
  });

  // Main Title
  slide.addText("BrightSmile Dental AI", {
    x: 1.0,
    y: 1.6,
    w: 8.0,
    h: 0.9,
    fontSize: 38,
    fontFace: "Arial",
    color: theme.primary,
    bold: true,
    align: "left",
    valign: "middle",
  });

  // Subtitle
  slide.addText(
    "Omnichannel Conversational Voice, Smart Chat & Dual-Calendar Scheduling",
    {
      x: 1.0,
      y: 2.5,
      w: 8.0,
      h: 0.5,
      fontSize: 16,
      fontFace: "Arial",
      color: theme.secondary,
      align: "left",
      valign: "middle",
    },
  );

  // Divider line
  slide.addShape(pres.shapes.LINE, {
    x: 1.0,
    y: 3.2,
    w: 8.0,
    h: 0,
    line: { color: "CBD5E1", width: 1.5 },
  });

  // 3 Feature Highlight Cards across the bottom
  const highlights = [
    {
      title: "Realtime Streaming Voice",
      desc: "Natural human-like voice over WebSocket, provider-agnostic & zero master key leaks",
      stat: "24/7",
      statLabel: "Availability",
    },
    {
      title: "Dual Calendar Engine",
      desc: "Live bidirectional sync with Google Calendar API v3 & Microsoft Graph",
      stat: "0%",
      statLabel: "Double Booking",
    },
    {
      title: "Clinical Rule Safety",
      desc: "Authoritative doctor qualification matrix & anti-injection guardrails",
      stat: "100%",
      statLabel: "Doctor Compliant",
    },
  ];

  const cardW = 2.47;
  const gap = 0.3;
  const startX = 1.0;
  const cardY = 3.5;
  const cardH = 1.45;

  highlights.forEach((item, idx) => {
    const x = startX + idx * (cardW + gap);

    // Card background
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x,
      y: cardY,
      w: cardW,
      h: cardH,
      fill: { color: "FFFFFF" },
      line: { color: "E2E8F0", width: 1 },
      rectRadius: 0.1,
    });

    // Stat badge
    slide.addText(item.stat, {
      x: x + 0.15,
      y: cardY + 0.12,
      w: cardW - 0.3,
      h: 0.35,
      fontSize: 18,
      fontFace: "Arial",
      color: theme.accent,
      bold: true,
      align: "left",
    });

    slide.addText(item.statLabel.toUpperCase(), {
      x: x + 0.15,
      y: cardY + 0.45,
      w: cardW - 0.3,
      h: 0.2,
      fontSize: 8.5,
      fontFace: "Arial",
      color: "64748B",
      bold: true,
    });

    // Title
    slide.addText(item.title, {
      x: x + 0.15,
      y: cardY + 0.72,
      w: cardW - 0.3,
      h: 0.28,
      fontSize: 11.5,
      fontFace: "Arial",
      color: theme.primary,
      bold: true,
    });

    // Desc
    slide.addText(item.desc, {
      x: x + 0.15,
      y: cardY + 0.98,
      w: cardW - 0.3,
      h: 0.4,
      fontSize: 8.5,
      fontFace: "Arial",
      color: theme.secondary,
    });
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
  pres.writeFile({ fileName: "slide-01-preview.pptx" });
}

module.exports = { createSlide, slideConfig };

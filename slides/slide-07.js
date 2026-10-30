const pptxgen = require("pptxgenjs");

const slideConfig = {
  type: "content",
  index: 7,
  title: "Operating Cost Drivers & Provider Choice",
};

/**
 * Slide 7: Operating Cost Drivers & Provider Choice
 * Explains what sets the bill, without quoting a total that depends on provider choice.
 */
function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };

  // Category Tracker
  slide.addText("OPERATING ECONOMICS", {
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
  slide.addText("What Sets the Monthly Bill (and What Doesn't)", {
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
    "Voice is the only line large enough to dominate a clinic budget, and it is the one you choose.",
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

  // Left: cost driver table (no totals)
  const costTableData = [
    [
      { text: "Component", options: { bold: true, color: "FFFFFF", fill: { color: theme.primary } } },
      { text: "Cost Driver", options: { bold: true, color: "FFFFFF", fill: { color: theme.primary } } },
    ],
    [
      { text: "Realtime Voice", options: { bold: true, color: theme.accent } },
      { text: "Per audio-minute in and out on a hosted provider. Becomes GPU time and electricity on a local model.", options: { color: theme.secondary } },
    ],
    [
      { text: "Text Chat LLM", options: { bold: true, color: theme.primary } },
      { text: "Per input/output token on the configured model. Scales with conversation length, not bookings.", options: { color: theme.secondary } },
    ],
    [
      { text: "App Hosting", options: { bold: true, color: theme.primary } },
      { text: "Serverless plan or container, sized to request volume.", options: { color: theme.secondary } },
    ],
    [
      { text: "PostgreSQL", options: { bold: true, color: theme.primary } },
      { text: "Managed instance with automated backups and pooling.", options: { color: theme.secondary } },
    ],
    [
      { text: "Calendar APIs", options: { bold: true, color: theme.primary } },
      { text: "Google Calendar and Microsoft Graph free quotas cover a single clinic.", options: { color: theme.secondary } },
    ],
  ];

  slide.addTable(costTableData, {
    x: 0.8,
    y: 1.55,
    w: 5.0,
    h: 2.9,
    colW: [1.4, 3.6],
    fontSize: 8.5,
    fontFace: "Arial",
    valign: "middle",
    border: { pt: 0.5, color: "CBD5E1" },
  });

  // Right: the two provider outcomes
  const rightX = 6.05;
  const rightW = 3.15;
  const compY = 1.55;

  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: rightX,
    y: compY,
    w: rightW,
    h: 3.45,
    fill: { color: "FFFFFF" },
    line: { color: "E2E8F0", width: 1.2 },
    rectRadius: 0.1,
  });

  slide.addText("TWO WAYS TO RUN VOICE", {
    x: rightX + 0.2,
    y: compY + 0.15,
    w: rightW - 0.4,
    h: 0.22,
    fontSize: 9.5,
    fontFace: "Arial",
    color: theme.accent,
    bold: true,
  });

  // Hosted provider
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: rightX + 0.2,
    y: compY + 0.45,
    w: rightW - 0.4,
    h: 1.15,
    fill: { color: "FEF2F2" },
    line: { color: "FCA5A5", width: 1 },
    rectRadius: 0.08,
  });

  slide.addText("Hosted Realtime Voice", {
    x: rightX + 0.35,
    y: compY + 0.55,
    w: rightW - 0.7,
    h: 0.22,
    fontSize: 10,
    fontFace: "Arial",
    color: "DC2626",
    bold: true,
  });

  slide.addText("Priced per audio-minute", {
    x: rightX + 0.35,
    y: compY + 0.78,
    w: rightW - 0.7,
    h: 0.25,
    fontSize: 12,
    fontFace: "Arial",
    color: "991B1B",
    bold: true,
  });

  slide.addText("Cost grows with spoken minutes. This is the line that can exceed every other component combined.", {
    x: rightX + 0.35,
    y: compY + 1.05,
    w: rightW - 0.7,
    h: 0.5,
    fontSize: 7.5,
    fontFace: "Arial",
    color: "7F1D1D",
  });

  // Self-hosted
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: rightX + 0.2,
    y: compY + 1.7,
    w: rightW - 0.4,
    h: 1.15,
    fill: { color: "F0FDF4" },
    line: { color: "86EFAC", width: 1 },
    rectRadius: 0.08,
  });

  slide.addText("Self-Hosted Realtime", {
    x: rightX + 0.35,
    y: compY + 1.8,
    w: rightW - 0.7,
    h: 0.22,
    fontSize: 10,
    fontFace: "Arial",
    color: "16A34A",
    bold: true,
  });

  slide.addText("Priced per GPU-hour", {
    x: rightX + 0.35,
    y: compY + 2.03,
    w: rightW - 0.7,
    h: 0.25,
    fontSize: 12,
    fontFace: "Arial",
    color: "15803D",
    bold: true,
  });

  slide.addText("No per-minute bill. Cost is hardware you own plus electricity; capacity is your GPU, not a quota.", {
    x: rightX + 0.35,
    y: compY + 2.3,
    w: rightW - 0.7,
    h: 0.5,
    fontSize: 7.5,
    fontFace: "Arial",
    color: "14532D",
  });

  // Bottom callout: no single total
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: rightX + 0.2,
    y: compY + 2.95,
    w: rightW - 0.4,
    h: 0.4,
    fill: { color: theme.primary },
    line: { color: theme.primary, width: 0 },
    rectRadius: 0.08,
  });

  slide.addText("Same application code either way", {
    x: rightX + 0.2,
    y: compY + 2.99,
    w: rightW - 0.4,
    h: 0.3,
    fontSize: 8.5,
    fontFace: "Arial",
    color: "38BDF8",
    bold: true,
    align: "center",
    valign: "middle",
  });

  // Footer note under the table
  slide.addText(
    "No single monthly total is quoted: it would require assuming a provider, a minute volume, and a per-minute rate. Those three assumptions set most of the result, and one of them can be zero. Price the deployment against the providers you actually configure.",
    {
      x: 0.8,
      y: 4.55,
      w: 5.0,
      h: 0.55,
      fontSize: 8,
      fontFace: "Arial",
      color: theme.secondary,
      valign: "top",
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
  slide.addText("07", {
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
  pres.writeFile({ fileName: "slide-07-preview.pptx" });
}

module.exports = { createSlide, slideConfig };

const pptxgen = require("pptxgenjs");

const slideConfig = {
  type: "content",
  index: 7,
  title: "Production Financial Cost Breakdown & ROI",
};

/**
 * Slide 7: Production Financial Cost Breakdown & ROI
 * Itemized monthly cost table and executive ROI comparison.
 */
function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };

  // Category Tracker
  slide.addText("FINANCIAL FORECAST & OPERATING ECONOMICS", {
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
  slide.addText("Transparent $599.05/mo Operating Cost & 83% ROI", {
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
    "Modeled on a busy dental practice handling 1,000 voice calls, 3,000 chat sessions, and ~650 bookings/month.",
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

  // Left Table: Itemized Cost Breakdown (w: 4.8)
  const costTableData = [
    [
      { text: "Infrastructure Tier", options: { bold: true, color: "FFFFFF", fill: { color: theme.primary } } },
      { text: "Monthly Workload", options: { bold: true, color: "FFFFFF", fill: { color: theme.primary } } },
      { text: "Cost", options: { bold: true, color: "FFFFFF", fill: { color: theme.primary } } },
      { text: "% Total", options: { bold: true, color: "FFFFFF", fill: { color: theme.primary } } },
    ],
    [
      { text: "Voice AI (Realtime, illustrative)", options: { bold: true, color: theme.primary } },
      { text: "3,000 Spoken Min", options: { color: theme.secondary } },
      { text: "$555.00", options: { bold: true, color: theme.accent } },
      { text: "92.6%", options: { color: theme.secondary } },
    ],
    [
      { text: "Chat AI (GPT-4o-mini)", options: { bold: true, color: theme.primary } },
      { text: "15,000 Turns", options: { color: theme.secondary } },
      { text: "$4.05", options: { bold: true, color: theme.accent } },
      { text: "0.7%", options: { color: theme.secondary } },
    ],
    [
      { text: "App Hosting (Next.js)", options: { bold: true, color: theme.primary } },
      { text: "150,000 Req/Mo", options: { color: theme.secondary } },
      { text: "$20.00", options: { bold: true, color: theme.accent } },
      { text: "3.3%", options: { color: theme.secondary } },
    ],
    [
      { text: "PostgreSQL Database", options: { bold: true, color: theme.primary } },
      { text: "10GB SSD Storage", options: { color: theme.secondary } },
      { text: "$15.00", options: { bold: true, color: theme.accent } },
      { text: "2.5%", options: { color: theme.secondary } },
    ],
    [
      { text: "Calendar APIs & DNS", options: { bold: true, color: theme.primary } },
      { text: "Google & MS Cloud", options: { color: theme.secondary } },
      { text: "$5.00", options: { bold: true, color: theme.accent } },
      { text: "0.8%", options: { color: theme.secondary } },
    ],
    [
      { text: "TOTAL MONTHLY OPEX", options: { bold: true, color: "FFFFFF", fill: { color: "0284C7" } } },
      { text: "~650 Patient Bookings", options: { bold: true, color: "FFFFFF", fill: { color: "0284C7" } } },
      { text: "$599.05", options: { bold: true, color: "FFFFFF", fill: { color: "0284C7" } } },
      { text: "100.0%", options: { bold: true, color: "FFFFFF", fill: { color: "0284C7" } } },
    ],
  ];

  slide.addTable(costTableData, {
    x: 0.8,
    y: 1.55,
    w: 4.7,
    h: 2.6,
    colW: [2.0, 1.3, 0.7, 0.7],
    fontSize: 8.5,
    fontFace: "Arial",
    align: "center",
    valign: "middle",
    border: { pt: 0.5, color: "CBD5E1" },
  });

  // Unit Economics Row under the table
  const unitY = 4.3;
  const unitCards = [
    { label: "Cost Per Voice Call", val: "$0.56 / call" },
    { label: "Cost Per Chat", val: "$0.0014 / chat" },
    { label: "Cost Per Booked Patient", val: "$0.92 / booking" },
  ];

  unitCards.forEach((uc, uIdx) => {
    const ux = 0.8 + uIdx * 1.6;
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: ux,
      y: unitY,
      w: 1.5,
      h: 0.7,
      fill: { color: theme.light },
      line: { color: "BAE6FD", width: 1 },
      rectRadius: 0.06,
    });

    slide.addText(uc.val, {
      x: ux + 0.05,
      y: unitY + 0.1,
      w: 1.4,
      h: 0.25,
      fontSize: 11,
      fontFace: "Arial",
      color: theme.primary,
      bold: true,
      align: "center",
    });

    slide.addText(uc.label.toUpperCase(), {
      x: ux + 0.05,
      y: unitY + 0.38,
      w: 1.4,
      h: 0.2,
      fontSize: 7,
      fontFace: "Arial",
      color: theme.accent,
      bold: true,
      align: "center",
    });
  });

  // Right Side: Human Staffing vs AI Comparison (x: 5.75, w: 3.45)
  const rightX = 5.75;
  const rightW = 3.45;
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

  slide.addText("RECEPTIONIST COST VS. AI BOT", {
    x: rightX + 0.2,
    y: compY + 0.15,
    w: rightW - 0.4,
    h: 0.22,
    fontSize: 9.5,
    fontFace: "Arial",
    color: theme.accent,
    bold: true,
  });

  // Human receptionist box
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: rightX + 0.2,
    y: compY + 0.45,
    w: rightW - 0.4,
    h: 1.0,
    fill: { color: "FEF2F2" },
    line: { color: "FCA5A5", width: 1 },
    rectRadius: 0.08,
  });

  slide.addText("Human Dental Receptionist", {
    x: rightX + 0.35,
    y: compY + 0.52,
    w: rightW - 0.7,
    h: 0.2,
    fontSize: 10,
    fontFace: "Arial",
    color: "DC2626",
    bold: true,
  });

  slide.addText("$3,500.00 / month", {
    x: rightX + 0.35,
    y: compY + 0.72,
    w: rightW - 0.7,
    h: 0.3,
    fontSize: 16,
    fontFace: "Arial",
    color: "991B1B",
    bold: true,
  });

  slide.addText("40 hrs/wk only • Misses after-hours • 1 caller at a time", {
    x: rightX + 0.35,
    y: compY + 1.05,
    w: rightW - 0.7,
    h: 0.3,
    fontSize: 7.5,
    fontFace: "Arial",
    color: "7F1D1D",
  });

  // BrightSmile AI box
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: rightX + 0.2,
    y: compY + 1.55,
    w: rightW - 0.4,
    h: 1.0,
    fill: { color: "F0FDF4" },
    line: { color: "86EFAC", width: 1 },
    rectRadius: 0.08,
  });

  slide.addText("BrightSmile AI Solution", {
    x: rightX + 0.35,
    y: compY + 1.62,
    w: rightW - 0.7,
    h: 0.2,
    fontSize: 10,
    fontFace: "Arial",
    color: "16A34A",
    bold: true,
  });

  slide.addText("$599.05 / month", {
    x: rightX + 0.35,
    y: compY + 1.82,
    w: rightW - 0.7,
    h: 0.3,
    fontSize: 16,
    fontFace: "Arial",
    color: "15803D",
    bold: true,
  });

  slide.addText("24/7/365 coverage • Zero hold times • Unlimited concurrent lines", {
    x: rightX + 0.35,
    y: compY + 2.15,
    w: rightW - 0.7,
    h: 0.3,
    fontSize: 7.5,
    fontFace: "Arial",
    color: "14532D",
  });

  // Annual Net Savings Callout
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: rightX + 0.2,
    y: compY + 2.65,
    w: rightW - 0.4,
    h: 0.65,
    fill: { color: theme.primary },
    line: { color: theme.primary, width: 0 },
    rectRadius: 0.08,
  });

  slide.addText("NET ANNUAL CLINIC SAVINGS", {
    x: rightX + 0.2,
    y: compY + 2.72,
    w: rightW - 0.4,
    h: 0.18,
    fontSize: 7.5,
    fontFace: "Arial",
    color: "94A3B8",
    bold: true,
    align: "center",
  });

  slide.addText("$34,811 / year", {
    x: rightX + 0.2,
    y: compY + 2.9,
    w: rightW - 0.4,
    h: 0.32,
    fontSize: 18,
    fontFace: "Arial",
    color: "38BDF8",
    bold: true,
    align: "center",
  });

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

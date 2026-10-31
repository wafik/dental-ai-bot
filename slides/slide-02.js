const pptxgen = require("pptxgenjs");

const slideConfig = {
  type: "content",
  index: 2,
  title: "Executive Overview: Challenges & AI Solution",
};

/**
 * Slide 2: Executive Overview
 * Side-by-side comparison of manual clinic bottlenecks vs. AI automation.
 */
function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };

  // Top Tracker
  slide.addText("EXECUTIVE OVERVIEW & BUSINESS VALUE", {
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
  slide.addText("Transforming Front-Desk Scheduling into a 24/7 Advantage", {
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
    "Traditional dental front-desks miss 35% of after-hours appointment requests. BrightSmile AI captures every patient.",
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

  // Left Card: Current Practice Bottlenecks (Red tinted border)
  const leftX = 0.8;
  const cardW = 4.1;
  const cardY = 1.55;
  const cardH = 2.45;

  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: leftX,
    y: cardY,
    w: cardW,
    h: cardH,
    fill: { color: "FFFFFF" },
    line: { color: "FCA5A5", width: 1.5 },
    rectRadius: 0.1,
  });

  // Header inside Left Card
  slide.addShape(pres.shapes.RECTANGLE, {
    x: leftX,
    y: cardY,
    w: cardW,
    h: 0.45,
    fill: { color: "FEF2F2" },
    line: { color: "FCA5A5", width: 0 },
  });

  slide.addText("TRADITIONAL CLINIC BOTTLENECKS", {
    x: leftX + 0.2,
    y: cardY + 0.1,
    w: cardW - 0.4,
    h: 0.25,
    fontSize: 11,
    fontFace: "Arial",
    color: "DC2626",
    bold: true,
  });

  const challenges = [
    { bold: "High Overhead Cost: ", desc: "Staffing costs $3,500 - $4,500/mo per receptionist for limited 40h/week coverage." },
    { bold: "Lost Revenue: ", desc: "35% of patient calls occur after-hours or on weekends, resulting in abandoned bookings." },
    { bold: "Scheduling Errors: ", desc: "Manual calendar data entry causes double-bookings and mismatched doctor scopes." },
    { bold: "Peak Hour Phone Hold: ", desc: "Long telephone hold times during morning rushes frustrate patients." },
  ];

  challenges.forEach((item, idx) => {
    slide.addText(
      [
        { text: item.bold, options: { bold: true, color: "991B1B" } },
        { text: item.desc, options: { color: "475569" } },
      ],
      {
        x: leftX + 0.2,
        y: cardY + 0.55 + idx * 0.45,
        w: cardW - 0.4,
        h: 0.4,
        fontSize: 9.5,
        fontFace: "Arial",
        bullet: true,
      },
    );
  });

  // Right Card: BrightSmile AI Platform (Cyan/Blue tinted border)
  const rightX = 5.1;

  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: rightX,
    y: cardY,
    w: cardW,
    h: cardH,
    fill: { color: "FFFFFF" },
    line: { color: "7DD3FC", width: 1.5 },
    rectRadius: 0.1,
  });

  slide.addShape(pres.shapes.RECTANGLE, {
    x: rightX,
    y: cardY,
    w: cardW,
    h: 0.45,
    fill: { color: "F0F9FF" },
    line: { color: "7DD3FC", width: 0 },
  });

  slide.addText("BRIGHTSMILE AI SOLUTION", {
    x: rightX + 0.2,
    y: cardY + 0.1,
    w: cardW - 0.4,
    h: 0.25,
    fontSize: 11,
    fontFace: "Arial",
    color: "0284C7",
    bold: true,
  });

  const solutions = [
    { bold: "83% Cost Reduction: ", desc: "Full operational stack costs only $599/mo with unlimited concurrent capacity." },
    { bold: "24/7/365 Omnichannel: ", desc: "Patients book anytime via spoken voice calls (streaming WebSocket) or instant chat." },
    { bold: "Zero Double-Booking: ", desc: "Atomic database locking and live sync to Google Calendar & Outlook." },
    { bold: "Clinical Qualification: ", desc: "Backend hard rules prevent booking complex surgery with junior dentists." },
  ];

  solutions.forEach((item, idx) => {
    slide.addText(
      [
        { text: item.bold, options: { bold: true, color: "0369A1" } },
        { text: item.desc, options: { color: "334155" } },
      ],
      {
        x: rightX + 0.2,
        y: cardY + 0.55 + idx * 0.45,
        w: cardW - 0.4,
        h: 0.4,
        fontSize: 9.5,
        fontFace: "Arial",
        bullet: true,
      },
    );
  });

  // Bottom 4 Metric Badges
  const metrics = [
    { label: "Phone Hold Time", value: "0 Seconds", note: "Instant pickup" },
    { label: "After-Hours Capture", value: "100%", note: "No missed calls" },
    { label: "Monthly Operating Cost", value: "$599.05", note: "vs $3,500+ human" },
    { label: "Voice Latency", value: "< 300 ms", note: "Natural dialog" },
  ];

  const mStartX = 0.8;
  const mW = 1.95;
  const mGap = 0.2;
  const mY = 4.15;
  const mH = 0.85;

  metrics.forEach((m, idx) => {
    const x = mStartX + idx * (mW + mGap);

    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x,
      y: mY,
      w: mW,
      h: mH,
      fill: { color: theme.light },
      line: { color: "BAE6FD", width: 1 },
      rectRadius: 0.08,
    });

    slide.addText(m.value, {
      x: x + 0.1,
      y: mY + 0.08,
      w: mW - 0.2,
      h: 0.35,
      fontSize: 16,
      fontFace: "Arial",
      color: theme.primary,
      bold: true,
      align: "center",
    });

    slide.addText(m.label.toUpperCase(), {
      x: x + 0.05,
      y: mY + 0.42,
      w: mW - 0.1,
      h: 0.18,
      fontSize: 8,
      fontFace: "Arial",
      color: theme.accent,
      bold: true,
      align: "center",
    });

    slide.addText(m.note, {
      x: x + 0.05,
      y: mY + 0.6,
      w: mW - 0.1,
      h: 0.18,
      fontSize: 7.5,
      fontFace: "Arial",
      color: theme.secondary,
      align: "center",
    });
  });

  // Page Badge
  slide.addShape(pres.shapes.OVAL, {
    x: 9.3,
    y: 5.1,
    w: 0.38,
    h: 0.38,
    fill: { color: theme.accent },
  });
  slide.addText("02", {
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
  pres.writeFile({ fileName: "slide-02-preview.pptx" });
}

module.exports = { createSlide, slideConfig };

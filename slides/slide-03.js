const pptxgen = require("pptxgenjs");

const slideConfig = {
  type: "content",
  index: 3,
  title: "End-to-End System Architecture Flowchart",
};

/**
 * Slide 3: End-to-End System Architecture Flowchart
 * Step-by-step visual diagram illustrating the request lifecycle.
 */
function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };

  // Category Tracker
  slide.addText("SYSTEM ARCHITECTURE & FLOW DIAGRAM", {
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
  slide.addText("End-to-End Patient Booking & Calendar Sync Flow", {
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
    "How spoken voice and chat requests move securely from the patient browser to authoritative clinical confirmation.",
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

  // 5 Step Flow Cards
  const steps = [
    {
      step: "STEP 01",
      title: "Patient Inbound",
      sub: "Voice or Chat",
      desc: "Patient speaks via WebRTC audio (Opus) or sends message via Next.js chat portal.",
      color: "0284C7",
      bg: "F0F9FF",
    },
    {
      step: "STEP 02",
      title: "Security Edge",
      sub: "Sanitizer & Limits",
      desc: "Sliding window rate limit. Deflects injection attacks (DAN) & medical diagnosis prompts.",
      color: "475569",
      bg: "F8FAFC",
    },
    {
      step: "STEP 03",
      title: "App Router API",
      sub: "Voice & Tools Gate",
      desc: "Issues <60s ephemeral secrets. Routes tool executions via WebRTC DataChannel.",
      color: "0F172A",
      bg: "F1F5F9",
    },
    {
      step: "STEP 04",
      title: "Clinical Engine",
      sub: "Qualification Rules",
      desc: "Validates Doctor Scope (Junior A-B vs Senior A-E) & working hours (09:00-17:00).",
      color: "0284C7",
      bg: "F0F9FF",
    },
    {
      step: "STEP 05",
      title: "Sync & Storage",
      sub: "Postgres & Calendar",
      desc: "Atomic DB lock prevents double-booking. Syncs event to Google Calendar or Outlook.",
      color: "16A34A",
      bg: "F0FDF4",
    },
  ];

  const startX = 0.6;
  const cardW = 1.52;
  const gap = 0.32;
  const cardY = 1.55;
  const cardH = 2.15;

  steps.forEach((s, idx) => {
    const x = startX + idx * (cardW + gap);

    // Main Card
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x,
      y: cardY,
      w: cardW,
      h: cardH,
      fill: { color: s.bg },
      line: { color: "CBD5E1", width: 1.2 },
      rectRadius: 0.1,
    });

    // Step Header Pill
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: x + 0.15,
      y: cardY + 0.15,
      w: cardW - 0.3,
      h: 0.28,
      fill: { color: s.color },
      line: { color: s.color, width: 0 },
      rectRadius: 0.14,
    });

    slide.addText(s.step, {
      x: x + 0.15,
      y: cardY + 0.15,
      w: cardW - 0.3,
      h: 0.28,
      fontSize: 9,
      fontFace: "Arial",
      color: "FFFFFF",
      bold: true,
      align: "center",
      valign: "middle",
    });

    // Step Title
    slide.addText(s.title, {
      x: x + 0.1,
      y: cardY + 0.52,
      w: cardW - 0.2,
      h: 0.3,
      fontSize: 11,
      fontFace: "Arial",
      color: theme.primary,
      bold: true,
      align: "center",
    });

    // Step Subtitle
    slide.addText(s.sub, {
      x: x + 0.1,
      y: cardY + 0.82,
      w: cardW - 0.2,
      h: 0.2,
      fontSize: 8.5,
      fontFace: "Arial",
      color: theme.accent,
      bold: true,
      align: "center",
    });

    // Divider inside card
    slide.addShape(pres.shapes.LINE, {
      x: x + 0.18,
      y: cardY + 1.08,
      w: cardW - 0.36,
      h: 0,
      line: { color: "CBD5E1", width: 0.8 },
    });

    // Step Description
    slide.addText(s.desc, {
      x: x + 0.1,
      y: cardY + 1.15,
      w: cardW - 0.2,
      h: 0.9,
      fontSize: 8,
      fontFace: "Arial",
      color: theme.secondary,
      align: "center",
      valign: "top",
    });

    // Directional Flow Arrow between cards (except last card)
    if (idx < steps.length - 1) {
      const arrowX = x + cardW + 0.05;
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: arrowX,
        y: cardY + 0.95,
        w: 0.22,
        h: 0.25,
        fill: { color: theme.accent },
        line: { color: theme.accent, width: 0 },
        rectRadius: 0.05,
      });

      slide.addText(">", {
        x: arrowX,
        y: cardY + 0.95,
        w: 0.22,
        h: 0.25,
        fontSize: 12,
        fontFace: "Arial",
        color: "FFFFFF",
        bold: true,
        align: "center",
        valign: "middle",
      });
    }
  });

  // Bottom Guarantee Banner / Architecture Principles
  const bannerY = 3.9;
  const bannerH = 1.05;
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: startX,
    y: bannerY,
    w: 8.88,
    h: bannerH,
    fill: { color: "FFFFFF" },
    line: { color: "E2E8F0", width: 1.2 },
    rectRadius: 0.1,
  });

  slide.addText("THREE ARCHITECTURAL GUARANTEES ENFORCED BY DESIGN", {
    x: startX + 0.25,
    y: bannerY + 0.1,
    w: 8.38,
    h: 0.22,
    fontSize: 9,
    fontFace: "Arial",
    color: theme.accent,
    bold: true,
  });

  const guarantees = [
    {
      title: "1. Ephemeral Secret Isolation",
      text: "Master OpenAI keys never touch the browser. Short-lived tokens expire in <60 seconds.",
    },
    {
      title: "2. Authoritative Clinical Guard",
      text: "LLMs suggest slots, but backend code strictly enforces qualifications and clinic hours.",
    },
    {
      title: "3. Double-Booking Immunity",
      text: "Database row-locks and external calendar FreeBusy queries reject overlapping bookings.",
    },
  ];

  guarantees.forEach((g, gIdx) => {
    const gx = startX + 0.25 + gIdx * 2.85;
    slide.addText(
      [
        { text: g.title + "\n", options: { bold: true, color: theme.primary, fontSize: 9 } },
        { text: g.text, options: { color: theme.secondary, fontSize: 8 } },
      ],
      {
        x: gx,
        y: bannerY + 0.35,
        w: 2.7,
        h: 0.6,
        fontFace: "Arial",
      },
    );
  });

  // Page Badge
  slide.addShape(pres.shapes.OVAL, {
    x: 9.3,
    y: 5.1,
    w: 0.38,
    h: 0.38,
    fill: { color: theme.accent },
  });
  slide.addText("03", {
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
  pres.writeFile({ fileName: "slide-03-preview.pptx" });
}

module.exports = { createSlide, slideConfig };

const pptxgen = require("pptxgenjs");

const slideConfig = {
  type: "summary",
  index: 8,
  title: "Enterprise Safety, Security & Production Readiness",
};

/**
 * Slide 8: Enterprise Safety, Security & Production Readiness
 * Four core compliance pillars and final operational summary.
 */
function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };

  // Category Tracker
  slide.addText("ENTERPRISE COMPLIANCE & PRODUCTION READINESS", {
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
  slide.addText("Clinical Safety Guardrails & Enterprise Security", {
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
    "Engineered with strict zero-trust principles: patient privacy, clinical boundary safety, and HIPAA readiness.",
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

  // 4 Pillar Cards in a 2x2 layout
  const pillars = [
    {
      num: "01",
      title: "Prompt Injection Defenses",
      desc: "Edge sanitizer catches jailbreak attempts ('DAN', 'ignore previous rules', system prompt leaks) before tokens hit the LLM, conserving billing and maintaining clinical tone.",
      tag: "SECURITY EDGE",
      color: "0284C7",
    },
    {
      num: "02",
      title: "Medical Diagnosis Deflection",
      desc: "AI strictly refuses diagnostic questions (e.g. 'Is my toothache an infection?', 'Prescribe amoxicillin') with an immediate official disclaimer directing the patient to in-person care.",
      tag: "CLINICAL GUARD",
      color: "DC2626",
    },
    {
      num: "03",
      title: "HIPAA & Patient Privacy",
      desc: "Master API keys and OAuth secrets never reach the browser bundle. Realtime voice audio streams are processed in-memory and discarded immediately after session termination.",
      tag: "PRIVACY FIRST",
      color: "16A34A",
    },
    {
      num: "04",
      title: "Atomic Concurrency Control",
      desc: "PostgreSQL unique constraints and row-level locks prevent race conditions. If two patients attempt to book the identical 30-minute slot, one succeeds and the other is offered next availability.",
      tag: "INTEGRITY",
      color: "0F172A",
    },
  ];

  const colW = 4.1;
  const rowH = 1.25;
  const gapX = 0.2;
  const gapY = 0.15;
  const startX = 0.8;
  const startY = 1.55;

  pillars.forEach((p, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = startX + col * (colW + gapX);
    const y = startY + row * (rowH + gapY);

    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x,
      y,
      w: colW,
      h: rowH,
      fill: { color: "FFFFFF" },
      line: { color: "CBD5E1", width: 1.2 },
      rectRadius: 0.08,
    });

    // Tag
    slide.addText(p.tag, {
      x: x + 0.18,
      y: y + 0.1,
      w: colW - 0.36,
      h: 0.18,
      fontSize: 8,
      fontFace: "Arial",
      color: p.color,
      bold: true,
    });

    // Title
    slide.addText(p.title, {
      x: x + 0.18,
      y: y + 0.28,
      w: colW - 0.36,
      h: 0.25,
      fontSize: 11.5,
      fontFace: "Arial",
      color: theme.primary,
      bold: true,
    });

    // Desc
    slide.addText(p.desc, {
      x: x + 0.18,
      y: y + 0.54,
      w: colW - 0.36,
      h: 0.65,
      fontSize: 8.5,
      fontFace: "Arial",
      color: theme.secondary,
    });
  });

  // Bottom Operational Readiness Banner
  const botY = 4.35;
  const botH = 0.75;

  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: startX,
    y: botY,
    w: 8.4,
    h: botH,
    fill: { color: theme.light },
    line: { color: "BAE6FD", width: 1 },
    rectRadius: 0.08,
  });

  slide.addText("VERIFIED PRODUCTION SUITE (100% PASSING)", {
    x: startX + 0.2,
    y: botY + 0.1,
    w: 8.0,
    h: 0.18,
    fontSize: 8.5,
    fontFace: "Arial",
    color: theme.accent,
    bold: true,
  });

  slide.addText(
    "Unit Tests (bun test: 34 passing) • Edge Cases (7 passing) • Playwright E2E Suite (4 tabs passing) • Strict Linters (oxlint & oxfmt)",
    {
      x: startX + 0.2,
      y: botY + 0.32,
      w: 8.0,
      h: 0.32,
      fontSize: 9,
      fontFace: "Arial",
      color: theme.primary,
      bold: true,
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
  slide.addText("08", {
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
  pres.writeFile({ fileName: "slide-08-preview.pptx" });
}

module.exports = { createSlide, slideConfig };

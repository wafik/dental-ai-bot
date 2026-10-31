const pptxgen = require("pptxgenjs");

const slideConfig = {
  type: "content",
  index: 5,
  title: "Realtime Streaming Voice AI Architecture Flow",
};

/**
 * Slide 5: Realtime Streaming Voice AI Architecture Flow
 * Step-by-step visual diagram of provider selection, session gating, and server tool execution.
 */
function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };

  // Category Tracker
  slide.addText("CONVERSATIONAL VOICE AI & WEBSOCKET FLOW", {
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
  slide.addText("Provider-Agnostic Streaming Voice Architecture", {
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
    "How patient voice streams over WebSocket to the configured realtime provider while clinical tool calls are verified safely on the backend.",
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

  // 3 Large Sequential Flow Cards
  const flowCards = [
    {
      num: "PHASE 1",
      title: "Provider Session Gate",
      target: "GET /api/v1/voice/session",
      desc: "Server picks the configured voice provider and returns its session descriptor: a single-use Gemini token, or a direct endpoint URL when an OpenAI-compatible server is configured.",
      badge: "ZERO API KEY LEAKAGE",
      badgeColor: "0284C7",
      bgColor: "F0F9FF",
    },
    {
      num: "PHASE 2",
      title: "Streaming WebSocket Audio",
      target: "WebSocket (PCM16 16/24 kHz)",
      desc: "Browser streams base64 PCM audio over a WebSocket to the realtime provider in both directions. Full-duplex audio with immediate interruption handling.",
      badge: "PROVIDER-AGNOSTIC",
      badgeColor: "0F172A",
      bgColor: "F8FAFC",
    },
    {
      num: "PHASE 3",
      title: "Server Tool Execution",
      target: "POST /api/v1/voice/tools",
      desc: "When the patient confirms a slot, the provider emits a tool call that the browser relays to the server. The backend validates doctor qualification and writes to the DB.",
      badge: "CLINICAL RULE ENFORCED",
      badgeColor: "16A34A",
      bgColor: "F0FDF4",
    },
  ];

  const startX = 0.8;
  const cardW = 2.62;
  const gap = 0.42;
  const cardY = 1.55;
  const cardH = 2.3;

  flowCards.forEach((c, idx) => {
    const x = startX + idx * (cardW + gap);

    // Card Box
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x,
      y: cardY,
      w: cardW,
      h: cardH,
      fill: { color: c.bgColor },
      line: { color: "CBD5E1", width: 1.2 },
      rectRadius: 0.1,
    });

    // Phase Pill
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: x + 0.15,
      y: cardY + 0.15,
      w: 1.0,
      h: 0.25,
      fill: { color: c.badgeColor },
      line: { color: c.badgeColor, width: 0 },
      rectRadius: 0.12,
    });

    slide.addText(c.num, {
      x: x + 0.15,
      y: cardY + 0.15,
      w: 1.0,
      h: 0.25,
      fontSize: 8.5,
      fontFace: "Arial",
      color: "FFFFFF",
      bold: true,
      align: "center",
      valign: "middle",
    });

    // Endpoint Tag
    slide.addText(c.target, {
      x: x + 0.15,
      y: cardY + 0.48,
      w: cardW - 0.3,
      h: 0.2,
      fontSize: 8,
      fontFace: "Arial",
      color: "64748B",
      bold: true,
    });

    // Title
    slide.addText(c.title, {
      x: x + 0.15,
      y: cardY + 0.72,
      w: cardW - 0.3,
      h: 0.3,
      fontSize: 13,
      fontFace: "Arial",
      color: theme.primary,
      bold: true,
    });

    // Divider
    slide.addShape(pres.shapes.LINE, {
      x: x + 0.15,
      y: cardY + 1.08,
      w: cardW - 0.3,
      h: 0,
      line: { color: "CBD5E1", width: 0.8 },
    });

    // Description
    slide.addText(c.desc, {
      x: x + 0.15,
      y: cardY + 1.18,
      w: cardW - 0.3,
      h: 0.65,
      fontSize: 8.5,
      fontFace: "Arial",
      color: theme.secondary,
    });

    // Feature Badge at bottom of card
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: x + 0.15,
      y: cardY + 1.9,
      w: cardW - 0.3,
      h: 0.26,
      fill: { color: "FFFFFF" },
      line: { color: "CBD5E1", width: 0.8 },
      rectRadius: 0.05,
    });

    slide.addText(c.badge, {
      x: x + 0.15,
      y: cardY + 1.9,
      w: cardW - 0.3,
      h: 0.26,
      fontSize: 7.5,
      fontFace: "Arial",
      color: c.badgeColor,
      bold: true,
      align: "center",
      valign: "middle",
    });

    // Flow arrow between cards
    if (idx < flowCards.length - 1) {
      const arrowX = x + cardW + 0.08;
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: arrowX,
        y: cardY + 1.0,
        w: 0.26,
        h: 0.28,
        fill: { color: theme.accent },
        line: { color: theme.accent, width: 0 },
        rectRadius: 0.06,
      });

      slide.addText(">", {
        x: arrowX,
        y: cardY + 1.0,
        w: 0.26,
        h: 0.28,
        fontSize: 14,
        fontFace: "Arial",
        color: "FFFFFF",
        bold: true,
        align: "center",
        valign: "middle",
      });
    }
  });

  // Bottom Comparison: Traditional Cascading Pipeline vs BrightSmile streaming engine
  const bottomY = 4.05;
  const bottomH = 0.95;

  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: startX,
    y: bottomY,
    w: 8.4,
    h: bottomH,
    fill: { color: "FFFFFF" },
    line: { color: "E2E8F0", width: 1.2 },
    rectRadius: 0.08,
  });

  // Left vs Right Comparison inside bottom card
  slide.addText("TRADITIONAL VOICE BOTS (2,500ms Delay)", {
    x: startX + 0.2,
    y: bottomY + 0.12,
    w: 3.8,
    h: 0.2,
    fontSize: 9,
    fontFace: "Arial",
    color: "DC2626",
    bold: true,
  });

  slide.addText(
    "Chained Pipeline: Audio -> STT -> LLM Text -> TTS -> Audio playback. Produces robotic pauses and cannot handle natural patient interruptions.",
    {
      x: startX + 0.2,
      y: bottomY + 0.35,
      w: 3.8,
      h: 0.5,
      fontSize: 8,
      fontFace: "Arial",
      color: "64748B",
    },
  );

  // Vertical divider
  slide.addShape(pres.shapes.LINE, {
    x: startX + 4.15,
    y: bottomY + 0.15,
    w: 0,
    h: bottomH - 0.3,
    line: { color: "E2E8F0", width: 1 },
  });

  slide.addText("BRIGHTSMILE STREAMING ENGINE", {
    x: startX + 4.35,
    y: bottomY + 0.12,
    w: 3.8,
    h: 0.2,
    fontSize: 9,
    fontFace: "Arial",
    color: "0284C7",
    bold: true,
  });

  slide.addText(
    "Native Audio-to-Audio Realtime: Zero transcription middleman. Patients can speak naturally, laugh, or cut in mid-sentence without lag.",
    {
      x: startX + 4.35,
      y: bottomY + 0.35,
      w: 3.8,
      h: 0.5,
      fontSize: 8,
      fontFace: "Arial",
      color: theme.secondary,
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
  slide.addText("05", {
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
  pres.writeFile({ fileName: "slide-05-preview.pptx" });
}

module.exports = { createSlide, slideConfig };

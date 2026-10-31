const pptxgen = require("pptxgenjs");

const slideConfig = {
  type: "content",
  index: 4,
  title: "Clinical Rules & Doctor Qualification Matrix",
};

/**
 * Slide 4: Clinical Rules & Doctor Qualification Matrix
 * Clear table and rule cards demonstrating medical safety.
 */
function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };

  // Category Tracker
  slide.addText("CLINICAL COMPLIANCE & SAFETY MATRIX", {
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
  slide.addText("Strict Doctor Qualification & Procedure Routing", {
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
    "Critical procedures (Root Canal, Crown, Implants) are authoritatively restricted from junior dentists by backend logic.",
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

  // Left: Table Matrix (width 5.5")
  const tableData = [
    [
      { text: "Service Name", options: { bold: true, color: "FFFFFF", fill: { color: theme.primary } } },
      { text: "Duration", options: { bold: true, color: "FFFFFF", fill: { color: theme.primary } } },
      { text: "Dr. Junior", options: { bold: true, color: "FFFFFF", fill: { color: "0284C7" } } },
      { text: "Dr. Senior 1", options: { bold: true, color: "FFFFFF", fill: { color: "0369A1" } } },
      { text: "Dr. Senior 2", options: { bold: true, color: "FFFFFF", fill: { color: "0369A1" } } },
    ],
    [
      { text: "A: Routine Cleaning", options: { bold: true, color: theme.primary } },
      { text: "30 min", options: { color: theme.secondary } },
      { text: "QUALIFIED", options: { color: "15803D", bold: true, fill: { color: "F0FDF4" } } },
      { text: "QUALIFIED", options: { color: "15803D", bold: true, fill: { color: "F0FDF4" } } },
      { text: "QUALIFIED", options: { color: "15803D", bold: true, fill: { color: "F0FDF4" } } },
    ],
    [
      { text: "B: Cavity Filling", options: { bold: true, color: theme.primary } },
      { text: "45 min", options: { color: theme.secondary } },
      { text: "QUALIFIED", options: { color: "15803D", bold: true, fill: { color: "F0FDF4" } } },
      { text: "QUALIFIED", options: { color: "15803D", bold: true, fill: { color: "F0FDF4" } } },
      { text: "QUALIFIED", options: { color: "15803D", bold: true, fill: { color: "F0FDF4" } } },
    ],
    [
      { text: "C: Root Canal Therapy", options: { bold: true, color: theme.primary } },
      { text: "150 min", options: { color: theme.secondary } },
      { text: "BLOCKED", options: { color: "B91C1C", bold: true, fill: { color: "FEF2F2" } } },
      { text: "QUALIFIED", options: { color: "15803D", bold: true, fill: { color: "F0FDF4" } } },
      { text: "QUALIFIED", options: { color: "15803D", bold: true, fill: { color: "F0FDF4" } } },
    ],
    [
      { text: "D: Crown & Veneer Prep", options: { bold: true, color: theme.primary } },
      { text: "120 min", options: { color: theme.secondary } },
      { text: "BLOCKED", options: { color: "B91C1C", bold: true, fill: { color: "FEF2F2" } } },
      { text: "QUALIFIED", options: { color: "15803D", bold: true, fill: { color: "F0FDF4" } } },
      { text: "QUALIFIED", options: { color: "15803D", bold: true, fill: { color: "F0FDF4" } } },
    ],
    [
      { text: "E: Full Mouth Implant", options: { bold: true, color: theme.primary } },
      { text: "360 min", options: { color: theme.secondary } },
      { text: "BLOCKED", options: { color: "B91C1C", bold: true, fill: { color: "FEF2F2" } } },
      { text: "QUALIFIED", options: { color: "15803D", bold: true, fill: { color: "F0FDF4" } } },
      { text: "QUALIFIED", options: { color: "15803D", bold: true, fill: { color: "F0FDF4" } } },
    ],
  ];

  slide.addTable(tableData, {
    x: 0.8,
    y: 1.55,
    w: 5.3,
    h: 3.3,
    colW: [2.0, 0.8, 0.83, 0.83, 0.83],
    fontSize: 9,
    fontFace: "Arial",
    align: "center",
    valign: "middle",
    border: { pt: 0.5, color: "CBD5E1" },
  });

  // Right Side: 3 Backend Architecture Cards (x: 6.35, w: 2.85)
  const rightX = 6.35;
  const rightW = 2.85;

  const ruleCards = [
    {
      title: "Hard Backend Validation",
      desc: "Never relies on system prompt instructions alone. AppointmentService throws an authoritative error if an unauthorized doctor is booked.",
      tag: "DETERMINISTIC",
      color: "0284C7",
    },
    {
      title: "Dynamic Slot Calculation",
      desc: "Procedures automatically reserve consecutive 30-min increments (e.g. 6.0h Implant = 12 slots), ensuring zero scheduling overlap.",
      tag: "TIME-EXPANSION",
      color: "0F172A",
    },
    {
      title: "Friendly User Redirection",
      desc: "When a patient asks Dr. Junior for Service C/D/E, the AI politely suggests Dr. Senior 1 or 2 with their exact earliest available slots.",
      tag: "AUTO-ROUTING",
      color: "16A34A",
    },
  ];

  ruleCards.forEach((rc, idx) => {
    const cardY = 1.55 + idx * 1.15;
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: rightX,
      y: cardY,
      w: rightW,
      h: 1.02,
      fill: { color: "FFFFFF" },
      line: { color: "E2E8F0", width: 1.2 },
      rectRadius: 0.08,
    });

    // Tag
    slide.addText(rc.tag, {
      x: rightX + 0.15,
      y: cardY + 0.1,
      w: rightW - 0.3,
      h: 0.18,
      fontSize: 7.5,
      fontFace: "Arial",
      color: rc.color,
      bold: true,
    });

    // Title
    slide.addText(rc.title, {
      x: rightX + 0.15,
      y: cardY + 0.28,
      w: rightW - 0.3,
      h: 0.22,
      fontSize: 10,
      fontFace: "Arial",
      color: theme.primary,
      bold: true,
    });

    // Desc
    slide.addText(rc.desc, {
      x: rightX + 0.15,
      y: cardY + 0.5,
      w: rightW - 0.3,
      h: 0.45,
      fontSize: 8,
      fontFace: "Arial",
      color: theme.secondary,
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
  slide.addText("04", {
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
  pres.writeFile({ fileName: "slide-04-preview.pptx" });
}

module.exports = { createSlide, slideConfig };

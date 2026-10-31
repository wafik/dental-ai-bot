const pptxgen = require("pptxgenjs");
const fs = require("node:fs");
const path = require("node:path");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";

const theme = {
  primary: "0F172A", // Deep navy slate
  secondary: "334155", // Neutral slate for body text
  accent: "0284C7", // Medical cyan / electric blue
  light: "E0F2FE", // Soft ice blue for card backgrounds
  bg: "F8FAFC", // Off-white clean background
};

// Ensure output directories exist
const outputDir = path.join(__dirname, "output");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const docsDir = path.join(__dirname, "..", "docs");
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

// Compile all 8 slides
for (let i = 1; i <= 8; i++) {
  const num = String(i).padStart(2, "0");
  const slideFile = path.join(__dirname, `slide-${num}.js`);
  if (fs.existsSync(slideFile)) {
    const slideModule = require(slideFile);
    slideModule.createSlide(pres, theme);
    console.log(`[Compile] Added Slide ${num}: ${slideModule.slideConfig.title}`);
  } else {
    console.warn(`[Compile] Warning: Slide file not found: ${slideFile}`);
  }
}

const outputFile = path.join(outputDir, "BrightSmile_Dental_AI_Presentation.pptx");
const docsOutputFile = path.join(docsDir, "BrightSmile_Dental_AI_Presentation.pptx");

pres.writeFile({ fileName: outputFile })
  .then(() => {
    console.log(`[Compile] Presentation successfully saved to: ${outputFile}`);
    // Copy to docs/ directory as well
    fs.copyFileSync(outputFile, docsOutputFile);
    console.log(`[Compile] Presentation mirrored to docs directory: ${docsOutputFile}`);
  })
  .catch((err) => {
    console.error("[Compile] Error compiling presentation:", err);
    process.exit(1);
  });

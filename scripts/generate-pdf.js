const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

const documents = [
  {
    html: "docs/BrightSmile_Dental_AI_Executive_Summary.html",
    pdf: "docs/BrightSmile_Dental_AI_Executive_Summary.pdf",
    label: "Executive Summary",
  },
  {
    html: "docs/BrightSmile_Dental_AI_Technical_Spec.html",
    pdf: "docs/BrightSmile_Dental_AI_Technical_Spec.pdf",
    label: "Technical Specification",
  },
];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader"],
  });

  for (const doc of documents) {
    const htmlPath = path.resolve(doc.html);
    const pdfPath = path.resolve(doc.pdf);

    console.log(`[PDF] Rendering ${doc.label}: ${htmlPath}`);
    const page = await browser.newPage();
    const fileUrl = "file:///" + htmlPath.split(path.sep).join("/");
    await page.goto(fileUrl, { waitUntil: "networkidle" });

    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
      preferCSSPageSize: true,
    });

    const stats = fs.statSync(pdfPath);
    console.log(`[PDF] Saved ${doc.label} (${(stats.size / 1024).toFixed(2)} KB) -> ${pdfPath}`);
    await page.close();
  }

  await browser.close();
  console.log("[PDF] All PDF documents generated successfully.");
})();

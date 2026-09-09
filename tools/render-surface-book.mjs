import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
const esc = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const escAttr = value => esc(value).replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export async function renderSurfaceBookPdf({ browser, html, outPath, title }) {
  // Hundreds of DPR-2 screenshots can exhaust Chromium's print renderer even
  // when the HTML loads successfully. Print bounded groups, then concatenate
  // their PDF pages without re-rasterizing the screenshots or selectable text.
  const sections = [...html.matchAll(/<section\b[\s\S]*?<\/section>/g)].map((match) => match[0]);
  const prefix = html.slice(0, html.indexOf("<body>") + "<body>".length).replace("</head>", `<base href="${escAttr(pathToFileURL(resolve(dirname(outPath)) + "/").href)}"></head>`);
  // Eight desktop DPR-2 frames decode to about 160 MB. Twenty can exceed
  // Chromium's image decoder budget even though every PNG is valid.
  const chunkSize = 8;
  const chunkCount = Math.ceil(sections.length / chunkSize);
  const temporary = mkdtempSync(join(tmpdir(), "shuttleworks-book-pdf-"));
  const parts = [];
  try {
    for (let start = 0; start < sections.length; start += chunkSize) {
      const partNumber = parts.length + 1;
      const reportPage = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      try {
        const chunkPath = join(temporary, `part-${partNumber}.html`);
        writeFileSync(chunkPath, prefix + sections.slice(start, start + chunkSize).join("").replaceAll('loading="lazy"', 'loading="eager"') + "</body></html>");
        await reportPage.goto(pathToFileURL(chunkPath).href, { waitUntil: "load", timeout: 120000 });
        await reportPage.locator("img").evaluateAll(async images => {
          await Promise.all(images.map(image => { return image.decode(); }));
        });
        await reportPage.emulateMedia({ media: "print", reducedMotion: "reduce" });
        const clippedSheets = await reportPage.locator('.sheet').evaluateAll((sheets) =>
          sheets.flatMap((sheet, index) => sheet.scrollHeight > sheet.clientHeight + 2 ? [index + 1] : []));
        if (clippedSheets.length) throw new Error(`Review-book content exceeds its sheets in PDF part ${partNumber}: ${clippedSheets.join(', ')}`);
        const partPath = join(temporary, `part-${partNumber}.pdf`);
        await reportPage.pdf({
          path: partPath,
          format: "A3", landscape: true, printBackground: true, preferCSSPageSize: true,
          displayHeaderFooter: true, headerTemplate: "<div></div>",
          footerTemplate: `<div style="box-sizing:border-box;width:100%;padding:0 12mm;font:10px -apple-system,'Segoe UI',sans-serif;color:#667085;display:flex;justify-content:space-between;align-items:center"><span>${esc(title)}</span><span>Part ${partNumber} / ${chunkCount} · Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
          margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
        });
        parts.push(partPath);
        if (partNumber % 20 === 0 || partNumber === chunkCount) console.log(`Printed PDF part ${partNumber} / ${chunkCount}`);
      } finally {
        await reportPage.close();
      }
    }
    if (parts.length === 1) {
      writeFileSync(outPath, readFileSync(parts[0]));
    } else {
      // pypdf is also used by the repository's surface-book text extractor.
      const repoPython = join(dirname(fileURLToPath(import.meta.url)), "../.venv/bin/python");
      const python = process.env.SURFACE_PDF_PYTHON ?? (existsSync(repoPython) ? repoPython : "python3");
      execFileSync(python, ["-c", "from pypdf import PdfWriter; import sys; writer = PdfWriter(); [writer.append(path) for path in sys.argv[2:]]; writer.write(sys.argv[1]); writer.close()", outPath, ...parts]);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  console.log(`wrote ${outPath}`);
}


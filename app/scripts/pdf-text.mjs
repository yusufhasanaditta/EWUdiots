// Prints the text of each page of a PDF that mentions a keyword (default "Alumni"), keeping line breaks.
// Usage: node scripts/pdf-text.mjs file.pdf [keyword]
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync } from "node:fs";

const [file, kw = "Alumni"] = process.argv.slice(2);
const doc = await getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise;
for (let i = 1; i <= doc.numPages; i++) {
  const c = await (await doc.getPage(i)).getTextContent();
  let out = "", lastY = null;
  for (const it of c.items) { const y = Math.round(it.transform[5]); if (lastY !== null && Math.abs(y - lastY) > 4) out += "\n"; out += it.str; lastY = y; }
  if (new RegExp(kw, "i").test(out)) console.log(`\n===== page ${i} =====\n${out.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n")}`);
}

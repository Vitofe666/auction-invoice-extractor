import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'node:module';
const { writePdf, writeDocx } = createRequire(import.meta.url)('../backend/fichaExport.ts') as typeof import('../backend/fichaExport');
import { FIELD_LIMITS, GRID_PAIRS, LABELS, REPORT_SCHEMA, fichaTitle, validateReport, detailGroups } from '../ficha';
import { fixture } from './ficha.fixture';

async function verifyExports(name: string, record = fixture()) {
  const pdf = await writePdf(record);
  const word = await writeDocx(record);
  const loadingTask = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true });
  const document = await loadingTask.promise;
  assert.equal(document.numPages, detailGroups(record.report).length + 1);
  const page = await document.getPage(1);
  assert.ok(Math.abs(page.view[2] - 595.28) < 1 && Math.abs(page.view[3] - 841.89) < 1, 'A4 page');
  const items = (await page.getTextContent()).items as { str: string; transform: number[] }[];
  const text = items.map(item => item.str).join(' ');
  const headings = GRID_PAIRS.flat().map(key => LABELS[key]);
  let previous = -1;
  for (const heading of headings) {
    const position = text.indexOf(heading);
    assert.ok(position > previous, `page-one heading order: ${heading}`); previous = position;
  }
  assert.ok(text.includes(record.report.auctionHouseEstimate));
  assert.ok(text.includes(record.report.predictedHammer));
  assert.ok(text.includes('independent'));
  assert.ok(!text.includes('Decision Grid'));
  const operators = await page.getOperatorList();
  assert.ok(operators.fnArray.some(op => op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject), 'page-one image');
  for (let number = 1; number <= document.numPages; number++) {
    const p = await document.getPage(number);
    for (const item of (await p.getTextContent()).items as { str: string; transform: number[] }[]) {
      if (item.str) assert.ok(item.transform[4] >= 35 && item.transform[5] >= 35, 'text inside margins');
    }
  }
  const zip = await JSZip.loadAsync(word);
  const xml = await zip.file('word/document.xml')!.async('string');
  assert.equal((xml.match(/<w:tbl>/g) || []).length, 4);
  assert.equal((xml.match(/<w:br w:type="page"\/>/g) || []).length, detailGroups(record.report).length);
  assert.match(xml, /w:w="11906" w:h="16838"/);
  assert.ok(xml.indexOf('<w:drawing>') < xml.indexOf('<w:tbl>'), 'image before all tables');
  previous = -1;
  for (const heading of headings) { const pos = xml.indexOf(heading); assert.ok(pos > previous); previous = pos; }
  assert.ok(xml.includes(fichaTitle(record.report)));
  assert.match(xml.slice(xml.indexOf(fichaTitle(record.report)) - 120, xml.indexOf(fichaTitle(record.report))), /<w:b\/>/, 'bold title');
  const media = Object.values(zip.files).filter(file => file.name.startsWith('word/media/') && !file.dir);
  assert.equal(media.length, 1);
  assert.deepEqual(await media[0].async('nodebuffer'), Buffer.from(record.representativeImage.dataUrl.split(',')[1], 'base64'), 'original bytes preserved');
  // Each table has exactly two cells; row cannot split across pages.
  for (const table of xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []) {
    assert.equal((table.match(/<w:tc>/g) || []).length, 2); assert.match(table, /<w:cantSplit\/>/);
  }
  if (process.env.FICHA_EXPORT_DIR) {
    await mkdir(process.env.FICHA_EXPORT_DIR, { recursive: true });
    await writeFile(`${process.env.FICHA_EXPORT_DIR}/${name}.pdf`, pdf);
    await writeFile(`${process.env.FICHA_EXPORT_DIR}/${name}.docx`, word);
    await writeFile(`${process.env.FICHA_EXPORT_DIR}/${name}.json`, JSON.stringify(record));
  }
  await loadingTask.destroy();
}

test('sapphire ring: original PNG, price separation and two-page exports', () => verifyExports('ring'));
test('pearl necklace: original JPEG and missing catalogue fields', () => verifyExports('pearls', fixture('jpg', {
  mainStones: 'Natural Pearl and Diamond', object: 'Necklace', period: 'Early 20th Century',
  auctionHouseEstimate: 'Not supplied', predictedHammer: 'Not assessed', retail: 'Not assessed', buyScore: null,
  recommendation: '+ Graduated pearl design. - Value requires certificate review and matching assessment.',
  warnings: 'Photographs cannot establish natural status. Certificate and pearl count not supplied in this test case.',
  gemstoneDetails: 'Catalogue: natural saltwater pearls, 3.2–9.0mm. Supplied CHAU: 72. Certificate and count over 4mm not supplied.',
  diamondDetails: 'Diamond-set clasp reported by the catalogue; diamond weight and grades not supplied.',
  metalValue: 'Catalogue: 18ct gold clasp. Gross and net metal weights not supplied; scrap not assessed.',
  periodWorkmanshipMaker: 'Catalogue: early 20th century. Maker not established. Inspect clasp construction and marks.',
  sizeNotes: 'Necklace length and pearl count not supplied. Confirm the diameter range and clasp dimensions.',
  condition: 'Check stringing, drill holes, nacre wear, clasp security and any replacement pearls in person.',
  catalogueInformation: 'The example catalogue describes a graduated natural saltwater pearl and diamond necklace with an 18ct gold clasp. A 3.2–9.0mm pearl range and 72 CHAU are supplied. The auction estimate, certificate, pearl count and necklace length are not supplied.',
  specialistAssessment: 'Assess lustre, surface, shape, colour matching and graduation separately. Natural saltwater status requires a suitable laboratory report. No photographic probability or count over 4mm is calculated from this synthetic test image.',
  valuationRationale: 'Independent predicted hammer and realistic retail are not assessed because certificate details and sufficient valuation evidence are missing. The absence of an auction estimate does not supply a pricing basis. This is an export test, not a trade valuation.',
  conditionAndFollowUp: 'Request the certificate, full necklace photographs, clasp marks and close-ups of drill holes and surface wear. Confirm pearl count, length and diameter distribution before considering a bid.',
})));
test('maximum-length fields remain three pages without truncation', async () => {
  const record = fixture();
  for (const [key, limit] of Object.entries(FIELD_LIMITS)) {
    record.report[key] = ('Evidence reported separately. '.repeat(100)).slice(0, limit);
  }
  await verifyExports('long', record);
});
test('schema and edits reject incomplete, old, malformed or excessive fields', () => {
  assert.deepEqual(REPORT_SCHEMA.required.sort(), Object.keys(fixture().report).sort());
  assert.throws(() => validateReport({ itemOverview: 'Legacy report' }));
  assert.throws(() => validateReport({ ...fixture().report, buyScore: 11 }));
  assert.throws(() => validateReport({ ...fixture().report, buyScore: NaN }));
  assert.throws(() => validateReport({ ...fixture().report, recommendation: 123 }));
  assert.throws(() => validateReport({ ...fixture().report, warnings: 'x'.repeat(241) }));
  assert.throws(() => validateReport({ ...fixture().report, unexpected: 'text' }));
});
test('missing or corrupt photographs cannot yield a text-only export', async () => {
  for (const dataUrl of ['', 'data:image/png;base64,YmFk', 'data:image/svg+xml;base64,YmFk']) {
    const record = fixture(); record.representativeImage.dataUrl = dataUrl;
    await assert.rejects(writePdf(record)); await assert.rejects(writeDocx(record));
  }
});

test('extreme wide text is rejected by both exporters instead of overflowing Word', async () => {
  const record = fixture();
  for (const [key, limit] of Object.entries(FIELD_LIMITS)) record.report[key] = 'W'.repeat(limit);
  await assert.rejects(writePdf(record), /too long/);
  await assert.rejects(writeDocx(record), /too long/);
});

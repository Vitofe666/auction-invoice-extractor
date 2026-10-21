import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ImageRun, PageBreak, TableLayoutType } from 'docx';
import { imageSize } from 'image-size';
import type { ReportRecord } from '../types';
import { DETAIL_KEYS, GRID_PAIRS, LABELS, fichaTitle, gridText, validateReport, displayText, detailGroups } from '../ficha';

const MARGIN = 36;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const WIDTH = PAGE_WIDTH - 2 * MARGIN;

export function originalImage(record: ReportRecord) {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(record.representativeImage?.dataUrl || '');
  if (!match) throw new Error('Select an original JPEG or PNG photograph before exporting.');
  const data = Buffer.from(match[2], 'base64');
  const dimensions = imageSize(data);
  if (!dimensions.width || !dimensions.height || !['png', 'jpg'].includes(dimensions.type || '')) throw new Error('Invalid photograph.');
  const scale = Math.min(300 / dimensions.width, 130 / dimensions.height);
  return { data, type: dimensions.type === 'png' ? 'png' as const : 'jpg' as const,
    width: dimensions.width * scale, height: dimensions.height * scale };
}

function registerFonts(doc: PDFKit.PDFDocument): void {
  const resolve = createRequire(path.join(process.cwd(), 'package.json')).resolve;
  doc.registerFont('Ficha', resolve('@fontsource/arimo/files/arimo-latin-400-normal.woff'));
  doc.registerFont('Ficha-Bold', resolve('@fontsource/arimo/files/arimo-latin-700-normal.woff'));
}

/** Conservative metric preflight shared by both exporters; reject edits that would break A4 layout. */
function validateLayout(record: ReportRecord): void {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
  registerFonts(doc);
  const r = record.report;
  const height = (text: string, size: number, width = WIDTH, bold = false) => {
    doc.font(bold ? 'Ficha-Bold' : 'Ficha').fontSize(size);
    return doc.heightOfString(displayText(text), { width, lineGap: 2 });
  };
  let first = height(`${r.auctionHouse} | ${r.auctionDate} | Lot ${r.lotNumber}`, 10)
    + height(fichaTitle(r), 15, WIDTH, true) + originalImage(record).height
    + height(`${LABELS.auctionHouseEstimate}: ${r.auctionHouseEstimate}`, 9) + 35;
  for (const pair of GRID_PAIRS) {
    first += Math.max(...pair.map(key => height(LABELS[key], 9, WIDTH / 2 - 16, true)
      + gridText(r, key).split('\n').reduce((sum, line) => sum + height(line, 9, WIDTH / 2 - 16) + 4, 0) + 24));
  }
  if (first > 710) throw new Error('Page-one content is too long. Shorten the title or table summaries.');
  const groups = detailGroups(r);
  for (let index = 0; index < groups.length; index++) {
    let total = 45;
    for (const key of groups[index]) total += height(LABELS[key], 11, WIDTH, true) + height(r[key], 10) + 24;
    if (index === 0) total += height(`Source: ${record.url}`, 8) + 25;
    if (total > 710) throw new Error('Detailed content is too long. Shorten the assessment.');
  }
  doc.end();
}

/** Two pages for concise assessments; a third page for extended supporting detail. */
export async function writePdf(record: ReportRecord): Promise<Buffer> {
  validateReport(record.report);
  validateLayout(record);
  const image = originalImage(record);
  const r = Object.fromEntries(Object.entries(record.report).map(([key, value]) => [key, typeof value === 'string' ? displayText(value) : value])) as typeof record.report;
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
  registerFonts(doc);
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', chunk => chunks.push(Buffer.from(chunk)));
    doc.once('end', () => resolve(Buffer.concat(chunks)));
    doc.once('error', reject);
  });
  doc.font('Ficha').fontSize(10).text(`${r.auctionHouse} | ${r.auctionDate} | Lot ${r.lotNumber}`);
  doc.moveDown(0.4).font('Ficha-Bold').fontSize(15).text(fichaTitle(r));
  doc.moveDown(0.4);
  const photoY = doc.y;
  doc.image(image.data, MARGIN + (WIDTH - image.width) / 2, photoY, { width: image.width, height: image.height });
  doc.y = photoY + image.height + 8;
  doc.font('Ficha').fontSize(9).text(`${LABELS.auctionHouseEstimate}: ${r.auctionHouseEstimate}`);
  doc.moveDown(0.5);
  for (const pair of GRID_PAIRS) {
    const y = doc.y;
    const colWidth = WIDTH / 2;
    const heights = pair.map(key => {
      doc.font('Ficha-Bold').fontSize(9);
      const heading = doc.heightOfString(LABELS[key], { width: colWidth - 16 });
      doc.font('Ficha').fontSize(9);
      return heading + doc.heightOfString(gridText(r, key), { width: colWidth - 16, lineGap: 1 }) + 20;
    });
    const height = Math.max(...heights);
    if (y + height > PAGE_HEIGHT - MARGIN) throw new Error('Page-one content is too long. Shorten the summaries.');
    pair.forEach((key, index) => {
      const x = MARGIN + index * colWidth;
      doc.rect(x, y, colWidth, height).lineWidth(0.5).strokeColor('#CBD5E1').stroke();
      doc.fillColor('#0F172A').font('Ficha-Bold').fontSize(9).text(LABELS[key], x + 8, y + 7, { width: colWidth - 16 });
      doc.font('Ficha').fontSize(9).text(gridText(r, key), x + 8, doc.y + 4, { width: colWidth - 16, lineGap: 1 });
    });
    doc.x = MARGIN;
    doc.y = y + height + 7;
  }
  const groups = detailGroups(r);
  for (let page = 0; page < groups.length; page++) {
    doc.addPage();
    doc.fillColor('#0F172A').font('Ficha-Bold').fontSize(12).text(groups.length === 1 ? 'Supporting assessment' : page === 0 ? 'Evidence and assessment' : 'Valuation and condition');
    doc.moveDown();
    for (const key of groups[page]) {
      doc.font('Ficha-Bold').fontSize(11).text(LABELS[key]);
      doc.moveDown(0.4).font('Ficha').fontSize(10).text(r[key], { lineGap: 2 });
      doc.moveDown();
    }
    if (page === 0) {
      doc.fontSize(8).text(`Source: ${record.url}`, { link: record.url });
      doc.text(`Generated: ${record.generatedAt}`);
    }
  }
  if (doc.bufferedPageRange().count !== groups.length + 1) throw new Error('Report exceeds three pages. Shorten the detailed assessment.');
  doc.end();
  return completed;
}

export async function writeDocx(record: ReportRecord): Promise<Buffer> {
  validateReport(record.report);
  validateLayout(record);
  const image = originalImage(record);
  const r = Object.fromEntries(Object.entries(record.report).map(([key, value]) => [key, typeof value === 'string' ? displayText(value) : value])) as typeof record.report;
  const p = (text: string, bold = false, size = 19) => new Paragraph({
    spacing: { after: 70 }, children: [new TextRun({ text, bold, size })],
  });
  const children: (Paragraph | Table)[] = [
    p(`${r.auctionHouse} | ${r.auctionDate} | Lot ${r.lotNumber}`),
    p(fichaTitle(r), true, 30),
    new Paragraph({ alignment: 'center', spacing: { after: 80 }, children: [new ImageRun({
      data: image.data, type: image.type,
      transformation: { width: image.width * 96 / 72, height: image.height * 96 / 72 },
      altText: { title: 'Original representative jewellery photograph', description: record.representativeImage.sourceUrl, name: 'Lot photograph' },
    })] }),
    p(`${LABELS.auctionHouseEstimate}: ${r.auctionHouseEstimate}`, false, 18),
  ];
  for (const pair of GRID_PAIRS) {
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [5233, 5233], layout: TableLayoutType.FIXED,
      rows: [new TableRow({ cantSplit: true, children: pair.map(key => new TableCell({
        width: { size: 50, type: WidthType.PERCENTAGE },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [p(LABELS[key], true, 18), ...gridText(r, key).split('\n').map(line => p(line, false, 18))],
      })) })],
    }));
    children.push(new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: '', size: 2 })] }));
  }
  const groups = detailGroups(r);
  for (let page = 0; page < groups.length; page++) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(p(groups.length === 1 ? 'Supporting assessment' : page === 0 ? 'Evidence and assessment' : 'Valuation and condition', true, 24));
    for (const key of groups[page]) {
      children.push(p(LABELS[key], true, 22));
      children.push(...r[key].split('\n').map(line => p(line, false, 20)));
    }
    if (page === 0) {
      children.push(p(`Source: ${record.url}`, false, 16), p(`Generated: ${record.generatedAt}`, false, 16));
    }
  }
  const doc = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 19 }, paragraph: { spacing: { line: 240, after: 70 } } } } },
    sections: [{ properties: { page: {
      size: { width: 11906, height: 16838 },
      margin: { top: 720, bottom: 720, left: 720, right: 720 },
    } }, children }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

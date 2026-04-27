import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import OpenAI from 'openai';
import { chromium } from 'playwright';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';

config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = Number(process.env.PORT || 3001);
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';
const REQUEST_TIMEOUT_MS = Number(process.env.SCRAPE_TIMEOUT_MS || 45000);
const MAX_IMAGES = Number(process.env.MAX_IMAGES_PER_LOT || 8);
const MAX_URLS_PER_REQUEST = Number(process.env.MAX_URLS_PER_REQUEST || 5);

if (!process.env.OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY is not configured; report generation requests will fail.');
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type SectionKey =
  | 'itemOverview'
  | 'materialsAndGemstones'
  | 'conditionAssessment'
  | 'authenticityObservations'
  | 'weightAndMeasurements'
  | 'marketAndValuationInsight';

interface ScrapedLot {
  url: string;
  title: string;
  description: string;
  metadata: Record<string, string>;
  images: string[];
}

interface ReportSections {
  itemOverview: string;
  materialsAndGemstones: string;
  conditionAssessment: string;
  authenticityObservations: string;
  weightAndMeasurements: string;
  marketAndValuationInsight: string;
}

interface ReportRecord {
  id: string;
  url: string;
  scrapedLot: ScrapedLot;
  report: ReportSections;
  generatedAt: string;
}

const reportCache = new Map<string, ReportRecord>();
const urlToCacheKey = new Map<string, string>();

const REPORT_SYSTEM_PROMPT = `You are a senior jewellery specialist writing formal auction-house reports. You will receive lot text and images.
Return only valid JSON with these exact keys:
{
  "itemOverview": "...",
  "materialsAndGemstones": "...",
  "conditionAssessment": "...",
  "authenticityObservations": "...",
  "weightAndMeasurements": "...",
  "marketAndValuationInsight": "..."
}
Rules:
- Professional, concise, evidence-based tone.
- Use complete paragraphs with bullet points only where useful.
- If evidence is missing, explicitly state limitations.
- Do not invent hallmarks, weights, dimensions, provenance, or market prices.
- Mention confidence level when information is uncertain.`;

const SECTION_TITLES: Record<SectionKey, string> = {
  itemOverview: 'Item Overview',
  materialsAndGemstones: 'Materials and Gemstones Analysis',
  conditionAssessment: 'Condition Assessment',
  authenticityObservations: 'Authenticity Observations',
  weightAndMeasurements: 'Weight and Measurement Validation',
  marketAndValuationInsight: 'Market and Valuation Insight',
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function absoluteUrl(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

async function scrapeLotPage(url: string): Promise<ScrapedLot> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: REQUEST_TIMEOUT_MS });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);

    const scraped = await page.evaluate(() => {
      const text = (selector: string): string => {
        const element = document.querySelector(selector);
        return element?.textContent?.trim() || '';
      };

      const candidateTitleSelectors = [
        'h1',
        '.lot-title',
        '[class*="lot"] h1',
        '[class*="title"]',
        'meta[property="og:title"]',
      ];

      let title = '';
      for (const selector of candidateTitleSelectors) {
        const found = selector.includes('meta[')
          ? document.querySelector(selector)?.getAttribute('content') || ''
          : text(selector);
        if (found) {
          title = found;
          break;
        }
      }

      const descriptionCandidates = [
        '.description',
        '.lot-description',
        '[class*="description"]',
        '[id*="description"]',
        'article',
        'main',
      ];

      let description = '';
      for (const selector of descriptionCandidates) {
        const found = text(selector);
        if (found && found.length > description.length) {
          description = found;
        }
      }

      const metadata: Record<string, string> = {};
      const pairs = document.querySelectorAll('dt, th, .label, .lot-meta-label');
      pairs.forEach((labelNode) => {
        const rawLabel = labelNode.textContent?.trim();
        if (!rawLabel) return;

        let value = '';
        const sibling = labelNode.nextElementSibling;
        if (sibling) {
          value = sibling.textContent?.trim() || '';
        }

        if (!value) {
          const parent = labelNode.parentElement;
          if (parent) {
            const children = Array.from(parent.children);
            const index = children.indexOf(labelNode as Element);
            if (index >= 0 && children[index + 1]) {
              value = children[index + 1].textContent?.trim() || '';
            }
          }
        }

        if (value) {
          metadata[rawLabel.replace(/:$/, '')] = value;
        }
      });

      const imageSources = Array.from(document.querySelectorAll('img'))
        .map((img) =>
          img.getAttribute('data-zoom') ||
          img.getAttribute('data-src') ||
          img.getAttribute('srcset')?.split(',').at(-1)?.trim().split(' ')[0] ||
          img.getAttribute('src') ||
          ''
        )
        .filter(Boolean);

      const metaEstimate = text('[class*="estimate"], [id*="estimate"]');
      if (metaEstimate && !metadata.Estimate) {
        metadata.Estimate = metaEstimate;
      }

      return {
        title,
        description,
        metadata,
        imageSources,
      };
    });

    const imageUrls = Array.from(new Set(scraped.imageSources.map((src) => absoluteUrl(src, url))))
      .filter((src) => src.startsWith('http'))
      .slice(0, MAX_IMAGES);

    const title = normalizeWhitespace(scraped.title) || 'Untitled lot';
    const description = normalizeWhitespace(scraped.description);

    if (!description) {
      throw new Error('Unable to extract lot description from the page.');
    }

    return {
      url,
      title,
      description,
      metadata: scraped.metadata,
      images: imageUrls,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function fetchImagesAsDataUrls(imageUrls: string[]): Promise<string[]> {
  const results: string[] = [];

  for (const imageUrl of imageUrls) {
    try {
      const response = await fetch(imageUrl, { headers: { 'User-Agent': 'AuctionReportBot/1.0' } });
      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      results.push(`data:${contentType};base64,${base64}`);
    } catch {
      // Skip individual image failures; report generation can continue.
    }
  }

  return results;
}

async function generateAuctionReport(scrapedLot: ScrapedLot, imageDataUrls: string[]): Promise<ReportSections> {
  const content: Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string }> = [
    {
      type: 'input_text',
      text:
        `Lot URL: ${scrapedLot.url}\n` +
        `Title: ${scrapedLot.title}\n` +
        `Description: ${scrapedLot.description}\n` +
        `Metadata: ${JSON.stringify(scrapedLot.metadata, null, 2)}\n` +
        `Write a professional report with the required sections.`,
    },
  ];

  for (const imageUrl of imageDataUrls) {
    content.push({ type: 'input_image', image_url: imageUrl });
  }

  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: REPORT_SYSTEM_PROMPT }] },
      { role: 'user', content },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'auction_report',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            itemOverview: { type: 'string' },
            materialsAndGemstones: { type: 'string' },
            conditionAssessment: { type: 'string' },
            authenticityObservations: { type: 'string' },
            weightAndMeasurements: { type: 'string' },
            marketAndValuationInsight: { type: 'string' },
          },
          required: [
            'itemOverview',
            'materialsAndGemstones',
            'conditionAssessment',
            'authenticityObservations',
            'weightAndMeasurements',
            'marketAndValuationInsight',
          ],
        },
      },
    },
  });

  const outputText = response.output_text;
  if (!outputText) {
    throw new Error('AI service returned an empty response.');
  }

  return JSON.parse(outputText) as ReportSections;
}

function buildCacheKey(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex');
}

function isPrivateIpv4(address: string): boolean {
  const octets = address.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return true;
  }

  const [a, b] = octets;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    a === 0 ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80')
  );
}

function isPrivateIp(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

async function validateScrapeTarget(rawUrl: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL format.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http:// and https:// URLs are supported.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('URLs with embedded credentials are not allowed.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Local network addresses are not allowed.');
  }

  if (isPrivateIp(hostname)) {
    throw new Error('Private or loopback IP addresses are not allowed.');
  }

  const lookupRecords = await dns.lookup(hostname, { all: true });
  if (!lookupRecords.length) {
    throw new Error('Unable to resolve URL hostname.');
  }

  if (lookupRecords.some((record) => isPrivateIp(record.address))) {
    throw new Error('Resolved hostname points to a private or local address.');
  }

  return parsed.toString();
}

async function writePdf(record: ReportRecord): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];

  doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));

  doc.fontSize(18).text('Auction Lot Assessment Report', { align: 'left' });
  doc.moveDown(0.5);
  doc.fontSize(11).text(`Generated: ${new Date(record.generatedAt).toLocaleString()}`);
  doc.text(`Source URL: ${record.url}`);
  doc.text(`Lot Title: ${record.scrapedLot.title}`);
  doc.moveDown();

  (Object.keys(SECTION_TITLES) as SectionKey[]).forEach((sectionKey) => {
    doc.fontSize(13).text(SECTION_TITLES[sectionKey], { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(11).text(record.report[sectionKey], { align: 'left' });
    doc.moveDown();
  });

  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.once('end', () => resolve(Buffer.concat(chunks)));
    doc.once('error', reject);
  });

  doc.end();
  return completed;
}

async function writeDocx(record: ReportRecord): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ text: 'Auction Lot Assessment Report', heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `Generated: ${new Date(record.generatedAt).toLocaleString()}` }),
    new Paragraph({ text: `Source URL: ${record.url}` }),
    new Paragraph({ text: `Lot Title: ${record.scrapedLot.title}` }),
    new Paragraph(''),
  ];

  (Object.keys(SECTION_TITLES) as SectionKey[]).forEach((key) => {
    children.push(new Paragraph({ text: SECTION_TITLES[key], heading: HeadingLevel.HEADING_1 }));
    children.push(new Paragraph({ children: [new TextRun(record.report[key])] }));
    children.push(new Paragraph(''));
  });

  const doc = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    model: OPENAI_MODEL,
    cacheSize: reportCache.size,
    openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/reports/generate', async (req, res) => {
  try {
    const urls: string[] = Array.isArray(req.body?.urls) ? req.body.urls : [];
    if (!urls.length) {
      return res.status(400).json({ error: 'Provide at least one URL in urls[]' });
    }

    if (urls.length > MAX_URLS_PER_REQUEST) {
      return res.status(400).json({ error: `Maximum ${MAX_URLS_PER_REQUEST} URLs per request.` });
    }

    const results: Array<{ ok: boolean; url: string; fromCache?: boolean; record?: ReportRecord; error?: string }> = [];

    for (const rawUrl of urls) {
      const url = String(rawUrl).trim();
      if (!url) continue;

      try {
        const cacheKey = buildCacheKey(url);
        const cachedId = urlToCacheKey.get(cacheKey);
        if (cachedId) {
          const cached = reportCache.get(cachedId);
          if (cached) {
            results.push({ ok: true, url, fromCache: true, record: cached });
            continue;
          }
        }

        const safeUrl = await validateScrapeTarget(url);
        const scrapedLot = await scrapeLotPage(safeUrl);
        const images = await fetchImagesAsDataUrls(scrapedLot.images);
        const report = await generateAuctionReport(scrapedLot, images);

        const record: ReportRecord = {
          id: crypto.randomUUID(),
          url,
          scrapedLot,
          report,
          generatedAt: new Date().toISOString(),
        };

        reportCache.set(record.id, record);
        urlToCacheKey.set(cacheKey, record.id);

        results.push({ ok: true, url, fromCache: false, record });
      } catch (error) {
        results.push({
          ok: false,
          url,
          error: error instanceof Error ? error.message : 'Unknown processing error',
        });
      }
    }

    return res.json({ results });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unexpected server error',
    });
  }
});

app.patch('/api/reports/:id', (req, res) => {
  const existing = reportCache.get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Report not found.' });
  }

  const incoming = req.body?.report as Partial<ReportSections>;
  if (!incoming || typeof incoming !== 'object') {
    return res.status(400).json({ error: 'report payload is required.' });
  }

  const next: ReportSections = {
    ...existing.report,
    ...incoming,
  };

  const updated: ReportRecord = { ...existing, report: next };
  reportCache.set(existing.id, updated);

  return res.json({ record: updated });
});

app.get('/api/reports/:id/export/pdf', async (req, res) => {
  const existing = reportCache.get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Report not found.' });
  }

  const pdf = await writePdf(existing);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="auction-report-${existing.id}.pdf"`);
  return res.send(pdf);
});

app.get('/api/reports/:id/export/docx', async (req, res) => {
  const existing = reportCache.get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Report not found.' });
  }

  const docx = await writeDocx(existing);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="auction-report-${existing.id}.docx"`);
  return res.send(docx);
});

app.listen(PORT, () => {
  console.log(`Auction report server running on http://localhost:${PORT}`);
});

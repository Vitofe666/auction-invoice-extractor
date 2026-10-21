import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import OpenAI from 'openai';
import { chromium } from 'playwright';
import { writePdf, writeDocx } from './fichaExport';
import { REPORT_SCHEMA, REPORT_SYSTEM_PROMPT, validateReport } from '../ficha';
import type { ScrapedLot, ReportSections, ReportRecord, RepresentativeImage } from '../types';
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

const reportCache = new Map<string, ReportRecord>();
const urlToCacheKey = new Map<string, string>();

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
        .filter(img => !/logo|icon|avatar|banner/i.test([img.className, img.getAttribute('src'), img.alt].join(' ')))
        .map((img) =>
          img.getAttribute('data-zoom') ||
          img.getAttribute('data-src') ||
          img.getAttribute('srcset')?.split(',').at(-1)?.trim().split(' ')[0] ||
          img.getAttribute('src') ||
          ''
        )
        .filter(Boolean);

      const primaryImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
      if (primaryImage) imageSources.unshift(primaryImage);
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

async function fetchImagesAsDataUrls(imageUrls: string[]): Promise<RepresentativeImage[]> {
  const results: RepresentativeImage[] = [];
  for (const sourceUrl of imageUrls) {
    try {
      let url = sourceUrl;
      let response: Response | undefined;
      for (let redirects = 0; redirects <= 3; redirects++) {
        await validateScrapeTarget(url);
        response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) throw new Error('Missing image redirect.');
          await response.body?.cancel();
          url = new URL(location, url).toString();
        } else break;
      }
      if (!response?.ok) continue;
      const contentType = response.headers.get('content-type')?.split(';')[0];
      if (!['image/jpeg', 'image/png'].includes(contentType || '')) { await response.body?.cancel(); continue; }
      const reader = response.body?.getReader();
      if (!reader) continue;
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 8 * 1024 * 1024) { await reader.cancel(); throw new Error('Image exceeds 8MB.'); }
        chunks.push(value);
      }
      const data = Buffer.concat(chunks);
      // Validate actual bytes before retaining them; the exports preserve these bytes unchanged.
      const { imageSize } = await import('image-size');
      if (!['png', 'jpg'].includes(imageSize(data).type || '')) continue;
      results.push({ sourceUrl, dataUrl: `data:${contentType};base64,${data.toString('base64')}` });
    } catch {
      // Individual failures are skipped; generation requires at least one valid photograph.
    }
  }
  return results;
}

async function generateAuctionReport(scrapedLot: ScrapedLot, imageDataUrls: string[]): Promise<ReportSections> {
  const content: Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'high' }> = [
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
    content.push({ type: 'input_image', image_url: imageUrl, detail: 'high' });
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
        name: 'jewellery_ficha_2026_10_13',
        strict: true,
        schema: REPORT_SCHEMA,
      },
    },
  });

  const outputText = response.output_text;
  if (!outputText) {
    throw new Error('AI service returned an empty response.');
  }

  const report: unknown = JSON.parse(outputText);
  validateReport(report);
  return report;
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

  if (net.isIP(hostname) && isPrivateIp(hostname)) {
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
        if (!images.length) throw new Error('No original JPEG/PNG lot photograph could be downloaded.');
        const report = await generateAuctionReport(scrapedLot, images.map(image => image.dataUrl));

        const record: ReportRecord = {
          id: crypto.randomUUID(),
          url,
          scrapedLot,
          report,
          imageAssets: images,
          representativeImage: images[0],
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
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return res.status(400).json({ error: 'report payload is required.' });
  }

  const next = { ...existing.report, ...incoming };
  try { validateReport(next); } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
  const sourceUrl = req.body.representativeImageSource ?? existing.representativeImage.sourceUrl;
  const representativeImage = existing.imageAssets.find(image => image.sourceUrl === sourceUrl);
  if (!representativeImage) return res.status(400).json({ error: 'Select a downloaded original lot photograph.' });
  const updated: ReportRecord = { ...existing, report: next, representativeImage };
  reportCache.set(existing.id, updated);

  return res.json({ record: updated });
});

app.get('/api/reports/:id/export/pdf', async (req, res) => {
  const existing = reportCache.get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Report not found.' });
  }

  let pdf: Buffer;
  try { pdf = await writePdf(existing); } catch (error) {
    return res.status(422).json({ error: (error as Error).message });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="auction-report-${existing.id}.pdf"`);
  return res.send(pdf);
});

app.get('/api/reports/:id/export/docx', async (req, res) => {
  const existing = reportCache.get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Report not found.' });
  }

  let docx: Buffer;
  try { docx = await writeDocx(existing); } catch (error) {
    return res.status(422).json({ error: (error as Error).message });
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="auction-report-${existing.id}.docx"`);
  return res.send(docx);
});

app.listen(PORT, () => {
  console.log(`Auction report server running on http://localhost:${PORT}`);
});


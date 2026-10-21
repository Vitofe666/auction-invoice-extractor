# Jewellery Ficha Report Generator

React + Node.js app for generating the Jewellery Ficha master (13 October 2026) from auction-lot URLs.

## What it does

1. **Scrapes lot pages** with Playwright (dynamic content capable).
2. Extracts title, description, metadata, and image URLs.
3. Downloads lot images (preserving source quality) and sends text + images to OpenAI multimodal model.
4. Generates a validated Ficha separating catalogue claims, specialist observations, independent predicted hammer and realistic retail.
5. Lets users edit report text in-app.
6. Exports to **PDF** and **Word (.docx)**.
7. Supports **batch URL processing** and **in-memory cache** for already-processed URLs.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + TypeScript
- Scraping: Playwright
- AI: OpenAI Responses API (multimodal)
- Export: PDFKit, docx

---

## Quick start

### 1) Install dependencies

```bash
npm install
```

### 2) Install Playwright browser runtime

```bash
npx playwright install chromium
```

### 3) Configure environment

```bash
cp .env.example .env
```

Set at minimum:

```env
OPENAI_API_KEY=your_key_here
```

### 4) Run backend

```bash
npm run dev:server
```

Backend: `http://localhost:3001`

### 5) Run frontend

```bash
npm run dev
```

Frontend: `http://localhost:5173`

---

## Usage

1. Paste one URL per line (or comma-separated list).
2. Click **Generate Report**.
3. Review the original images and select the representative jewellery photograph. Edit the title, catalogue fields, four tables and supporting assessment.
4. Save edits.
5. Export PDF or DOCX.

---

## API endpoints

- `GET /api/health` – service health and model info
- `POST /api/reports/generate` – generate one or more reports
  - body: `{ "urls": ["https://..."] }`
- `PATCH /api/reports/:id` – persist manual edits
- `GET /api/reports/:id/export/pdf` – download PDF
- `GET /api/reports/:id/export/docx` – download DOCX

---

## Edge-case handling

- Missing images: generation requires at least one valid original JPEG/PNG; exports reject missing or corrupt photographs. No retouching, cropping or AI image synthesis is used.
- Poor descriptions: missing facts are marked as not supplied or not established; photographic opinions remain separate from certificates and weighed findings.
- Multiple URLs: batch processing supported.
- Slow-loading pages: configurable scrape timeout and robust fallbacks.
- Page structure changes: multi-selector extraction strategy + clear error messages.

---

## Notes for production hardening

- Replace in-memory cache with Redis/Postgres.
- Add job queue + retries for large batches.
- Add auth/rate-limit/audit logging.
- Add S3-compatible storage for image/report persistence.


## Ficha layout and data contract

- A4 portrait, two pages for concise assessments; three for longer supporting detail.
- Page one: auction house/date/lot, bold **Metal + Main Stones + Object + Period** title prefixed with lot number, original representative photograph with preserved proportions, and separate catalogue estimate.
- Four stacked two-column tables, always in this order: **RECOMMENDATION / WARNINGS**; **GEMSTONE DETAILS / DIAMOND DETAILS**; **METAL / VALUE** paired with **PERIOD / WORKMANSHIP / MAKER**; **SIZE / NOTES** paired with **CONDITION**.
- Recommendation includes buy score /10, independent predicted hammer, realistic retail and +/- points. No “Decision Grid” heading is printed.
- Supporting content attributes catalogue claims separately from specialist observations, valuation reasoning and condition follow-up.
- `types.ts` and `ficha.ts` are shared by generation, editing and exports. Field limits and a conservative export preflight prevent overflow; shorten excessive content rather than silently dropping it. Whitespace is normalised for layout; text is never truncated.
- Original downloaded image bytes remain in the cached record. `PATCH /api/reports/:id` accepts `{ report: { ...editedFields }, representativeImageSource: "original-source-url" }`; only a previously downloaded image can be selected. Invalid edits return 400; invalid export layouts return 422.
- Save edits before download; the frontend disables export links while edits are unsaved.

## Verification

Use Node 22.13+ for the PDF parser used by export tests:

```bash
npm ci
npm run typecheck:ficha
npm run build
npm run test:dates
npm run test:ficha
```

The Ficha check covers the active application, backend and export tests. The repository-wide `tsc --noEmit` still includes pre-existing legacy invoice/Gemini errors outside this workflow.

For rendered Word/PDF layout checks, install LibreOffice (`soffice` on PATH) and Python `pypdf`, then run:

```bash
npm run test:ficha:layout
```

This uses the checked-in PNG/JPEG test patterns to generate a concise ring report, a pearl report with missing values, and a maximum-length report under `tmp/ficha`. It renders Word to PDF and checks A4 dimensions, two/three page counts, the image and ordered headings on page one, and preserved assessment text. The fixture image is a synthetic test pattern, not a real auction lot or a valuation. Automated export tests also verify original DOCX image bytes, two cells per table, bold title, distinct prices and rejection of malformed/overflowing content. No live auction scrape or paid AI request is needed by these tests.

# Auction Lot AI Report Generator

Production-ready React + Node.js web app for generating professional auction-house jewellery reports from lot URLs.

## What it does

1. **Scrapes lot pages** with Playwright (dynamic content capable).
2. Extracts title, description, metadata, and image URLs.
3. Downloads lot images (preserving source quality) and sends text + images to OpenAI multimodal model.
4. Generates a structured auction report with required sections.
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
3. Review/edit the generated sections.
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

- Missing images: continues with text-only analysis.
- Poor descriptions: AI prompt instructs limitations/confidence notes.
- Multiple URLs: batch processing supported.
- Slow-loading pages: configurable scrape timeout and robust fallbacks.
- Page structure changes: multi-selector extraction strategy + clear error messages.

---

## Notes for production hardening

- Replace in-memory cache with Redis/Postgres.
- Add job queue + retries for large batches.
- Add auth/rate-limit/audit logging.
- Add S3-compatible storage for image/report persistence.

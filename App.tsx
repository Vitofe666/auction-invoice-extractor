import { useMemo, useState } from 'react';
import type { ReportRecord, ReportResult, ReportSections } from './types';
import { exportDocx, exportPdf, generateReports, updateReport } from './services/reportApi';

const SECTION_FIELDS: Array<{ key: keyof ReportSections; label: string }> = [
  { key: 'itemOverview', label: 'Item Overview' },
  { key: 'materialsAndGemstones', label: 'Materials and Gemstones Analysis' },
  { key: 'conditionAssessment', label: 'Condition Assessment' },
  { key: 'authenticityObservations', label: 'Authenticity Observations' },
  { key: 'weightAndMeasurements', label: 'Weight and Measurement Validation' },
  { key: 'marketAndValuationInsight', label: 'Market and Valuation Insight' },
];

function parseUrls(input: string): string[] {
  return input
    .split(/\r?\n|,/) 
    .map((value) => value.trim())
    .filter(Boolean);
}

function App() {
  const [urlInput, setUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ReportResult[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const reportCount = useMemo(() => results.filter((entry) => entry.ok && entry.record).length, [results]);

  const onGenerate = async () => {
    const urls = parseUrls(urlInput);
    if (!urls.length) {
      setError('Enter at least one lot URL.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const generated = await generateReports(urls);
      setResults(generated);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to generate report.');
    } finally {
      setIsLoading(false);
    }
  };

  const onSectionEdit = (reportId: string, section: keyof ReportSections, value: string) => {
    setResults((previous) =>
      previous.map((entry) => {
        if (!entry.record || entry.record.id !== reportId) return entry;
        return {
          ...entry,
          record: {
            ...entry.record,
            report: {
              ...entry.record.report,
              [section]: value,
            },
          },
        };
      }),
    );
  };

  const onSaveEdit = async (record: ReportRecord) => {
    setSavingId(record.id);
    try {
      const updated = await updateReport(record.id, record.report);
      setResults((previous) =>
        previous.map((entry) =>
          entry.record?.id === record.id
            ? {
                ...entry,
                record: updated,
              }
            : entry,
        ),
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save report edits.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-cyan-300">Auction Lot AI Report Generator</h1>
          <p className="text-slate-300">
            Paste one or more auction lot URLs, extract listing data with Playwright, and generate a professional
            multimodal jewellery report.
          </p>
        </header>

        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <label htmlFor="urlInput" className="block text-sm font-medium text-slate-200">
            Auction lot URLs (one per line, or comma-separated)
          </label>
          <textarea
            id="urlInput"
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
            placeholder="https://www.easyliveauction.com/catalogue/lot/..."
            className="w-full min-h-32 rounded-lg bg-slate-950 border border-slate-700 p-3 text-sm"
          />

          <div className="flex items-center gap-3">
            <button
              onClick={onGenerate}
              disabled={isLoading}
              className="bg-cyan-400 hover:bg-cyan-300 text-slate-950 px-5 py-2 rounded-lg font-semibold disabled:opacity-50"
            >
              {isLoading ? 'Generating Report...' : 'Generate Report'}
            </button>
            {isLoading && <span className="text-sm text-slate-300 animate-pulse">Scraping, processing images, and running AI analysis…</span>}
          </div>

          {error && <p className="text-rose-300 text-sm">{error}</p>}
          {!!results.length && (
            <p className="text-sm text-slate-300">
              Completed {reportCount} report(s), {results.length - reportCount} failure(s).
            </p>
          )}
        </section>

        <section className="space-y-6">
          {results.map((entry) => (
            <article key={entry.url} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h2 className="text-xl text-cyan-300 font-semibold break-all">{entry.url}</h2>

              {!entry.ok || !entry.record ? (
                <p className="text-rose-300 text-sm">Failed: {entry.error || 'Unknown error'}</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2 py-1 rounded bg-slate-800">{entry.fromCache ? 'Cached result' : 'Fresh analysis'}</span>
                    <span className="px-2 py-1 rounded bg-slate-800">{entry.record.scrapedLot.images.length} image(s) analyzed</span>
                    <span className="px-2 py-1 rounded bg-slate-800">Lot: {entry.record.scrapedLot.title}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {SECTION_FIELDS.map((section) => (
                      <label key={section.key} className="block">
                        <span className="text-sm text-slate-200 font-medium">{section.label}</span>
                        <textarea
                          value={entry.record.report[section.key]}
                          onChange={(event) => onSectionEdit(entry.record!.id, section.key, event.target.value)}
                          className="mt-1 w-full min-h-28 rounded-lg bg-slate-950 border border-slate-700 p-2 text-sm"
                        />
                      </label>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      onClick={() => onSaveEdit(entry.record!)}
                      disabled={savingId === entry.record.id}
                      className="px-4 py-2 rounded bg-emerald-400 text-slate-900 font-semibold disabled:opacity-50"
                    >
                      {savingId === entry.record.id ? 'Saving...' : 'Save Edits'}
                    </button>
                    <a
                      href={exportPdf(entry.record.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 rounded bg-indigo-400 text-slate-900 font-semibold"
                    >
                      Download PDF
                    </a>
                    <a
                      href={exportDocx(entry.record.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 rounded bg-violet-400 text-slate-900 font-semibold"
                    >
                      Download Word (.docx)
                    </a>
                  </div>
                </>
              )}
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}

export default App;

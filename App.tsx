import { useMemo, useState } from 'react';
import type { ReportRecord, ReportResult, ReportSections } from './types';
import { exportDocx, exportPdf, generateReports, updateReport } from './services/reportApi';

import { GRID_PAIRS, DETAIL_KEYS, LABELS, FIELD_LIMITS, fichaTitle } from './ficha';

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
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
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
      setDirtyIds(new Set());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to generate report.');
    } finally {
      setIsLoading(false);
    }
  };

  const onSectionEdit = (reportId: string, section: keyof ReportSections, value: string | number | null) => {
    setDirtyIds(previous => new Set(previous).add(reportId));
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
      const updated = await updateReport(record.id, record.report, record.representativeImage.sourceUrl);
      setDirtyIds(previous => { const next = new Set(previous); next.delete(record.id); return next; });
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
          <h1 className="text-3xl font-bold text-cyan-300">Jewellery Ficha Report Generator</h1>
          <p className="text-slate-300">
            Generate your 2–3-page A4 Ficha, review the original photograph, and edit the assessment before exporting.
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
                    <span className="px-2 py-1 rounded bg-slate-800">{entry.record.imageAssets.length} original image(s) analyzed</span>
                    <span className="px-2 py-1 rounded bg-slate-800">Lot: {entry.record.scrapedLot.title}</span>
                  </div>

                  <h3 className="text-xl font-bold">{fichaTitle(entry.record.report)}</h3>
                  <fieldset disabled={savingId === entry.record.id} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      {(['auctionHouse', 'auctionDate', 'lotNumber', 'metal', 'mainStones', 'object', 'period', 'auctionHouseEstimate'] as const).map(key => (
                        <label key={key} className="block text-sm">{LABELS[key]}
                          <input value={entry.record!.report[key]} maxLength={FIELD_LIMITS[key]}
                            onChange={event => onSectionEdit(entry.record!.id, key, event.target.value)}
                            className="block w-full bg-slate-950 border border-slate-700 rounded p-2" />
                        </label>
                      ))}
                    </div>
                    <div>
                      <p className="text-sm mb-2">Original representative photograph — select the jewellery view for page one</p>
                      <img src={entry.record.representativeImage.dataUrl} alt="Selected original lot photograph" className="h-48 w-full object-contain" />
                      <div className="flex flex-wrap gap-3 mt-3">
                        {entry.record.imageAssets.map(image => (
                          <label key={image.sourceUrl} className="cursor-pointer">
                            <input type="radio" name={`photo-${entry.record!.id}`}
                              checked={entry.record!.representativeImage.sourceUrl === image.sourceUrl}
                              onChange={() => {
                                setDirtyIds(previous => new Set(previous).add(entry.record!.id));
                                setResults(previous => previous.map(result => result.record?.id === entry.record!.id
                                  ? { ...result, record: { ...result.record, representativeImage: image } } : result));
                              }} aria-label={`Select photograph ${entry.record!.imageAssets.indexOf(image) + 1}`} />
                            <img src={image.dataUrl} alt={`Original lot view ${entry.record!.imageAssets.indexOf(image) + 1}`} className="h-20 w-24 object-contain" />
                          </label>
                        ))}
                      </div>
                    </div>
                    {GRID_PAIRS.map((pair, index) => (
                      <table key={index} className="w-full table-fixed border-collapse">
                        <thead><tr>{pair.map(key => <th key={key} className="border border-slate-600 p-2 text-left text-xs">{LABELS[key]}</th>)}</tr></thead>
                        <tbody><tr>{pair.map(key => (
                          <td key={key} className="border border-slate-600 p-2 align-top">
                            {key === 'recommendation' && <div className="space-y-2 mb-3">
                              {(['buyScore', 'predictedHammer', 'retail'] as const).map(priceKey => (
                                <label key={priceKey} className="block text-xs">{LABELS[priceKey]}
                                  <input type={priceKey === 'buyScore' ? 'number' : 'text'}
                                    min={priceKey === 'buyScore' ? 0 : undefined} max={priceKey === 'buyScore' ? 10 : undefined} step="0.1"
                                    value={entry.record!.report[priceKey] ?? ''}
                                    maxLength={priceKey === 'buyScore' ? undefined : FIELD_LIMITS[priceKey]}
                                    onChange={event => onSectionEdit(entry.record!.id, priceKey, priceKey === 'buyScore'
                                      ? (event.target.value === '' ? null : Number(event.target.value)) : event.target.value)}
                                    className="block w-full bg-slate-950 border border-slate-700 rounded p-2" />
                                </label>
                              ))}
                            </div>}
                            <textarea aria-label={LABELS[key]} value={entry.record!.report[key]} maxLength={FIELD_LIMITS[key]}
                              onChange={event => onSectionEdit(entry.record!.id, key, event.target.value)}
                              className="w-full min-h-28 rounded bg-slate-950 border border-slate-700 p-2 text-sm" />
                          </td>
                        ))}</tr></tbody>
                      </table>
                    ))}
                    {DETAIL_KEYS.map(key => (
                      <label key={key} className="block text-sm">{LABELS[key]}
                        <textarea value={entry.record!.report[key]} maxLength={FIELD_LIMITS[key]}
                          onChange={event => onSectionEdit(entry.record!.id, key, event.target.value)}
                          className="block w-full min-h-40 rounded bg-slate-950 border border-slate-700 p-2" />
                      </label>
                    ))}
                  </fieldset>
                  {dirtyIds.has(entry.record.id) && <p role="status" className="text-amber-200 text-sm">Save your edits before downloading.</p>}

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      onClick={() => onSaveEdit(entry.record!)}
                      disabled={savingId === entry.record.id}
                      className="px-4 py-2 rounded bg-emerald-400 text-slate-900 font-semibold disabled:opacity-50"
                    >
                      {savingId === entry.record.id ? 'Saving...' : 'Save Edits'}
                    </button>
                    <a
                      href={dirtyIds.has(entry.record.id) ? undefined : exportPdf(entry.record.id)}
                      aria-disabled={dirtyIds.has(entry.record.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 rounded bg-indigo-400 text-slate-900 font-semibold"
                    >
                      Download PDF
                    </a>
                    <a
                      href={dirtyIds.has(entry.record.id) ? undefined : exportDocx(entry.record.id)}
                      aria-disabled={dirtyIds.has(entry.record.id)}
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


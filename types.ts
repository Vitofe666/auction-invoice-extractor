export interface ScrapedLot {
  url: string;
  title: string;
  description: string;
  metadata: Record<string, string>;
  images: string[];
}

export interface ReportSections {
  itemOverview: string;
  materialsAndGemstones: string;
  conditionAssessment: string;
  authenticityObservations: string;
  weightAndMeasurements: string;
  marketAndValuationInsight: string;
}

export interface ReportRecord {
  id: string;
  url: string;
  scrapedLot: ScrapedLot;
  report: ReportSections;
  generatedAt: string;
}

export interface ReportResult {
  ok: boolean;
  url: string;
  fromCache?: boolean;
  record?: ReportRecord;
  error?: string;
}

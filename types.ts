export interface ScrapedLot {
  url: string;
  title: string;
  description: string;
  metadata: Record<string, string>;
  images: string[];
}

/** Ficha master, 13 October 2026. Catalogue claims and specialist opinions are separate. */
export interface ReportSections {
  auctionHouse: string;
  auctionDate: string;
  lotNumber: string;
  metal: string;
  mainStones: string;
  object: string;
  period: string;
  auctionHouseEstimate: string;
  predictedHammer: string;
  retail: string;
  buyScore: number | null;
  recommendation: string;
  warnings: string;
  gemstoneDetails: string;
  diamondDetails: string;
  metalValue: string;
  periodWorkmanshipMaker: string;
  sizeNotes: string;
  condition: string;
  catalogueInformation: string;
  specialistAssessment: string;
  valuationRationale: string;
  conditionAndFollowUp: string;
}

export interface RepresentativeImage {
  sourceUrl: string;
  /** Original downloaded JPEG/PNG bytes; never AI-generated or retouched. */
  dataUrl: string;
}

export interface ReportRecord {
  id: string;
  url: string;
  scrapedLot: ScrapedLot;
  report: ReportSections;
  representativeImage: RepresentativeImage;
  imageAssets: RepresentativeImage[];
  generatedAt: string;
}

export interface ReportResult {
  ok: boolean;
  url: string;
  fromCache?: boolean;
  record?: ReportRecord;
  error?: string;
}

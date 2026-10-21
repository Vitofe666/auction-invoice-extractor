import { readFileSync } from 'node:fs';
import type { ReportRecord, ReportSections } from '../types';
export const report: ReportSections = {
  auctionHouse: 'Example Auctions', auctionDate: '21 October 2026', lotNumber: '28',
  metal: '18ct Gold', mainStones: 'Sapphire and Diamond', object: 'Ring', period: 'Art Deco, circa 1930',
  auctionHouseEstimate: '£800–£1,200', predictedHammer: '£1,400–£1,800', retail: '£3,200–£3,800', buyScore: 7.5,
  recommendation: '+ Attractive period design. - Buy subject to sapphire testing.',
  warnings: 'Photographs cannot establish treatment. Obtain a gem laboratory opinion before bidding.',
  gemstoneDetails: 'Catalogue: blue sapphire. Photographs: medium blue, some apparent zoning. Treatment and origin not established.',
  diamondDetails: 'Catalogue: old-cut diamonds, approximately 0.40ct total. Weight and grades not independently verified.',
  metalValue: 'Catalogue: 18ct gold; gross weight 5.2g. Net metal weight and current metal price not supplied; scrap not assessed.',
  periodWorkmanshipMaker: 'Catalogue: circa 1930. Geometric shoulders support an Art Deco attribution. Maker not established.',
  sizeNotes: 'Catalogue: ring size N. Stone dimensions not supplied. Confirm sizing and shank thickness.',
  condition: 'Photographs show light surface wear. Claws, underside and any solder repairs require physical inspection.',
  catalogueInformation: 'The catalogue describes an 18ct gold sapphire and diamond ring, circa 1930, size N, gross weight 5.2g, with approximately 0.40ct of diamonds. The auction house estimate is £800–£1,200. These statements are catalogue claims, not independently weighed or laboratory-confirmed findings.',
  specialistAssessment: 'The geometric composition and shoulder details are consistent with an Art Deco design. Photographic colour is provisional because lighting and display settings can affect appearance. The sapphire’s natural status, treatment and geographic origin cannot be established from these images. Obtain a condition report, hallmark photographs and an independent laboratory report.',
  valuationRationale: 'Independent predicted hammer: £1,400–£1,800. Realistic retail: £3,200–£3,800. These are illustrative test values, not live market advice. The auction house estimate remains a separate catalogue field. Allow for buyer’s premium, testing, repairs and margin before setting a bid. No metal scrap value is calculated without net metal weight and a dated price assumption.',
  conditionAndFollowUp: 'Inspect claws, abrasions, chips, shank thinning, resizing evidence and solder joins. Confirm diamond count and total weight. Separate gemstone internal clarity from surface wear. Request photographs of the reverse, hallmarks and each stone under neutral light. A physical examination is required to assess structural security.',
};
export function fixture(extension = 'png', overrides: Partial<ReportSections> = {}): ReportRecord {
  const data = readFileSync(new URL(`./fixtures/representative.${extension}`, import.meta.url));
  const image = { sourceUrl: `https://example.com/original.${extension}`, dataUrl: `data:image/${extension === 'jpg' ? 'jpeg' : 'png'};base64,${data.toString('base64')}` };
  return { id: 'ficha-test', url: 'https://example.com/lot/28', generatedAt: '2026-10-21T09:00:00Z',
    scrapedLot: { url: 'https://example.com/lot/28', title: 'Catalogue title', description: 'Original description', metadata: { Estimate: '£800–£1,200' }, images: [image.sourceUrl] },
    report: { ...report, ...overrides }, representativeImage: image, imageAssets: [image] };
}

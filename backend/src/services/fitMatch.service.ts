/**
 * Fit Match Service
 *
 * Matches AI-extracted garment specs against the NUON Basic Blocks repository.
 * When a match is found, the repository measurements become the definitive source
 * and additional garment details are merged in.
 */

import { FIT_REPOSITORY, FitBlock } from '../data/fitRepository';
import { GarmentSpecifications, Measurement } from '../types';

export interface FitMatchResult {
  matched: boolean;
  matchedBlock?: FitBlock;
  matchScore: number;
  matchedFit?: string;
  matchedBody?: string;
}

/**
 * Score how well a garment's AI-extracted info matches a FitBlock.
 * Uses the garment type, style description, and overall text to find keyword overlap.
 */
function scoreMatch(block: FitBlock, searchText: string): number {
  const lower = searchText.toLowerCase();
  let score = 0;

  // Exact body name match is strongest signal
  if (lower.includes(block.body.toLowerCase())) {
    score += 100;
  }

  // Fit category match
  if (lower.includes(block.fit.toLowerCase())) {
    score += 15;
  }

  // Keyword hits
  for (const kw of block.keywords) {
    if (lower.includes(kw.toLowerCase())) {
      // Multi-word keywords are more specific → higher weight
      const words = kw.split(/\s+/).length;
      score += words >= 2 ? 20 : 8;
    }
  }

  // Reference name match (e.g. "Tara", "Valencia")
  if (lower.includes(block.reference.toLowerCase())) {
    score += 50;
  }

  return score;
}

/**
 * Find the best matching FitBlock for a garment.
 * Combines garmentType, style, and description into a single search string.
 */
export function findBestFitMatch(specs: GarmentSpecifications): FitMatchResult {
  const searchText = [
    specs.garmentType || '',
    specs.style || '',
    specs.description || '',
  ].join(' ');

  let bestBlock: FitBlock | undefined;
  let bestScore = 0;

  for (const block of FIT_REPOSITORY) {
    const s = scoreMatch(block, searchText);
    if (s > bestScore) {
      bestScore = s;
      bestBlock = block;
    }
  }

  // Minimum threshold — at least a fit keyword + one style keyword
  const THRESHOLD = 20;

  if (bestBlock && bestScore >= THRESHOLD) {
    console.log(`Fit match: "${bestBlock.body}" (${bestBlock.fit}) — score ${bestScore} — ref: ${bestBlock.reference}`);
    return {
      matched: true,
      matchedBlock: bestBlock,
      matchScore: bestScore,
      matchedFit: bestBlock.fit,
      matchedBody: bestBlock.body,
    };
  }

  console.log(`No fit match found (best score: ${bestScore})`);
  return { matched: false, matchScore: bestScore };
}

/**
 * Merge repository measurements into AI-extracted specs.
 *
 * Strategy:
 *  - Repository measurements are DEFINITIVE and always override AI guesses
 *  - Any additional AI measurements not in the repo are kept (e.g. pocket width, button spacing)
 *  - The matched fit and body style are added to the specs
 */
export function applyFitMeasurements(
  specs: GarmentSpecifications,
  match: FitMatchResult
): GarmentSpecifications {
  if (!match.matched || !match.matchedBlock) return specs;

  const block = match.matchedBlock;
  const repoMeasurements = block.measurements;

  // Build a map of repo measurements by a normalised key
  const repoMap = new Map<string, Measurement>();
  for (const rm of repoMeasurements) {
    repoMap.set(rm.id, { ...rm });
    // Also index by normalised name for fuzzy matching
    repoMap.set(normaliseName(rm.name), { ...rm });
  }

  // Start with all repo measurements as the base — tagged as 'repo' (mandatory)
  const finalMeasurements: Measurement[] = repoMeasurements.map(rm => ({ ...rm, source: 'repo' as const }));
  const usedIds = new Set(repoMeasurements.map(rm => rm.id));
  const usedNames = new Set(repoMeasurements.map(rm => normaliseName(rm.name)));

  // Add any AI measurements that don't overlap with repo — tagged as 'ai'
  for (const aiM of specs.measurements) {
    const normName = normaliseName(aiM.name);
    if (!usedIds.has(aiM.id) && !usedNames.has(normName)) {
      finalMeasurements.push({ ...aiM, source: 'ai' as const });
    }
  }

  return {
    ...specs,
    measurements: finalMeasurements,
    // Enrich style info with matched block data
    style: specs.style || block.body,
    // Store fit info in description if not already present
    description: specs.description || `${block.body} — ${block.fit} fit`,
  };
}

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

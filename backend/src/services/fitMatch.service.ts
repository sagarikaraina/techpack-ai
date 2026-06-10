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
  /** Closest block even when below threshold — used for POM name influence */
  partialBlock?: FitBlock;
  matchScore: number;
  matchedFit?: string;
  matchedBody?: string;
}

/**
 * Pre-match: find the closest FitBlock using only designer notes / free text
 * BEFORE AI extraction. Returns the best block (even low scores) so its POM list
 * can be injected into the AI prompt as a reference.
 */
export function preMatchFromNotes(notes: string): FitBlock | undefined {
  if (!notes || notes.trim().length === 0) return undefined;
  const lower = notes.toLowerCase();
  let best: FitBlock | undefined;
  let bestScore = 0;

  for (const block of FIT_REPOSITORY) {
    let s = 0;
    if (lower.includes(block.body.toLowerCase())) s += 100;
    if (lower.includes(block.fit.toLowerCase())) s += 15;
    for (const kw of block.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        s += kw.split(/\s+/).length >= 2 ? 20 : 8;
      }
    }
    if (lower.includes(block.reference.toLowerCase())) s += 50;
    if (s > bestScore) { bestScore = s; best = block; }
  }

  if (best && bestScore > 0) {
    console.log(`Pre-match from notes: "${best.body}" (${best.fit}) — score ${bestScore}`);
  }
  return bestScore > 0 ? best : undefined;
}

/**
 * Build a human-readable POM reference string from a FitBlock.
 * This is injected into the AI prompt so the AI knows what measurements
 * to look for, with the repo values as a guideline.
 */
export function buildPOMReferenceString(block: FitBlock): string {
  const pomLines = block.measurements
    .map(m => m.value > 0 ? `  - ${m.name}: ${m.value} cm` : `  - ${m.name}: (estimate from image)`);

  return `\n\nPOINT OF MEASUREMENT REFERENCE — The following is a standard POM list for a similar garment (${block.body}, ${block.fit} fit). Use these measurement names as your naming convention and these values as a reference guide. You may adjust values based on what you see in the image, but use the same point-of-measurement names:\n${pomLines.join('\n')}\n\nCRITICAL: You MUST provide a non-zero numeric value for EVERY measurement listed above. Do NOT return 0 for any measurement — estimate realistic values from the garment image using the reference values as a guide. Use these exact measurement names in your output. If you see additional measurements not listed here, add them using clear industry-standard POM names.`;
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
 * Combines garmentType, style, description, and designer notes into a single search string
 * so that notes like "relaxed fit" or "oversized shirt" can influence the match.
 */
export function findBestFitMatch(specs: GarmentSpecifications, notes?: string): FitMatchResult {
  const searchText = [
    specs.garmentType || '',
    specs.style || '',
    specs.description || '',
    notes || '',
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

  // Minimum threshold — a single keyword match is enough for full match
  const THRESHOLD = 8;

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

  // Below threshold — still return the best block as a partial match for POM influence
  if (bestBlock && bestScore > 0) {
    console.log(`Partial fit match: "${bestBlock.body}" (${bestBlock.fit}) — score ${bestScore} (below threshold ${THRESHOLD}) — POM influence only`);
    return { matched: false, partialBlock: bestBlock, matchScore: bestScore };
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

  // ── Merge visual construction notes from the matched repo block ──────────
  // The repo block has constructionNotes derived from Gemini Vision reading
  // the actual garment CADs in the PDF.  These are authoritative — a designer
  // looking at the catalogue image knows far more about the construction than
  // the AI guessing from the uploaded photo.
  //
  // Strategy:
  //   • Repo notes are prepended (most important / most reliable).
  //   • Existing AI-derived details whose title is already covered by a repo
  //     note are dropped to avoid duplication.

  let mergedConstruction = [...specs.constructionDetails];

  const repoNotes: string[] = [
    ...(block.constructionNotes || []),
    ...(block.visualDetails     || []),
  ];

  if (repoNotes.length > 0) {
    // Build a set of normalised titles already covered by repo notes
    const repoCovered = new Set(repoNotes.map(n => normaliseTitle(n)));

    // Keep AI-derived entries that aren't already covered by repo notes
    const aiOnly = specs.constructionDetails.filter(
      cd => !repoCovered.has(normaliseTitle(cd.title)) &&
            !repoCovered.has(normaliseTitle(cd.description))
    );

    // Repo notes → ConstructionDetail entries (location = 'repo')
    const repoEntries = repoNotes.map(note => ({
      title:       note.split(/[,:–—]/)[0].trim(),
      description: note,
      location:    'from fit repository',
    }));

    mergedConstruction = [...repoEntries, ...aiOnly];
  }

  return {
    ...specs,
    measurements: finalMeasurements,
    constructionDetails: mergedConstruction,
    // Enrich style info with matched block data
    style: specs.style || block.body,
    description: specs.description || `${block.body} — ${block.fit} fit`,
  };
}

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normaliseTitle(text: string): string {
  // Collapse to key words only — used to detect duplicate construction notes
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/).slice(0, 4).join(' ');
}

/**
 * Apply Point-of-Measurement influence from the closest (partial) fit block.
 *
 * When a garment doesn't match any block above the threshold, we still
 * want the repository's POM structure to guide the measurement list:
 *   1. Standardise AI measurement names to match the repo's naming conventions.
 *   2. Add any missing POMs from the repo (value = 0) so the designer/vendor
 *      knows which measurements are expected and can fill them in.
 *   3. Keep all original AI measurements that don't overlap with the repo.
 *
 * This does NOT overwrite AI values — the repo values are only used as a
 * reference when the AI didn't detect a particular POM at all.
 */
export function applyPOMInfluence(
  specs: GarmentSpecifications,
  block: FitBlock
): GarmentSpecifications {
  const repoPOMs = block.measurements;

  // Build lookup sets from the repo
  const repoNameMap = new Map<string, { id: string; name: string }>();
  for (const rm of repoPOMs) {
    repoNameMap.set(normaliseName(rm.name), { id: rm.id, name: rm.name });
    repoNameMap.set(rm.id, { id: rm.id, name: rm.name });
  }

  // Track which repo POMs the AI already covers
  const coveredRepoIds = new Set<string>();
  const finalMeasurements: Measurement[] = [];

  for (const aiM of specs.measurements) {
    const normAI = normaliseName(aiM.name);
    const repoHit = repoNameMap.get(normAI) || repoNameMap.get(aiM.id);

    if (repoHit) {
      // AI measurement matches a repo POM — standardise the name, keep the AI value
      coveredRepoIds.add(repoHit.id);
      finalMeasurements.push({
        ...aiM,
        id:     repoHit.id,
        name:   repoHit.name,   // use the repo's standardised name
        source: 'ai' as const,
      });
    } else {
      // AI measurement has no repo equivalent — keep as-is
      finalMeasurements.push({ ...aiM, source: 'ai' as const });
    }
  }

  // Add any repo POMs the AI missed — use the repo reference value so the table is never empty
  for (const rm of repoPOMs) {
    if (!coveredRepoIds.has(rm.id)) {
      finalMeasurements.push({
        id:     rm.id,
        name:   rm.name,
        value:  rm.value,   // use repo reference value, not zero
        unit:   'cm',
        source: 'repo' as const,
      });
    }
  }

  console.log(
    `POM influence from "${block.body}" (${block.fit}): ` +
    `${coveredRepoIds.size} AI measurements standardised, ` +
    `${finalMeasurements.length - specs.measurements.length} repo POMs added as placeholders`
  );

  return {
    ...specs,
    measurements: finalMeasurements,
  };
}

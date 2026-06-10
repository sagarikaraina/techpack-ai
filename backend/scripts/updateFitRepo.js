#!/usr/bin/env node
/**
 * updateFitRepo.js
 * ----------------
 * Reads the size-chart PDF via Python (measurement tables + page images),
 * then calls Gemini Vision to analyse the garment CAD/photos on each page
 * for construction details, and finally writes a fresh fitRepository.ts.
 *
 * Usage (from backend/ folder):
 *   npm run update-fit-repo
 *
 * Steps for a new PDF:
 *   1. Drop the new PDF into: backend/data/size-charts/nuon-size-chart.pdf
 *   2. Run: npm run update-fit-repo
 *   3. Restart backend: npm run dev
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

// ── Load .env manually (no dotenv package needed) ───────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach(line => {
      const [key, ...rest] = line.split('=');
      if (key && rest.length) {
        const val = rest.join('=').trim();
        if (!process.env[key.trim()]) {
          process.env[key.trim()] = val;
        }
      }
    });
}

loadEnv();

// Set credentials for Google SDKs
const keyFilePath = process.env.SERVICE_ACCOUNT_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (keyFilePath) {
  const absKey = path.resolve(path.join(__dirname, '..'), keyFilePath);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = absKey;
}

const PROJECT_ID = process.env.GCP_PROJECT_ID || 'nano-banana-api-test-484205';

const PYTHON_SCRIPT = path.join(__dirname, 'extract_pdf_data.py');
const OUTPUT_FILE   = path.join(__dirname, '..', 'src', 'data', 'fitRepository.ts');

function findPythonCommand() {
  const candidates = [
    process.env.PYTHON,
    process.env.PYTHON3,
    'python3',
    'python',
    'py -3',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      execSync(`${candidate} --version`, { stdio: 'ignore' });
      return candidate;
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    'Python executable not found. Install Python and/or set PYTHON or PYTHON3 environment variable to a valid Python 3 interpreter.'
  );
}

// ── Fallback construction notes ───────────────────────────────────────────────

/**
 * Pattern-based fallback: generate reasonable construction notes from the
 * style name when Gemini Vision is unavailable (e.g., network restrictions).
 * These are a designer's "baseline expectations" — good enough for matching,
 * replaced by Gemini Vision output when available.
 */
function inferConstructionFallback(body, fit) {
  const b = body.toLowerCase();
  const f = fit.toLowerCase();
  const notes = [];
  const visual = [];

  // ── Neckline ──────────────────────────────────────────────────────────────
  if (b.includes('crew') || (!b.includes('v neck') && !b.includes('scoop') && !b.includes('square') && !b.includes('collar') && !b.includes('mock'))) {
    notes.push('Crew neck with 1x1 rib collar, approximately 2cm folded width');
  }
  if (b.includes('v neck')) {
    notes.push('V-neckline with narrow rib binding or clean finish, no collar');
  }
  if (b.includes('scoop')) {
    notes.push('Scoop neckline with self-fabric binding or narrow rib trim');
  }
  if (b.includes('square')) {
    notes.push('Square neckline with clean self-fabric binding, topstitched 0.5cm');
  }
  if (b.includes('collar') && !b.includes('v neck')) {
    notes.push('Knit collar or woven collar attached with overlock seam');
    notes.push('Collar stand sewn with lockstitch 301, topstitched 1cm');
  }
  if (b.includes('mock')) {
    notes.push('Mock neck collar or v-neck placket overlay, approximate 6-8cm height');
  }
  if (b.includes('ringer')) {
    notes.push('Contrast 1x1 rib crew neck collar in contrasting colour, 2cm folded width');
    notes.push('Contrast sleeve cuff/opening rib, matching collar colour');
    visual.push('Contrast collar and cuff binding — ringer detail');
  }

  // ── Sleeves ───────────────────────────────────────────────────────────────
  if (b.includes('sleeveless') || b.includes('tank')) {
    notes.push('Sleeveless — armhole finished with self-fabric binding or narrow rib trim');
    notes.push('Armhole binding topstitched 0.5cm from edge, lockstitch 301');
    visual.push('Clean sleeveless silhouette with finished armhole');
  } else if (b.includes('long sleeve') || b.includes('full sleeve')) {
    notes.push('Long set-in sleeve, attached with 5-thread safety stitch, 1cm seam allowance');
    notes.push('Sleeve opening finished with 1×1 rib cuff or rolled hem, coverstitch 602');
    notes.push('Sleeve length from shoulder seam');
    visual.push('Full-length sleeve with clean cuff finish');
  } else if (b.includes('cap sleeve')) {
    notes.push('Cap sleeve — short set-in sleeve, approx 5–8cm from shoulder point');
    notes.push('Sleeve hem finished with narrow coverstitch, 1cm fold');
    visual.push('Short cap sleeve with minimal coverage');
  } else {
    notes.push('Short set-in sleeve, attached with 5-thread safety stitch 504, 1cm SA');
    notes.push('Sleeve hem finished with twin-needle coverstitch 602, 2cm fold');
  }

  // ── Body / seams ──────────────────────────────────────────────────────────
  notes.push('Side seams with 5-thread safety stitch 504, 1cm seam allowance');
  notes.push('Shoulder seam with 5-thread safety stitch 504, forward shoulder 1cm');
  notes.push('Neck back tape — 1cm woven tape, lockstitch 301');

  // ── Hem ───────────────────────────────────────────────────────────────────
  if (b.includes('crop')) {
    notes.push('Cropped hem — straight hem with twin-needle coverstitch 602, 2cm fold-up');
    visual.push('Cropped length — above hip');
  } else {
    notes.push('Bottom hem — straight with twin-needle coverstitch 602, 2.5cm fold-up');
  }

  // ── Fit / silhouette ──────────────────────────────────────────────────────
  if (f.includes('slim') || f.includes('skinny')) {
    visual.push('Slim/fitted silhouette — close to body across chest and waist');
  } else if (f.includes('oversize') || f.includes('boxy')) {
    visual.push('Relaxed/oversized silhouette — generous through chest and body');
    notes.push('Drop shoulder or extended shoulder seam placement');
  }

  // ── Shirt-specific ────────────────────────────────────────────────────────
  if (b.includes('shirt')) {
    notes.push('Woven construction — lockstitch 301 throughout');
    notes.push('French seams or flat-felled side seams');
    if (b.includes('button')) {
      notes.push('Button placket — fused, single-needle topstitch 0.5cm each side');
      notes.push('Buttons — 4-hole, 11mm, spaced evenly, bartacked at each');
    }
    if (b.includes('darted')) {
      notes.push('Front darts for fitted silhouette — lockstitch 301, pressed flat');
    }
    if (b.includes('corsett')) {
      notes.push('Boning channels or structured panels — corset-style shaping');
    }
    visual.push('Woven shirt construction — structured silhouette');
  }

  return { constructionNotes: notes, visualDetails: visual };
}

// ── Gemini Vision ─────────────────────────────────────────────────────────────

/**
 * Analyse one PDF page image with Gemini Vision.
 * Returns an array of { body, constructionNotes, visualDetails } objects
 * (one per garment style visible on the page).
 *
 * @param {string}   pageB64      - base64 JPEG of the PDF page
 * @param {string[]} styleNames   - garment body names found on this page
 * @returns {Promise<Array>}
 */
async function analysePageImage(pageB64, styleNames) {
  if (!pageB64) return [];

  // Lazy-load @google/genai from node_modules
  let GoogleGenAI;
  try {
    ({ GoogleGenAI } = require('@google/genai'));
  } catch (e) {
    console.warn('⚠️  @google/genai not found — skipping visual analysis');
    return [];
  }

  const ai = new GoogleGenAI({
    vertexai: true,
    project: PROJECT_ID,
    location: 'global',
  });

  const styleListText = styleNames.map((n, i) => `  ${i + 1}. ${n}`).join('\n');

  const prompt = `You are a senior fashion designer and tech pack specialist reviewing a garment catalogue page.

This page contains specification data for the following garment styles:
${styleListText}

Carefully examine the garment images/CADs on this page. For EACH style listed, analyse the visible construction details with expert precision. Look at:

- Neckline/collar: exact type (crew neck, v-neck, scoop, rib collar, polo collar, mock neck, etc.), binding width, finish method
- Sleeves: style (set-in, raglan, drop shoulder, sleeveless), length, cuff/opening finish, attachment seam
- Hem: straight hem, curved hem, raw edge, rib band, lettuce edge, binding
- Body construction: side seams vs. seamless, forward shoulder, shoulder seam placement
- Any special design details: panels, plackets, pockets, contrast trims, tape, piping, labels

Return ONLY a JSON array (no markdown, no explanation):
[
  {
    "body": "EXACT STYLE NAME FROM LIST ABOVE",
    "constructionNotes": [
      "1×1 rib crew neck collar, 2cm wide",
      "Set-in short sleeve with overlock seam",
      "Straight hem with single needle cover stitch",
      "Forward shoulder 1cm",
      "Side seams, 5-thread safety stitch"
    ],
    "visualDetails": [
      "Regular fit silhouette",
      "Minimal shoulder drop",
      "Clean back yoke"
    ]
  }
]

Include an entry for every style in the list. If a garment image is not clearly visible, still include the entry with reasonable defaults based on the table header information.`;

  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: pageB64,
              },
            },
            { text: prompt },
          ],
        },
      ],
    });

    const raw = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // Strip markdown fences if present
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn(`⚠️  Vision analysis failed: ${err.message}`);
    return [];
  }
}

// ── TypeScript file generation ────────────────────────────────────────────────

function escStr(s) {
  return (s || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    // Replace common non-ASCII typographic characters with ASCII equivalents
    // so the generated TypeScript file stays clean (ASCII-safe strings)
    .replace(/×/g, 'x')           // multiplication sign → x
    .replace(/[–—]/g, '-')        // en/em dash → hyphen
    .replace(/[""]/g, '"')        // curly double quotes → straight
    .replace(/['']/g, "'")        // curly single quotes → straight (re-escaped by next step)
    .replace(/…/g, '...')         // ellipsis
    .replace(/[^\x00-\x7F]/g, ch => {
      // Any remaining non-ASCII: encode as unicode escape
      return '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
    });
}

function generateFitRepositoryTs(styles) {
  const blocks = styles.map(s => {
    const measLines = s.measurements
      .map(m => `      m('${escStr(m.id)}', '${escStr(m.name)}', ${m.value}),`)
      .join('\n');

    const kwLines = s.keywords
      .map(k => `'${escStr(k)}'`)
      .join(', ');

    const constructionLines = (s.constructionNotes || [])
      .map(n => `    '${escStr(n)}',`)
      .join('\n');

    const visualLines = (s.visualDetails || [])
      .map(n => `    '${escStr(n)}',`)
      .join('\n');

    return `  {
    body: '${escStr(s.body)}',
    fit: '${escStr(s.fit)}',
    reference: '${escStr(s.reference)}',
    keywords: [${kwLines}],
    constructionNotes: [
${constructionLines}
    ],
    visualDetails: [
${visualLines}
    ],
    measurements: [
${measLines}
    ],
  },`;
  }).join('\n');

  return `/**
 * NUON Size Chart — Fit & Sizing Repository
 * AUTO-GENERATED by backend/scripts/updateFitRepo.js
 * Source: backend/data/size-charts/nuon-size-chart.pdf
 *
 * To regenerate: cd backend && npm run update-fit-repo
 * All values in cm.
 * constructionNotes and visualDetails are extracted by Gemini Vision
 * from the garment images/CADs on each PDF page.
 */

export interface FitMeasurement {
  id: string;
  name: string;
  value: number;
  unit: string;
}

export interface FitBlock {
  body: string;
  fit: string;
  reference: string;
  keywords: string[];
  /** Visual construction analysis from Gemini Vision reading the PDF garment images */
  constructionNotes: string[];
  /** Overall silhouette and design observations */
  visualDetails: string[];
  measurements: FitMeasurement[];
}

function m(id: string, name: string, value: number): FitMeasurement {
  return { id, name, value, unit: 'cm' };
}

export const FIT_REPOSITORY: FitBlock[] = [
${blocks}
];
`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📄 Reading PDF via Python extractor (tables + page images)…');

  let jsonOutput;
  let pythonCmd;
  try {
    pythonCmd = findPythonCommand();
  } catch (err) {
    console.error('❌ Python extraction failed:', err.message);
    console.error('   - On Windows, ensure `py -3` or `python` is in PATH.');
    console.error('   - Set PYTHON or PYTHON3 environment variable if needed.');
    process.exit(1);
  }

  try {
    jsonOutput = execSync(`${pythonCmd} "${PYTHON_SCRIPT}"`, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024, // 50 MB — page images can be large
    });
  } catch (err) {
    console.error('❌ Python extraction failed:', err.stderr || err.message);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonOutput);
    if (parsed.error) {
      console.error('❌ Extractor error:', parsed.error);
      process.exit(1);
    }
  } catch {
    console.error('❌ Failed to parse extractor JSON output');
    console.error(jsonOutput.substring(0, 500));
    process.exit(1);
  }

  const styles    = parsed.styles || [];
  const pageImages = parsed.pages || {};

  if (!styles || styles.length === 0) {
    console.error('❌ No styles extracted from PDF — check the PDF format');
    process.exit(1);
  }

  console.log(`✅ Extracted ${styles.length} garment styles from PDF:`);
  styles.forEach(s =>
    console.log(`   • ${s.body} (${s.fit}) — ref: ${s.reference} — ${s.measurements.length} measurements  [page ${s.page_num + 1}]`)
  );

  // ── Gemini Vision analysis — one request per unique page ──────────────────
  console.log('\n🔍 Analysing garment images with Gemini Vision…');

  // Group styles by page number
  const stylesByPage = {};
  for (const s of styles) {
    const pg = String(s.page_num);
    if (!stylesByPage[pg]) stylesByPage[pg] = [];
    stylesByPage[pg].push(s);
  }

  // Map from body name → { constructionNotes, visualDetails }
  const constructionMap = {};

  for (const [pageNum, pageStyles] of Object.entries(stylesByPage)) {
    const b64 = pageImages[pageNum];
    if (!b64) {
      console.warn(`   ⚠️  No image for page ${parseInt(pageNum, 10) + 1} — skipping visual analysis`);
      continue;
    }

    const names = pageStyles.map(s => s.body);
    console.log(`   📷 Page ${parseInt(pageNum, 10) + 1}: analysing ${names.join(', ')}…`);

    const visionResults = await analysePageImage(b64, names);

    for (const vr of visionResults) {
      if (vr.body) {
        constructionMap[vr.body.toUpperCase()] = {
          constructionNotes: vr.constructionNotes || [],
          visualDetails:     vr.visualDetails     || [],
        };
      }
    }
  }

  // Merge vision results into styles — fall back to expert inference when Vision unavailable
  const enrichedStyles = styles.map(s => {
    const vis = constructionMap[s.body.toUpperCase()];
    if (vis && vis.constructionNotes?.length) {
      return { ...s, ...vis };
    }
    // Fallback: derive from style name
    const fallback = inferConstructionFallback(s.body, s.fit);
    return { ...s, ...fallback };
  });

  const fromVision   = enrichedStyles.filter(s => constructionMap[s.body.toUpperCase()]?.constructionNotes?.length);


  const fromFallback = enrichedStyles.filter(s => !constructionMap[s.body.toUpperCase()]?.constructionNotes?.length);  if (fromFallback.length) {
    console.log(`   \u2139\uFE0F  ${fromFallback.length} styles used pattern-based fallback (run on your machine for full Vision analysis)`);
  }

  // ── Write fitRepository.ts ────────────────────────────────────────────────
  const tsContent = generateFitRepositoryTs(enrichedStyles);
  fs.writeFileSync(OUTPUT_FILE, tsContent, 'utf8');

  console.log(`\n\u2705 fitRepository.ts updated \u2192 ${OUTPUT_FILE}`);
  console.log(`   ${enrichedStyles.filter(s => s.constructionNotes?.length).length}/${enrichedStyles.length} styles have visual construction data`);
  console.log('   Restart the backend: npm run dev');
}

main().catch(err => {
  console.error('\u274C Unexpected error:', err);
  process.exit(1);
});

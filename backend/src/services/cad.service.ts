import { getGenAIClient } from './vertexai.service';
import { CADDrawings, ConstructionDetail, UniqueFeature, Measurement, PlacementDetail } from '../types';
import { imageQueue } from './queue.service';

const CAD_MODEL = 'gemini-3.1-flash-image-preview';

const FRONT_VIEW_PROMPT = `You are a professional fashion technical illustrator. Generate a clean, precise FLAT TECHNICAL DRAWING (CAD-style) of the FRONT VIEW of this garment.

Requirements:
- Pure black line drawing on white background
- No shading, no gradients, no color fill
- Clean, precise lines showing all construction details
- Show all seam lines, darts, buttons, pockets, collars, cuffs
- Flat/lay-flat perspective (not on a body)
- Include topstitching details as dashed lines
- Professional technical illustration quality
- Similar to fashion tech pack flat sketches`;

const BACK_VIEW_PROMPT = `You are a professional fashion technical illustrator. Generate a clean, precise FLAT TECHNICAL DRAWING (CAD-style) of the BACK VIEW of this garment.

Requirements:
- Pure black line drawing on white background
- No shading, no gradients, no color fill
- Clean, precise lines showing all construction details
- Show back yoke, back seams, vents, back neckline, back hem shape
- Flat/lay-flat perspective (not on a body)
- Include topstitching details as dashed lines
- Professional technical illustration quality
- Similar to fashion tech pack flat sketches`;

const BACK_VIEW_FROM_FRONT_PROMPT = `You are a professional fashion technical illustrator. This image shows the FRONT VIEW of a garment. Based on this front view, generate a clean, precise FLAT TECHNICAL DRAWING (CAD-style) of the BACK VIEW of this same garment.

Requirements:
- Pure black line drawing on white background
- No shading, no gradients, no color fill
- The back view must follow the SAME design language as the front — same silhouette, proportions, collar style, hem shape, sleeve length
- Infer back construction details from the front: back yoke, back seams, back neckline matching the front collar, back hem matching front hem
- Flat/lay-flat perspective (not on a body)
- Include topstitching details as dashed lines
- Professional technical illustration quality
- Similar to fashion tech pack flat sketches
- The back drawing should look like it belongs to the EXACT SAME garment as the front`;

function buildAnnotatedPrompt(view: 'front' | 'back', details: { title: string; description: string }[]): string {
  const numbered = details.map((d, i) => `  ${i + 1}. ${d.title}`).join('\n');
  return `You are a senior garment technician annotating a flat technical drawing (CAD) of a garment's ${view.toUpperCase()} VIEW.

Mark ONLY the following pre-identified construction points on the drawing:

${numbered}

STRICT RULES:
- Keep the EXACT SAME garment drawing — do NOT redraw, alter, or add any extra details to it
- For each point, draw a CIRCLED NUMBER connected by a thin red leader line to the exact point on the garment
- CRITICAL CIRCLE STYLE: Each circle must be OUTLINE ONLY — draw a thin dark-red circular border with WHITE/EMPTY inside (no colour fill whatsoever). The number sits inside this empty outline circle in dark-red ink. Think of it as a hand-drawn ring around the number, NOT a filled dot. NEVER use solid filled circles, coloured discs, or opaque backgrounds behind the numbers
- Show ONLY the circled number — do NOT write any text, title, keyword, description, stitch type, or label next to the number
- Do NOT add any annotations beyond the numbered list above — no extra callouts, no additional text anywhere on the image
- Place the circled numbers neatly around left and right sides of the drawing, not overlapping the garment
- Keep the white background
- The image should contain ONLY the original garment drawing + outline-circled numbers with leader lines — nothing else`;
}

function buildMeasurementPrompt(
  view: 'front' | 'back',
  measurements: Measurement[],
  placementDetails: PlacementDetail[] = []
): string {
  const backOnly = ['across back', 'back neck', 'back yoke', 'back length'];

  // Include ALL measurements — table shows all, CAD should match
  let relevant: typeof measurements;
  if (view === 'front') {
    relevant = measurements.filter(m => {
      const lower = (m.name + ' ' + m.id).toLowerCase();
      return !backOnly.some(k => lower.includes(k));
    });
  } else {
    relevant = measurements.filter(m => {
      const lower = (m.name + ' ' + m.id).toLowerCase();
      return backOnly.some(k => lower.includes(k)) ||
        lower.includes('shoulder') || lower.includes('hem') ||
        lower.includes('body length');
    });
  }

  // Use a GLOBAL number index so front + back diagrams share the same reference numbers
  // (matches the numbered table printed on Page 3 of the tech pack)
  const allVisible = measurements;
  const globalIndexMap = new Map<string, number>();
  allVisible.forEach((m, i) => globalIndexMap.set(m.id + '|' + m.name, i));

  let lineNum = allVisible.length + 1; // placement details continue from after standard measurements

  // Standard measurement lines — numbers only, no values
  const measLines = relevant
    .map(m => {
      const globalIdx = (globalIndexMap.get(m.id + '|' + m.name) ?? 0) + 1; // 1-based
      return `  ${globalIdx}. ${m.name}`;
    })
    .join('\n');

  // Placement details — only include those relevant to this view
  const placementFrontKeywords = ['front', 'centre front', 'cf', 'chest', 'hem', 'neckline', 'print', 'embroidery', 'pocket', 'tie', 'bow', 'placket'];
  const placementBackKeywords  = ['back', 'cb', 'centre back', 'yoke', 'hem', 'vent'];
  const relevantPlacements = placementDetails.filter(pd => {
    const text = (pd.placement + ' ' + pd.reference + ' ' + pd.item).toLowerCase();
    if (view === 'front') return placementFrontKeywords.some(k => text.includes(k)) || !placementBackKeywords.some(k => text.includes(k));
    return placementBackKeywords.some(k => text.includes(k)) || text.includes('all round');
  });

  let placementLines = '';
  if (relevantPlacements.length > 0) {
    placementLines = '\n\nPLACEMENT & DETAIL POINTS (also mark these with circled numbers):\n';
    for (const pd of relevantPlacements) {
      placementLines += `  ${lineNum}. ${pd.item} @ ${pd.placement}\n`;
      lineNum++;
    }
  }

  console.log(`Measurement prompt (${view}): ${relevant.length} measurements + ${relevantPlacements.length} placement details`);

  // Same style as page 2 annotated CAD — circled numbers only, no text
  const numbered = measLines + placementLines;

  return `You are a senior garment technician annotating a flat technical drawing (CAD) of a garment's ${view.toUpperCase()} VIEW with measurement point markers.

Mark ONLY the following measurement and placement points on the drawing:

${numbered}

STRICT RULES:
- Keep the EXACT SAME garment drawing — do NOT redraw, alter, or add any extra details to it
- For each point, draw a CIRCLED NUMBER connected by a thin red leader line to the exact measurement point on the garment
- CRITICAL CIRCLE STYLE: Each circle must be OUTLINE ONLY — draw a thin dark-red circular border with WHITE/EMPTY inside (no colour fill whatsoever). The number sits inside this empty outline circle in dark-red ink. Think of it as a hand-drawn ring around the number, NOT a filled dot. NEVER use solid filled circles, coloured discs, or opaque backgrounds behind the numbers
- For measurement points that span a distance (e.g. shoulder width, chest width), draw a thin red double-ended arrow line (←→) between the two endpoints, with the outline-circled number placed near the centre of the arrow
- Show ONLY the circled number — do NOT write any text, measurement value, name, keyword, description, or label next to the number
- Do NOT add any annotations beyond the numbered list above — no extra callouts, no additional text anywhere on the image
- Place the circled numbers neatly around left and right sides of the drawing, not overlapping the garment
- Keep the white background
- The image should contain ONLY the original garment drawing + outline-circled numbers with leader lines/arrows — nothing else`;
}

async function callImageAPI(imageBuffer: Buffer, mimeType: string, prompt: string): Promise<Buffer | undefined> {
  const client = getGenAIClient();

  const response = await client.models.generateContent({
    model: CAD_MODEL,
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: imageBuffer.toString('base64') } },
        { text: prompt },
      ],
    }],
    config: {
      responseModalities: ['IMAGE'],
    },
  });

  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      console.log('CAD image generated, mimeType:', part.inlineData.mimeType);
      return Buffer.from(part.inlineData.data, 'base64');
    }
  }

  console.warn('No image in response');
  return undefined;
}

async function generateImage(imageBuffer: Buffer, mimeType: string, prompt: string, maxRetries = 2): Promise<Buffer | undefined> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await imageQueue.enqueue(() => callImageAPI(imageBuffer, mimeType, prompt));
      if (result) return result;
      // No image in response — retry
      if (attempt < maxRetries) {
        console.warn(`CAD generation returned no image (attempt ${attempt + 1}/${maxRetries + 1}), retrying...`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    } catch (error: any) {
      console.error(`CAD generation error (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message?.substring(0, 200));
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  console.error('CAD generation failed after all retries');
  return undefined;
}

export interface CADInput {
  frontImage: Buffer;
  frontMime: string;
  backImage: Buffer | null;
  backMime: string | null;
}

// Phase 1: Generate base front & back CAD drawings
export async function generateBaseCAD(
  input: CADInput,
  onProgress?: (completed: number, total: number, label: string) => void
): Promise<{ frontView?: Buffer; backView?: Buffer }> {
  console.log('Starting base CAD generation...');
  const hasBackPhoto = input.backImage !== null;

  let completed = 0;
  const total = 4; // base(2) + measurement(2) — annotated comes later
  const report = (label: string) => { completed++; onProgress?.(completed, total, label); };

  const frontView = await generateImage(input.frontImage, input.frontMime, FRONT_VIEW_PROMPT)
    .then(r => { report('Front View'); return r; });

  let backView: Buffer | undefined;
  if (hasBackPhoto) {
    backView = await generateImage(input.backImage!, input.backMime!, BACK_VIEW_PROMPT)
      .then(r => { report('Back View'); return r; });
  } else {
    const backInput = frontView || input.frontImage;
    const backMime = frontView ? 'image/png' : input.frontMime;
    backView = await generateImage(backInput, backMime, BACK_VIEW_FROM_FRONT_PROMPT)
      .then(r => { report('Back View (from front)'); return r; });
  }

  return { frontView, backView };
}

// Phase 2: Generate measurement diagrams using actual extracted measurements + placement details
export async function generateMeasurementCAD(
  frontCAD: Buffer | undefined,
  backCAD: Buffer | undefined,
  fallbackImage: Buffer,
  fallbackMime: string,
  measurements: Measurement[],
  onProgress?: (completed: number, total: number, label: string) => void,
  placementDetails: PlacementDetail[] = []
): Promise<{ measurementFront?: Buffer; measurementBack?: Buffer }> {
  const frontInput = frontCAD || fallbackImage;
  const backInput = backCAD || fallbackImage;
  const frontMime = frontCAD ? 'image/png' : fallbackMime;
  const backMime = backCAD ? 'image/png' : fallbackMime;

  const frontPrompt = buildMeasurementPrompt('front', measurements, placementDetails);
  const backPrompt = buildMeasurementPrompt('back', measurements, placementDetails);

  const [measurementFront, measurementBack] = await Promise.all([
    generateImage(frontInput, frontMime, frontPrompt).then(r => { onProgress?.(3, 4, 'Measurement Front'); return r; }),
    generateImage(backInput, backMime, backPrompt).then(r => { onProgress?.(4, 4, 'Measurement Back'); return r; }),
  ]);

  return { measurementFront, measurementBack };
}

// Phase 3: Generate annotated views using actual extracted specs
export async function generateAnnotatedCAD(
  frontCAD: Buffer | undefined,
  backCAD: Buffer | undefined,
  constructionDetails: ConstructionDetail[],
  fallbackImage: Buffer,
  fallbackMime: string,
  onProgress?: (label: string) => void
): Promise<{ annotatedFront?: Buffer; annotatedBack?: Buffer }> {
  const frontDetails = constructionDetails.filter(d => d.location !== 'Back View');
  const backDetails = constructionDetails.filter(d => d.location === 'Back View');

  const frontInput = frontCAD || fallbackImage;
  const backInput = backCAD || fallbackImage;
  const frontMime = frontCAD ? 'image/png' : fallbackMime;
  const backMime = backCAD ? 'image/png' : fallbackMime;

  const frontPrompt = buildAnnotatedPrompt('front', frontDetails);
  const backPrompt = buildAnnotatedPrompt('back', backDetails);

  console.log(`Annotating: ${frontDetails.length} front details, ${backDetails.length} back details`);

  const [annotatedFront, annotatedBack] = await Promise.all([
    generateImage(frontInput, frontMime, frontPrompt).then(r => { onProgress?.('Annotated Front'); return r; }),
    generateImage(backInput, backMime, backPrompt).then(r => { onProgress?.('Annotated Back'); return r; }),
  ]);

  return { annotatedFront, annotatedBack };
}

// Generate zoomed-in close-up images for unique features
export async function generateFeatureCloseups(
  originalImage: Buffer,
  originalMime: string,
  features: UniqueFeature[]
): Promise<Buffer[]> {
  if (features.length === 0) {
    console.log('No unique features to generate close-ups for');
    return [];
  }

  console.log(`Generating close-ups for ${features.slice(0, 3).length} unique features...`);
  const results: Buffer[] = [];

  for (const feature of features.slice(0, 3)) {
    console.log(`Generating close-up for: ${feature.name}`);
    const prompt = `Generate a detailed close-up image of the "${feature.name}" feature of this garment. ${feature.description}

Requirements:
- Show ONLY the "${feature.name}" detail, tightly cropped
- High detail, sharp focus
- Show texture, material, and construction details clearly
- Square aspect ratio
- No text, no labels, no annotations`;

    const img = await generateImage(originalImage, originalMime, prompt);
    if (img) {
      console.log(`Close-up generated for: ${feature.name}`);
      results.push(img);
    } else {
      console.warn(`Failed to generate close-up for: ${feature.name}`);
    }
  }

  console.log(`Feature close-ups: ${results.length}/${features.slice(0, 3).length} generated`);
  return results;
}

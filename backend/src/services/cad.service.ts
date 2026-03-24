import { getGenAIClient } from './vertexai.service';
import { CADDrawings, ConstructionDetail, UniqueFeature, Measurement } from '../types';
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
  return `You are a senior garment technician reviewing a flat technical drawing (CAD) of a garment's ${view.toUpperCase()} VIEW. Your job is to add DETAILED construction callout annotations.

FIRST, thoroughly analyze this CAD drawing — examine every visible line, seam, stitch, edge, and structural element. Identify ALL construction points including subtle ones that a factory would need to know.

The following construction details have been pre-identified — annotate ALL of them, plus any additional technical details you can see in the drawing:

${numbered}

ALSO look for and annotate these if visible (even if not listed above):
- Stitch types at each seam (lockstitch, overlock, coverstitch, flatlock, chain stitch)
- Topstitching lines and their gauge/distance from edge
- Seam allowance indicators
- Bartack / reinforcement points (pocket corners, zipper ends, vent tops)
- Grain line direction
- Notch marks and drill holes
- Binding / tape / piping at neckline, armhole, hem
- Label / care label placement
- Fusing / interlining areas (collar, placket, cuff)
- Ease / gather / pleat distribution points
- Edge finish type (clean finish, overlock, bound, raw edge)
- Button/buttonhole size, placement, and spacing
- Snap, hook, or closure hardware positions
- Rib knit collar/cuff/hem attachment lines

Requirements:
- Keep the EXACT SAME garment drawing — do NOT redraw or change it
- For each detail, add ONLY the NUMBER and SHORT TITLE/KEYWORD as a label (e.g. "1 Collar", "2 Shoulder Seam", "3 Side Seam") — do NOT write descriptions, stitch types, or specifications on the image
- Use thin red leader lines from each label to the EXACT construction point on the garment
- Labels should be placed neatly on left and right sides of the drawing, not overlapping the garment
- Text should be small but clearly legible
- Aim for 12-20+ annotation callouts — be thorough, a tech pack must capture every detail for factory production
- Keep the white background`;
}

function buildMeasurementPrompt(view: 'front' | 'back', measurements: Measurement[]): string {
  // Classify each measurement as front, back, or both based on name/id
  const backOnly = ['across back', 'back neck', 'back yoke', 'back length'];
  const frontOnly = ['across front', 'front neck', 'front placket'];

  // Filter: keep repo measurements always, skip AI measurements with value 0
  const nonZero = measurements.filter(m => m.source === 'repo' || m.value > 0);

  let relevant: typeof nonZero;
  if (view === 'front') {
    // Front gets everything EXCEPT back-specific measurements
    relevant = nonZero.filter(m => {
      const lower = (m.name + ' ' + m.id).toLowerCase();
      return !backOnly.some(k => lower.includes(k));
    });
  } else {
    // Back gets back-specific + shared measurements (shoulder, hem, body length)
    relevant = nonZero.filter(m => {
      const lower = (m.name + ' ' + m.id).toLowerCase();
      return backOnly.some(k => lower.includes(k)) ||
        lower.includes('shoulder') || lower.includes('hem') ||
        lower.includes('body length');
    });
  }

  // Build A, B, C letter labels to keep the diagram clean
  // We need the global index of each measurement to assign consistent letters
  const allVisible = measurements.filter(m => m.source === 'repo' || m.value > 0);
  const globalIndexMap = new Map<string, number>();
  allVisible.forEach((m, i) => globalIndexMap.set(m.id + '|' + m.name, i));

  const measurementList = relevant
    .map(m => {
      const globalIdx = globalIndexMap.get(m.id + '|' + m.name) ?? 0;
      const letter = String.fromCharCode(65 + globalIdx);
      return `  - ${letter}: ${m.name}`;
    })
    .join('\n');

  console.log(`Measurement prompt (${view}): ${relevant.length} measurements — ${relevant.map(m => m.name).join(', ')}`);

  return `This is a flat technical drawing (CAD) of a garment's ${view.toUpperCase()} VIEW. Add measurement indicator lines with SHORT LETTER LABELS to this EXACT drawing.

The following are the specific measurements to annotate (letter = label to use):

${measurementList}

Requirements:
- Keep the EXACT SAME garment drawing — do NOT redraw or change it
- For each measurement listed above, add a thin red measurement line with small arrows at both ends pointing to the correct measurement points on the garment
- Label each line with ONLY the single letter shown (e.g. "A", "B", "C") — do NOT write the full measurement name on the drawing
- The letter labels should be small, clean, and positioned at one end of the measurement line
- Keep lines thin and labels small to avoid visual clutter
- Place lines and labels clearly without overlapping each other or the drawing
- Keep the white background`;
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

async function generateImage(imageBuffer: Buffer, mimeType: string, prompt: string): Promise<Buffer | undefined> {
  try {
    return await imageQueue.enqueue(() => callImageAPI(imageBuffer, mimeType, prompt));
  } catch (error: any) {
    console.error('CAD generation error:', error.message?.substring(0, 200));
    return undefined;
  }
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

// Phase 2: Generate measurement diagrams using actual extracted measurements
export async function generateMeasurementCAD(
  frontCAD: Buffer | undefined,
  backCAD: Buffer | undefined,
  fallbackImage: Buffer,
  fallbackMime: string,
  measurements: Measurement[],
  onProgress?: (completed: number, total: number, label: string) => void
): Promise<{ measurementFront?: Buffer; measurementBack?: Buffer }> {
  const frontInput = frontCAD || fallbackImage;
  const backInput = backCAD || fallbackImage;
  const frontMime = frontCAD ? 'image/png' : fallbackMime;
  const backMime = backCAD ? 'image/png' : fallbackMime;

  const frontPrompt = buildMeasurementPrompt('front', measurements);
  const backPrompt = buildMeasurementPrompt('back', measurements);

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

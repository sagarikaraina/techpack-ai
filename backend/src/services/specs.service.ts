import { getGenerativeModel } from './vertexai.service';
import { GarmentSpecifications } from '../types';
import { findBestFitMatch, applyFitMeasurements, applyPOMInfluence, preMatchFromNotes, buildPOMReferenceString } from './fitMatch.service';

const SPEC_EXTRACTION_PROMPT = `You are a professional garment technician. Analyze this garment image and extract detailed technical specifications.

Return a JSON object with EXACTLY this structure (no markdown, no code fences, just raw JSON):
{
  "garmentType": "e.g. Slim Crop Tee, Boxy Drop Tee, Oversized Tee, Slim Long Sleeve, Scoop Neck Skinny Tee, Blazer, Dress, Shirt, Pants",
  "style": "e.g. Blue Cropped Blazer with Contrast Piping, Slim Crop Ringer Stripe Tee",
  "fit": "Garment fit category — one of: SLIM, BOXY, OVERSIZED, SKINNY, OVERSIZE, or REGULAR if unclear",
  "description": "Short description, max 8-10 words e.g. Short sleeve knitted polo shirt with textured pattern",
  "season": "e.g. Summer 2027",
  "date": "today's date in DD.MM.YYYY format",
  "supplier": "Supplier name",
  "designer": "Designer name",
  "measurements": [
    {"id": "OW_CHEST_WIDTH", "name": "1/2 Chest Width", "value": 55, "unit": "cm"},
    {"id": "OW_BODY_LENGTH", "name": "Body Length from HPS", "value": 45, "unit": "cm"},
    {"id": "OW_SHOULDER_WIDTH", "name": "Shoulder Width", "value": 46, "unit": "cm"},
    {"id": "OW_SLEEVE_LENGTH", "name": "Sleeve Length from Shoulder Seam", "value": 45, "unit": "cm"},
    {"id": "LAPEL_WIDTH", "name": "Lapel Width", "value": 8, "unit": "cm"},
    {"id": "VENT_LENGTH", "name": "Back Vent Length", "value": 15, "unit": "cm"},
    {"id": "OW_HEM_WIDTH", "name": "1/2 Hem Width", "value": 53, "unit": "cm"},
    {"id": "OW_SLEEVE_OPENING", "name": "1/2 Sleeve Opening", "value": 12.5, "unit": "cm"},
    {"id": "OW_ARMHOLE_DEPTH", "name": "Armhole Depth", "value": 26, "unit": "cm"},
    {"id": "OW_BICEP_WIDTH", "name": "1/2 Bicep Width", "value": 20, "unit": "cm"},
    {"id": "OW_WAIST_WIDTH", "name": "1/2 Waist Width", "value": 51, "unit": "cm"},
    {"id": "OW_ACROSS_FRONT", "name": "Across Front", "value": 42, "unit": "cm"},
    {"id": "OW_ACROSS_BACK", "name": "Across Back", "value": 43, "unit": "cm"},
    {"id": "OW_NECK_DROP_FRONT", "name": "Front Neck Drop", "value": 9.5, "unit": "cm"},
    {"id": "OW_NECK_DROP_BACK", "name": "Back Neck Drop", "value": 2.5, "unit": "cm"},
    {"id": "OW_POCKET_WIDTH", "name": "Pocket Opening Width", "value": 14, "unit": "cm"},
    {"id": "OW_BUTTON_SPACING", "name": "Button Spacing", "value": 7.5, "unit": "cm"}
  ],
  "materials": [
    {"type": "Main Fabric", "description": "Detailed fabric description including composition, weight, texture, finish"},
    {"type": "Lining", "description": "Lining details or 'Unlined' with seam finish details"},
    {"type": "Thread", "description": "Thread details including color, type, stitch count"}
  ],
  "colors": [
    {"name": "Color Name", "pantone": "XX-XXXX TCX", "hex": "#000000"}
  ],
  "constructionDetails": [
    {"title": "Detail Name", "description": "Full construction specification including stitch type, SPI, seam allowance, tolerances", "location": "Front View or Back View"}
  ],
  "careInstructions": ["Machine wash cold", "Do not bleach", "Tumble dry low", "Iron medium heat"],
  "trims": ["Button type and size", "Piping details"],
  "uniqueFeatures": [
    {"name": "Feature name (e.g. Horn Buttons, Floral Print, Ribbed Knit)", "description": "Brief description of the feature, what makes it distinctive, material/technique used"}
  ],
  "placementDetails": [
    {
      "item": "What is being placed — e.g. Screen Print, Lace Trim, Satin Tie, Chest Pocket, Embroidery, Stripe/Contrast Panel, Button, Elastic, Drawstring, Ruffle, Bow, Patch, Woven Label",
      "placement": "Exact location on the garment — e.g. Centre Front Body, Left Chest, Hem All Round, Left Side Seam, Back Yoke, Both Sleeves, Neckline, Waist, Cuff",
      "reference": "The reference point being measured from — e.g. from HPS, from hem, from CF seam, from side seam, from armhole, from shoulder seam, from waistband",
      "value": 8,
      "unit": "cm",
      "notes": "All extra vendor instructions — dimensions (width × height), centring method, repeat, alignment to seam, tying method, colour, material, tolerance ±"
    }
  ]
}

- uniqueFeatures: identify exactly 3 standout design elements of this garment. These should be the most visually distinctive or noteworthy features — e.g. a specific print/pattern, special buttons/closures, unique stitching, embroidery, contrast fabric panels, hardware, labels, elastic details, etc. Focus on what makes this garment special.

- placementDetails: THIS IS CRITICAL FOR THE VENDOR. Identify and document EVERY design-specific detail that has a placement position or dimension on the garment. Look carefully for:
  • PRINT/GRAPHIC: screen print, digital print, heat transfer — note position from HPS, distance from CF, width × height of print area, centring method
  • TRIMS: lace trim, eyelet trim, piping, contrast binding, ruffle, frill — distance from hem/seam, width of trim, attachment method, whether it wraps all round or is a panel
  • TIES/BOWS/BELTS: self-fabric tie, satin ribbon, drawstring, waist tie — where it exits the garment (seam, eyelet, loop), distance from reference point, tie length and width
  • POCKETS: chest pocket, patch pocket, welt pocket — distance from HPS (vertical), distance from CF or side seam (horizontal), pocket dimensions (W × H), opening width
  • EMBROIDERY/PATCHES/LABELS: woven badge, embroidery motif — centre position from HPS, distance from CF/side seam, size of motif, stitch type if visible
  • BUTTONS/SNAPS/HOOKS: if decorative or structural outside main placket — spacing, distance from edge, size
  • PANELS/INSERTS: contrast fabric panels, mesh inserts — dimensions, seam position from HPS/hem
  • ELASTIC: gathered elastic waist, cuff elastic — width, relaxed length, position from hem/edge
  • LABELS: main woven label, care label, size label — exact position (e.g. "back neck seam, 1cm from seam, centred")
  • STRIPE/CONTRAST DETAIL: horizontal or vertical stripe position — distance from hem or neckline

  Include a placementDetail entry for EVERY visible design element that a factory would need a measurement or position for. If the garment appears plain with no special details, return an empty array []. Do NOT invent details that are not visible.
  For value: use the estimated cm distance from the reference point. If it is a size/dimension (e.g. print width), capture it in notes.

Important:
- EVERY measurement MUST have a non-zero realistic numeric value — estimate from the garment proportions visible in the image. NEVER return 0 for any measurement. If you cannot measure precisely, give your best estimate based on standard garment sizing
- Estimate realistic measurements based on the garment type visible in the image
- constructionDetails MUST be EXTREMELY comprehensive (aim for 15-25 entries). A factory needs EVERY construction point documented. Include ALL of the following where applicable:
  Front View: collar/neckline construction (rib type, width, attachment method), neckline binding/tape (width, fold, stitch), shoulder seam (type, SA, reinforcement), armhole seam (stitch type, SA), armhole binding/tape, side seam (stitch, SA), front placket/closure (width, fusing, stitch), button/buttonhole (size, type, spacing, placement from edge), pocket construction (type, topstitch gauge, bartack), pocket placement (distance from seam/hem), dart placement & angle, topstitching (gauge from edge, single/twin needle), sleeve attachment (set-in/raglan, stitch type), sleeve hem/cuff finish (fold width, stitch type, coverstitch gauge), front hem finish (fold width, blind hem/coverstitch), piping/trim/contrast panel (width, stitch), zipper (type, length, tape width), waistband (width, fusing, closure), pleats/gathers (distribution, stitch), embroidery/print (technique, placement from HPS/CF), label placement (main label, care label, size label positions), fusing/interlining areas, bartack/reinforcement positions
  Back View: back neckline facing/finish, back neckline tape (width, stitch), back yoke seam (stitch, SA), center back seam, back dart (placement, length), back vent/slit (length, stitch, overlap), back hem finish, back shoulder seam (tape, SA), back armhole finish, back pocket, back waistband, kick pleat, back label position
- For EACH detail: specify stitch type (lockstitch 301, overlock 504/516, coverstitch 602, flatlock 607, chain stitch 401, blind hem 103), SPI/stitch density, seam allowance in cm, tolerance +/- in mm, thread type if notable
- Be extremely thorough — every visible seam, fold, edge, and attachment point should be a separate entry
- Provide Pantone TCX color codes
- Return ONLY valid JSON, no other text`;

export interface SpecParams {
  season?: string;
  department?: string;
  designer?: string;
  supplier?: string;
  notes?: string;
  brandDna?: string;
}

export async function extractSpecifications(
  imageBuffer: Buffer,
  mimeType: string = 'image/jpeg',
  params?: SpecParams
): Promise<GarmentSpecifications> {
  console.log('Starting specification extraction...');

  const model = getGenerativeModel();

  const imagePart = {
    inlineData: {
      mimeType: mimeType,
      data: imageBuffer.toString('base64'),
    },
  };

  // Build context from user-provided parameters
  const contextParts: string[] = [];
  if (params?.season) contextParts.push(`Season: ${params.season}`);
  if (params?.department) contextParts.push(`Department: ${params.department}`);
  if (params?.designer) contextParts.push(`Designer: ${params.designer}`);
  if (params?.supplier) contextParts.push(`Supplier/Vendor: ${params.supplier}`);
  if (params?.notes) contextParts.push(`Additional notes: ${params.notes}`);
  const contextStr = contextParts.length > 0
    ? `\n\nThe following information has been provided by the designer — use these values where applicable:\n${contextParts.join('\n')}`
    : '';

  // Brand DNA context — guides the AI on the brand's design language
  const brandDnaStr = params?.brandDna
    ? `\n\nBrand DNA — keep this brand identity in mind when describing the garment style, materials, and construction. The descriptions, material choices, and overall tone should align with this brand direction:\n${params.brandDna}`
    : '';

  // Pre-match: find the closest fit block from ALL available context so we can inject
  // its POM list (names + reference values) into the AI prompt. This ensures
  // the AI uses standardised measurement names and has reference values to guide
  // its judgment — the AI still makes the final call on actual numeric values.
  let pomRefStr = '';
  // Combine all available text for pre-matching — notes, department, season, etc.
  const preMatchText = [
    params?.notes || '',
    params?.department || '',
    params?.season || '',
  ].filter(Boolean).join(' ');
  const preBlock = preMatchFromNotes(preMatchText);
  if (preBlock) {
    pomRefStr = buildPOMReferenceString(preBlock);
    console.log(`Injecting POM reference from "${preBlock.body}" (${preBlock.fit}) into AI prompt`);
  }

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [imagePart, { text: SPEC_EXTRACTION_PROMPT + contextStr + brandDnaStr + pomRefStr }] }],
  });

  const response = result.response;
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No text response from specification extraction');
  }

  console.log('Raw spec response length:', text.length);

  let specs = parseSpecifications(text);

  // Override with user-provided values
  if (params?.season) specs.season = params.season;
  if (params?.designer) specs.designer = params.designer;
  if (params?.supplier) specs.supplier = params.supplier;

  // Match against fit repository and apply definitive measurements + visual construction data
  // Designer notes are included so terms like "relaxed fit", "oversized" etc. influence the match
  const fitMatch = findBestFitMatch(specs, params?.notes);
  if (fitMatch.matched && fitMatch.matchedBlock) {
    // ── Full match — repo measurements are definitive ──
    specs = applyFitMeasurements(specs, fitMatch);
    specs.matchedFit  = fitMatch.matchedFit;
    specs.matchedBody = fitMatch.matchedBody;

    const block = fitMatch.matchedBlock;
    const visualCount = (block.constructionNotes?.length ?? 0) + (block.visualDetails?.length ?? 0);
    console.log(
      `Fit matched: ${fitMatch.matchedBody} (${fitMatch.matchedFit}) — ` +
      `${specs.measurements.length} measurements applied, ` +
      `${visualCount} visual construction details merged from PDF garment images`
    );
  } else if (fitMatch.partialBlock) {
    // ── Partial match — use repo POM names/structure as influence ──
    // The closest block's measurement names standardise the AI output and any
    // missing POMs are added with value=0 so the designer knows what to fill in.
    specs = applyPOMInfluence(specs, fitMatch.partialBlock);
    // Still show the closest match info so the designer knows what grounding was used
    specs.matchedFit  = fitMatch.partialBlock.fit + ' (partial)';
    specs.matchedBody = fitMatch.partialBlock.body;
    console.log(
      `POM influence applied from closest block: "${fitMatch.partialBlock.body}" ` +
      `(score ${fitMatch.matchScore}) — ${specs.measurements.length} measurements after influence`
    );
  } else if (preBlock) {
    // ── No match at all from garment type, but we had a pre-match from notes/context ──
    // Still apply POM influence from the pre-matched block
    specs = applyPOMInfluence(specs, preBlock);
    specs.matchedFit  = preBlock.fit + ' (reference)';
    specs.matchedBody = preBlock.body;
    console.log(
      `POM influence applied from pre-match block: "${preBlock.body}" ` +
      `(${preBlock.fit}) — ${specs.measurements.length} measurements after influence`
    );
  }

  console.log('Specifications extracted:', specs.garmentType, '-', specs.measurements.length, 'measurements');

  return specs;
}

function parseSpecifications(text: string): GarmentSpecifications {
  // Try to extract JSON from the response
  let jsonStr = text.trim();

  // Remove markdown code fences if present
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // Try to find JSON object in the text
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objMatch) {
    jsonStr = objMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);

    // Validate required fields
    if (!parsed.garmentType || typeof parsed.garmentType !== 'string') {
      parsed.garmentType = 'Unknown Garment';
    }

    if (!Array.isArray(parsed.measurements) || parsed.measurements.length === 0) {
      parsed.measurements = [
        { id: 'CHEST', name: 'Chest Width', value: 50, unit: 'cm' },
      ];
    }

    // Ensure all measurements have positive values
    parsed.measurements = parsed.measurements.map((m: any) => ({
      id: m.id || m.name?.toUpperCase().replace(/\s+/g, '_') || 'UNKNOWN',
      name: m.name || 'Unknown',
      value: Math.max(0, Number(m.value) || 0),
      unit: m.unit || 'cm',
    }));

    // Include AI-detected fit in garmentType for better repository matching
    const aiFit = parsed.fit || '';
    const garmentType = aiFit && !parsed.garmentType.toLowerCase().includes(aiFit.toLowerCase())
      ? `${aiFit} ${parsed.garmentType}`
      : parsed.garmentType;

    // Sanitise placementDetails — ensure every entry has required fields
    const rawPlacements = Array.isArray(parsed.placementDetails) ? parsed.placementDetails : [];
    const placementDetails = rawPlacements
      .filter((p: any) => p && typeof p === 'object' && p.item && p.item.trim())
      .map((p: any) => ({
        item:      (p.item      || '').trim(),
        placement: (p.placement || '').trim(),
        reference: (p.reference || '').trim(),
        value:     Math.max(0, Number(p.value) || 0),
        unit:      p.unit || 'cm',
        notes:     (p.notes     || '').trim(),
      }));

    return {
      garmentType,
      style: parsed.style || garmentType,
      description: parsed.description || '',
      season: parsed.season || '',
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.'),
      supplier: parsed.supplier || 'Supplier name',
      designer: parsed.designer || '',
      measurements: parsed.measurements,
      materials: parsed.materials || [],
      colors: parsed.colors || [],
      constructionDetails: parsed.constructionDetails || [],
      careInstructions: parsed.careInstructions || [],
      trims: parsed.trims || [],
      uniqueFeatures: parsed.uniqueFeatures || [],
      placementDetails,
    };
  } catch (error) {
    console.error('Failed to parse specifications JSON:', error);
    throw new Error('Failed to parse garment specifications from AI response');
  }
}

export interface GarmentSpecifications {
  garmentType: string;
  style: string;
  description: string;
  season: string;
  date: string;
  supplier: string;
  designer: string;
  measurements: Measurement[];
  materials: Material[];
  colors: ColorSpec[];
  constructionDetails: ConstructionDetail[];
  careInstructions: string[];
  trims: string[];
  uniqueFeatures: UniqueFeature[];
  /**
   * Design-specific placement specs: print positions, trim distances,
   * tie/bow locations, pocket placement, embroidery co-ordinates, label positions.
   * These are garment-unique — not in the standard fit repo — and MUST be
   * communicated clearly to the vendor so they know exactly where to apply each detail.
   */
  placementDetails?: PlacementDetail[];
  matchedFit?: string;   // e.g. "SLIM", "BOXY", "OVERSIZED"
  matchedBody?: string;  // e.g. "SLIM CROP TEE", "BOXY DROP TEE"
}

export interface UniqueFeature {
  name: string;
  description: string;
}

/**
 * A single garment-specific placement or detail measurement.
 *
 * Examples:
 *   item="Screen Print"  placement="Centre Front"  reference="from HPS"  value=12  unit="cm"
 *   item="Lace Trim"     placement="Hem, all round" reference="from hem"  value=4   unit="cm"  notes="mitred at side seams"
 *   item="Satin Tie"     placement="Left side seam" reference="from waist" value=3  unit="cm"  notes="length 35cm, self-tie bow"
 *   item="Chest Pocket"  placement="Left chest"     reference="from HPS"  value=18  unit="cm"  notes="5cm from CF"
 */
export interface PlacementDetail {
  item: string;       // What: "Print", "Lace Trim", "Satin Tie", "Patch Pocket", "Embroidery", "Elastic"
  placement: string;  // Where on the garment: "Centre Front", "Left Chest", "Hem All Round", "Left Side Seam"
  reference: string;  // Measured from: "from HPS", "from hem", "from CF seam", "from armhole", "from side seam"
  value: number;      // Numeric distance in cm (0 if not applicable / unknown)
  unit: string;       // Always "cm"
  notes: string;      // Extra vendor instructions: dimensions, method, matching, centring, etc.
}

export interface Measurement {
  id: string;
  name: string;
  value: number;
  unit: string;
  source?: 'repo' | 'ai';  // 'repo' = from fit repository (mandatory), 'ai' = AI-generated
}

export interface Material {
  type: string;
  description: string;
}

export interface ColorSpec {
  name: string;
  pantone: string;
  hex?: string;
}

export interface ConstructionDetail {
  title: string;
  description: string;
  location: string;
}

export interface CADDrawings {
  frontView?: Buffer;
  backView?: Buffer;
  annotatedFrontView?: Buffer;
  annotatedBackView?: Buffer;
  detailViews?: Buffer[];
  constructionDiagram?: Buffer;
  measurementDiagramFront?: Buffer;
  measurementDiagramBack?: Buffer;
}

export interface TechPackData {
  specifications: GarmentSpecifications;
  cadDrawings: CADDrawings;
  originalImage: Buffer;
  originalImages?: Buffer[];
  brand?: string;
}

export interface GenerationOptions {
  includeCAD: boolean;
  includeSpecs: boolean;
}

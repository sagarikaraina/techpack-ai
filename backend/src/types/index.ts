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
  matchedFit?: string;   // e.g. "SLIM", "BOXY", "OVERSIZED"
  matchedBody?: string;  // e.g. "SLIM CROP TEE", "BOXY DROP TEE"
}

export interface UniqueFeature {
  name: string;
  description: string;
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

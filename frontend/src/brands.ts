export interface BrandInfo {
  id: string;
  name: string;
  displayName: string;
  dna: string;
}

export const BRANDS: BrandInfo[] = [
  {
    id: 'nuon',
    name: 'NUON',
    displayName: 'Nuon by Westside',
    dna: 'NUON by Westside is designed for a Gen Z and young millennial audience that values self-expression, comfort, and trend-led style without premium pricing. The target consumer is urban, digitally aware, and culturally engaged — someone who follows streetwear, music, and social trends but interprets them in an individual, non-conformist way. The brand personality is youthful, confident, and effortlessly cool, with a slightly rebellious edge that avoids being loud or aggressive. It communicates in a casual, relatable tone and reflects an easygoing, creative lifestyle. Products should embody this through relaxed silhouettes, graphic or typographic elements, and versatile, everyday wearability that feels current yet authentic to street-inspired fashion.',
  },
];

export function getBrandById(id: string): BrandInfo | undefined {
  return BRANDS.find(b => b.id === id);
}

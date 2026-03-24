# TechPack AI

An AI-powered tool that generates vendor-ready garment tech packs from images. Upload garment photos, and the system automatically produces CAD flat drawings, extracts detailed specifications, and assembles a professional multi-page tech sheet — all editable inline.

## Features

- **AI CAD Generation** — Generates front/back flat drawings, annotated views, measurement diagrams, and feature close-ups using Google Gemini
- **Spec Extraction** — Automatically identifies garment type, measurements, materials, colors, construction details, and care instructions
- **3-Page HTML Tech Sheet** — Live-rendered, editable tech sheet with Overview, Technical Comments, and Sample Size pages
- **Inline Editing** — Click any value on the tech sheet to edit. Tracks changes with undo support
- **AI Chat** — Natural language revisions (e.g. "add a back vent", "change collar to mandarin") that update specs and regenerate CAD drawings when needed
- **PDF Export** — Generates a downloadable A4 landscape PDF tech pack
- **Multi-Image Upload** — Upload up to 10 garment images; AI selects the best front and back views
- **Rate-Limited Queue** — Handles API rate limits with automatic backoff and retry
- **Brand Support** — Select a brand (e.g. Nuon) before generating; brand name appears on tech sheet headers, footers, and PDF. Expandable Brand DNA panel shows the brand's target audience, personality, and design direction

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | React, TypeScript, Vite |
| Backend | Express, TypeScript |
| AI | Google Vertex AI (Gemini 2.0 Flash for text, Gemini Flash for image generation) |
| PDF | PDFKit |

## Getting Started

### Prerequisites

- Node.js 18+
- A Google Cloud project with Vertex AI API enabled
- A service account JSON key with Vertex AI permissions

### Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/SwagataJ/techpack-ai.git
   cd techpack-ai
   ```

2. **Backend**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit .env with your GCP project ID and service account key path
   # Place your service-account.json in the backend/ directory
   npm run dev
   ```

3. **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. Open `http://localhost:5173` in your browser

## Project Structure

```
techpack-ai/
├── backend/          # Express API server
│   └── src/
│       ├── controllers/   # Route handlers
│       ├── services/      # AI, PDF, queue services
│       └── types/         # TypeScript interfaces
├── frontend/         # React UI
│   └── src/
│       ├── App.tsx        # Main app with sidebar, progress, chat
│       ├── TechSheet.tsx  # 3-page HTML tech sheet component
│       ├── brands.ts      # Brand definitions with DNA descriptions
│       └── *.css          # Styles
```

## Usage

1. Upload one or more garment images
2. Select a **brand** (e.g. Nuon) — optionally expand **Brand DNA** to review the brand's design direction
3. Set parameters (season, department, designer, vendor)
4. Click **Generate Tech Sheet**
5. View the generated tech sheet with CAD drawings and specs
6. Click **Edit** to modify any value inline
7. Use the **chat** to make AI-driven revisions
8. Click **Download** to export as PDF

## Adding a New Brand

Edit `frontend/src/brands.ts` and add an entry to the `BRANDS` array:

```ts
{
  id: 'your-brand',
  name: 'BRAND NAME',       // Shown on tech sheet headers/footers and PDF
  displayName: 'Brand Name', // Shown in the Brand DNA panel
  dna: 'Brand DNA description...',
}
```

No other file changes are needed — the new brand will appear as a selectable chip in the UI automatically.

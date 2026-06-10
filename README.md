# TechPack AI

An AI-powered tool that generates vendor-ready garment tech packs from images. Upload garment photos, and the system automatically produces CAD flat drawings, extracts detailed specifications, and assembles a professional multi-page tech sheet — all editable inline.

## Features

- **AI CAD Generation** — Generates front/back flat drawings, annotated views (12-20+ construction callouts), measurement diagrams (A/B/C letter labels), and feature close-ups using `gemini-3.1-flash-image-preview`
- **Spec Extraction** — Identifies garment type, fit category, measurements, materials, colors, 15-25 construction details, and care instructions using `gemini-2.0-flash`
- **Fit Repository Matching** — Automatically matches the uploaded garment against the NUON size chart (15+ styles). When matched, repository measurements are used as the definitive source; AI measurements fill in the rest
- **3-Page HTML Tech Sheet** — Live-rendered, editable tech sheet: Page 1 Overview, Page 2 Technical Comments (annotated CADs), Page 3 Sample Size (measurement table with A/B/C legend)
- **Inline Editing** — Click any value on the tech sheet to edit. Tracks changes with undo support
- **AI Chat Revisions** — Natural language revisions (e.g. "add a back vent", "change collar to mandarin") update specs, regenerate CAD when the garment shape changes, and refresh the tech sheet automatically
- **PDF Export** — Generates a downloadable A4 landscape PDF tech pack
- **Multi-Image Upload** — Upload up to 10 garment images; AI selects the best front and back views
- **Rate-Limited Queue** — Handles API rate limits with automatic backoff and retry
- **Brand Support** — Select a brand (e.g. Nuon) before generating; brand name and DNA guide the AI's style descriptions and appear on all tech sheet headers, footers, and PDF pages

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | React, TypeScript, Vite |
| Backend | Express, TypeScript |
| AI — Spec Extraction | Google Vertex AI — `gemini-2.0-flash` (`us-central1`) |
| AI — CAD / Image Generation | Google GenAI — `gemini-3.1-flash-image-preview` (`global`) |
| PDF | PDFKit |
| PDF Parsing | Python + pdfplumber |

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.8+ with `pdfplumber` (`pip install pdfplumber`)
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
   # Edit .env — set GCP_PROJECT_ID and SERVICE_ACCOUNT_KEY_PATH
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

### Environment Variables

```env
GCP_PROJECT_ID=your-gcp-project-id
GCP_LOCATION=us-central1
SERVICE_ACCOUNT_KEY_PATH=./service-account.json
```

## Project Structure

```
techpack-ai/
├── backend/
│   ├── data/
│   │   └── size-charts/
│   │       └── nuon-size-chart.pdf      # Active size chart PDF
│   ├── scripts/
│   │   ├── extract_pdf_data.py          # Python: extracts tables from PDF
│   │   └── updateFitRepo.js             # Node: rebuilds fitRepository.ts from PDF
│   └── src/
│       ├── controllers/
│       │   └── techpack.controller.ts   # Job routing, chat, regeneration
│       ├── data/
│       │   └── fitRepository.ts         # Auto-generated fit/sizing data
│       ├── services/
│       │   ├── cad.service.ts           # CAD drawing & annotation (gemini-3.1)
│       │   ├── chat.service.ts          # AI chat revision (gemini-2.0-flash)
│       │   ├── classifier.service.ts    # Front/back image classification
│       │   ├── fitMatch.service.ts      # Garment → size chart matching
│       │   ├── pdf.service.ts           # PDF generation (PDFKit)
│       │   ├── queue.service.ts         # Rate-limited image API queue
│       │   ├── specs.service.ts         # Spec extraction + fit matching
│       │   └── vertexai.service.ts      # Vertex AI & GenAI client setup
│       └── types/
│           └── index.ts                 # Shared TypeScript interfaces
├── frontend/
│   └── src/
│       ├── App.tsx                      # Main app — sidebar, progress, chat
│       ├── TechSheet.tsx                # 3-page interactive tech sheet
│       ├── brands.ts                    # Brand definitions with DNA descriptions
│       └── *.css                        # Styles
```

## Usage

1. Upload one or more garment images
2. Select a **brand** (e.g. Nuon) — optionally expand **Brand DNA** to review or edit the brand's design direction
3. Set parameters (season, department, designer, vendor)
4. Click **Generate Tech Sheet**
5. View the generated 3-page tech sheet with CAD drawings, specs, and measurements
6. Click **Edit** to modify any value inline
7. Use the **chat** to make AI-driven revisions — structural changes (e.g. collar type) regenerate the CADs automatically
8. Click **Download** to export as PDF

## Updating the Size Chart

When you receive a new sizing PDF from the brand:

1. Replace the file at `backend/data/size-charts/nuon-size-chart.pdf`
2. Run the update script:
   ```bash
   cd backend
   npm run update-fit-repo
   ```
3. Restart the backend:
   ```bash
   npm run dev
   ```

The script reads the PDF, extracts all garment styles and measurements, deduplicates values, and rewrites `src/data/fitRepository.ts` automatically. No manual code changes are needed.

## How Fit Matching Works

When a garment image is uploaded:

1. `gemini-2.0-flash` analyses the image and returns garment type, fit category (SLIM / BOXY / OVERSIZED / SKINNY), and AI-estimated measurements
2. `fitMatch.service.ts` scores the extracted garment description against every style in `fitRepository.ts` using keyword overlap on body name, fit, and style
3. If a match is found above the confidence threshold, all repository measurements replace the AI estimates — these are marked `source: 'repo'` and always appear on Page 3
4. AI-only measurements (marked `source: 'ai'`) are shown only if their value is non-zero
5. The matched fit block (e.g. "SLIM CROP TEE — SLIM") is shown in the tech sheet subrow

## CAD Diagram Labels

- **Page 2 (Technical Comments)** — Annotated CAD views with numbered callouts (1, 2, 3…) pointing to construction details. Labels show keyword only (e.g. "1 Collar", "2 Shoulder Seam") — full specs are in the table below
- **Page 3 (Sample Size)** — Measurement diagrams use letter labels (A, B, C…) matching the REF column of the measurement table

## Adding a New Brand

Edit `frontend/src/brands.ts` and add an entry to the `BRANDS` array:

```ts
{
  id: 'your-brand',
  name: 'BRAND NAME',        // Shown on tech sheet headers/footers and PDF
  displayName: 'Brand Name', // Shown in the Brand DNA panel
  dna: 'Brand DNA description — target audience, aesthetic, and design direction...',
}
```

No other changes needed — the new brand appears as a selectable chip in the UI automatically.

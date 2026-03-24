import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { generateBaseCAD, generateMeasurementCAD, generateAnnotatedCAD, generateFeatureCloseups } from '../services/cad.service';
import { extractSpecifications } from '../services/specs.service';
import { generateTechPackPDF } from '../services/pdf.service';
import { classifyAndSelectImages } from '../services/classifier.service';
import { reviseSpecifications } from '../services/chat.service';
import { TechPackData, GarmentSpecifications, CADDrawings } from '../types';

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const OUTPUT_DIR = path.join(__dirname, '../../output');

const router = Router();

interface JobParams {
  season?: string;
  department?: string;
  designer?: string;
  supplier?: string;
  notes?: string;
  brand?: string;
  brandDna?: string;
}

interface Job {
  id: string;
  fileIds: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  result?: { pdfId: string; downloadUrl: string };
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  specifications?: GarmentSpecifications;
  cadDrawings?: CADDrawings;
  originalImage?: Buffer;
  originalImages?: Buffer[];
  params?: JobParams;
}

const jobs = new Map<string, Job>();

function findUploadedFile(fileId: string): string | null {
  const files = fs.readdirSync(UPLOADS_DIR);
  const match = files.find(f => f.startsWith(fileId));
  return match ? path.join(UPLOADS_DIR, match) : null;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
}

router.post('/generate', async (req: Request, res: Response) => {
  // Accept either single fileId or array of fileIds
  const { fileId, fileIds, season, department, designer, supplier, notes, brand, brandDna } = req.body;
  const ids: string[] = fileIds || (fileId ? [fileId] : []);
  const params: JobParams = { season, department, designer, supplier, notes, brand, brandDna };

  if (ids.length === 0) {
    res.status(400).json({ error: 'fileId or fileIds is required' });
    return;
  }

  // Validate all files exist
  const filePaths: { path: string; mimeType: string }[] = [];
  for (const id of ids) {
    const fp = findUploadedFile(id);
    if (!fp) {
      res.status(404).json({ error: `File not found: ${id}` });
      return;
    }
    filePaths.push({ path: fp, mimeType: getMimeType(fp) });
  }

  const jobId = uuidv4();
  const job: Job = {
    id: jobId,
    fileIds: ids,
    status: 'pending',
    progress: 0,
    currentStep: 'Initializing',
    createdAt: new Date(),
    params,
  };
  jobs.set(jobId, job);

  res.json({ jobId, status: 'pending' });

  processJob(job, filePaths).catch(err => {
    console.error('Job processing error:', err);
    job.status = 'failed';
    job.error = err.message || 'Unknown error';
    job.completedAt = new Date();
  });
});

async function processJob(job: Job, filePaths: { path: string; mimeType: string }[]) {
  try {
    job.status = 'processing';
    job.progress = 2;
    job.currentStep = 'Loading images';

    // Read and optimize all images
    const images: { buffer: Buffer; mimeType: string }[] = [];
    for (const fp of filePaths) {
      const rawBuffer = fs.readFileSync(fp.path);
      const optimized = await sharp(rawBuffer)
        .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      images.push({ buffer: optimized, mimeType: 'image/jpeg' });
    }

    // Classify and select best front/back images
    job.progress = 5;
    job.currentStep = images.length > 1 ? 'Classifying images (selecting best front & back)' : 'Image loaded';

    const selected = await classifyAndSelectImages(images);

    // Phase 1: Base CAD (front + back) + spec extraction in parallel
    job.progress = 10;
    job.currentStep = 'Generating base CAD drawings & extracting specifications';

    const cadInput = {
      frontImage: selected.frontImage,
      frontMime: selected.frontMime,
      backImage: selected.backImage,
      backMime: selected.backMime,
    };

    const [baseCAD, specifications] = await Promise.all([
      generateBaseCAD(cadInput, (completed, total, label) => {
        // Phase 1: 10% → 45%
        const p = 10 + Math.round((completed / total) * 35);
        job.progress = p;
        job.currentStep = `Generating ${label}`;
      }),
      extractSpecifications(selected.frontImage, selected.frontMime, job.params).then(result => {
        job.currentStep = 'Specs extracted';
        return result;
      }),
    ]);

    // Phase 2: Measurement diagrams + annotated views (using actual specs) in parallel
    job.progress = 45;
    job.currentStep = 'Generating measurement & annotated diagrams';

    // Track Phase 2 completions (up to 7 tasks: 2 measurement + 2 annotated + 3 features)
    let phase2Done = 0;
    const phase2Total = 4 + Math.min((specifications.uniqueFeatures || []).length, 3);
    const updatePhase2 = (label: string) => {
      phase2Done++;
      // Phase 2: 45% → 92%
      job.progress = 45 + Math.round((phase2Done / phase2Total) * 47);
      job.currentStep = `${label}`;
    };

    const [measurementCAD, annotatedCAD, featureCloseups] = await Promise.all([
      generateMeasurementCAD(
        baseCAD.frontView, baseCAD.backView,
        selected.frontImage, selected.frontMime,
        specifications.measurements,
        (_completed, _total, label) => { updatePhase2(label); }
      ),
      generateAnnotatedCAD(
        baseCAD.frontView, baseCAD.backView,
        specifications.constructionDetails,
        selected.frontImage, selected.frontMime,
        (label) => { updatePhase2(label); }
      ),
      generateFeatureCloseups(selected.frontImage, selected.frontMime, specifications.uniqueFeatures || [])
        .then(r => { updatePhase2('Feature close-ups'); return r; }),
    ]);

    const cadDrawings: CADDrawings = {
      frontView: baseCAD.frontView,
      backView: baseCAD.backView,
      annotatedFrontView: annotatedCAD.annotatedFront,
      annotatedBackView: annotatedCAD.annotatedBack,
      measurementDiagramFront: measurementCAD.measurementFront,
      measurementDiagramBack: measurementCAD.measurementBack,
      detailViews: featureCloseups,
    };

    job.specifications = specifications;
    job.cadDrawings = cadDrawings;
    job.originalImage = selected.frontImage;
    job.originalImages = images.map(img => img.buffer);

    job.progress = 94;
    job.currentStep = 'Generating PDF';

    const techPackData: TechPackData = { specifications, cadDrawings, originalImage: selected.frontImage, originalImages: images.map(img => img.buffer), brand: job.params?.brand };
    const pdfBuffer = await generateTechPackPDF(techPackData);

    job.progress = 98;
    job.currentStep = 'Saving PDF';

    const pdfId = uuidv4();
    const pdfPath = path.join(OUTPUT_DIR, `${pdfId}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);

    job.progress = 100;
    job.status = 'completed';
    job.currentStep = 'Complete';
    job.result = { pdfId, downloadUrl: `/api/techpack/download/${pdfId}` };
    job.completedAt = new Date();

    console.log(`Job ${job.id} completed. PDF: ${pdfId}`);
  } catch (error: any) {
    console.error(`Job ${job.id} failed:`, error);
    job.status = 'failed';
    job.error = error.message || 'Unknown error';
    job.completedAt = new Date();
  }
}

// Job status
router.get('/status/:jobId', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId as string);
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

  // Tell frontend which CAD images are available
  const images: Record<string, boolean> = {};
  if (job.cadDrawings) {
    images.front = !!job.cadDrawings.frontView;
    images.back = !!job.cadDrawings.backView;
    images.annotatedFront = !!job.cadDrawings.annotatedFrontView;
    images.annotatedBack = !!job.cadDrawings.annotatedBackView;
    images.measurementFront = !!job.cadDrawings.measurementDiagramFront;
    images.measurementBack = !!job.cadDrawings.measurementDiagramBack;
    images.detailCount = (job.cadDrawings.detailViews?.length || 0) as any;
  }
  const originalCount = job.originalImages?.length || (job.originalImage ? 1 : 0);

  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    currentStep: job.currentStep,
    result: job.result,
    error: job.error,
    specifications: job.specifications,
    images,
    originalCount,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  });
});

// Get specs for editing
router.get('/specs/:jobId', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId as string);
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
  if (!job.specifications) { res.status(400).json({ error: 'Specifications not yet available' }); return; }
  res.json(job.specifications);
});

// Regenerate PDF with edited specs
router.post('/regenerate/:jobId', async (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId as string);
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
  if (!job.cadDrawings || !job.originalImage) {
    res.status(400).json({ error: 'Job data not available for regeneration' });
    return;
  }

  const updatedSpecs: GarmentSpecifications = req.body;
  job.specifications = updatedSpecs;

  try {
    const techPackData: TechPackData = {
      specifications: updatedSpecs,
      cadDrawings: job.cadDrawings,
      originalImage: job.originalImage,
      originalImages: job.originalImages,
      brand: job.params?.brand,
    };

    const pdfBuffer = await generateTechPackPDF(techPackData);

    const pdfId = uuidv4();
    const pdfPath = path.join(OUTPUT_DIR, `${pdfId}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);

    job.result = { pdfId, downloadUrl: `/api/techpack/download/${pdfId}` };

    console.log(`Job ${job.id} regenerated. PDF: ${pdfId}`);
    res.json({ pdfId, downloadUrl: `/api/techpack/download/${pdfId}` });
  } catch (error: any) {
    console.error('Regeneration error:', error);
    res.status(500).json({ error: error.message || 'Regeneration failed' });
  }
});

// Chat: designer gives instructions, AI revises specs and regenerates PDF
router.post('/chat/:jobId', async (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId as string);
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
  if (!job.specifications || !job.cadDrawings || !job.originalImage) {
    res.status(400).json({ error: 'Job data not available' });
    return;
  }

  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  try {
    // Use AI to revise specs based on designer's instruction
    const { updatedSpecs, changes, regenerateCAD } = await reviseSpecifications(job.specifications, message);
    job.specifications = updatedSpecs;

    // Only regenerate CAD for major structural/visual changes
    if (regenerateCAD) {
      console.log('Major change detected — regenerating all CAD drawings...');

      const cadInput = {
        frontImage: job.originalImage,
        frontMime: 'image/jpeg',
        backImage: null,
        backMime: null,
      };

      const baseCAD = await generateBaseCAD(cadInput, (completed, total, label) => {
        console.log(`Chat CAD: ${label} (${completed}/${total})`);
      });

      const [measurementCAD, annotatedCAD] = await Promise.all([
        generateMeasurementCAD(
          baseCAD.frontView, baseCAD.backView,
          job.originalImage, 'image/jpeg',
          updatedSpecs.measurements
        ),
        generateAnnotatedCAD(
          baseCAD.frontView, baseCAD.backView,
          updatedSpecs.constructionDetails,
          job.originalImage, 'image/jpeg'
        ),
      ]);

      job.cadDrawings = {
        frontView: baseCAD.frontView,
        backView: baseCAD.backView,
        annotatedFrontView: annotatedCAD.annotatedFront,
        annotatedBackView: annotatedCAD.annotatedBack,
        measurementDiagramFront: measurementCAD.measurementFront,
        measurementDiagramBack: measurementCAD.measurementBack,
      };
    } else {
      console.log('Minor change — skipping CAD regeneration.');
    }

    // Regenerate PDF
    const techPackData: TechPackData = {
      specifications: updatedSpecs,
      cadDrawings: job.cadDrawings,
      originalImage: job.originalImage,
      originalImages: job.originalImages,
      brand: job.params?.brand,
    };

    const pdfBuffer = await generateTechPackPDF(techPackData);

    const pdfId = uuidv4();
    const pdfPath = path.join(OUTPUT_DIR, `${pdfId}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);

    job.result = { pdfId, downloadUrl: `/api/techpack/download/${pdfId}` };

    // Build image availability for frontend refresh
    const images: Record<string, boolean | number> = {};
    if (job.cadDrawings) {
      images.front = !!job.cadDrawings.frontView;
      images.back = !!job.cadDrawings.backView;
      images.annotatedFront = !!job.cadDrawings.annotatedFrontView;
      images.annotatedBack = !!job.cadDrawings.annotatedBackView;
      images.measurementFront = !!job.cadDrawings.measurementDiagramFront;
      images.measurementBack = !!job.cadDrawings.measurementDiagramBack;
      images.detailCount = job.cadDrawings.detailViews?.length || 0;
    }

    console.log(`Job ${job.id} revised via chat (CAD regenerated: ${regenerateCAD}). PDF: ${pdfId}`);
    res.json({
      changes: changes + (regenerateCAD ? ' (CAD drawings regenerated)' : ''),
      specifications: updatedSpecs,
      pdfId,
      downloadUrl: `/api/techpack/download/${pdfId}`,
      images,
      regenerateCAD,
    });
  } catch (error: any) {
    console.error('Chat revision error:', error);
    res.status(500).json({ error: error.message || 'Revision failed' });
  }
});

// Serve CAD images for a job (used by HTML tech sheet)
router.get('/images/:jobId/:imageType', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId as string);
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
  if (!job.cadDrawings) { res.status(400).json({ error: 'No images available' }); return; }

  const imageType = req.params.imageType as string;
  let buffer: Buffer | undefined;

  switch (imageType) {
    case 'front': buffer = job.cadDrawings.frontView; break;
    case 'back': buffer = job.cadDrawings.backView; break;
    case 'annotated-front': buffer = job.cadDrawings.annotatedFrontView; break;
    case 'annotated-back': buffer = job.cadDrawings.annotatedBackView; break;
    case 'measurement-front': buffer = job.cadDrawings.measurementDiagramFront; break;
    case 'measurement-back': buffer = job.cadDrawings.measurementDiagramBack; break;
    default:
      // detail-0, detail-1, detail-2...
      const detailMatch = imageType.match(/^detail-(\d+)$/);
      if (detailMatch && job.cadDrawings.detailViews) {
        buffer = job.cadDrawings.detailViews[parseInt(detailMatch[1])];
      }
  }

  if (!buffer) { res.status(404).json({ error: 'Image not found' }); return; }

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(buffer);
});

// Serve original uploaded images for a job
router.get('/originals/:jobId/:index', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId as string);
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

  const idx = parseInt(req.params.index as string);
  const images = job.originalImages || (job.originalImage ? [job.originalImage] : []);
  if (idx < 0 || idx >= images.length) { res.status(404).json({ error: 'Image not found' }); return; }

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(images[idx]);
});

// PDF download
router.get('/download/:pdfId', (req: Request, res: Response) => {
  const pdfPath = path.join(OUTPUT_DIR, `${req.params.pdfId}.pdf`);
  if (!fs.existsSync(pdfPath)) { res.status(404).json({ error: 'PDF not found' }); return; }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="techpack-${req.params.pdfId}.pdf"`);
  fs.createReadStream(pdfPath).pipe(res);
});

export default router;

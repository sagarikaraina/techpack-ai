import PDFDocument from 'pdfkit';
import { TechPackData, GarmentSpecifications } from '../types';

// A4 landscape dimensions in points
const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN = 30;
const HEADER_HEIGHT = 80;

const DARK_GRAY = '#333333';
const MEDIUM_GRAY = '#666666';
const LIGHT_GRAY = '#CCCCCC';
const BORDER_COLOR = '#000000';
const HEADER_BG = '#1a1a2e';

export async function generateTechPackPDF(data: TechPackData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        info: {
          Title: `Tech Pack - ${data.specifications.style}`,
          Author: data.specifications.designer || 'Tech Pack Generator',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const brand = data.brand;

      // Page 1: Overview with front/back views, colors, fabric reference
      renderPage1(doc, data, brand);

      // Page 2: Technical Comments
      doc.addPage({ size: 'A4', layout: 'landscape' });
      renderPage2(doc, data, brand);

      // Page 3: Measurements table (left) + CAD Drawings (right)
      doc.addPage({ size: 'A4', layout: 'landscape' });
      renderPage3(doc, data, brand);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function renderHeader(doc: PDFKit.PDFDocument, specs: GarmentSpecifications, pageTitle: string, pageNum: number, brand?: string) {
  const headerY = MARGIN;

  // Brand box (dark background)
  doc.save();
  doc.rect(MARGIN, headerY, 80, 40).fill(HEADER_BG);
  doc.fillColor('#FFFFFF').fontSize(14).font('Helvetica-Bold');
  doc.text(brand || 'NUON', MARGIN + 10, headerY + 15, { width: 60, align: 'center', lineBreak: false });
  doc.restore();

  // Page title (constrained to left half so it doesn't overlap style)
  const titleMaxW = PAGE_WIDTH / 2 - MARGIN - 110;
  doc.fillColor(DARK_GRAY).fontSize(11).font('Helvetica-Bold');
  doc.text(pageTitle, MARGIN + 100, headerY + 5, { width: titleMaxW, lineBreak: false, ellipsis: true });

  // Style info
  doc.fontSize(9).font('Helvetica-Bold');
  doc.text(`Style: ${specs.style}`, PAGE_WIDTH / 2, headerY + 5, { width: PAGE_WIDTH / 2 - MARGIN, align: 'right', lineBreak: false });

  // Metadata row
  const metaY = headerY + 32;
  doc.fontSize(7).font('Helvetica').fillColor(MEDIUM_GRAY);
  doc.text(`Season: ${specs.season}`, MARGIN + 100, metaY, { lineBreak: false });
  doc.text(`Date: ${specs.date}`, MARGIN + 280, metaY, { lineBreak: false });
  doc.text(`Vendor: ${specs.supplier}`, MARGIN + 420, metaY, { lineBreak: false });
  doc.text(`Designer: ${specs.designer}`, PAGE_WIDTH - MARGIN - 120, metaY, { width: 120, align: 'right', lineBreak: false });

  // Header separator line
  doc.moveTo(MARGIN, headerY + 45).lineTo(PAGE_WIDTH - MARGIN, headerY + 45).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();

  // Page number
  doc.fontSize(7).fillColor(MEDIUM_GRAY);
  doc.text(`${pageNum}`, PAGE_WIDTH - MARGIN - 30, PAGE_HEIGHT - MARGIN + 5, { lineBreak: false });
}

function renderPage1(doc: PDFKit.PDFDocument, data: TechPackData, brand?: string) {
  const specs = data.specifications;

  // Header
  renderHeader(doc, specs, `Description: ${specs.description}`, 1, brand);

  const contentY = MARGIN + HEADER_HEIGHT;
  const contentHeight = PAGE_HEIGHT - contentY - MARGIN;

  // Left section: Front and Back views (60% width)
  const viewsWidth = (PAGE_WIDTH - 2 * MARGIN) * 0.6;
  const viewColWidth = viewsWidth / 2;

  // Front View label
  doc.fontSize(8).font('Helvetica-Bold').fillColor(DARK_GRAY);
  doc.text('FRONT VIEW', MARGIN, contentY, { width: viewColWidth, align: 'center', lineBreak: false });

  // Back View label
  doc.text('BACK VIEW', MARGIN + viewColWidth, contentY, { width: viewColWidth, align: 'center', lineBreak: false });

  // Draw front view CAD image
  const imgY = contentY + 15;
  const imgHeight = contentHeight * 0.65;

  if (data.cadDrawings.frontView) {
    try {
      doc.image(data.cadDrawings.frontView, MARGIN + 20, imgY, {
        fit: [viewColWidth - 40, imgHeight],
        align: 'center',
        valign: 'center',
      });
    } catch (e) {
      drawPlaceholder(doc, MARGIN + 20, imgY, viewColWidth - 40, imgHeight, 'Front View');
    }
  } else {
    drawPlaceholder(doc, MARGIN + 20, imgY, viewColWidth - 40, imgHeight, 'Front View');
  }

  if (data.cadDrawings.backView) {
    try {
      doc.image(data.cadDrawings.backView, MARGIN + viewColWidth + 20, imgY, {
        fit: [viewColWidth - 40, imgHeight],
        align: 'center',
        valign: 'center',
      });
    } catch (e) {
      drawPlaceholder(doc, MARGIN + viewColWidth + 20, imgY, viewColWidth - 40, imgHeight, 'Back View');
    }
  } else {
    drawPlaceholder(doc, MARGIN + viewColWidth + 20, imgY, viewColWidth - 40, imgHeight, 'Back View');
  }

  // Right section: Colors, Materials, Image reference (40% width)
  const rightX = MARGIN + viewsWidth + 20;
  const rightWidth = PAGE_WIDTH - MARGIN - rightX;
  let rightY = contentY;

  // Colors section
  doc.fontSize(8).font('Helvetica-Bold').fillColor(DARK_GRAY);
  doc.text('Color:', rightX, rightY);
  rightY += 15;

  for (const color of specs.colors) {
    // Color dot
    if (color.hex) {
      doc.circle(rightX + 5, rightY + 4, 4).fill(color.hex);
    } else {
      doc.circle(rightX + 5, rightY + 4, 4).fill('#333333');
    }
    doc.fontSize(7).font('Helvetica').fillColor(DARK_GRAY);
    doc.text(`${color.name} ${color.pantone}`, rightX + 15, rightY, { width: rightWidth - 15 });
    rightY += 12;
  }

  rightY += 10;

  // Materials section
  for (const material of specs.materials) {
    doc.fontSize(7).font('Helvetica-Bold').fillColor(DARK_GRAY);
    doc.text(`${material.type}:`, rightX, rightY, { width: rightWidth });
    rightY += 10;
    doc.fontSize(7).font('Helvetica').fillColor(MEDIUM_GRAY);
    doc.text(material.description, rightX, rightY, { width: rightWidth, lineGap: 2 });
    rightY += doc.heightOfString(material.description, { width: rightWidth, lineGap: 2 }) + 8;
  }

  // Image reference section
  rightY += 5;
  doc.fontSize(7).font('Helvetica-Bold').fillColor(DARK_GRAY);
  doc.text('Image reference:', rightX, rightY);
  rightY += 12;

  // Show original images as reference
  const refImages = data.originalImages && data.originalImages.length > 0 ? data.originalImages : (data.originalImage ? [data.originalImage] : []);
  const maxRefImgs = Math.min(refImages.length, 4);
  const refImgSize = maxRefImgs <= 2 ? 80 : 55;
  const refGap = 6;
  let refX = rightX;

  for (let i = 0; i < maxRefImgs; i++) {
    try {
      // Wrap to next row if needed
      if (refX + refImgSize > rightX + rightWidth) {
        refX = rightX;
        rightY += refImgSize + refGap;
      }
      doc.image(refImages[i], refX, rightY, {
        fit: [refImgSize, refImgSize],
        align: 'center',
      });
      refX += refImgSize + refGap;
    } catch (e) {
      // Ignore image errors
    }
  }

  // Bottom section: Fabric, Trimming & Swatch Reference
  const bottomY = PAGE_HEIGHT - MARGIN - 80;
  doc.moveTo(MARGIN, bottomY).lineTo(PAGE_WIDTH - MARGIN, bottomY).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();

  doc.fontSize(8).font('Helvetica-Bold').fillColor(DARK_GRAY);
  doc.text('Fabric, Trimming & Swatch Reference', MARGIN, bottomY + 8);

  // Unique features showcase (name + zoomed-in image)
  const features = specs.uniqueFeatures?.slice(0, 3) || [];
  const featureImages = data.cadDrawings.detailViews || [];
  const hasFeatureImages = featureImages.length > 0;
  let featureX = MARGIN;
  const featureY = bottomY + 25;
  const featureBoxW = (PAGE_WIDTH - 2 * MARGIN - 20) / 3;
  const featureBoxH = 50;

  if (features.length > 0) {
    for (let i = 0; i < features.length; i++) {
      const feature = features[i];

      doc.rect(featureX, featureY, featureBoxW, featureBoxH).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();

      if (hasFeatureImages && featureImages[i]) {
        // Show zoomed-in image + name
        try {
          doc.image(featureImages[i], featureX + 2, featureY + 2, {
            fit: [featureBoxH - 4, featureBoxH - 4],
            align: 'center',
            valign: 'center',
          });
        } catch (e) {
          // Ignore image errors
        }

        const textX = featureX + featureBoxH + 2;
        const textW = featureBoxW - featureBoxH - 4;
        doc.fontSize(6).font('Helvetica-Bold').fillColor(DARK_GRAY);
        doc.text(feature.name, textX, featureY + 6, { width: textW, height: featureBoxH - 8, lineBreak: true });
      } else {
        // No image — show name + description
        doc.fontSize(6).font('Helvetica-Bold').fillColor(DARK_GRAY);
        doc.text(feature.name, featureX + 4, featureY + 4, { width: featureBoxW - 8, lineBreak: false });

        doc.fontSize(5).font('Helvetica').fillColor(MEDIUM_GRAY);
        doc.text(feature.description, featureX + 4, featureY + 14, { width: featureBoxW - 8, height: 32, ellipsis: true });
      }

      featureX += featureBoxW + 10;
    }
  } else {
    // No unique features at all — show materials as swatches
    for (const material of specs.materials.slice(0, 3)) {
      doc.rect(featureX, featureY, 60, 40).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
      doc.fontSize(5).font('Helvetica').fillColor(MEDIUM_GRAY);
      doc.text(material.type, featureX + 2, featureY + 42, { width: 60, lineBreak: false });
      featureX += 75;
    }
  }
}

function renderPage2(doc: PDFKit.PDFDocument, data: TechPackData, brand?: string) {
  const specs = data.specifications;

  // Header
  renderHeader(doc, specs, 'Technical Comments', 2, brand);

  const contentY = MARGIN + HEADER_HEIGHT;
  const fullWidth = PAGE_WIDTH - 2 * MARGIN;
  const halfWidth = fullWidth / 2;

  // --- Top section: Front & Back annotated CAD drawings side by side ---
  const drawingHeight = 110;

  doc.fontSize(8).font('Helvetica-Bold').fillColor(DARK_GRAY);
  doc.text('FRONT VIEW', MARGIN, contentY, { width: halfWidth, align: 'center', lineBreak: false });
  doc.text('BACK VIEW', MARGIN + halfWidth, contentY, { width: halfWidth, align: 'center', lineBreak: false });

  const imgY = contentY + 12;
  const frontImg = data.cadDrawings.annotatedFrontView || data.cadDrawings.frontView;
  const backImg = data.cadDrawings.annotatedBackView || data.cadDrawings.backView;

  if (frontImg) {
    try {
      doc.image(frontImg, MARGIN + 20, imgY, {
        fit: [halfWidth - 40, drawingHeight],
        align: 'center',
        valign: 'center',
      });
    } catch (e) {
      drawPlaceholder(doc, MARGIN + 20, imgY, halfWidth - 40, drawingHeight, 'Front View');
    }
  } else {
    drawPlaceholder(doc, MARGIN + 20, imgY, halfWidth - 40, drawingHeight, 'Front View');
  }

  if (backImg) {
    try {
      doc.image(backImg, MARGIN + halfWidth + 20, imgY, {
        fit: [halfWidth - 40, drawingHeight],
        align: 'center',
        valign: 'center',
      });
    } catch (e) {
      drawPlaceholder(doc, MARGIN + halfWidth + 20, imgY, halfWidth - 40, drawingHeight, 'Back View');
    }
  } else {
    drawPlaceholder(doc, MARGIN + halfWidth + 20, imgY, halfWidth - 40, drawingHeight, 'Back View');
  }

  // --- Separator line ---
  const tableStartY = imgY + drawingHeight + 10;
  doc.moveTo(MARGIN, tableStartY).lineTo(PAGE_WIDTH - MARGIN, tableStartY)
    .strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();

  // --- Bottom section: Two-column construction details table ---
  // Front on LEFT, Back on RIGHT. Continues to additional pages if needed.
  const frontDetails = specs.constructionDetails.filter(d => d.location !== 'Back View');
  const backDetails = specs.constructionDetails.filter(d => d.location === 'Back View');

  const colGap = 16;
  const colWidth = (fullWidth - colGap) / 2;
  const numColW = 16;
  const titleColW = colWidth * 0.25;
  const descColW = colWidth - numColW - titleColW;
  const maxY = PAGE_HEIGHT - MARGIN - 10;
  const leftX = MARGIN;
  const rightColX = MARGIN + colWidth + colGap;
  const fontSize = 5;
  const rowH = 11; // compact row height — fits more rows per page

  // Helper: draw a fixed-height row — all text is single-line with ellipsis, clipped per cell
  const drawRow = (x: number, y: number, num: number, detail: { title: string; description: string }) => {
    // White background for all rows
    doc.rect(x, y, numColW + titleColW + descColW, rowH).fill('#FFFFFF');

    // ── num cell ──
    doc.save();
    doc.rect(x, y, numColW, rowH).clip();
    doc.fontSize(fontSize).font('Helvetica-Bold').fillColor('#111111');
    doc.text(String(num), x + 2, y + 3, { width: numColW - 4, align: 'center', lineBreak: false });
    doc.restore();

    // ── title cell ──
    doc.save();
    doc.rect(x + numColW, y, titleColW, rowH).clip();
    doc.fontSize(fontSize).font('Helvetica-Bold').fillColor('#111111');
    doc.text(detail.title, x + numColW + 2, y + 3, { width: titleColW - 6, lineBreak: false, ellipsis: true });
    doc.restore();

    // ── description cell ──
    doc.save();
    doc.rect(x + numColW + titleColW, y, descColW, rowH).clip();
    doc.fontSize(fontSize).font('Helvetica').fillColor('#111111');
    doc.text(detail.description, x + numColW + titleColW + 2, y + 3, { width: descColW - 6, lineBreak: false, ellipsis: true });
    doc.restore();

    // ── cell borders ──
    doc.rect(x, y, numColW, rowH).strokeColor(LIGHT_GRAY).lineWidth(0.3).stroke();
    doc.rect(x + numColW, y, titleColW, rowH).strokeColor(LIGHT_GRAY).lineWidth(0.3).stroke();
    doc.rect(x + numColW + titleColW, y, descColW, rowH).strokeColor(LIGHT_GRAY).lineWidth(0.3).stroke();

    return rowH;
  };

  // Render front and back detail lists, continuing to new pages as needed
  let leftY = tableStartY + 8;
  let rY = tableStartY + 8;
  let frontIdx = 0;
  let backIdx = 0;
  let leftDone = false;
  let rightDone = false;
  let isFirstPage = true;

  // Clip the entire table region so nothing can bleed past the page boundary
  doc.save();
  doc.rect(MARGIN, tableStartY, fullWidth, maxY - tableStartY).clip();

  // Draw table headers on first page
  const thH = 12;

  // Front column header
  doc.rect(leftX, leftY, colWidth, thH).fill('#FFFFFF');
  doc.fontSize(6).font('Helvetica-Bold').fillColor('#111111');
  doc.text('Front View', leftX + numColW + 3, leftY + 3, { width: titleColW - 6, lineBreak: false });
  doc.text('Description', leftX + numColW + titleColW + 3, leftY + 3, { width: descColW - 6, lineBreak: false });
  doc.rect(leftX, leftY, colWidth, thH).strokeColor(LIGHT_GRAY).lineWidth(0.3).stroke();
  leftY += thH;

  if (backDetails.length > 0) {
    // Back column header
    doc.rect(rightColX, rY, colWidth, thH).fill('#FFFFFF');
    doc.fontSize(6).font('Helvetica-Bold').fillColor('#111111');
    doc.text('Back View', rightColX + numColW + 3, rY + 3, { width: titleColW - 6, lineBreak: false });
    doc.text('Description', rightColX + numColW + titleColW + 3, rY + 3, { width: descColW - 6, lineBreak: false });
    doc.rect(rightColX, rY, colWidth, thH).strokeColor(LIGHT_GRAY).lineWidth(0.3).stroke();
    rY += thH;
  } else {
    rightDone = true;
  }

  while (!leftDone || !rightDone) {
    // Render front rows on left column
    while (frontIdx < frontDetails.length) {
      if (leftY + rowH > maxY) break;
      leftY += drawRow(leftX, leftY, frontIdx + 1, frontDetails[frontIdx]);
      frontIdx++;
    }
    if (frontIdx >= frontDetails.length) leftDone = true;

    // Render back rows on right column
    while (backIdx < backDetails.length) {
      if (rY + rowH > maxY) break;
      rY += drawRow(rightColX, rY, backIdx + 1, backDetails[backIdx]);
      backIdx++;
    }
    if (backIdx >= backDetails.length) rightDone = true;

    // If there's still content remaining, add a continuation page
    if (!leftDone || !rightDone) {
      doc.restore(); // release clip from previous page
      doc.addPage({ size: 'A4', layout: 'landscape' });
      renderHeader(doc, specs, 'Technical Comments (cont.)', 2, brand);

      leftY = MARGIN + HEADER_HEIGHT + 8;
      rY = MARGIN + HEADER_HEIGHT + 8;

      // Re-apply clip for the new page
      doc.save();
      doc.rect(MARGIN, leftY, fullWidth, maxY - leftY).clip();

      if (!leftDone) {
        doc.rect(leftX, leftY, colWidth, thH).fill('#FFFFFF');
        doc.fontSize(6).font('Helvetica-Bold').fillColor('#111111');
        doc.text('Front View (cont.)', leftX + numColW + 3, leftY + 3, { width: titleColW - 6, lineBreak: false });
        doc.text('Description', leftX + numColW + titleColW + 3, leftY + 3, { width: descColW - 6, lineBreak: false });
        doc.rect(leftX, leftY, colWidth, thH).strokeColor(LIGHT_GRAY).lineWidth(0.3).stroke();
        leftY += thH;
      }

      if (!rightDone) {
        doc.rect(rightColX, rY, colWidth, thH).fill('#FFFFFF');
        doc.fontSize(6).font('Helvetica-Bold').fillColor('#111111');
        doc.text('Back View (cont.)', rightColX + numColW + 3, rY + 3, { width: titleColW - 6, lineBreak: false });
        doc.text('Description', rightColX + numColW + titleColW + 3, rY + 3, { width: descColW - 6, lineBreak: false });
        doc.rect(rightColX, rY, colWidth, thH).strokeColor(LIGHT_GRAY).lineWidth(0.3).stroke();
        rY += thH;
      }
    }
  }

  // Release the table clip
  doc.restore();
}

// ── PAGE 3: Measurements table (LEFT) + CAD Drawings (RIGHT) ──────────────────
function renderPage3(doc: PDFKit.PDFDocument, data: TechPackData, brand?: string) {
  const specs = data.specifications;

  renderHeader(doc, specs, 'MEASUREMENT DRAWINGS', 3, brand);

  const contentY = MARGIN + HEADER_HEIGHT;
  const contentH = PAGE_HEIGHT - contentY - MARGIN;
  const totalW   = PAGE_WIDTH - 2 * MARGIN;
  const firstPageTableW = totalW * 0.40;
  const tableX = MARGIN;
  const tableBottom = PAGE_HEIGHT - MARGIN - 10;
  const rowH = 10;
  const headerH = 12;

  const visibleMeasurements = specs.measurements;
  const placements = specs.placementDetails?.filter(p => p.item) || [];

  const col = {
    num:   firstPageTableW * 0.14,
    name:  firstPageTableW * 0.56,
    value: firstPageTableW * 0.30,
  };
  const pCol = {
    num:  col.num,
    item: firstPageTableW * 0.28,
    ref:  firstPageTableW * 0.28,
    val:  firstPageTableW - col.num - firstPageTableW * 0.28 - firstPageTableW * 0.28,
  };

  // ── Draw CAD Drawings on the RIGHT side of first page ──────────────────
  const drawStartX = tableX + firstPageTableW + 12;
  const drawW      = PAGE_WIDTH - MARGIN - drawStartX;
  const halfH      = (contentH - 28) / 2;

  // Vertical divider
  doc.moveTo(tableX + firstPageTableW + 5, contentY)
     .lineTo(tableX + firstPageTableW + 5, PAGE_HEIGHT - MARGIN)
     .strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();

  // FRONT — top half
  doc.fontSize(6).font('Helvetica-Bold').fillColor('#111111');
  doc.text('FRONT — MEASUREMENT DRAWING', drawStartX, contentY, { width: drawW, align: 'center', lineBreak: false });

  const frontImgY = contentY + 12;
  if (data.cadDrawings.measurementDiagramFront) {
    try { doc.image(data.cadDrawings.measurementDiagramFront, drawStartX, frontImgY, { fit: [drawW, halfH], align: 'center', valign: 'center' }); }
    catch { drawPlaceholder(doc, drawStartX, frontImgY, drawW, halfH, 'Front Measurement Drawing'); }
  } else {
    drawPlaceholder(doc, drawStartX, frontImgY, drawW, halfH, 'Front Measurement Drawing');
  }

  // BACK — bottom half
  const backLabelY = frontImgY + halfH + 6;
  const backImgY   = backLabelY + 12;
  doc.fontSize(6).font('Helvetica-Bold').fillColor('#111111');
  doc.text('BACK — MEASUREMENT DRAWING', drawStartX, backLabelY, { width: drawW, align: 'center', lineBreak: false });

  if (data.cadDrawings.measurementDiagramBack) {
    try { doc.image(data.cadDrawings.measurementDiagramBack, drawStartX, backImgY, { fit: [drawW, halfH], align: 'center', valign: 'center' }); }
    catch { drawPlaceholder(doc, drawStartX, backImgY, drawW, halfH, 'Back Measurement Drawing'); }
  } else {
    drawPlaceholder(doc, drawStartX, backImgY, drawW, halfH, 'Back Measurement Drawing');
  }

  // ── Draw LEFT-side table with overflow support ────────────────────────────
  let tableW = firstPageTableW;
  let tableY = contentY;
  let measIdx = 0;
  let placeIdx = 0;
  let measDone = false;
  let placeDone = placements.length === 0;
  let placementSectionStartY = 0;
  let placementHeaderDrawn = false;

  // Helper: draw measurement table header
  const drawMeasHeader = (y: number, tw: number, label: string) => {
    doc.rect(tableX, y, tw, headerH).fill('#FFFFFF');
    doc.fontSize(6).font('Helvetica-Bold').fillColor('#111111');
    doc.text('NO.',    tableX + 3,                      y + 3, { width: col.num - 4,   align: 'center',  lineBreak: false });
    doc.text(label,    tableX + col.num + 3,            y + 3, { width: col.name - 6,  lineBreak: false, ellipsis: true });
    doc.text('VALUE (CM)', tableX + col.num + col.name + 2, y + 3, { width: col.value - 4, align: 'center',  lineBreak: false });
    doc.rect(tableX, y, tw, headerH).strokeColor(LIGHT_GRAY).lineWidth(0.3).stroke();
  };

  // Helper: draw one measurement row
  const drawMeasRow = (y: number, tw: number, m: { name: string; value: number }, idx: number) => {
    doc.rect(tableX, y, tw, rowH).fill('#FFFFFF');
    doc.fontSize(5).font('Helvetica-Bold').fillColor('#111111');
    doc.text(String(idx + 1), tableX + 2, y + 2, { width: col.num - 4, align: 'center', lineBreak: false });
    doc.font('Helvetica').fillColor('#111111');
    doc.text(m.name, tableX + col.num + 2, y + 2, { width: col.name - 4, lineBreak: false, ellipsis: true });
    doc.font('Helvetica-Bold').fillColor('#111111');
    doc.text(m.value > 0 ? `${m.value} cm` : '—', tableX + col.num + col.name + 2, y + 2, { width: col.value - 4, align: 'center', lineBreak: false });
    let bx = tableX;
    for (const w of [col.num, col.name, col.value]) {
      doc.rect(bx, y, w, rowH).strokeColor(LIGHT_GRAY).lineWidth(0.3).stroke();
      bx += w;
    }
  };

  // Helper: draw placement headers
  const drawPlacementHeaders = (y: number, tw: number) => {
    const pHeaderH = 11;
    doc.rect(tableX, y, tw, pHeaderH).fill('#FFFFFF');
    doc.fontSize(6).font('Helvetica-Bold').fillColor('#111111');
    doc.text('PLACEMENT & DETAIL SPECIFICATIONS', tableX + 3, y + 3, { width: tw - 6, lineBreak: false, ellipsis: true });
    doc.rect(tableX, y, tw, pHeaderH).strokeColor(LIGHT_GRAY).lineWidth(0.3).stroke();
    y += pHeaderH;

    const pSubH = 10;
    doc.rect(tableX, y, tw, pSubH).fill('#FFFFFF');
    doc.fontSize(6).font('Helvetica-Bold').fillColor('#111111');
    let px = tableX + 3;
    doc.text('NO.',  px, y + 2, { width: pCol.num - 4,  align: 'center', lineBreak: false }); px += pCol.num;
    doc.text('ITEM', px, y + 2, { width: pCol.item - 4, lineBreak: false });                   px += pCol.item;
    doc.text('FROM', px, y + 2, { width: pCol.ref - 4,  lineBreak: false });                   px += pCol.ref;
    doc.text('CM',   px, y + 2, { width: pCol.val - 4,  align: 'center', lineBreak: false });
    doc.rect(tableX, y, tw, pSubH).strokeColor(LIGHT_GRAY).lineWidth(0.3).stroke();
    y += pSubH;
    return y;
  };

  // Helper: draw one placement row
  const drawPlacementRow = (y: number, tw: number, pd: { item: string; reference: string; value: number }, num: number) => {
    doc.rect(tableX, y, tw, rowH).fill('#FFFFFF');
    let cx = tableX;
    doc.save(); doc.rect(cx, y, pCol.num, rowH).clip();
    doc.fontSize(5).font('Helvetica-Bold').fillColor('#111111');
    doc.text(String(num), cx + 2, y + 2, { width: pCol.num - 4, align: 'center', lineBreak: false });
    doc.restore(); cx += pCol.num;
    doc.save(); doc.rect(cx, y, pCol.item, rowH).clip();
    doc.fontSize(5).font('Helvetica').fillColor('#111111');
    doc.text(pd.item, cx + 2, y + 2, { width: pCol.item - 4, lineBreak: false, ellipsis: true });
    doc.restore(); cx += pCol.item;
    doc.save(); doc.rect(cx, y, pCol.ref, rowH).clip();
    doc.fontSize(5).font('Helvetica').fillColor('#111111');
    doc.text(pd.reference, cx + 2, y + 2, { width: pCol.ref - 4, lineBreak: false, ellipsis: true });
    doc.restore(); cx += pCol.ref;
    doc.save(); doc.rect(cx, y, pCol.val, rowH).clip();
    doc.fontSize(5).font('Helvetica-Bold').fillColor('#111111');
    doc.text(pd.value > 0 ? `${pd.value} cm` : '—', cx + 2, y + 2, { width: pCol.val - 4, align: 'center', lineBreak: false });
    doc.restore();
    let bx = tableX;
    for (const w of [pCol.num, pCol.item, pCol.ref, pCol.val]) {
      doc.rect(bx, y, w, rowH).strokeColor(LIGHT_GRAY).lineWidth(0.3).stroke();
      bx += w;
    }
  };

  // Clip left column on first page so text won't bleed into CAD area
  doc.save();
  doc.rect(tableX, contentY, tableW, tableBottom - contentY).clip();

  // First page: draw measurement header
  drawMeasHeader(tableY, tableW, 'MEASUREMENT NAME');
  tableY += headerH;

  // Main rendering loop — measurements then placements, with page continuation
  while (!measDone || !placeDone) {
    // Render measurement rows
    while (measIdx < visibleMeasurements.length) {
      if (tableY + rowH > tableBottom) break;
      drawMeasRow(tableY, tableW, visibleMeasurements[measIdx], measIdx);
      tableY += rowH;
      measIdx++;
    }
    if (measIdx >= visibleMeasurements.length) measDone = true;

    // Once measurements done, render placement section
    if (measDone && !placeDone) {
      if (!placementHeaderDrawn) {
        const neededH = 11 + 10 + rowH;
        if (tableY + 5 + neededH <= tableBottom) {
          tableY += 5;
          placementSectionStartY = tableY;
          tableY = drawPlacementHeaders(tableY, tableW);
          placementHeaderDrawn = true;
        }
        // else: not enough room, will draw on continuation page
      }

      if (placementHeaderDrawn) {
        while (placeIdx < placements.length) {
          if (tableY + rowH > tableBottom) break;
          const num = visibleMeasurements.length + placeIdx + 1;
          drawPlacementRow(tableY, tableW, placements[placeIdx], num);
          tableY += rowH;
          placeIdx++;
        }
        if (placeIdx >= placements.length) {
          placeDone = true;
          // Draw outer border around placement section
          if (placementSectionStartY > 0) {
            doc.rect(tableX, placementSectionStartY, tableW, tableY - placementSectionStartY)
               .strokeColor(LIGHT_GRAY).lineWidth(0.3).stroke();
          }
        }
      }
    }

    // If there's still content remaining, add a continuation page
    if (!measDone || !placeDone) {
      doc.restore(); // release clip from previous page

      doc.addPage({ size: 'A4', layout: 'landscape' });
      renderHeader(doc, specs, 'MEASUREMENT DRAWINGS (cont.)', 3, brand);

      // Continuation pages use full width (no CAD drawings)
      tableW = totalW;
      tableY = MARGIN + HEADER_HEIGHT + 8;

      doc.save();
      doc.rect(tableX, tableY, tableW, tableBottom - tableY).clip();

      if (!measDone) {
        drawMeasHeader(tableY, tableW, 'MEASUREMENT NAME (cont.)');
        tableY += headerH;
      } else if (!placeDone && !placementHeaderDrawn) {
        placementSectionStartY = tableY;
        tableY = drawPlacementHeaders(tableY, tableW);
        placementHeaderDrawn = true;
      } else if (!placeDone && placementHeaderDrawn) {
        // Draw placement outer border for previous page section if it was started
        // Re-draw placement sub-headers on continuation
        placementSectionStartY = tableY;
        tableY = drawPlacementHeaders(tableY, tableW);
      }
    }
  }

  // Release the table clip
  doc.restore();
}


function drawPlaceholder(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, label: string) {
  doc.rect(x, y, w, h).strokeColor(LIGHT_GRAY).lineWidth(0.5).dash(3, { space: 3 }).stroke().undash();
  doc.fontSize(8).font('Helvetica').fillColor(LIGHT_GRAY);
  doc.text(label, x, y + h / 2 - 5, { width: w, align: 'center' });
}

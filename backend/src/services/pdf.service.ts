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

      // Page 3: Measurements
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
  const drawingHeight = 180;

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
  const fontSize = 5.5;
  const minRowH = 16;

  // Helper: measure row height
  const measureRow = (detail: { title: string; description: string }) => {
    doc.fontSize(fontSize);
    const descH = doc.heightOfString(detail.description, { width: descColW - 6 });
    const titleH = doc.heightOfString(detail.title, { width: titleColW - 6 });
    return Math.max(descH + 6, titleH + 6, minRowH);
  };

  // Helper: draw a numbered row
  const drawRow = (x: number, y: number, num: number, detail: { title: string; description: string }) => {
    const rowH = measureRow(detail);

    doc.fontSize(fontSize).font('Helvetica-Bold').fillColor(DARK_GRAY);
    doc.text(String(num), x + 2, y + 2, { width: numColW - 4, align: 'center', lineBreak: false });

    doc.fontSize(fontSize).font('Helvetica-Bold').fillColor(DARK_GRAY);
    doc.text(detail.title, x + numColW + 2, y + 2, { width: titleColW - 6, height: rowH - 4, ellipsis: true });

    doc.fontSize(fontSize).font('Helvetica').fillColor(MEDIUM_GRAY);
    doc.text(detail.description, x + numColW + titleColW + 2, y + 2, { width: descColW - 6, height: rowH - 4, ellipsis: true });

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

  // Draw section labels on first page
  doc.fontSize(7).font('Helvetica-Bold').fillColor(DARK_GRAY);
  doc.text('Front View:', leftX, leftY, { lineBreak: false });
  leftY += 12;

  if (backDetails.length > 0) {
    doc.fontSize(7).font('Helvetica-Bold').fillColor(DARK_GRAY);
    doc.text('Back View:', rightColX, rY, { lineBreak: false });
    rY += 12;
  } else {
    rightDone = true;
  }

  while (!leftDone || !rightDone) {
    // Render front rows on left column
    while (frontIdx < frontDetails.length) {
      const h = measureRow(frontDetails[frontIdx]);
      if (leftY + h > maxY) break;
      leftY += drawRow(leftX, leftY, frontIdx + 1, frontDetails[frontIdx]);
      frontIdx++;
    }
    if (frontIdx >= frontDetails.length) leftDone = true;

    // Render back rows on right column
    while (backIdx < backDetails.length) {
      const h = measureRow(backDetails[backIdx]);
      if (rY + h > maxY) break;
      rY += drawRow(rightColX, rY, backIdx + 1, backDetails[backIdx]);
      backIdx++;
    }
    if (backIdx >= backDetails.length) rightDone = true;

    // If there's still content remaining, add a continuation page
    if (!leftDone || !rightDone) {
      doc.addPage({ size: 'A4', layout: 'landscape' });
      renderHeader(doc, specs, 'Technical Comments (cont.)', 2, brand);

      leftY = MARGIN + HEADER_HEIGHT + 8;
      rY = MARGIN + HEADER_HEIGHT + 8;

      if (!leftDone) {
        doc.fontSize(7).font('Helvetica-Bold').fillColor(DARK_GRAY);
        doc.text('Front View (cont.):', leftX, leftY, { lineBreak: false });
        leftY += 12;
      }

      if (!rightDone) {
        doc.fontSize(7).font('Helvetica-Bold').fillColor(DARK_GRAY);
        doc.text('Back View (cont.):', rightColX, rY, { lineBreak: false });
        rY += 12;
      }
    }
  }
}

function renderPage3(doc: PDFKit.PDFDocument, data: TechPackData, brand?: string) {
  const specs = data.specifications;

  // Header
  renderHeader(doc, specs, 'SAMPLE SIZE', 3, brand);

  const contentY = MARGIN + HEADER_HEIGHT;
  const contentHeight = PAGE_HEIGHT - contentY - MARGIN;

  // Left side: Measurements table (55% width)
  const tableWidth = (PAGE_WIDTH - 2 * MARGIN) * 0.55;
  let tableY = contentY;

  // Table headers
  const colWidths = {
    id: tableWidth * 0.25,
    name: tableWidth * 0.40,
    value: tableWidth * 0.20,
    unit: tableWidth * 0.15,
  };

  // Header row
  doc.rect(MARGIN, tableY, tableWidth, 16).fill('#F0F0F0');
  doc.fontSize(7).font('Helvetica-Bold').fillColor(DARK_GRAY);
  doc.text('REF', MARGIN + 3, tableY + 4, { width: colWidths.id });
  doc.text('NAME', MARGIN + colWidths.id + 3, tableY + 4, { width: colWidths.name });
  doc.text('M (CM)', MARGIN + colWidths.id + colWidths.name + 3, tableY + 4, { width: colWidths.value + colWidths.unit, align: 'center' });
  doc.rect(MARGIN, tableY, tableWidth, 16).strokeColor(BORDER_COLOR).lineWidth(0.3).stroke();
  tableY += 16;

  // Filter measurements: keep repo measurements always, skip AI measurements with value 0
  const visibleMeasurements = specs.measurements.filter(m =>
    m.source === 'repo' || m.value > 0
  );

  // Measurement rows with letter labels (A, B, C...) for CAD diagram reference
  visibleMeasurements.forEach((measurement, idx) => {
    const rowHeight = 16;
    const letter = String.fromCharCode(65 + idx); // A, B, C...

    doc.fontSize(6).font('Helvetica').fillColor(DARK_GRAY);
    doc.text(letter, MARGIN + 3, tableY + 4, { width: colWidths.id - 6 });
    doc.text(measurement.name, MARGIN + colWidths.id + 3, tableY + 4, { width: colWidths.name - 6 });
    doc.text(measurement.value > 0 ? String(measurement.value) : '-', MARGIN + colWidths.id + colWidths.name + 3, tableY + 4, {
      width: colWidths.value + colWidths.unit - 6,
      align: 'center',
    });

    // Row borders
    doc.rect(MARGIN, tableY, colWidths.id, rowHeight).strokeColor(LIGHT_GRAY).lineWidth(0.3).stroke();
    doc.rect(MARGIN + colWidths.id, tableY, colWidths.name, rowHeight).strokeColor(LIGHT_GRAY).lineWidth(0.3).stroke();
    doc.rect(MARGIN + colWidths.id + colWidths.name, tableY, colWidths.value + colWidths.unit, rowHeight).strokeColor(LIGHT_GRAY).lineWidth(0.3).stroke();

    tableY += rowHeight;

    if (tableY > PAGE_HEIGHT - MARGIN - 20) return;
  });

  // Right side: Measurement drawings
  const drawingsX = MARGIN + tableWidth + 20;
  const drawingsWidth = PAGE_WIDTH - MARGIN - drawingsX;
  const drawingHeight = contentHeight / 2 - 15;

  // Front measurement diagram
  doc.fontSize(7).font('Helvetica-Bold').fillColor(DARK_GRAY);
  doc.text('FRONT — MEASUREMENT DRAWING', drawingsX, contentY, { width: drawingsWidth, align: 'center' });

  if (data.cadDrawings.measurementDiagramFront) {
    try {
      doc.image(data.cadDrawings.measurementDiagramFront, drawingsX + 10, contentY + 12, {
        fit: [drawingsWidth - 20, drawingHeight],
        align: 'center',
        valign: 'center',
      });
    } catch (e) {
      drawPlaceholder(doc, drawingsX + 10, contentY + 12, drawingsWidth - 20, drawingHeight, 'Front Measurements');
    }
  } else {
    drawPlaceholder(doc, drawingsX + 10, contentY + 12, drawingsWidth - 20, drawingHeight, 'Front Measurements');
  }

  // Back measurement diagram
  const backDiagramY = contentY + drawingHeight + 25;
  doc.fontSize(7).font('Helvetica-Bold').fillColor(DARK_GRAY);
  doc.text('BACK — MEASUREMENT DRAWING', drawingsX, backDiagramY, { width: drawingsWidth, align: 'center' });

  if (data.cadDrawings.measurementDiagramBack) {
    try {
      doc.image(data.cadDrawings.measurementDiagramBack, drawingsX + 10, backDiagramY + 12, {
        fit: [drawingsWidth - 20, drawingHeight],
        align: 'center',
        valign: 'center',
      });
    } catch (e) {
      drawPlaceholder(doc, drawingsX + 10, backDiagramY + 12, drawingsWidth - 20, drawingHeight, 'Back Measurements');
    }
  } else {
    drawPlaceholder(doc, drawingsX + 10, backDiagramY + 12, drawingsWidth - 20, drawingHeight, 'Back Measurements');
  }
}

function drawPlaceholder(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, label: string) {
  doc.rect(x, y, w, h).strokeColor(LIGHT_GRAY).lineWidth(0.5).dash(3, { space: 3 }).stroke().undash();
  doc.fontSize(8).font('Helvetica').fillColor(LIGHT_GRAY);
  doc.text(label, x, y + h / 2 - 5, { width: w, align: 'center' });
}

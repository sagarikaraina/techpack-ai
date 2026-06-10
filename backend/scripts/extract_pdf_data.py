#!/usr/bin/env python3
"""
extract_pdf_data.py
-------------------
Reads the Nuon size-chart PDF from backend/data/size-charts/nuon-size-chart.pdf.

1. Extracts all measurement tables (rows with style names, fit categories, numeric values).
2. Renders each PDF page as a base64 JPEG so the Node.js caller can pass them to
   Gemini Vision for visual construction analysis.

Output (stdout): JSON with shape:
  {
    "styles": [ { body, fit, reference, keywords, measurements, page_num }, ... ],
    "pages":  { "0": "<base64-jpeg>", "1": "<base64-jpeg>", ... }
  }

Usage:
  python3 backend/scripts/extract_pdf_data.py
"""

import pdfplumber
import json
import sys
import os
import re
import base64
from io import BytesIO

PDF_PATH = os.path.join(
    os.path.dirname(__file__), '..', 'data', 'size-charts', 'nuon-size-chart.pdf'
)

# ── Measurement row mapping ──────────────────────────────────────────────────

MEASUREMENT_ROWS = {
    'shoulder width seam to seam @ back': 'SHOULDER_WIDTH',
    'single shouler width': 'SINGLE_SHOULDER',
    'single shoulder width': 'SINGLE_SHOULDER',
    'across front @ mid of armhole seam to seam': 'ACROSS_FRONT',
    'across back @ mid of armhole seam to seam': 'ACROSS_BACK',
    '1/2 chest width at armhole': 'HALF_CHEST',
    '1/2 bottom width': 'HALF_BOTTOM',
    '1/2 armhole straight': 'HALF_ARMHOLE',
    '1/2 bicep 1" below armhole': 'HALF_BICEP',
    '1/2 armhole straight at imaginary line': 'HALF_ARMHOLE_IMAGINARY',
    'sleeve length from shoulder seam': 'SLEEVE_LENGTH_SHOULDER',
    'sleeve length from neck edge': 'SLEEVE_LENGTH_NECK',
    'sleeve opening': 'SLEEVE_OPENING',
    'front length from hps': 'FRONT_LENGTH_HPS',
    'neck width seam to seam': 'NECK_WIDTH',
    'front neck drop from hps to neck seam': 'FRONT_NECK_DROP',
    'back neck drop from hps to seam': 'BACK_NECK_DROP',
    'neck binding/trim width': 'NECK_BINDING',
    'forward shoulder': 'FORWARD_SHOULDER',
}

SKIP_ROWS = {'style no', 'body', 'fit', 'reference', 'fabric', 'image', 'neck', ''}


# ── Helpers ──────────────────────────────────────────────────────────────────

def clean(val):
    if val is None:
        return ''
    v = str(val).strip()
    m = re.search(r'CHANGE TO\s+([\d.]+)', v, re.IGNORECASE)
    if m:
        return m.group(1)
    return v


def to_number(val):
    v = clean(val)
    try:
        return float(v)
    except Exception:
        return 0.0


def render_page_b64(page, resolution=100) -> str:
    """
    Render a pdfplumber page to a base64-encoded JPEG string.
    Returns empty string if rendering fails.
    """
    try:
        img_obj = page.to_image(resolution=resolution)
        pil_img = img_obj.original          # PIL.Image.Image
        buf = BytesIO()
        pil_img.save(buf, format='JPEG', quality=80)
        buf.seek(0)
        return base64.b64encode(buf.read()).decode('utf-8')
    except Exception as e:
        sys.stderr.write(f'[warn] page image render failed: {e}\n')
        return ''


# ── Table extraction ─────────────────────────────────────────────────────────

def extract_tables():
    """
    Returns a list of style dicts:
      { body, fit, reference, measurements: [...], page_num }
    """
    results = []
    pdf = pdfplumber.open(PDF_PATH)

    for page_num, page in enumerate(pdf.pages):
        tables = page.extract_tables()
        for table in tables:
            if not table or len(table) < 5:
                continue

            body_row = fit_row = ref_row = None
            for row in table:
                if not row or not row[0]:
                    continue
                label = str(row[0]).strip().upper()
                if label == 'BODY':
                    body_row = row
                elif label == 'FIT':
                    fit_row = row
                elif label == 'REFERENCE':
                    ref_row = row

            if not body_row:
                continue

            # Build style column descriptors
            style_cols = []
            for i in range(1, len(body_row)):
                body_val = clean(body_row[i])
                fit_val  = clean(fit_row[i])  if fit_row  else ''
                ref_val  = clean(ref_row[i])  if ref_row  else ''
                if body_val and body_val.upper() not in ('', 'BODY'):
                    style_cols.append({
                        'col_idx': i,
                        'body': body_val,
                        'fit': fit_val,
                        'reference': ref_val,
                        'measurements': [],
                        'page_num': page_num,
                    })

            if not style_cols:
                continue

            # Collect measurements
            for row in table:
                if not row or not row[0]:
                    continue
                label = str(row[0]).strip()
                label_lower = label.lower()
                if label_lower in SKIP_ROWS:
                    continue
                meas_id = MEASUREMENT_ROWS.get(label_lower)
                if not meas_id:
                    continue
                for sc in style_cols:
                    col_i = sc['col_idx']
                    if col_i < len(row):
                        val = to_number(row[col_i])
                        sc['measurements'].append({
                            'id': meas_id,
                            'name': label,
                            'value': val,
                        })

            # Deduplicate and filter
            for sc in style_cols:
                deduped = {}
                for mm in sc['measurements']:
                    mid = mm['id']
                    if mid not in deduped or (mm['value'] != 0 and deduped[mid]['value'] == 0):
                        deduped[mid] = mm
                sc['measurements'] = list(deduped.values())
                if any(mm['value'] != 0 for mm in sc['measurements']):
                    results.append(sc)

    pdf.close()
    return results


# ── Keyword generation ────────────────────────────────────────────────────────

def generate_keywords(body: str, fit: str) -> list:
    body_lower = body.lower()
    fit_lower  = fit.lower()
    words    = body_lower.split()
    keywords = list(set(words + [body_lower, fit_lower]))

    if 'oversized' in body_lower or 'oversize' in body_lower:
        keywords += ['os', 'oversize', 'oversized']
    if 'tee' in body_lower:
        keywords += ['t-shirt', 'tshirt']
    if 'long sleeve' in body_lower:
        keywords += ['full sleeve', 'longsleeve']
    if 'sleeveless' in body_lower:
        keywords += ['tank', 'muscle tee']
    if 'v neck' in body_lower or 'v-neck' in body_lower:
        keywords += ['vneck', 'v-neck', 'v neck']
    if 'scoop' in body_lower:
        keywords += ['scoop neck']
    if 'ringer' in body_lower:
        keywords += ['contrast trim', 'contrast collar']
    if 'raglan' in body_lower:
        keywords += ['raglan']
    if 'skinny' in body_lower:
        keywords += ['fitted', 'tight']
    if 'collar' in body_lower:
        keywords += ['polo', 'collar']
    if 'cap sleeve' in body_lower:
        keywords += ['cap sleeve', 'short cap']

    parts = body_lower.split()
    for i in range(len(parts) - 1):
        keywords.append(f'{parts[i]} {parts[i+1]}')

    return list(set(k for k in keywords if k.strip()))


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not os.path.exists(PDF_PATH):
        print(json.dumps({'error': f'PDF not found: {PDF_PATH}'}))
        sys.exit(1)

    # 1. Extract measurement tables
    raw_styles = extract_tables()

    # 2. Render page images (one per unique page that has styles)
    pages_needed = set(s['page_num'] for s in raw_styles)
    page_images: dict = {}
    if pages_needed:
        pdf = pdfplumber.open(PDF_PATH)
        for pg_idx, page in enumerate(pdf.pages):
            if pg_idx in pages_needed:
                sys.stderr.write(f'[info] rendering page {pg_idx + 1} image…\n')
                page_images[str(pg_idx)] = render_page_b64(page, resolution=120)
        # Also render page 0 if it shows garment reference images even without tables
        if '0' not in page_images:
            page_images['0'] = render_page_b64(pdf.pages[0], resolution=120)
        pdf.close()

    # 3. Build output styles
    output_styles = []
    for s in raw_styles:
        keywords = generate_keywords(s['body'], s['fit'])
        output_styles.append({
            'body':      s['body'].upper(),
            'fit':       s['fit'].upper() if s['fit'] else 'REGULAR',
            'reference': s['reference'],
            'keywords':  keywords,
            'page_num':  s['page_num'],
            'measurements': [
                {'id': mm['id'], 'name': mm['name'], 'value': mm['value'], 'unit': 'cm'}
                for mm in s['measurements']
                if mm['name'].lower() not in ('', 'neck')
            ],
        })

    print(json.dumps({'styles': output_styles, 'pages': page_images}, indent=2))


if __name__ == '__main__':
    main()

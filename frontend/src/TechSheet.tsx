import { useState, useEffect, useCallback } from 'react';
import './TechSheet.css';

/* ── Types ── */
interface Measurement { id: string; name: string; value: number; unit: string; source?: 'repo' | 'ai'; }
interface Material { type: string; description: string; }
interface ColorSpec { name: string; pantone: string; hex?: string; }
interface ConstructionDetail { title: string; description: string; location: string; }
interface UniqueFeature { name: string; description: string; }
interface GarmentSpecifications {
  garmentType: string; style: string; description: string;
  season: string; date: string; supplier: string; designer: string;
  measurements: Measurement[]; materials: Material[];
  colors: ColorSpec[]; constructionDetails: ConstructionDetail[];
  careInstructions: string[]; trims: string[];
  uniqueFeatures?: UniqueFeature[];
  matchedFit?: string; matchedBody?: string;
}

interface ImageAvailability {
  front?: boolean; back?: boolean;
  annotatedFront?: boolean; annotatedBack?: boolean;
  measurementFront?: boolean; measurementBack?: boolean;
  detailCount?: number;
}

interface TechSheetProps {
  specs: GarmentSpecifications;
  jobId: string;
  images: ImageAvailability;
  originalCount: number;
  editMode: boolean;
  brandName: string;
  imageVersion?: number;
  onUpdate: (specs: GarmentSpecifications) => void;
}

const API_BASE = 'http://localhost:3001/api';

/* ── Click-to-edit cell ── */
function EC({ value, onChange, multiline = false, isChanged = false, editMode }: {
  value: string; onChange: (v: string) => void; multiline?: boolean;
  isChanged?: boolean; editMode: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);

  if (!editMode) return <span>{value || '\u2014'}</span>;

  if (editing) {
    const save = () => { onChange(draft); setEditing(false); };
    const cancel = () => { setDraft(value); setEditing(false); };
    return (
      <div className="ts-ec-wrap">
        {multiline
          ? <textarea className="ts-ec-ta" value={draft} onChange={e => setDraft(e.target.value)} autoFocus onKeyDown={e => { if (e.key === 'Escape') cancel(); }} />
          : <input className="ts-ec-inp" value={draft} onChange={e => setDraft(e.target.value)} autoFocus onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }} />
        }
        <div className="ts-ec-acts">
          <button className="ts-ec-save" onClick={save}>Save</button>
          <button className="ts-ec-cancel" onClick={cancel}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <span className={`ts-ec${isChanged ? ' ts-ec-changed' : ''}`} onClick={() => { setDraft(value); setEditing(true); }}>
      <span className="ts-ec-tip">click to edit</span>
      {value || <span className="ts-ec-empty">click to add</span>}
    </span>
  );
}

/* ── Image helper with cache busting ── */
function CadImage({ jobId, type, alt, className, version }: { jobId: string; type: string; alt: string; className?: string; version?: number }) {
  const [err, setErr] = useState(false);
  const src = `${API_BASE}/techpack/images/${jobId}/${type}${version ? `?v=${version}` : ''}`;
  useEffect(() => { setErr(false); }, [version]); // reset error on version change
  if (err) return <div className="ts-img-placeholder">{alt}</div>;
  return <img src={src} alt={alt} className={className || 'ts-cad-img'} onError={() => setErr(true)} />;
}

/* ── Main TechSheet Component ── */
export default function TechSheet({ specs, jobId, images, originalCount, editMode, brandName, imageVersion, onUpdate }: TechSheetProps) {
  const [changedFields, setChangedFields] = useState<Record<string, number>>({});

  const isChanged = (label: string) => !!changedFields[label];

  const updateField = useCallback((path: string, value: string, label: string) => {
    setChangedFields(cf => ({ ...cf, [label]: Date.now() }));
    const next = JSON.parse(JSON.stringify(specs));
    const parts = path.split('.');
    let cur: any = next;
    for (let i = 0; i < parts.length - 1; i++) {
      cur = isNaN(Number(parts[i])) ? cur[parts[i]] : cur[parseInt(parts[i])];
    }
    const lastKey = parts[parts.length - 1];
    // Handle numeric values for measurements
    if (path.includes('measurements') && lastKey === 'value') {
      cur[lastKey] = parseFloat(value) || 0;
    } else {
      cur[lastKey] = value;
    }
    onUpdate(next);
  }, [specs, onUpdate]);

  const addRow = useCallback((arrayPath: string, item: any, label: string) => {
    setChangedFields(cf => ({ ...cf, [label]: Date.now() }));
    const next = JSON.parse(JSON.stringify(specs));
    const parts = arrayPath.split('.');
    let cur: any = next;
    for (const p of parts) cur = cur[p];
    cur.push(item);
    onUpdate(next);
  }, [specs, onUpdate]);

  const removeRow = useCallback((arrayPath: string, index: number, label: string) => {
    setChangedFields(cf => ({ ...cf, [label]: Date.now() }));
    const next = JSON.parse(JSON.stringify(specs));
    const parts = arrayPath.split('.');
    let cur: any = next;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
    const lastKey = parts[parts.length - 1];
    cur[lastKey] = cur[lastKey].filter((_: any, i: number) => i !== index);
    onUpdate(next);
  }, [specs, onUpdate]);

  // Shorthand for EC with path-based update
  const E = ({ path, label, multiline }: { path: string; label: string; multiline?: boolean }) => (
    <EC
      value={path.split('.').reduce((o: any, k) => (isNaN(Number(k)) ? o?.[k] : o?.[parseInt(k)]), specs) as string || ''}
      onChange={v => updateField(path, v, label)}
      isChanged={isChanged(label)}
      editMode={editMode}
      multiline={multiline}
    />
  );

  const frontDetails = specs.constructionDetails.filter(d => d.location !== 'Back View');
  const backDetails = specs.constructionDetails.filter(d => d.location === 'Back View');
  const features = specs.uniqueFeatures?.slice(0, 3) || [];

  return (
    <div className="ts">

      {/* ═══════ PAGE 1: OVERVIEW ═══════ */}
      <div className="ts-page">
        {/* Header */}
        <div className="ts-header">
          <div className="ts-logo">{brandName}</div>
          <div className="ts-desc-cell">
            <div className="ts-desc-main">Description: <E path="description" label="Description" /></div>
          </div>
          <div className="ts-style-cell">Style: <E path="style" label="Style" /></div>
        </div>
        <div className="ts-subrow">
          <div className="ts-sub-cell"><span className="ts-sub-label">Season:</span> <E path="season" label="Season" /></div>
          <div className="ts-sub-cell"><span className="ts-sub-label">Date:</span> <E path="date" label="Date" /></div>
          <div className="ts-sub-cell"><span className="ts-sub-label">Vendor:</span> <E path="supplier" label="Vendor" /></div>
          <div className="ts-sub-cell"><span className="ts-sub-label">Designer:</span> <E path="designer" label="Designer" /></div>
          {specs.matchedBody && (
            <div className="ts-sub-cell"><span className="ts-sub-label">Fit Block:</span> {specs.matchedBody} ({specs.matchedFit})</div>
          )}
        </div>

        {/* Body */}
        <div className="ts-p1-body">
          {/* Left: Front & Back views */}
          <div className="ts-p1-views">
            <div className="ts-p1-views-row">
              <div>
                <div className="ts-view-label">FRONT VIEW</div>
                <div className="ts-view-box">
                  {images.front
                    ? <CadImage jobId={jobId} version={imageVersion} type="front" alt="Front View" />
                    : <span className="ts-view-empty">Front View</span>}
                </div>
              </div>
              <div>
                <div className="ts-view-label">BACK VIEW</div>
                <div className="ts-view-box">
                  {images.back
                    ? <CadImage jobId={jobId} version={imageVersion} type="back" alt="Back View" />
                    : <span className="ts-view-empty">Back View</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Colors, Materials, Image ref */}
          <div className="ts-p1-right">
            <div className="ts-p1-section-title">Color:</div>
            {specs.colors.map((c, i) => (
              <div key={i} className="ts-color-row">
                <div className="ts-color-dot" style={{ background: c.hex || '#333' }} />
                <span className="ts-color-text">
                  <E path={`colors.${i}.name`} label={`Color ${i+1}`} /> <E path={`colors.${i}.pantone`} label={`Color ${i+1} Pantone`} />
                </span>
                {editMode && <button className="ts-row-del" onClick={() => removeRow('colors', i, '- Color')}>x</button>}
              </div>
            ))}
            {editMode && <button className="ts-add-row" onClick={() => addRow('colors', { name: 'New Color', pantone: 'PMS 000 C', hex: '#CCCCCC' }, '+ Color')}>+ Add Color</button>}

            <hr className="ts-divider" />

            {specs.materials.map((m, i) => (
              <div key={i} className="ts-material-item">
                <div className="ts-material-header">
                  <strong><E path={`materials.${i}.type`} label={`Material ${i+1} Type`} />:</strong>
                  {editMode && <button className="ts-row-del" onClick={() => removeRow('materials', i, '- Material')}>x</button>}
                </div>
                <div className="ts-material-desc">
                  <E path={`materials.${i}.description`} label={`Material ${i+1}`} multiline />
                </div>
              </div>
            ))}
            {editMode && <button className="ts-add-row" onClick={() => addRow('materials', { type: 'New Fabric', description: '' }, '+ Material')}>+ Add Material</button>}

            <hr className="ts-divider" />

            <div className="ts-p1-section-title">Image reference:</div>
            <div className="ts-ref-images">
              {Array.from({ length: originalCount }, (_, i) => (
                <img key={i} src={`${API_BASE}/techpack/originals/${jobId}/${i}`} alt={`Ref ${i+1}`} className="ts-ref-img" />
              ))}
            </div>
          </div>
        </div>

        {/* Swatch section */}
        <div className="ts-swatch-section">
          <div className="ts-swatch-title">Fabric, Trimming & Swatch Reference</div>
          <div className="ts-swatch-grid">
            {features.length > 0 ? features.map((f, i) => (
              <div key={i} className="ts-swatch-item">
                {(images.detailCount || 0) > i
                  ? <CadImage jobId={jobId} version={imageVersion} type={`detail-${i}`} alt={f.name} className="ts-swatch-img" />
                  : <div className="ts-swatch-box" />
                }
                <div className="ts-swatch-ref">{f.name}</div>
              </div>
            )) : specs.trims.slice(0, 3).map((t, i) => (
              <div key={i} className="ts-swatch-item">
                <div className="ts-swatch-box" />
                <div className="ts-swatch-ref">{t}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="ts-footer">
          <span>1</span>
          <span className="ts-footer-brand">{brandName}</span>
        </div>
      </div>

      {/* ═══════ PAGE 2: TECHNICAL COMMENTS ═══════ */}
      <div className="ts-page">
        <div className="ts-header">
          <div className="ts-logo">{brandName}</div>
          <div className="ts-desc-cell"><div className="ts-desc-main">Technical Comments</div></div>
          <div className="ts-style-cell">Style: {specs.style}</div>
        </div>
        <div className="ts-subrow">
          <div className="ts-sub-cell"><span className="ts-sub-label">Season:</span> {specs.season}</div>
          <div className="ts-sub-cell"><span className="ts-sub-label">Date:</span> {specs.date}</div>
          <div className="ts-sub-cell"><span className="ts-sub-label">Vendor:</span> {specs.supplier}</div>
          <div className="ts-sub-cell"><span className="ts-sub-label">Designer:</span> {specs.designer}</div>
        </div>

        {/* Annotated views */}
        <div className="ts-p2-views">
          <div className="ts-p2-panel">
            <div className="ts-view-label">FRONT VIEW</div>
            <div className="ts-view-box">
              {(images.annotatedFront || images.front)
                ? <CadImage jobId={jobId} version={imageVersion} type={images.annotatedFront ? 'annotated-front' : 'front'} alt="Front View" />
                : <span className="ts-view-empty">Front View</span>}
            </div>
          </div>
          <div className="ts-p2-panel">
            <div className="ts-view-label">BACK VIEW</div>
            <div className="ts-view-box">
              {(images.annotatedBack || images.back)
                ? <CadImage jobId={jobId} version={imageVersion} type={images.annotatedBack ? 'annotated-back' : 'back'} alt="Back View" />
                : <span className="ts-view-empty">Back View</span>}
            </div>
          </div>
        </div>

        {/* Construction details table */}
        <div className="ts-p2-tables">
          <div className="ts-p2-half">
            <div className="ts-p2-th">
              <div className="ts-p2-th-cell" style={{ width: 160 }}>Front View</div>
              <div className="ts-p2-th-cell">Description</div>
            </div>
            {frontDetails.map((c, i) => (
              <div key={i} className="ts-p2-tr">
                <div className="ts-p2-td-title">
                  {editMode ? (
                    <div className="ts-row-wrap">
                      <E path={`constructionDetails.${specs.constructionDetails.indexOf(c)}.title`} label={`Front ${i+1} Title`} />
                      <button className="ts-row-del" onClick={() => removeRow('constructionDetails', specs.constructionDetails.indexOf(c), '- Detail')}>x</button>
                    </div>
                  ) : `${i + 1}. ${c.title}`}
                </div>
                <div className="ts-p2-td-desc">
                  <E path={`constructionDetails.${specs.constructionDetails.indexOf(c)}.description`} label={`Front ${i+1} Desc`} multiline />
                </div>
              </div>
            ))}
          </div>
          <div className="ts-p2-half">
            <div className="ts-p2-th">
              <div className="ts-p2-th-cell" style={{ width: 160 }}>Back View</div>
              <div className="ts-p2-th-cell">Description</div>
            </div>
            {backDetails.map((c, i) => (
              <div key={i} className="ts-p2-tr">
                <div className="ts-p2-td-title">
                  {editMode ? (
                    <div className="ts-row-wrap">
                      <E path={`constructionDetails.${specs.constructionDetails.indexOf(c)}.title`} label={`Back ${i+1} Title`} />
                      <button className="ts-row-del" onClick={() => removeRow('constructionDetails', specs.constructionDetails.indexOf(c), '- Detail')}>x</button>
                    </div>
                  ) : `${i + 1}. ${c.title}`}
                </div>
                <div className="ts-p2-td-desc">
                  <E path={`constructionDetails.${specs.constructionDetails.indexOf(c)}.description`} label={`Back ${i+1} Desc`} multiline />
                </div>
              </div>
            ))}
          </div>
        </div>
        {editMode && (
          <div style={{ padding: '8px 18px' }}>
            <button className="ts-add-row" onClick={() => addRow('constructionDetails', { title: 'New Detail', description: '', location: 'Front View' }, '+ Detail')}>+ Add Front Detail</button>
            <button className="ts-add-row" style={{ marginLeft: 8 }} onClick={() => addRow('constructionDetails', { title: 'New Detail', description: '', location: 'Back View' }, '+ Detail')}>+ Add Back Detail</button>
          </div>
        )}

        <div className="ts-footer">
          <span>2</span>
          <span className="ts-footer-brand">{brandName}</span>
        </div>
      </div>

      {/* ═══════ PAGE 3: SAMPLE SIZE ═══════ */}
      <div className="ts-page">
        <div className="ts-header">
          <div className="ts-logo">{brandName}</div>
          <div className="ts-desc-cell"><div className="ts-desc-main">SAMPLE SIZE</div></div>
          <div className="ts-style-cell">Style: {specs.style}</div>
        </div>
        <div className="ts-subrow">
          <div className="ts-sub-cell"><span className="ts-sub-label">Season:</span> {specs.season}</div>
          <div className="ts-sub-cell"><span className="ts-sub-label">Date:</span> {specs.date}</div>
          <div className="ts-sub-cell"><span className="ts-sub-label">Vendor:</span> {specs.supplier}</div>
          <div className="ts-sub-cell"><span className="ts-sub-label">Designer:</span> {specs.designer}</div>
        </div>

        <div className="ts-p3-body">
          {/* Left: Measurement table — filter out AI measurements with value 0, always keep repo */}
          <div className="ts-p3-table">
            <div className="ts-p3-th">
              <div className="ts-p3-th-cell" style={{ flex: 0.5 }}>REF</div>
              <div className="ts-p3-th-cell" style={{ flex: 2.0 }}>NAME</div>
              <div className="ts-p3-th-cell" style={{ flex: 0.8, textAlign: 'center' }}>M (CM)</div>
            </div>
            {specs.measurements
              .map((m, origIdx) => ({ m, origIdx }))
              .filter(({ m }) => m.source === 'repo' || m.value > 0)
              .map(({ m, origIdx }, visIdx) => (
              <div key={origIdx} className="ts-p3-tr">
                <div className="ts-p3-td ts-p3-id" style={{ flex: 0.5, fontWeight: 600, textAlign: 'center' }}>
                  {String.fromCharCode(65 + visIdx)}
                </div>
                <div className="ts-p3-td" style={{ flex: 2.0 }}>
                  <E path={`measurements.${origIdx}.name`} label={`M${visIdx+1} Name`} />
                </div>
                <div className="ts-p3-td ts-p3-val" style={{ flex: 0.8 }}>
                  {m.value > 0 ? <E path={`measurements.${origIdx}.value`} label={`M${visIdx+1} Value`} /> : <span style={{ color: '#999' }}>-</span>}
                  {editMode && <button className="ts-row-del" onClick={() => removeRow('measurements', origIdx, '- Measurement')}>x</button>}
                </div>
              </div>
            ))}
            {editMode && <button className="ts-add-row" style={{ margin: '8px 12px' }} onClick={() => addRow('measurements', { id: `M${specs.measurements.length + 1}`, name: 'New', value: 0, unit: 'cm' }, '+ Measurement')}>+ Add Measurement</button>}
          </div>

          {/* Right: Measurement drawings */}
          <div className="ts-p3-drawings">
            <div>
              <div className="ts-drawing-label">FRONT — MEASUREMENT DRAWING</div>
              <div className="ts-drawing-box">
                {images.measurementFront
                  ? <CadImage jobId={jobId} version={imageVersion} type="measurement-front" alt="Front Measurements" />
                  : <span className="ts-view-empty">Front measurement drawing</span>}
              </div>
            </div>
            <div>
              <div className="ts-drawing-label">BACK — MEASUREMENT DRAWING</div>
              <div className="ts-drawing-box">
                {images.measurementBack
                  ? <CadImage jobId={jobId} version={imageVersion} type="measurement-back" alt="Back Measurements" />
                  : <span className="ts-view-empty">Back measurement drawing</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="ts-footer">
          <span>3</span>
          <span className="ts-footer-brand">{brandName}</span>
        </div>
      </div>

    </div>
  );
}

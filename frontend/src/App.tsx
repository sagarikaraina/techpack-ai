import { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import TechSheet from './TechSheet';
import { BRANDS, getBrandById } from './brands';

const API_BASE = 'http://localhost:3001/api';

type AppState = 'idle' | 'uploading' | 'generating' | 'completed' | 'error';

interface ImageAvailability {
  front?: boolean; back?: boolean;
  annotatedFront?: boolean; annotatedBack?: boolean;
  measurementFront?: boolean; measurementBack?: boolean;
  detailCount?: number;
}

interface JobStatus {
  id: string;
  status: string;
  progress: number;
  currentStep: string;
  result?: { pdfId: string; downloadUrl: string };
  error?: string;
  specifications?: GarmentSpecifications;
  images?: ImageAvailability;
  originalCount?: number;
}

interface Measurement {
  id: string;
  name: string;
  value: number;
  unit: string;
}

interface Material {
  type: string;
  description: string;
}

interface ColorSpec {
  name: string;
  pantone: string;
  hex?: string;
}

interface ConstructionDetail {
  title: string;
  description: string;
  location: string;
}

interface GarmentSpecifications {
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
}


const SEASONS = ['SS26', 'AW26', 'SS27', 'AW27', 'SS28'];
const DEPARTMENTS = ['Western Womenswear', 'Menswear', 'Kidswear', 'Ethnic', 'Innerwear', 'Beauty', 'Footwear'];

function App() {
  const [state, setState] = useState<AppState>('idle');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [specs, setSpecs] = useState<GarmentSpecifications | null>(null);
  const [cadImages, setCadImages] = useState<ImageAvailability>({});
  const [imageVersion, setImageVersion] = useState(0);
  const [originalCount, setOriginalCount] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);

  // Edit tracking: undo stack, changed fields, changelog
  const [undoStack, setUndoStack] = useState<GarmentSpecifications[]>([]);
  const [changedFields, setChangedFields] = useState<Record<string, number>>({});
  const [changelog, setChangelog] = useState<{ field: string; time: string }[]>([]);
  const [showChangelog, setShowChangelog] = useState(false);

  // Parameters
  const [season, setSeason] = useState('SS26');
  const [department, setDepartment] = useState('Western Womenswear');
  const [designer, setDesigner] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState(BRANDS[0]?.id || '');
  const [showBrandDna, setShowBrandDna] = useState(false);
  const selectedBrand = getBrandById(selectedBrandId);
  const [brandDna, setBrandDna] = useState(selectedBrand?.dna || '');

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) addFiles(droppedFiles);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);

  const addFiles = (newFiles: File[]) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    const valid = newFiles.filter(f => {
      if (!allowed.includes(f.type)) { setError('Invalid file type. Only PNG, JPEG, WebP allowed.'); return false; }
      if (f.size > 10 * 1024 * 1024) { setError('File too large. Maximum 10MB per file.'); return false; }
      return true;
    });
    if (valid.length === 0) return;

    setFiles(prev => {
      const combined = [...prev, ...valid].slice(0, 10); // max 10 images
      setPreviews(combined.map(f => URL.createObjectURL(f)));
      return combined;
    });
    setError(null);
    setState('idle');
    setJob(null);
    setPdfUrl(null);
    setSpecs(null);
    setJobId(null);
  };

  const removeFile = (idx: number) => {
    setFiles(prev => {
      const updated = prev.filter((_, i) => i !== idx);
      setPreviews(updated.map(f => URL.createObjectURL(f)));
      return updated;
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
      e.target.value = ''; // reset so same files can be re-selected
    }
  };

  const handleGenerate = async () => {
    if (files.length === 0) return;
    setState('uploading');
    setError(null);
    setPdfUrl(null);
    setSpecs(null);
    setChatMessages([]);
    setChatInput('');
    setUndoStack([]);
    setChangedFields({});
    setChangelog([]);
    setShowChangelog(false);
    setEditOpen(false);

    try {
      // Upload all files
      let fileIds: string[];
      if (files.length === 1) {
        const formData = new FormData();
        formData.append('file', files[0]);
        const uploadRes = await axios.post(`${API_BASE}/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        fileIds = [uploadRes.data.fileId];
      } else {
        const formData = new FormData();
        files.forEach(f => formData.append('files', f));
        const uploadRes = await axios.post(`${API_BASE}/upload/multiple`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        fileIds = uploadRes.data.files.map((f: any) => f.fileId);
      }

      setState('generating');
      const res = await axios.post(`${API_BASE}/techpack/generate`, {
        fileIds,
        season,
        department,
        designer,
        supplier: vendorName,
        notes,
        brand: selectedBrand?.name || 'NUON',
        brandDna: brandDna,
      });
      const newJobId = res.data.jobId;
      setJobId(newJobId);

      pollRef.current = window.setInterval(async () => {
        try {
          const statusRes = await axios.get(`${API_BASE}/techpack/status/${newJobId}`);
          const jobData: JobStatus = statusRes.data;
          setJob(jobData);

          if (jobData.status === 'completed') {
            if (pollRef.current) clearInterval(pollRef.current);
            setState('completed');
            if (jobData.result?.downloadUrl) {
              setPdfUrl(`${API_BASE.replace('/api', '')}${jobData.result.downloadUrl}`);
            }
            if (jobData.specifications) {
              setSpecs(jobData.specifications);
            }
            if (jobData.images) setCadImages(jobData.images);
            if (jobData.originalCount) setOriginalCount(jobData.originalCount);
          } else if (jobData.status === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current);
            setError(jobData.error || 'Generation failed');
            setState('error');
          }
        } catch { /* ignore polling errors */ }
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Generation failed');
      setState('error');
    }
  };

  const handleRegenerate = async () => {
    if (!jobId || !specs) return;
    setRegenerating(true);
    try {
      const res = await axios.post(`${API_BASE}/techpack/regenerate/${jobId}`, specs);
      setPdfUrl(`${API_BASE.replace('/api', '')}${res.data.downloadUrl}?t=${Date.now()}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Regeneration failed');
    } finally {
      setRegenerating(false);
    }
  };

  const downloadPDF = () => { if (pdfUrl) window.open(pdfUrl, '_blank'); };

  const handleChatSend = async () => {
    if (!chatInput.trim() || !jobId || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: msg }]);
    setChatLoading(true);

    try {
      const res = await axios.post(`${API_BASE}/techpack/chat/${jobId}`, { message: msg }, { timeout: 300000 });
      const changeText = res.data.changes || 'Specifications updated.';
      const pdfReady = res.data.downloadUrl
        ? `${changeText}\n\u2705 Updated PDF is ready — click Download to view.`
        : changeText;
      setChatMessages(prev => [...prev, { role: 'ai', text: pdfReady }]);
      if (res.data.specifications) setSpecs(res.data.specifications);
      if (res.data.downloadUrl) {
        setPdfUrl(`${API_BASE.replace('/api', '')}${res.data.downloadUrl}?t=${Date.now()}`);
      }
      // Refresh CAD images (especially after structural changes like collar/neckline)
      if (res.data.images) {
        setCadImages(res.data.images);
        if (res.data.regenerateCAD) {
          setImageVersion(v => v + 1); // bust image cache
        }
      }
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'ai', text: `Error: ${err.response?.data?.error || 'Failed to process'}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const reset = () => {
    setState('idle');
    setFiles([]);
    setPreviews([]);
    setJobId(null);
    setJob(null);
    setError(null);
    setPdfUrl(null);
    setSpecs(null);
    setCadImages({});
    setOriginalCount(0);
    setChatMessages([]);
    setChatInput('');
    setUndoStack([]);
    setChangedFields({});
    setChangelog([]);
    setShowChangelog(false);
    setEditOpen(false);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  // --- Tracked spec editing (with undo + change tracking) ---
  const trackedUpdate = useCallback((label: string, updater: (prev: GarmentSpecifications) => GarmentSpecifications) => {
    setSpecs(prev => {
      if (!prev) return prev;
      setUndoStack(u => [...u.slice(-19), prev]);
      setChangedFields(cf => ({ ...cf, [label]: Date.now() }));
      setChangelog(cl => [{ field: label, time: new Date().toLocaleTimeString() }, ...cl.slice(0, 19)]);
      return updater(prev);
    });
  }, []);

  const undo = () => {
    if (!undoStack.length) return;
    setSpecs(undoStack[undoStack.length - 1]);
    setUndoStack(u => u.slice(0, -1));
  };

  const changeCount = Object.keys(changedFields).length;


  const isGenerating = state === 'uploading' || state === 'generating';

  return (
    <div className="app">
      <header className="top-header">
        <div className="logo">
          <span className="logo-dot"></span>
          <span className="logo-text">TechPack AI</span>
        </div>
        <div className="header-right">
          <span className="header-nav">DESIGN TECH SHEET GENERATOR</span>
        </div>
      </header>

      <div className="layout">
        {/* Left Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-section">
            <p className="section-label">HOW IT WORKS</p>
            <h2 className="how-title">Upload &rarr; Generate &rarr; Edit &rarr; Export</h2>
            <p className="how-desc">Upload any garment photo. AI builds a full vendor-ready tech sheet. Edit inline or use AI to fix any section.</p>
          </div>

          <div className="sidebar-section">
            <p className="section-label">STEP 1 &mdash; GARMENT IMAGE</p>
            <div
              className={`dropzone ${files.length > 0 ? 'has-file' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileSelect} multiple hidden />
              {files.length > 0 ? (
                <div className="preview-grid" onClick={e => e.stopPropagation()}>
                  {previews.map((p, i) => (
                    <div key={i} className="preview-thumb">
                      <img src={p} alt={`Image ${i + 1}`} />
                      <button className="thumb-remove" onClick={() => removeFile(i)}>x</button>
                      <p className="thumb-name">{files[i]?.name}</p>
                    </div>
                  ))}
                  <div className="preview-add" onClick={() => fileInputRef.current?.click()}>
                    <span>+</span>
                  </div>
                </div>
              ) : (
                <div className="dropzone-content">
                  <div className="dropzone-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                  </div>
                  <p><strong>Click or drop</strong> garment photos</p>
                  <p className="hint">JPG &middot; PNG &middot; WEBP &middot; Up to 10 images &middot; AI picks best front &amp; back</p>
                </div>
              )}
            </div>
          </div>

          <div className="sidebar-section">
            <p className="section-label">STEP 2 &mdash; PARAMETERS</p>

            <div className="param-group">
              <label className="param-label">BRAND</label>
              <div className="chip-group">
                {BRANDS.map(b => (
                  <button key={b.id} className={`chip ${selectedBrandId === b.id ? 'active' : ''}`} onClick={() => { setSelectedBrandId(b.id); setBrandDna(b.dna); }}>{b.name}</button>
                ))}
              </div>
              {selectedBrand && (
                <div className="brand-dna-section">
                  <button className="brand-dna-toggle" onClick={() => setShowBrandDna(!showBrandDna)}>
                    <span className="brand-dna-toggle-icon">{showBrandDna ? '\u25BE' : '\u25B8'}</span>
                    Brand DNA
                  </button>
                  {showBrandDna && (
                    <div className="brand-dna-content">
                      <textarea className="brand-dna-textarea" value={brandDna} onChange={e => setBrandDna(e.target.value)} />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="param-group">
              <label className="param-label">SEASON</label>
              <div className="chip-group">
                {SEASONS.map(s => (
                  <button key={s} className={`chip ${season === s ? 'active' : ''}`} onClick={() => setSeason(s)}>{s}</button>
                ))}
              </div>
            </div>

            <div className="param-group">
              <label className="param-label">DEPARTMENT</label>
              <div className="chip-group">
                {DEPARTMENTS.map(d => (
                  <button key={d} className={`chip ${department === d ? 'active' : ''}`} onClick={() => setDepartment(d)}>{d}</button>
                ))}
              </div>
            </div>

            <div className="param-group">
              <label className="param-label">DESIGNER</label>
              <input type="text" className="text-input" placeholder="e.g. Sarah Chen" value={designer} onChange={e => setDesigner(e.target.value)} />
            </div>

            <div className="param-group">
              <label className="param-label">VENDOR NAME</label>
              <input type="text" className="text-input" placeholder="e.g. ABC Textiles" value={vendorName} onChange={e => setVendorName(e.target.value)} />
            </div>

            <div className="param-group">
              <label className="param-label">NOTES FOR AI</label>
              <textarea className="text-input textarea" placeholder="Key details, special requirements, price point..." value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            <button className="btn-generate" onClick={handleGenerate} disabled={files.length === 0 || isGenerating}>
              {isGenerating ? 'Generating...' : 'Generate Tech Sheet'}
            </button>
          </div>
        </aside>

        {/* Right Panel */}
        <main className="output-panel">
          {/* Toolbar when completed */}
          {state === 'completed' && specs && (
            <div className="tabs-bar">
              <div className="toolbar-left-group">
                <span className="toolbar-title">Tech Pack Preview</span>
                {editOpen && <span className="badge-edit">EDITING</span>}
                {changeCount > 0 && <span className="badge-changes">{changeCount} edit{changeCount > 1 ? 's' : ''}</span>}
              </div>
              <div className="tabs-spacer" />
              {editOpen && undoStack.length > 0 && (
                <button className="btn-undo" onClick={undo}>Undo</button>
              )}
              {editOpen && changeCount > 0 && (
                <button className="btn-update-pdf" onClick={handleRegenerate} disabled={regenerating}>
                  {regenerating ? 'Updating...' : 'Update PDF'}
                </button>
              )}
              <button className={`btn-edit-toggle ${editOpen ? 'active' : ''}`} onClick={() => setEditOpen(!editOpen)}>
                {editOpen ? 'Done' : 'Edit'}
              </button>
              <button className="btn-download-sm" onClick={downloadPDF}>Download</button>
              <button className="btn-new-sm" onClick={reset}>New</button>
            </div>
          )}

          {error && (
            <div className="error-message">
              {error}
              <button className="btn-retry" onClick={reset}>Try Again</button>
            </div>
          )}

          {isGenerating && (() => {
            const pct = job?.progress || 0;
            const stages = [
              { icon: '\u2702\uFE0F', label: 'Cutting', threshold: 0 },
              { icon: '\uD83E\uDDF5', label: 'Stitching', threshold: 20 },
              { icon: '\uD83D\uDCD0', label: 'Detailing', threshold: 45 },
              { icon: '\uD83D\uDC57', label: 'Fitting', threshold: 70 },
              { icon: '\uD83D\uDCC4', label: 'Tech Pack', threshold: 92 },
            ];
            let activeIdx = 0;
            stages.forEach((s, i) => { if (pct >= s.threshold) activeIdx = i; });

            return (
              <div className="generating-state">
                <div className="progress-section">
                  <div className="stages-row">
                    {stages.map((s, i) => (
                      <div key={s.label} className="stage-wrapper">
                        {i > 0 && <div className={`stage-line ${i <= activeIdx ? 'done' : ''}`} />}
                        <div className={`stage ${i < activeIdx ? 'done' : i === activeIdx ? 'active' : ''}`}>
                          <div className="stage-icon">{s.icon}</div>
                          <div className="stage-label">{s.label}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="progress-pct">{pct}%</div>
                  <p className="progress-text">{job?.currentStep || 'Starting...'}</p>
                </div>
              </div>
            );
          })()}

          {state === 'completed' && specs && jobId && (
            <div className="sheet-output">
              <TechSheet
                specs={specs}
                jobId={jobId}
                images={cadImages}
                originalCount={originalCount}
                editMode={editOpen}
                brandName={selectedBrand?.name || 'NUON'}
                imageVersion={imageVersion}
                onUpdate={(updated) => {
                  trackedUpdate('Inline edit', () => updated);
                }}
              />
            </div>
          )}

          {/* Empty state */}
          {state === 'idle' && !error && (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5">
                  <rect x="4" y="2" width="16" height="20" rx="2" />
                  <line x1="8" y1="6" x2="16" y2="6" />
                  <line x1="8" y1="10" x2="16" y2="10" />
                  <line x1="8" y1="14" x2="12" y2="14" />
                </svg>
              </div>
              <h4>No Tech Sheet Yet</h4>
              <p>Upload a garment image and click Generate. Once created, switch to Edit Mode to refine any detail &mdash; or let AI rewrite entire sections.</p>
            </div>
          )}

          {/* Chat panel — visible when tech sheet is generated */}
          {state === 'completed' && specs && (
            <div className="chat-panel">
              {chatMessages.length > 0 && (
                <div className="chat-messages">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`chat-msg ${msg.role}`}>
                      <span className="chat-role">{msg.role === 'user' ? 'You' : 'AI'}</span>
                      <span className="chat-text">{msg.text}</span>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="chat-msg ai">
                      <span className="chat-role">AI</span>
                      <span className="chat-text chat-typing">Thinking...</span>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}
              <div className="chat-input-row">
                <input
                  type="text"
                  className="chat-input"
                  placeholder="e.g. &quot;Add a back vent&quot;, &quot;Change collar to mandarin&quot;, &quot;Increase chest width to 58cm&quot;"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleChatSend()}
                  disabled={chatLoading}
                />
                <button className="chat-send" onClick={handleChatSend} disabled={chatLoading || !chatInput.trim()}>
                  Send
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;

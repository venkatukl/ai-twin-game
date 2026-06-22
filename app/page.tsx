'use client';

import { Camera, CameraOff, LoaderCircle, Pencil, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import scenarios from '@/data/scenarios.json';

type Scenario = (typeof scenarios)[number];
type ScoreResponse = { score?: number; verdict?: string; dimensions?: { riskCalibration?: number; complianceAlignment?: number; growthJudgment?: number; aiGovernance?: number; aiCostDiscipline?: number }; rationale?: string };
type ActiveScore = { overall: number; verdict: string; dimensions: { label: string; value: number }[]; note: string };
type TwinProfile = { role: string; risk: number; compliance: number; growth: number; aiTrust: number; aiCost: number };
type AvatarStyleValue = 'pixar-3d-masterpiece' | 'cyberpunk-neon-strategist' | 'corporate-superhero' | 'anime-executive' | 'futuristic-fintech-commander' | 'minimal-editorial-portrait';

const actions = ['Approve', 'Approve with conditions', 'Escalate', 'Hold', 'Reject'];
const avatarStyleOptions: { value: AvatarStyleValue; label: string }[] = [
  { value: 'pixar-3d-masterpiece', label: 'Pixar 3D Masterpiece' },
  { value: 'cyberpunk-neon-strategist', label: 'Cyberpunk Neon Strategist' },
  { value: 'corporate-superhero', label: 'Corporate Superhero' },
  { value: 'anime-executive', label: 'Anime Executive' },
  { value: 'futuristic-fintech-commander', label: 'Futuristic Fintech Commander' },
  { value: 'minimal-editorial-portrait', label: 'Minimal Editorial Portrait' },
];

const GUIDE_CROP_RATIO = 0.86;

const sliderConfig = [
  { key: 'risk' as const,       label: 'Risk appetite',    min: 0,  max: 100 },
  { key: 'compliance' as const, label: 'Compliance focus', min: 0,  max: 100 },
  { key: 'growth' as const,     label: 'Growth drive',     min: 0,  max: 100 },
  { key: 'aiTrust' as const,    label: 'AI trust',         min: 0,  max: 100 },
  { key: 'aiCost' as const,     label: 'AI cost discipline', min: 0, max: 100 },
];

function scoreScenario(profile: TwinProfile, scenario: Scenario, action: string, reason: string): ActiveScore {
  const bestCost = ((scenario.bestProfile as any).aiCost ?? 55) as number;
  const fit = 100 - (Math.abs(profile.risk - scenario.bestProfile.risk) + Math.abs(profile.compliance - scenario.bestProfile.compliance) + Math.abs(profile.growth - scenario.bestProfile.growth) + Math.abs(profile.aiTrust - scenario.bestProfile.aiTrust) + Math.abs(profile.aiCost - bestCost)) / 5;
  const normalizedRecommended = scenario.recommendedAction.toLowerCase();
  const normalizedAction = action.toLowerCase();
  const actionBonus = normalizedAction === normalizedRecommended ? 12 : normalizedRecommended.includes(normalizedAction) ? 8 : 0;
  const reasoningBonus = Math.min(10, Math.max(2, Math.round(reason.trim().split(/\s+/).filter(Boolean).length / 5)));
  const overall = Math.max(18, Math.min(100, Math.round(fit + actionBonus + reasoningBonus)));
  return {
    overall,
    verdict: overall >= 80 ? 'Strong balance' : overall >= 60 ? 'Promising but exposed' : 'Needs tighter controls',
    note: scenario.coachingTip,
    dimensions: [
      { label: 'Risk calibration',     value: Math.max(20, Math.min(100, Math.round(100 - Math.abs(profile.risk - scenario.bestProfile.risk) * 1.3))) },
      { label: 'Compliance alignment', value: Math.max(20, Math.min(100, Math.round(100 - Math.abs(profile.compliance - scenario.bestProfile.compliance) * 1.25))) },
      { label: 'Growth judgment',      value: Math.max(20, Math.min(100, Math.round(100 - Math.abs(profile.growth - scenario.bestProfile.growth) * 1.2))) },
      { label: 'AI governance',        value: Math.max(20, Math.min(100, Math.round(100 - Math.abs(profile.aiTrust - scenario.bestProfile.aiTrust) * 1.25))) },
      { label: 'AI cost discipline',   value: Math.max(20, Math.min(100, Math.round(100 - Math.abs(profile.aiCost - bestCost) * 1.2))) },
    ],
  };
}

function getPersonaName(role: string, risk: number, compliance: number, growth: number) {
  if (compliance >= 85) return 'Captain Compliance';
  if (growth >= 85) return 'Growth Gladiator';
  if (risk <= 25) return 'Caution Commander';
  if (risk >= 75 && growth >= 70) return 'Bold Pathfinder';
  if (role.includes('Risk')) return 'Guardian Grid';
  return 'Strategy Spark';
}

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="score-bar-track">
      <div className="score-bar-fill" style={{ width: `${value}%` }} />
    </div>
  );
}

export default function HomePage() {
  const [role, setRole] = useState('CFO');
  const [risk, setRisk] = useState(35);
  const [compliance, setCompliance] = useState(85);
  const [growth, setGrowth] = useState(70);
  const [aiTrust, setAiTrust] = useState(55);
  const [aiCost, setAiCost] = useState(40);
  const [index, setIndex] = useState(0);
  const [action, setAction] = useState('Approve with conditions');
  const [reason, setReason] = useState('Preserve growth, but release only with documented conditions and review checkpoints.');
  const [sourceImageSrc, setSourceImageSrc] = useState<string | null>(null);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const fallbackAvatarSrc = '/avatars/captain-compliance.png';
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [scoringFailed, setScoringFailed] = useState(false);
  const [serverScore, setServerScore] = useState<ScoreResponse | null>(null);
  const [showJudgingPanel, setShowJudgingPanel] = useState(false);
  const [selectedImageBase64, setSelectedImageBase64] = useState<string | null>(null);
  const [selectedMimeType, setSelectedMimeType] = useState('image/jpeg');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyleValue>('pixar-3d-masterpiece');
  const [scoreStatus, setScoreStatus] = useState('Complete AI Twin setup to begin.');
  const [setupOpen, setSetupOpen] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scenario = scenarios[index % scenarios.length] as Scenario;
  const personaName = getPersonaName(role, risk, compliance, growth);
  const selectedStyleLabel = avatarStyleOptions.find((o) => o.value === avatarStyle)?.label ?? avatarStyleOptions[0].label;
  const resolvedAvatarSrc = avatarSrc || sourceImageSrc || fallbackAvatarSrc;
  const profile: TwinProfile = { role, risk, compliance, growth, aiTrust, aiCost };
  const localScore = useMemo(() => scoreScenario(profile, scenario, action, reason), [profile, scenario, action, reason]);
  const activeScore: ActiveScore = serverScore
    ? {
        overall: serverScore.score ?? localScore.overall,
        verdict: serverScore.verdict ?? localScore.verdict,
        note: serverScore.rationale || localScore.note,
        dimensions: [
          { label: 'Risk calibration',     value: serverScore.dimensions?.riskCalibration     ?? localScore.dimensions[0].value },
          { label: 'Compliance alignment', value: serverScore.dimensions?.complianceAlignment ?? localScore.dimensions[1].value },
          { label: 'Growth judgment',      value: serverScore.dimensions?.growthJudgment      ?? localScore.dimensions[2].value },
          { label: 'AI governance',        value: serverScore.dimensions?.aiGovernance        ?? localScore.dimensions[3].value },
          { label: 'AI cost discipline',   value: serverScore.dimensions?.aiCostDiscipline    ?? localScore.dimensions[4].value },
        ],
      }
    : localScore;

  const sliderValues: Record<string, number> = { risk, compliance, growth, aiTrust, aiCost };
  const sliderSetters: Record<string, (v: number) => void> = {
    risk: setRisk,
    compliance: setCompliance,
    growth: setGrowth,
    aiTrust: setAiTrust,
    aiCost: setAiCost,
  };

  useEffect(() => {
    setMounted(true);
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null; }
    setCameraOpen(false);
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1024 }, height: { ideal: 1024 } }, audio: false });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(async () => { if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); } });
    } catch (error) { console.error('Camera access failed:', error); }
  }

  function capturePhoto() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const sourceWidth = video.videoWidth || 1024;
    const sourceHeight = video.videoHeight || 768;
    const baseSquare = Math.min(sourceWidth, sourceHeight);
    const cropSize = Math.floor(baseSquare * GUIDE_CROP_RATIO);
    const sx = Math.floor((sourceWidth - cropSize) / 2);
    const sy = Math.floor((sourceHeight - cropSize) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 1024;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, 1024, 1024);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
    setSelectedImageBase64(base64); setSelectedMimeType('image/jpeg'); setSourceImageSrc(dataUrl); setAvatarSrc(null); stopCamera();
  }

  async function generateAvatar() {
    if (!selectedImageBase64) return;
    setIsGeneratingAvatar(true);
    try {
      const response = await fetch('/api/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: selectedImageBase64, mimeType: selectedMimeType, persona: `${personaName} | role=${role} | risk=${risk} | compliance=${compliance} | growth=${growth} | aiTrust=${aiTrust} | aiCost=${aiCost}`, avatarStyleKey: avatarStyle, fallbackAvatar: fallbackAvatarSrc }),
      });
      const data = await response.json();
      if (!response.ok) { setAvatarSrc(fallbackAvatarSrc); return; }
      if (data.avatarUrl) setAvatarSrc(data.avatarUrl);
      else if (data.imageBase64) setAvatarSrc(`data:${data.mimeType || 'image/png'};base64,${data.imageBase64}`);
      else setAvatarSrc(fallbackAvatarSrc);
    } catch { setAvatarSrc(fallbackAvatarSrc); } finally { setIsGeneratingAvatar(false); }
  }

  function completeSetup() {
    setAvatarSrc(avatarSrc || sourceImageSrc || fallbackAvatarSrc);
    setIsInitialized(true);
    setSetupOpen(false);
    setScoreStatus('Choose a scenario action, then score the round.');
  }

  async function scoreRound() {
    if (!isInitialized) return;
    setIsScoring(true); setShowJudgingPanel(true); setScoringFailed(false); setScoreStatus('Scoring this round...');
    try {
      const response = await fetch('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId: scenario.id, profile, action, reason }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Scoring failed.');
      setServerScore(data); setScoreStatus('Round scored.');
    } catch (error) { console.error(error); setServerScore(null); setScoringFailed(true); setScoreStatus('Scoring failed — showing estimated score.'); } finally { setIsScoring(false); }
  }

  function nextScenario() {
    if (!isInitialized) return;
    setIndex((i) => (i + 1) % scenarios.length);
    setServerScore(null); setShowJudgingPanel(false); setScoringFailed(false);
    setScoreStatus('Choose a scenario action, then score the round.');
  }

  if (!mounted) return null;

  return (
    <>
      <main className="page-shell">
        {/* ── Header ── */}
        <header className="header">
          <div>
            <div className="brand"><Sparkles size={22} /> AI Twin Challenge</div>
            <div className="subtle">Build your twin, judge the scenario, and see how your decision balances growth, risk, and compliance.</div>
          </div>
        </header>

        <section className="grid">
          {/* ── Left — Active AI Twin ── */}
          <aside className="card left-card simplified-left-card">
            <div className="section-title">Active AI Twin</div>

            <div className="active-avatar-card">
              <div className="active-avatar-image-wrap">
                <img className="active-avatar-image" src={resolvedAvatarSrc} alt="AI Twin avatar" />
                <button
                  className="avatar-edit-btn"
                  type="button"
                  onClick={() => setSetupOpen(true)}
                  title="Re-open setup"
                  aria-label="Edit twin"
                >
                  <Pencil size={11} />
                </button>
              </div>
              <div className="active-avatar-meta">
                <div className="active-avatar-name">{personaName}</div>
                <div className="small">{role} · {selectedStyleLabel}</div>
              </div>
            </div>

            {/* Sliders */}
            <div className="sliders-section">
              {sliderConfig.map(({ key, label, min, max }) => (
                <div className="slider-row" key={key}>
                  <div className="slider-label-row">
                    <span className="slider-name">{label}</span>
                    <span className="slider-value">{sliderValues[key]}</span>
                  </div>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    value={sliderValues[key]}
                    onChange={(e) => sliderSetters[key](Number(e.target.value))}
                    disabled={!isInitialized}
                    style={{
                      backgroundSize: `${sliderValues[key]}% 100%`,
                      backgroundImage: `linear-gradient(90deg, rgba(247,201,72,.5) 0%, rgba(89,179,255,.5) 100%)`,
                      backgroundRepeat: 'no-repeat',
                    }}
                  />
                </div>
              ))}
            </div>
          </aside>

          {/* ── Center — Scenario ── */}
          <section className="card center-card">
            <div className="scenario-content">
              <div className="scenario-tag">Scenario Arena</div>
              <div className="scenario-meta">{scenario.category} · {scenario.difficulty} · {scenario.timePressure} pressure</div>
              <h1 className="scenario-title">{scenario.title}</h1>
              <p className="small" style={{ marginBottom: 8, lineHeight: 1.5 }}>{scenario.summary}</p>
              <ul className="bullets">
                {scenario.facts.map((fact) => <li key={fact}>{fact}</li>)}
              </ul>
              <div className="action-helper small" style={{ marginTop: 8 }}>
                Choose the action your AI Twin would take for this scenario.
              </div>
              <div className="choice-grid">
                {actions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`choice ${action === item ? 'active' : ''}`}
                    onClick={() => setAction(item)}
                    disabled={!isInitialized}
                  >
                    <strong>{item}</strong>
                    <div className="small">Decision label for scoring.</div>
                  </button>
                ))}
              </div>
              <div className="reason-box">
                <label className="label" htmlFor="reason-box">Why did your AI Twin choose this?</label>
                <textarea
                  id="reason-box"
                  className="textarea"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={!isInitialized}
                />
              </div>
            </div>

            {/* Footer — always at bottom */}
            <div className="scenario-footer">
              <div className="scenario-actions">
                <button className="secondary-btn" type="button" onClick={nextScenario} disabled={!isInitialized}>
                  Play next scenario
                </button>
                <button className="primary-btn" type="button" onClick={scoreRound} disabled={!isInitialized || isScoring}>
                  {isScoring
                    ? <span className="btn-inline"><LoaderCircle size={15} className="spin" /> Scoring…</span>
                    : 'AI score this round'}
                </button>
              </div>
              <div className="footer-note">{scoreStatus}</div>
            </div>
          </section>

          {/* ── Right — Scoring results ── */}
          <aside className="card right-card">
            <div className="section-title">Scoring results</div>
            <div className="score-list">
              {isScoring ? (
                <div className="score-loading">
                  <div className="score-spinner-wrap">
                    <div className="twin-spinner twin-spinner-lg">
                      <div className="twin-ring ring-a" />
                      <div className="twin-ring ring-b" />
                      <Sparkles size={18} />
                    </div>
                  </div>
                  <div className="score-loading-title">Analysing your decision…</div>
                  <div className="small">AI is calibrating risk, compliance & growth.</div>
                </div>
              ) : showJudgingPanel ? (
                <>
                  {scoringFailed && (
                    <div className="score-fallback-note small">⚠ AI scoring unavailable — showing estimated score.</div>
                  )}
                  {/* Overall */}
                  <div className="score-item">
                    <header>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span className="verdict-badge">{activeScore.verdict}</span>
                      </span>
                      <span className="score-value-badge">{activeScore.overall}</span>
                    </header>
                    <ScoreBar value={activeScore.overall} />
                    <div className="small" style={{ marginTop: 8 }}>{activeScore.note}</div>
                  </div>
                  {/* Dimensions */}
                  {activeScore.dimensions.map((item) => (
                    <div className="score-item" key={item.label}>
                      <header>
                        <span>{item.label}</span>
                        <span className="score-value-badge">{item.value}</span>
                      </header>
                      <ScoreBar value={item.value} />
                    </div>
                  ))}
                </>
              ) : (
                <div className="panel-overlay-card">
                  <div className="overlay-title">No score yet</div>
                  <div className="small">Choose an action and score the round to see results here.</div>
                </div>
              )}
            </div>
          </aside>
        </section>
      </main>

      {/* ── Setup modal ── */}
      {setupOpen && (
        <div className="setup-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="setup-title">
          <div className="setup-modal">
            {/* Header */}
            <div className="setup-modal-header">
              <div className="setup-kicker">Mandatory setup</div>
              <h2 id="setup-title">Initialize your AI Twin</h2>
              <p>Create your participant identity before starting the challenge.</p>
            </div>

            {/* Body */}
            <div className="setup-grid">
              {/* Left — form controls */}
              <div className="setup-form">
                <div className="field-group">
                  <label className="label" htmlFor="role-select">Business persona</label>
                  <select id="role-select" className="select" value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="CFO">CFO</option>
                    <option value="Chief Risk Officer">Chief Risk Officer</option>
                    <option value="Head of Sales">Head of Sales</option>
                    <option value="Operations Leader">Operations Leader</option>
                    <option value="Product Owner">Product Owner</option>
                  </select>
                </div>
                <div className="field-group">
                  <label className="label" htmlFor="style-select">Avatar style</label>
                  <select id="style-select" className="select" value={avatarStyle} onChange={(e) => setAvatarStyle(e.target.value as AvatarStyleValue)}>
                    {avatarStyleOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="setup-toolbar">
                  <button className="icon-btn" type="button" onClick={cameraOpen ? stopCamera : startCamera} aria-label="Toggle camera">
                    {cameraOpen ? <CameraOff size={15} /> : <Camera size={15} />}
                  </button>
                  <button className="secondary-btn compact-btn" type="button" onClick={capturePhoto} disabled={!cameraOpen}>
                    Capture photo
                  </button>
                  <button className="primary-btn compact-btn" type="button" onClick={generateAvatar} disabled={!selectedImageBase64 || isGeneratingAvatar}>
                    {isGeneratingAvatar ? 'Generating…' : 'Generate avatar'}
                  </button>
                </div>
              </div>

              {/* Right — camera / preview */}
              <div className="setup-preview">
                <div className="setup-preview-card">
                  <div className="setup-preview-header">
                    <span>Preview</span>
                    <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{personaName}</span>
                  </div>

                  <div className="setup-preview-media">
                    {cameraOpen ? (
                      <div className="camera-stage">
                        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center', display: 'block' }} />
                        <div className="camera-guide">
                          <div className="camera-guide-frame" />
                          <div className="camera-guide-text">Center your face in the frame</div>
                        </div>
                        <button className="camera-close-btn" type="button" onClick={stopCamera} aria-label="Close camera">
                          <CameraOff size={15} />
                        </button>
                      </div>
                    ) : avatarSrc ? (
                      <img className="setup-preview-image" src={avatarSrc} alt="Generated avatar preview" />
                    ) : sourceImageSrc ? (
                      <img className="setup-preview-image" src={sourceImageSrc} alt="Captured participant photo" />
                    ) : (
                      <div className="setup-empty">
                        <Camera size={28} />
                        <div>No participant photo yet</div>
                        <div className="small">Open camera → capture → generate avatar.</div>
                      </div>
                    )}

                    {isGeneratingAvatar && (
                      <div className="avatar-generating-overlay">
                        <div className="twin-spinner">
                          <div className="twin-ring ring-a" />
                          <div className="twin-ring ring-b" />
                          <Sparkles size={16} />
                        </div>
                        <div className="avatar-generating-title">Training your AI Twin…</div>
                        <div className="small">Reading features, applying style, rendering avatar.</div>
                      </div>
                    )}
                  </div>

                  <div className="setup-preview-meta">
                    <div className="active-avatar-name">{personaName}</div>
                    <div className="small">{role} · {selectedStyleLabel}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="setup-modal-footer">
              {isInitialized && (
                <button className="secondary-btn" type="button" onClick={() => setSetupOpen(false)}>
                  Cancel
                </button>
              )}
              <button className="primary-btn" type="button" onClick={completeSetup}>
                {isInitialized ? 'Save & resume' : 'Start AI challenge →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

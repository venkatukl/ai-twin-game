'use client';

import { Camera, CameraOff, LoaderCircle, Pencil, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import scenarios from '@/data/scenarios.json';

type Scenario = (typeof scenarios)[number];

type ProfileDelta = { label: string; user: number; ideal: number; direction: string };

type ScoreResponse = {
  score?: number;
  verdict?: string;
  dimensions?: {
    riskCalibration?: number;
    complianceAlignment?: number;
    growthJudgment?: number;
    aiGovernance?: number;
    aiCostDiscipline?: number;
  };
  rationale?: string;
  personaComparison?: string;
  idealAction?: string;
  profileDeltas?: ProfileDelta[];
};

type ActiveScore = {
  overall: number;
  verdict: string;
  note: string;
  personaComparison: string;
  idealAction: string;
  profileDeltas: ProfileDelta[];
  dimensions: { label: string; value: number }[];
};

type TwinProfile = {
  role: string;
  risk: number;
  compliance: number;
  growth: number;
  aiTrust: number;
  aiCost: number;
};

type AvatarStyleValue =
  | 'pixar-3d-masterpiece'
  | 'cyberpunk-neon-strategist'
  | 'corporate-superhero'
  | 'anime-executive'
  | 'futuristic-fintech-commander'
  | 'minimal-editorial-portrait';

const actions = ['Approve', 'Approve with conditions', 'Escalate', 'Hold', 'Reject'];

const avatarStyleOptions: { value: AvatarStyleValue; label: string }[] = [
  { value: 'pixar-3d-masterpiece',         label: 'Pixar 3D Masterpiece' },
  { value: 'cyberpunk-neon-strategist',    label: 'Cyberpunk Neon Strategist' },
  { value: 'corporate-superhero',          label: 'Corporate Superhero' },
  { value: 'anime-executive',              label: 'Anime Executive' },
  { value: 'futuristic-fintech-commander', label: 'Futuristic Fintech Commander' },
  { value: 'minimal-editorial-portrait',   label: 'Minimal Editorial Portrait' },
];

const GUIDE_CROP_RATIO = 0.86;

const sliderConfig = [
  { key: 'risk'       as const, label: 'Risk appetite',      min: 0, max: 100 },
  { key: 'compliance' as const, label: 'Compliance focus',   min: 0, max: 100 },
  { key: 'growth'     as const, label: 'Growth drive',       min: 0, max: 100 },
  { key: 'aiTrust'    as const, label: 'AI trust',           min: 0, max: 100 },
  { key: 'aiCost'     as const, label: 'AI cost discipline', min: 0, max: 100 },
];

// ── Local scoring fallback (no API) ──────────────────────────────────────────
function scoreScenario(
  profile: TwinProfile,
  scenario: Scenario,
  action: string,
): ActiveScore {
  const bp = scenario.bestProfile as {
    risk: number; compliance: number; growth: number; aiTrust: number; aiCost?: number;
  };
  const idealAiCost = bp.aiCost ?? 55;

  const dims = [
    { label: 'Risk calibration',     value: Math.max(20, Math.min(100, Math.round(100 - Math.abs(profile.risk       - bp.risk)        * 1.3))) },
    { label: 'Compliance alignment', value: Math.max(20, Math.min(100, Math.round(100 - Math.abs(profile.compliance - bp.compliance)   * 1.25))) },
    { label: 'Growth judgment',      value: Math.max(20, Math.min(100, Math.round(100 - Math.abs(profile.growth     - bp.growth)       * 1.2))) },
    { label: 'AI governance',        value: Math.max(20, Math.min(100, Math.round(100 - Math.abs(profile.aiTrust    - bp.aiTrust)      * 1.25))) },
    { label: 'AI cost discipline',   value: Math.max(20, Math.min(100, Math.round(100 - Math.abs(profile.aiCost     - idealAiCost)     * 1.2))) },
  ];

  const actionMatch = action.toLowerCase() === scenario.recommendedAction.toLowerCase();
  const actionBonus = actionMatch ? 12 : scenario.recommendedAction.toLowerCase().includes(action.toLowerCase()) ? 6 : 0;
  const overall = Math.max(18, Math.min(100, Math.round(dims.reduce((a, d) => a + d.value, 0) / 5 + actionBonus)));

  function dir(u: number, i: number) {
    const d = u - i; return Math.abs(d) <= 8 ? 'spot on' : d > 0 ? 'too high' : 'too low';
  }

  return {
    overall,
    verdict: overall >= 80 ? 'Strong balance' : overall >= 60 ? 'Promising but exposed' : 'Needs tighter controls',
    note: scenario.coachingTip,
    personaComparison: `A typical ${profile.role} facing this scenario would have chosen to ${scenario.recommendedAction}. ${scenario.coachingTip}`,
    idealAction: scenario.recommendedAction,
    dimensions: dims,
    profileDeltas: [
      { label: 'Risk appetite',      user: profile.risk,       ideal: bp.risk,       direction: dir(profile.risk, bp.risk) },
      { label: 'Compliance focus',   user: profile.compliance, ideal: bp.compliance, direction: dir(profile.compliance, bp.compliance) },
      { label: 'Growth drive',       user: profile.growth,     ideal: bp.growth,     direction: dir(profile.growth, bp.growth) },
      { label: 'AI trust',           user: profile.aiTrust,    ideal: bp.aiTrust,    direction: dir(profile.aiTrust, bp.aiTrust) },
      { label: 'AI cost discipline', user: profile.aiCost,     ideal: idealAiCost,   direction: dir(profile.aiCost, idealAiCost) },
    ],
  };
}

function getPersonaName(role: string, risk: number, compliance: number, growth: number) {
  if (compliance >= 85) return 'Captain Compliance';
  if (growth >= 85)     return 'Growth Gladiator';
  if (risk <= 25)       return 'Caution Commander';
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

// Direction pill for profile deltas
function DeltaPill({ direction }: { direction: string }) {
  const isGood  = direction === 'spot on';
  const isHigh  = direction === 'too high';
  const colour  = isGood ? '#4ade80' : isHigh ? '#f87171' : '#fb923c';
  const icon    = isGood ? '✓' : isHigh ? '↑' : '↓';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800,
      background: `${colour}18`, color: colour, whiteSpace: 'nowrap',
    }}>
      {icon} {direction}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function HomePage() {
  const [role,       setRole]       = useState('CFO');
  const [risk,       setRisk]       = useState(35);
  const [compliance, setCompliance] = useState(85);
  const [growth,     setGrowth]     = useState(70);
  const [aiTrust,    setAiTrust]    = useState(55);
  const [aiCost,     setAiCost]     = useState(40);

  const [index,  setIndex]  = useState(() => Math.floor(Math.random() * scenarios.length));
  const [action, setAction] = useState('Approve with conditions');

  const [sourceImageSrc,      setSourceImageSrc]      = useState<string | null>(null);
  const [avatarSrc,            setAvatarSrc]            = useState<string | null>(null);
  const [isGeneratingAvatar,  setIsGeneratingAvatar]  = useState(false);
  const [isScoring,            setIsScoring]            = useState(false);
  const [scoringFailed,        setScoringFailed]        = useState(false);
  const [serverScore,          setServerScore]          = useState<ScoreResponse | null>(null);
  const [showJudgingPanel,     setShowJudgingPanel]     = useState(false);
  const [showResultsDialog,    setShowResultsDialog]    = useState(false);
  const [selectedImageBase64,  setSelectedImageBase64]  = useState<string | null>(null);
  const [selectedMimeType,     setSelectedMimeType]     = useState('image/jpeg');
  const [cameraOpen,           setCameraOpen]           = useState(false);
  const [videoReady,           setVideoReady]           = useState(false);
  const [mounted,              setMounted]              = useState(false);
  const [scoreStatus,          setScoreStatus]          = useState('Complete AI Twin setup to begin.');
  const [setupOpen,            setSetupOpen]            = useState(true);
  const [isInitialized,        setIsInitialized]        = useState(false);
  const [usedIndices,          setUsedIndices]          = useState<Set<number>>(() => new Set());

  const FALLBACK_POOL = [
  '/avatars/fallback-1.png',
  '/avatars/fallback-2.png',
  '/avatars/fallback-3.png',
  '/avatars/fallback-4.png',
  '/avatars/fallback-5.png',
  '/avatars/fallback-6.png'
];
  const fallbackAvatarSrc = FALLBACK_POOL[Math.floor(Math.random() * FALLBACK_POOL.length)];

  const randomAvatarStyle = () =>
    avatarStyleOptions[Math.floor(Math.random() * avatarStyleOptions.length)].value;
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyleValue>(() => randomAvatarStyle());
  useEffect(() => { if (setupOpen) setAvatarStyle(randomAvatarStyle()); }, [setupOpen]);

  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const scenario         = scenarios[index % scenarios.length] as Scenario;
  const personaName      = getPersonaName(role, risk, compliance, growth);
  const selectedStyleLabel = avatarStyleOptions.find((o) => o.value === avatarStyle)?.label ?? avatarStyleOptions[0].label;
  const resolvedAvatarSrc  = avatarSrc || sourceImageSrc || fallbackAvatarSrc;
  const profile: TwinProfile = { role, risk, compliance, growth, aiTrust, aiCost };

  // Local score — always available, used when server hasn't responded yet
  const localScore = useMemo(
    () => scoreScenario(profile, scenario, action),
    [profile, scenario, action],
  );

  // Merge server response over local score — prefer server fields when present
  const activeScore: ActiveScore = serverScore
    ? {
        overall:           serverScore.score   ?? localScore.overall,
        verdict:           serverScore.verdict  ?? localScore.verdict,
        note:              serverScore.rationale || localScore.note,
        personaComparison: serverScore.personaComparison || localScore.personaComparison,
        idealAction:       serverScore.idealAction       || localScore.idealAction,
        profileDeltas:     serverScore.profileDeltas     ?? localScore.profileDeltas,
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
    risk: setRisk, compliance: setCompliance, growth: setGrowth,
    aiTrust: setAiTrust, aiCost: setAiCost,
  };

  useEffect(() => {
    setMounted(true);
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  }, []);

  // ── Camera ──────────────────────────────────────────────────────────────────
  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null; }
    setCameraOpen(false);
    setVideoReady(false);
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setVideoReady(false);
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((e) => console.warn('Video play failed:', e));
        }
      }, 80);
    } catch (error) {
      console.error('Camera access failed:', error);
      alert('Camera access was denied or unavailable. Please check your browser permissions and ensure the page is served over HTTPS.');
    }
  }

  function capturePhoto() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const sourceWidth  = video.videoWidth  || 1024;
    const sourceHeight = video.videoHeight || 768;
    const baseSquare   = Math.min(sourceWidth, sourceHeight);
    const cropSize     = Math.floor(baseSquare * GUIDE_CROP_RATIO);
    const sx           = Math.floor((sourceWidth  - cropSize) / 2);
    const sy           = Math.floor((sourceHeight - cropSize) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 1024;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, 1024, 1024);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
    const base64  = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
    setSelectedImageBase64(base64);
    setSelectedMimeType('image/jpeg');
    setSourceImageSrc(dataUrl);
    setAvatarSrc(null);
    stopCamera();
  }

  // ── Avatar generation ───────────────────────────────────────────────────────
  async function generateAvatar() {
    if (!selectedImageBase64) return;
    setIsGeneratingAvatar(true);
    try {
      const response = await fetch('/api/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64:    selectedImageBase64,
          mimeType:       selectedMimeType,
          persona:        `${personaName} | role=${role} | risk=${risk} | compliance=${compliance} | growth=${growth} | aiTrust=${aiTrust} | aiCost=${aiCost}`,
          avatarStyleKey: avatarStyle,
          fallbackAvatar: fallbackAvatarSrc,
        }),
      });
      const data = await response.json();
      if (!response.ok)      { setAvatarSrc(fallbackAvatarSrc); return; }
      if (data.avatarUrl)    setAvatarSrc(data.avatarUrl);
      else if (data.imageBase64) setAvatarSrc(`data:${data.mimeType || 'image/png'};base64,${data.imageBase64}`);
      else                   setAvatarSrc(fallbackAvatarSrc);
    } catch { setAvatarSrc(fallbackAvatarSrc); }
    finally  { setIsGeneratingAvatar(false); }
  }

  function completeSetup() {
    setAvatarSrc(avatarSrc || sourceImageSrc || fallbackAvatarSrc);
    setIsInitialized(true);
    setSetupOpen(false);
    setScoreStatus(`You are the ${role}. Read the scenario and make your call.`);
  }

  // ── Scoring ─────────────────────────────────────────────────────────────────
  async function scoreRound() {
    if (!isInitialized) return;
    setIsScoring(true);
    setShowJudgingPanel(true);
    setScoringFailed(false);
    setShowResultsDialog(true); // open dialog immediately — shows spinner while loading
    setScoreStatus('Judging your decision…');
    try {
      const response = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: scenario.id, profile, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Scoring failed.');
      setServerScore(data);
      setScoreStatus('Results ready — see how you compared.');
    } catch (error) {
      console.error(error);
      setServerScore(null);
      setScoringFailed(true);
      setScoreStatus('Showing estimated results.');
    } finally {
      setIsScoring(false);
    }
  }

  // ── Next scenario ────────────────────────────────────────────────────────────
  function nextScenario() {
    if (!isInitialized) return;
    setUsedIndices((prev) => {
      const next = new Set(prev);
      next.add(index);
      if (next.size >= scenarios.length) next.clear();
      return next;
    });
    setIndex((prev) => {
      const pool = Array.from({ length: scenarios.length }, (_, i) => i)
        .filter((i) => i !== prev && !usedIndices.has(i));
      return pool.length > 0
        ? pool[Math.floor(Math.random() * pool.length)]
        : Math.floor(Math.random() * scenarios.length);
    });
    setServerScore(null);
    setShowJudgingPanel(false);
    setScoringFailed(false);
    setShowResultsDialog(false);
    setAction('Approve with conditions');
    setScoreStatus(`You are the ${role}. Read the scenario and make your call.`);
  }

  if (!mounted) return null;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <main className="page-shell">
        {/* ── Header ── */}
        <header className="header">
          <div>
            <div className="brand"><Sparkles size={22} /> AI Twin Challenge</div>
            <div className="subtle">Step into your persona, face the scenario, and see how your decisions compare to the ideal.</div>
          </div>
        </header>

        <section className="grid">
          {/* ── Left — Active AI Twin ── */}
          <aside className="card left-card simplified-left-card">
            <div className="section-title">Your AI Twin</div>

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
            <div className="sliders-header">Adjust your persona's priorities</div>
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
                    disabled={!isInitialized || showJudgingPanel}
                    style={{
                      backgroundSize:  `${sliderValues[key]}% 100%`,
                      backgroundImage: 'linear-gradient(90deg, rgba(247,201,72,.5) 0%, rgba(89,179,255,.5) 100%)',
                      backgroundRepeat:'no-repeat',
                    }}
                  />
                </div>
              ))}
            </div>
          </aside>

          {/* ── Center — Scenario ── */}
          <section className="card center-card">
            <div className="scenario-content">

              {/* Persona-in-role banner */}
              {isInitialized && (
                <div className="persona-banner">
                  You are the <strong>{role}</strong> — how do you respond?
                </div>
              )}

              <div className="scenario-tag">{scenario.category}</div>
              <div className="scenario-meta">{scenario.difficulty} · {scenario.timePressure} pressure</div>
              <h1 className="scenario-title">{scenario.title}</h1>
              <p className="scenario-summary">{scenario.summary}</p>
              <ul className="bullets">
                {scenario.facts.map((fact) => <li key={fact}>{fact}</li>)}
              </ul>

              <div className="decision-zone">
                <div className="decision-zone-label">What would you do as the {role}?</div>
                  <div className="choice-grid">
                    {actions.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={`choice ${action === item ? 'active' : ''}`}
                        onClick={() => setAction(item)}
                        disabled={!isInitialized || showJudgingPanel}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
              </div>
            </div>

            {/* Footer */}
            <div className="scenario-footer">
              <div className="footer-note">{scoreStatus}</div>
              <div className="scenario-actions">
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={nextScenario}
                  disabled={!isInitialized || isScoring}
                >
                  Try another scenario
                </button>

                {showJudgingPanel && !isScoring ? (
                  <button className="primary-btn" type="button" onClick={() => setShowResultsDialog(true)}>
                    View my results
                  </button>
                ) : (
                  <button
                    className="primary-btn"
                    type="button"
                    onClick={scoreRound}
                    disabled={!isInitialized || isScoring}
                  >
                    {isScoring
                      ? <span className="btn-inline"><LoaderCircle size={15} className="spin" /> Judging…</span>
                      : 'Judge my decision'}
                  </button>
                )}
              </div>              
            </div>
          </section>
        </section>
      </main>

      {/* ── Setup modal ── */}
      {setupOpen && (
        <div className="setup-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="setup-title">
          <div className="setup-modal">
            <div className="setup-modal-header">
              <div className="setup-kicker">Step 1 of 1</div>
              <h2 id="setup-title">Build your AI Twin</h2>
              <p>Choose your business persona, capture your photo, and generate your avatar before entering the challenge.</p>
            </div>

            <div className="setup-grid">
              {/* Left */}
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
                    {avatarStyleOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="setup-toolbar">
                  <button className="icon-btn" type="button" onClick={cameraOpen ? stopCamera : startCamera} aria-label="Toggle camera">
                    {cameraOpen ? <CameraOff size={15} /> : <Camera size={15} />}
                  </button>
                  <button className="secondary-btn compact-btn" type="button" onClick={capturePhoto} disabled={!videoReady}>
                    {cameraOpen && !videoReady ? 'Starting…' : 'Capture photo'}
                  </button>
                  <button className="primary-btn compact-btn" type="button" onClick={generateAvatar} disabled={!selectedImageBase64 || isGeneratingAvatar}>
                    {isGeneratingAvatar ? 'Generating…' : 'Generate avatar'}
                  </button>
                </div>
              </div>

              {/* Right — preview */}
              <div className="setup-preview">
                <div className="setup-preview-card">
                  <div className="setup-preview-header">
                    <span>Preview</span>
                    <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{personaName}</span>
                  </div>
                  <div className="setup-preview-media">
                    {cameraOpen ? (
                      <div className="camera-stage">
                        <video
                          ref={videoRef}
                          autoPlay playsInline muted
                          onCanPlay={() => setVideoReady(true)}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                        <div className="camera-guide">
                          <div className="camera-guide-frame" />
                          <div className="camera-guide-text">Center your face in the frame</div>
                        </div>
                        <button className="camera-close-btn" type="button" onClick={stopCamera} aria-label="Close camera">
                          <CameraOff size={15} />
                        </button>
                      </div>
                    ) : avatarSrc ? (
                      <img className="setup-preview-image" src={avatarSrc} alt="Generated avatar" />
                    ) : sourceImageSrc ? (
                      <img className="setup-preview-image" src={sourceImageSrc} alt="Captured photo" />
                    ) : (
                      <div className="setup-empty">
                        <Camera size={28} />
                        <div>No photo yet</div>
                        <div className="small">Open camera → capture → generate avatar</div>
                      </div>
                    )}
                    {isGeneratingAvatar && (
                      <div className="avatar-generating-overlay">
                        <div className="twin-spinner">
                          <div className="twin-ring ring-a" />
                          <div className="twin-ring ring-b" />
                          <Sparkles size={16} />
                        </div>
                        <div className="avatar-generating-title">Building your AI Twin…</div>
                        <div className="small">Applying style and rendering avatar.</div>
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

            <div className="setup-modal-footer">
              {isInitialized && (
                <button className="secondary-btn" type="button" onClick={() => setSetupOpen(false)}>Cancel</button>
              )}
              <button className="primary-btn" type="button" onClick={completeSetup}>
                {isInitialized ? 'Save & resume' : 'Enter the challenge →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Results dialog ── */}
      {showResultsDialog && (
        <div
          className="results-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Scoring results"
          onClick={(e) => { if (e.target === e.currentTarget) setShowResultsDialog(false); }}
        >
          <div className="results-modal">

            {/* Header */}
            <div className="results-modal-header">
              <div>
                <div className="setup-kicker">AI Verdict</div>
                <h2 className="results-modal-title">
                  {isScoring ? 'Judging your decision…' : activeScore.verdict}
                </h2>
                <div className="results-modal-subtitle">{scenario.title}</div>
              </div>
              <button className="results-close-btn" type="button" onClick={() => setShowResultsDialog(false)} aria-label="Close">✕</button>
            </div>

            {/* Body */}
            <div className="results-modal-body">
              {isScoring ? (
                /* ── Loading state ── */
                <div className="score-loading" style={{ padding: '60px 20px' }}>
                  <div className="score-spinner-wrap">
                    <div className="twin-spinner twin-spinner-lg">
                      <div className="twin-ring ring-a" />
                      <div className="twin-ring ring-b" />
                      <Sparkles size={18} />
                    </div>
                  </div>
                  <div className="score-loading-title">Analysing your decision…</div>
                  <div className="small" style={{ marginTop: 4 }}>Comparing your choices to a typical {role}'s response.</div>
                </div>
              ) : (
                <>
                  {scoringFailed && (
                    <div className="score-fallback-note small" style={{ marginBottom: 16 }}>
                      ⚠ Live AI judging unavailable — showing estimated results.
                    </div>
                  )}

                  {/* ── 1. Overall score hero ── */}
                  <div className="results-overall">
                    <div className="results-overall-left">
                      <span className="verdict-badge" style={{ fontSize: 12, padding: '4px 12px' }}>
                        {activeScore.verdict}
                      </span>
                      <div className="results-overall-score">
                        {activeScore.overall}
                        <span style={{ fontSize: 16, fontWeight: 400, color: 'var(--muted)' }}>/100</span>
                      </div>
                    </div>
                    <div className="results-overall-right">
                      <ScoreBar value={activeScore.overall} />
                      <p className="small" style={{ marginTop: 10, lineHeight: 1.6 }}>
                        {activeScore.note}
                      </p>
                    </div>
                  </div>

                  {/* ── 2. Persona comparison narrative ── */}
                  <div className="results-section">
                    <div className="results-section-title">How a typical {role} would have responded</div>
                    <p className="results-narrative">{activeScore.personaComparison}</p>
                  </div>

                  {/* ── 3. Action comparison ── */}
                  <div className="results-section">
                    <div className="results-section-title">Decision comparison</div>
                    <div className="results-action-row">
                      <div className="results-action-col results-action-col--user">
                        <div className="results-col-label">Your call</div>
                        <div className="results-col-action">{action}</div>
                      </div>
                      <div className="results-action-vs">vs</div>
                      <div className="results-action-col results-action-col--ai">
                        <div className="results-col-label">Recommended</div>
                        <div className="results-col-action results-col-action--ai">{activeScore.idealAction}</div>
                      </div>
                    </div>
                  </div>

                  {/* ── 4. Profile delta table ── */}
                  <div className="results-section">
                    <div className="results-section-title">Your priorities vs ideal {role} profile</div>
                    <div className="results-delta-table">
                      {activeScore.profileDeltas.map((d) => (
                        <div className="results-delta-row" key={d.label}>
                          <span className="results-delta-label">{d.label}</span>
                          <span className="results-delta-values">
                            <span className="results-delta-user">{d.user}</span>
                            <span className="results-delta-sep">→</span>
                            <span className="results-delta-ideal">{d.ideal} ideal</span>
                          </span>
                          <DeltaPill direction={d.direction} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── 5. Dimension breakdown ── */}
                  <div className="results-section">
                    <div className="results-section-title">Dimension scores</div>
                    <div className="results-dimensions-grid">
                      {activeScore.dimensions.map((item) => (
                        <div className="results-dimension-item" key={item.label}>
                          <div className="results-dimension-header">
                            <span>{item.label}</span>
                            <span className="score-value-badge">{item.value}</span>
                          </div>
                          <ScoreBar value={item.value} />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="results-modal-footer">
              <button className="secondary-btn" type="button" onClick={() => setShowResultsDialog(false)}>
                Back to scenario
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

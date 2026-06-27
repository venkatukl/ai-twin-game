'use client';

import { Bot, Camera, CameraOff, LoaderCircle, Pencil, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import scenarios from '@/data/scenarios.json';

const GESTURE_ENABLED = process.env.NEXT_PUBLIC_GESTURE_ENABLED === 'true';

type Scenario = {
  id: string;
  title: string;
  personaFocus: string[];
  summary: string;
  situation: string;
  options: { code: string; label: string }[];
  correctOption: string;
  coachingTip?: string;
  bestProfile: { risk: number; compliance: number; growth: number; aiTrust: number; aiCost?: number };
};

type ProfileDelta = { label: string; user: number; ideal: number; direction: string };

type ScoreResponse = {
  score?: number;
  verdict?: string;
  coachNarrative?: string;
  gaps?: { label: string; user: number; ideal: number; direction: string }[];
  idealAction?: string;
};

type ActiveScore = {
  overall: number;
  verdict: string;
  coachNarrative: string;
  idealAction: string;
  gaps: { label: string; user: number; ideal: number; direction: string }[];
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

function topGaps(
  profile: TwinProfile,
  bp: { risk: number; compliance: number; growth: number; aiTrust: number; aiCost?: number },
  idealAiCost: number,
) {
  return [
    { label: 'Risk appetite',      user: profile.risk,       ideal: bp.risk,       diff: profile.risk       - bp.risk },
    { label: 'Compliance focus',   user: profile.compliance, ideal: bp.compliance, diff: profile.compliance - bp.compliance },
    { label: 'Growth drive',       user: profile.growth,     ideal: bp.growth,     diff: profile.growth     - bp.growth },
    { label: 'AI trust',           user: profile.aiTrust,    ideal: bp.aiTrust,    diff: profile.aiTrust    - bp.aiTrust },
    { label: 'AI cost discipline', user: profile.aiCost,     ideal: idealAiCost,   diff: profile.aiCost     - idealAiCost },
  ]
    .filter((g) => Math.abs(g.diff) > 12)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, 3)
    .map((g) => ({ ...g, direction: g.diff > 0 ? 'too high' : 'too low' }));
}

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

  const aScore = (() => {
    const correct = scenario.correctOption.toLowerCase();
    const chosen  = action.toLowerCase();
    if (chosen === correct) return 50;
    return 0;
  })();
  const dimScores = [
    Math.max(25, Math.min(100, Math.round(100 - Math.abs(profile.risk       - bp.risk)        * 0.65))),
    Math.max(25, Math.min(100, Math.round(100 - Math.abs(profile.compliance - bp.compliance)  * 0.65))),
    Math.max(25, Math.min(100, Math.round(100 - Math.abs(profile.growth     - bp.growth)      * 0.65))),
    Math.max(25, Math.min(100, Math.round(100 - Math.abs(profile.aiTrust    - bp.aiTrust)     * 0.65))),
    Math.max(25, Math.min(100, Math.round(100 - Math.abs(profile.aiCost     - idealAiCost)    * 0.65))),
  ];
  const sliderAvg = Math.round(dimScores.reduce((a, b) => a + b, 0) / 5);
  const overall   = Math.max(20, Math.min(100, Math.round(aScore + sliderAvg * 0.5)));

  const chosenLabel  = scenario.options.find(o => o.code === action)?.label ?? action;
  const correctLabel = scenario.options.find(o => o.code === scenario.correctOption)?.label ?? scenario.correctOption;

  return {
    overall,
    verdict: aScore === 50 ? 'Strong balance' : 'Needs tighter controls',
    coachNarrative: `You chose "${chosenLabel}". The right call was "${correctLabel}". ${scenario.coachingTip ?? ''}`.trim(),
    idealAction: correctLabel,
    gaps: topGaps(profile, bp, idealAiCost),
  };
}

function getPersonaName(role: string, risk: number, compliance: number, growth: number) {
  if (role === 'Chief Financial Officer (CFO)')   return compliance >= 85 ? 'Captain Compliance' : risk >= 70 ? 'Bold CFO' : 'Strategy Spark';
  if (role === 'Chief Risk Officer (CRO)')        return risk <= 30 ? 'Guardian Grid' : compliance >= 80 ? 'Risk Sentinel' : 'Caution Commander';
  if (role === 'Chief Technology Officer (CTO)')  return growth >= 75 ? 'Tech Trailblazer' : 'System Architect';
  if (role === 'Head of HR')                      return growth >= 75 ? 'People Champion' : 'Culture Keeper';
  if (role === 'General Counsel (GC)')            return compliance >= 80 ? 'Rule of Law' : 'Deal Maker';
  if (role === 'Head - Data & AI')                return growth >= 75 ? 'Data Maverick' : 'AI Steward';
  if (role === 'Head of Public Affairs')          return risk <= 30 ? 'Safe Messenger' : 'Bold Voice';
  if (role === 'Head of Global Operations')       return compliance >= 75 ? 'Ops Commander' : 'Efficiency Edge';
  if (role === 'VP - Operations')                 return risk <= 40 ? 'Process Pro' : 'Scale Master';
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

function Typewriter({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    setDisplayed('');
    let i = 0;
    const interval = setInterval(() => {
      setDisplayed(text.slice(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(interval);
    }, 8);
    return () => clearInterval(interval);
  }, [text]);
  return <>{displayed}</>;
}

const VERDICT_OPTIONS = [
  'Needs tighter controls',
  'Promising but exposed',
  'Strong balance',
];

function VerdictSlotMachine({ final }: { final: string }) {
  const [displayed, setDisplayed]   = useState(VERDICT_OPTIONS[0]);
  const [spinning,  setSpinning]    = useState(true);
  const [settled,   setSettled]     = useState(false);

  useEffect(() => {
    setDisplayed(VERDICT_OPTIONS[0]);
    setSpinning(true);
    setSettled(false);

    let cycles = 0;
    const totalCycles = 10;
    // Start fast, slow down toward the end
    const delays = [60, 60, 80, 80, 100, 120, 150, 180, 220, 280];

    function spin(i: number) {
      if (i >= totalCycles) {
        setDisplayed(final);
        setSpinning(false);
        setTimeout(() => setSettled(true), 100);
        return;
      }
      setDisplayed(VERDICT_OPTIONS[i % VERDICT_OPTIONS.length]);
      setTimeout(() => spin(i + 1), delays[i] ?? 280);
    }

    // Short delay before starting — let modal appear first
    setTimeout(() => spin(0), 400);
  }, [final]);

  return (
    <span className={`verdict-slot ${spinning ? 'slot-spinning' : ''} ${settled ? 'slot-settled' : ''}`} data-verdict={settled ? final : undefined} >
      {displayed}
    </span>
  );
}

const AVATAR_QUIPS = [
  'Studying your best angles… 📐',
  'Adding cartoon magic… ✨',
  'Exaggerating your features… lovingly… 🎨',
  'Consulting Pixar… unofficially… 🎬',
  'Making you look important… 💼',
  'Rounding your edges… literally… 🔵',
  'Adding executive gravitas… 👔',
  'Your caricature is cooking… 🍳',
  'Turning pixels into personality…',
  'Making you 10% more photogenic… 📸',
  'AI artist at work… do not disturb… 🖌️',
  'Asking your face to hold still…',
];

const LOADING_QUIPS = [
  'Consulting 10,000 MBAs… 🧠',
  'Checking if this is legal… 👀',
  'Running risk simulations… ⚡',
  'Asking your Twin nicely…',
  'Cross-referencing bad decisions… 📚',
  'Calculating career implications… 😅',
  'Polling the board… virtually… 🏛️',
  'Searching for precedent… 🔍',
  'Your Twin is thinking hard…',
  'Comparing to 847 real executives…',
  'Dusting off the risk playbook… 📖',
  'Checking LinkedIn for inspiration… 💼',
];

function LoadingQuip({ quips = LOADING_QUIPS }: { quips?: string[] }) {
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    setIdx(0);
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % quips.length);
        setFade(true);
      }, 200);
    }, 1000);
    return () => clearInterval(interval);
  }, [quips]);

  return (
    <div
      className="loading-quip"
      style={{ opacity: fade ? 1 : 0, transition: 'opacity 0.2s ease' }}
    >
      {quips[idx]}
    </div>
  );
}

// Module-level — persists across camera start/stop cycles
let _gestureRecognizer: any = null;
let _mediaPipeLoading = false;

// ── Main component ────────────────────────────────────────────────────────────
export default function HomePage() {
  const [role,       setRole]       = useState('Head of Public Affairs');
  const [risk,       setRisk]       = useState(35);
  const [compliance, setCompliance] = useState(85);
  const [growth,     setGrowth]     = useState(70);
  const [aiTrust,    setAiTrust]    = useState(55);
  const [aiCost,     setAiCost]     = useState(40);

  const [showLanding, setShowLanding] = useState(true);

  const [index,  setIndex]  = useState(() => Math.floor(Math.random() * scenarios.length));
  const [action, setAction] = useState('');

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
  const [countdown,            setCountdown]            = useState<number | null>(null);
  const [mounted,              setMounted]              = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [scoreStatus,          setScoreStatus]          = useState('Complete AI Twin setup to begin.');
  const [setupOpen,            setSetupOpen]            = useState(true);
  const [isInitialized,        setIsInitialized]        = useState(false);
  const [usedIndices,          setUsedIndices]          = useState<Set<number>>(() => new Set());
  const [chipBubble, setChipBubble] = useState<string | null>(null);
  const [chipVisible, setChipVisible] = useState(false);
  const [chipWiggle,  setChipWiggle]  = useState(false);
  const [verdictOverlay, setVerdictOverlay] = useState<{ type: 'correct' | 'wrong'; text: string } | null>(null);
  const [briefingActive, setBriefingActive] = useState(false);
  const [holoActive, setHoloActive] = useState(false);

  // ── Gesture control ──────────────────────────────────────────────────────────
  const gestureVideoRef   = useRef<HTMLVideoElement | null>(null);
  const gestureCanvasRef  = useRef<HTMLCanvasElement | null>(null);
  const gestureStreamRef  = useRef<MediaStream | null>(null);
  const gestureRafRef     = useRef<number | null>(null);
  const gestureRecRef     = useRef<any>(null);
  const btnEditRef        = useRef<HTMLButtonElement | null>(null);
  const btnNextRef        = useRef<HTMLButtonElement | null>(null);
  const btnSubmitRef      = useRef<HTMLButtonElement | null>(null);
  const optionRefs        = useRef<(HTMLButtonElement | null)[]>([null, null, null, null]);

  const [gestureReady,    setGestureReady]    = useState(false);
  const [gestureError,    setGestureError]    = useState<string | null>(null);
  const [gestureActive,   setGestureActive]   = useState(false);
  const [activeTarget,    setActiveTarget]    = useState<string | null>(null);  
  const [dwellFiring, setDwellFiring] = useState<string | null>(null);
  const [gesturePaused, setGesturePaused] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('gesture-paused') === 'true';
  });
  const [gestureCursor, setGestureCursor] = useState<{ x: number; y: number } | null>(null);
  const [dwellProgress, setDwellProgress] = useState(0);
  const smoothX       = useRef(0);
  const smoothY       = useRef(0);
  const lastClickTime = useRef(0);
  const hoverFrames   = useRef<Record<string, number>>({});
  const dwellTarget   = useRef<string | null>(null);
  const dwellStart    = useRef<number | null>(null);
  const dwellGrace    = useRef<ReturnType<typeof setTimeout> | null>(null);  
  const DWELL_MS      = 2000;
  
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

  const videoRef     = useRef<HTMLVideoElement | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const guideFrameRef = useRef<HTMLDivElement | null>(null);

  const personaScenarios = useMemo(() => {
  const matched = (scenarios as Scenario[]).filter(s => s.personaFocus.includes(role));
  return matched.length > 0 ? matched : (scenarios as Scenario[]);
  }, [role]);

  const scenario = personaScenarios[index % personaScenarios.length] as Scenario;
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
        overall:        serverScore.score          ?? localScore.overall,
        verdict:        serverScore.verdict         ?? localScore.verdict,
        coachNarrative: serverScore.coachNarrative  ?? localScore.coachNarrative,
        idealAction:    serverScore.idealAction     ?? localScore.idealAction,
        gaps:           serverScore.gaps            ?? localScore.gaps,
      }
    : localScore;
  const sliderValues: Record<string, number> = { risk, compliance, growth, aiTrust, aiCost };
  const sliderSetters: Record<string, (v: number) => void> = {
    risk: setRisk, compliance: setCompliance, growth: setGrowth,
    aiTrust: setAiTrust, aiCost: setAiCost,
  };

  useEffect(() => {
    setMounted(true);
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // Scroll modal body to top every time setup opens
  useEffect(() => {
    if (setupOpen) {
      requestAnimationFrame(() => {
        const body = document.querySelector('.setup-modal-body');
        if (body) body.scrollTop = 0;
      });
    }
  }, [setupOpen]);

  useEffect(() => {
    if (!GESTURE_ENABLED) return;
    if (!isInitialized || showResultsDialog || setupOpen || gesturePaused) {
      stopGestureCamera();
      return;
    }
    startGestureCamera();
    return () => stopGestureCamera();
  }, [GESTURE_ENABLED, isInitialized, showResultsDialog, setupOpen, gesturePaused]);

  useEffect(() => {
    if (!GESTURE_ENABLED) return;
    sessionStorage.setItem('gesture-paused', String(gesturePaused));
  }, [gesturePaused]);

  // ── Camera ──────────────────────────────────────────────────────────────────
  function stopCamera() {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setCountdown(null);
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
    const videoW = video.videoWidth  || 1024;
    const videoH = video.videoHeight || 768;

    let sx = 0, sy = 0, cropSize = Math.min(videoW, videoH);

    if (guideFrameRef.current && videoRef.current) {
      // Measure where the guide frame sits within the video element on screen
      const videoRect = videoRef.current.getBoundingClientRect();
      const frameRect = guideFrameRef.current.getBoundingClientRect();

      // How much of the video element is the guide frame (0–1 scale)
      const scaleX = videoW / videoRect.width;
      const scaleY = videoH / videoRect.height;

      // Guide frame position relative to the video element, scaled to video pixels
      const frameLeft   = (frameRect.left   - videoRect.left)   * scaleX;
      const frameTop    = (frameRect.top    - videoRect.top)    * scaleY;
      const frameWidth  = frameRect.width  * scaleX;
      const frameHeight = frameRect.height * scaleY;

      // Use the smaller dimension to keep it square, centred on the frame
      cropSize = Math.floor(Math.min(frameWidth, frameHeight));
      sx = Math.floor(frameLeft + (frameWidth  - cropSize) / 2);
      sy = Math.floor(frameTop  + (frameHeight - cropSize) / 2);

      // Clamp to video bounds
      sx = Math.max(0, Math.min(sx, videoW - cropSize));
      sy = Math.max(0, Math.min(sy, videoH - cropSize));
    } else {
      // Fallback: centre crop if ref not available
      const base = Math.min(videoW, videoH);
      cropSize = Math.floor(base * 0.86);
      sx = Math.floor((videoW - cropSize) / 2);
      sy = Math.floor((videoH - cropSize) / 2);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, 1024, 1024);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const base64  = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
    setSelectedImageBase64(base64);
    setSelectedMimeType('image/jpeg');
    setSourceImageSrc(dataUrl);
    setAvatarSrc(null);
    stopCamera();
    // Auto-generate immediately using local variable — avoids stale state
    window.setTimeout(() => generateAvatar(base64, 'image/jpeg'), 900);
  }

  function startCountdown() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(7);
    let remaining = 7;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownRef.current!);
        countdownRef.current = null;
        setCountdown(null);
        capturePhoto();
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  }

  function cancelCountdown() {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setCountdown(null);
  }

  // Auto-start countdown as soon as the video feed is ready
  useEffect(() => {
    if (videoReady) startCountdown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoReady]);
  
  async function generateAvatar(base64Override?: string, mimeOverride?: string) {
  const imageBase64 = base64Override ?? selectedImageBase64;
  const mimeType    = mimeOverride   ?? selectedMimeType;
  if (!imageBase64) return;
  setIsGeneratingAvatar(true);
  try {
    const response = await fetch('/api/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64,
        mimeType,
        persona:        `${personaName} | role=${role} | risk=${risk} | compliance=${compliance} | growth=${growth} | aiTrust=${aiTrust} | aiCost=${aiCost}`,
        avatarStyleKey: avatarStyle,
        fallbackAvatar: fallbackAvatarSrc,
      }),
    });
    const data = await response.json();
    if (!response.ok)          { setAvatarSrc(fallbackAvatarSrc); return; }
    if (data.avatarUrl)        setAvatarSrc(data.avatarUrl);
    else if (data.imageBase64) setAvatarSrc(`data:${data.mimeType || 'image/png'};base64,${data.imageBase64}`);
    else                       setAvatarSrc(fallbackAvatarSrc);
  } catch { setAvatarSrc(fallbackAvatarSrc); }
  finally  { setIsGeneratingAvatar(false); }
}

  function completeSetup() {
    stopCamera();
    setAvatarSrc(avatarSrc || sourceImageSrc || fallbackAvatarSrc);
    setIsInitialized(true);
    triggerBriefing();
    setChipBubble(randomFrom(CHIP_GREETINGS));
    setChipVisible(true);
    setSetupOpen(false);
    setScoreStatus(`You are the ${role}. Read the scenario and make your call.`);
    sessionStorage.removeItem('gesture-paused');
    setGesturePaused(false);
  }

  const BRIEFING_TEXTS = [
    '⚡ INCOMING CRISIS',
    '🤖 AI CHAOS DETECTED',
    '⚠️ DECISION REQUIRED',
    '📡 YOUR TWIN IS WATCHING',
    '🔴 SITUATION ALERT',
  ];

  const CHIP_GREETINGS = [
  'Ready to judge you! 😄',
  'Let\'s see what you\'ve got!',
  'I\'m watching… 👀',
  'Choose wisely, human.',
  'My circuits are tingling!',
  'New scenario, new drama! 🎭',
  'Don\'t panic. Or do. I\'ll watch.',
  'I\'ve seen 1000 execs fail this one…',
  'Ooh this one\'s spicy! 🌶️',
  'My neural nets are warmed up!',
  'Let\'s see if you\'re as smart as you look.',
  'I\'ve already calculated all outcomes. 😏',
  'No pressure. (It\'s pressure.)',
  'The board is watching. So am I.',
  'Time to separate the CFOs from the chaos.',
];

const CHIP_REACTIONS = [
  'Interesting choice… 🤔',
  'Bold move! Let\'s see…',
  'Are you sure about that?',
  'My risk sensors are beeping!',
  'Hmm, a classic response!',
  'Ooh, controversial! 😮',
  'Playing it safe, huh?',
  'That\'s one way to do it!',
  'I did NOT see that coming.',
  'The lawyers are going to love this. 👀',
  'Noted. Eyebrow raised.',
  'Your risk appetite is showing! 📈',
  'Compliance officer has left the chat.',
  'Classic. Absolutely classic.',
  'I\'d have done the same. Maybe.',
  'Interesting… my predecessor chose that too. It didn\'t end well.',
  'Bold. Chaotic. Respect.',
  'Your CFO is sweating right now.',
  'The shareholders have entered the room.',
  'Plot twist incoming! 🎬',
  'My confidence in you just shifted 12 basis points.',
  'I\'ll allow it. For now.',
  'That\'s either genius or disaster. 50/50.',
  'The press release writes itself.',
];

const CHIP_FAREWELL = [
  'Consulting my circuits… 🧠',
  'Calculating your fate…',
  'Running the numbers… ⚡',
  'Hmm let me think…',
  'Cross-referencing 847 executive decisions…',
  'Accessing the hall of fame. And shame.',
  'Comparing you to 10,000 MBAs…',
  'Initialising verdict engine… 🔄',
  'Let me check with my legal team. Briefly.',
  'Processing. This might sting.',
  'Running scenario simulation… fingers crossed.',
  'Consulting the oracle… 🔮',
];

const CORRECT_TEXTS  = ['Nailed it! 🎯', 'Right call!', 'Exactly! 💡', 'Your Twin agrees! ✅', 'Spot on! 🌟'];
const PARTIAL_TEXTS  = ['Good instincts! 💛', 'Close enough!', 'Not bad at all!'];
const WRONG_TEXTS    = ['Your Twin disagrees… 🤔', 'Tough call!', 'Not quite…', 'Your Twin saw it differently'];

  function randomFrom(arr: string[]) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  
  function launchConfetti() {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9998';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d')!;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = Array.from({ length: 120 }, () => ({
      x:    Math.random() * canvas.width,
      y:    Math.random() * canvas.height - canvas.height,
      r:    Math.random() * 8 + 4,
      d:    Math.random() * 60 + 20,
      color: ['#f5c518','#1a7fd4','#4ade80','#f472b6','#fb923c'][Math.floor(Math.random()*5)],
      tilt: Math.random() * 10 - 10,
      tiltAngle: 0,
      tiltSpeed: Math.random() * 0.1 + 0.05,
    }));

    let frame = 0;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        p.tiltAngle += p.tiltSpeed;
        p.y += (Math.cos(frame * 0.01 + p.d) + 2.5) * 1.8;
        p.x += Math.sin(frame * 0.01) * 1.2;
        p.tilt = Math.sin(p.tiltAngle) * 12;
        ctx.beginPath();
        ctx.lineWidth = p.r / 2;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 4, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4);
        ctx.stroke();
      });
      frame++;
      if (frame < 160) requestAnimationFrame(draw);
      else canvas.remove();
    }
    draw();
  }

  function triggerBriefing() {
    setBriefingActive(true);
    setTimeout(() => setBriefingActive(false), 1400);
  }

  function triggerHolo() {
    setHoloActive(true);
    setTimeout(() => setHoloActive(false), 1200);
  }

  // ── Gesture camera ───────────────────────────────────────────────────────────
  async function startGestureCamera() {
    if (!GESTURE_ENABLED) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
        audio: false,
      });
      gestureStreamRef.current = stream;
      if (gestureVideoRef.current) {
        gestureVideoRef.current.srcObject = stream;
        gestureVideoRef.current.play();
      }
      await initMediaPipe();
      setGestureActive(true);
      setGestureError(null);
    } catch (err) {
      setGestureError('Camera unavailable');
      console.warn('Gesture camera error:', err);
    }
  }

  function stopGestureCamera() {
    if (gestureRafRef.current) { cancelAnimationFrame(gestureRafRef.current); gestureRafRef.current = null; }
    if (dwellGrace.current) { clearTimeout(dwellGrace.current); dwellGrace.current = null; }
    gestureStreamRef.current?.getTracks().forEach(t => t.stop());
    gestureStreamRef.current = null;
    if (gestureVideoRef.current) { gestureVideoRef.current.srcObject = null; }
    setGestureActive(false);
    setActiveTarget(null);
    setDwellProgress(0);
    dwellTarget.current = null;
    dwellStart.current  = null;
  }

  async function initMediaPipe() {
    // Already loaded — reuse
    if (_gestureRecognizer) {
      gestureRecRef.current = _gestureRecognizer;
      setGestureReady(true);
      requestGestureFrame();
      return;
    }
    // Already loading — wait
    if (_mediaPipeLoading) return;
    _mediaPipeLoading = true;

    try {
      const vision = await import('@mediapipe/tasks-vision');
      const { GestureRecognizer, FilesetResolver } = vision;
      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
      );
      const recognizer = await GestureRecognizer.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 1,
      });
      _gestureRecognizer = recognizer;
      gestureRecRef.current = recognizer;
      setGestureReady(true);
      requestGestureFrame();
    } catch (err) {
      setGestureError('MediaPipe failed to load');
      console.error('MediaPipe init error:', err);
    } finally {
      _mediaPipeLoading = false;
    }
  }

  function requestGestureFrame() {
    gestureRafRef.current = requestAnimationFrame(processGestureFrame);
  }

  function processGestureFrame() {
    if (!gestureStreamRef.current) return;
    const video  = gestureVideoRef.current;
    const canvas = gestureCanvasRef.current;
    const rec    = gestureRecRef.current;
    if (!video || !canvas || !rec || video.readyState < 2) {
      requestGestureFrame(); return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) { requestGestureFrame(); return; }

    canvas.width  = video.videoWidth  || 320;
    canvas.height = video.videoHeight || 240;

    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    let results: any;
    try { results = rec.recognizeForVideo(video, performance.now()); }
    catch { requestGestureFrame(); return; }

    if (results?.landmarks?.length > 0) {
      const hand     = results.landmarks[0];
      const indexTip = hand[8];

      // Draw index finger dot on canvas
      const sx = (1 - indexTip.x) * canvas.width;
      const sy = indexTip.y * canvas.height;
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245,197,24,0.9)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Map to screen coordinates with smoothing
      const SMOOTH  = 0.2;
      const screenX = (1 - indexTip.x) * window.innerWidth;
      const screenY = indexTip.y * window.innerHeight;
      smoothX.current = smoothX.current * (1 - SMOOTH) + screenX * SMOOTH;
      smoothY.current = smoothY.current * (1 - SMOOTH) + screenY * SMOOTH;
      setGestureCursor({ x: smoothX.current, y: smoothY.current });

      // Hit test buttons
      const buttons = [
        { key: 'edit',   ref: btnEditRef },
        { key: 'next',   ref: btnNextRef },
        { key: 'submit', ref: btnSubmitRef },
        ...scenario.options.map((opt, i) => ({
          key: `option-${opt.code}`,
          ref: { current: optionRefs.current[i] },
        })),
      ];

      let hit: string | null = null;
      for (const { key, ref } of buttons) {
        if (!ref.current || ref.current.disabled) continue;
        const r = ref.current.getBoundingClientRect();
        if (
          smoothX.current >= r.left && smoothX.current <= r.right &&
          smoothY.current >= r.top  && smoothY.current <= r.bottom
        ) { hit = key; break; }
      }

      // Stable hover — require 4 consistent frames before committing
      const hf = hoverFrames.current;
      if (hit) {
        hf[hit] = (hf[hit] ?? 0) + 1;
        Object.keys(hf).forEach(k => { if (k !== hit) hf[k] = 0; });
        if (hf[hit] >= 4) setActiveTarget(hit);
      } else {
        Object.keys(hf).forEach(k => { hf[k] = 0; });
      }

      // ── Dwell click ──────────────────────────────────────────────────────────
      const now = Date.now();

      if (hit) {
        // Cancel any pending grace reset
        if (dwellGrace.current) {
          clearTimeout(dwellGrace.current);
          dwellGrace.current = null;
        }

        if (dwellTarget.current !== hit) {
          // Moved to a new button — reset dwell timer
          dwellTarget.current = hit;
          dwellStart.current  = now;
          setDwellProgress(0);
        } else {
          // Same button — accumulate dwell time regardless of minor jitter
          const elapsed  = now - (dwellStart.current ?? now);
          const progress = Math.min(100, (elapsed / DWELL_MS) * 100);
          setDwellProgress(progress);

          if (progress >= 100) {
            const cooldownOk = now - lastClickTime.current > 1500;
            if (cooldownOk) {
              lastClickTime.current = now;
              dwellStart.current = now + DWELL_MS;
              setDwellProgress(0);

              const btn = buttons.find(b => b.key === hit)?.ref.current;
              const label = hit === 'edit'   ? '✓ Edit profile'
                          : hit === 'next'   ? '✓ Next scenario'
                          : hit === 'submit' ? '✓ Submitting…'
                          : hit?.startsWith('option-')
                            ? `✓ Option ${hit.replace('option-', '')} selected`
                            : '✓ Activating…';

              setDwellFiring(label);
              setTimeout(() => {
                setDwellFiring(null);
                btn?.click();
              }, 600);
            }
          }
        }
      } else {
        // Finger left all buttons — grace period before resetting
        // This prevents micro-jitter at button edges from resetting progress
        if (dwellTarget.current && !dwellGrace.current) {
          dwellGrace.current = setTimeout(() => {
            dwellTarget.current = null;
            dwellStart.current  = null;
            setDwellProgress(0);
            dwellGrace.current  = null;
            setActiveTarget(null);
          }, 300);
        }
      }

      // Draw hand skeleton
      const connections = [
        [0,1],[1,2],[2,3],[3,4],
        [0,5],[5,6],[6,7],[7,8],
        [0,9],[9,10],[10,11],[11,12],
        [0,13],[13,14],[14,15],[15,16],
        [0,17],[17,18],[18,19],[19,20],
        [5,9],[9,13],[13,17],
      ];
      ctx.strokeStyle = 'rgba(26,127,212,0.5)';
      ctx.lineWidth = 1.5;
      for (const [a, b] of connections) {
        const pa = hand[a], pb = hand[b];
        ctx.beginPath();
        ctx.moveTo((1 - pa.x) * canvas.width, pa.y * canvas.height);
        ctx.lineTo((1 - pb.x) * canvas.width, pb.y * canvas.height);
        ctx.stroke();
      }

    } else {
      // No hand detected
      if (dwellGrace.current) { clearTimeout(dwellGrace.current); dwellGrace.current = null; }
      dwellTarget.current = null;
      dwellStart.current  = null;
      setDwellProgress(0);
      setActiveTarget(null);
      setGestureCursor(null);
    }

    requestGestureFrame();
  }

  // ── Scoring ─────────────────────────────────────────────────────────────────
  async function scoreRound() {
    if (!isInitialized) return;

    const scoringStartTime = Date.now();
    const isCorrect = action.toUpperCase() === scenario.correctOption.toUpperCase();
    const overlayText = isCorrect ? randomFrom(CORRECT_TEXTS) : randomFrom(WRONG_TEXTS);

    // Step 1 (0ms) — holo rings + farewell bubble
    setChipBubble(randomFrom(CHIP_FAREWELL));
    triggerHolo();

    // Step 2 (1200ms) — hide chip, open modal with spinner
    setTimeout(() => {
      setChipVisible(false);
      setChipBubble(null);
      setShowResultsDialog(true);
    }, 1200);

    setIsScoring(true);
    setScoringFailed(false);
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

      // Fire overlay after modal has been visible minimum 1.5s
      const elapsed = Date.now() - scoringStartTime;
      const delay = Math.max(1500, 2600 - elapsed);
      setTimeout(() => {
        setVerdictOverlay({ type: isCorrect ? 'correct' : 'wrong', text: overlayText });
        setTimeout(() => setVerdictOverlay(null), 2200);
        if (isCorrect) launchConfetti();
      }, delay);

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

    const nextUsed = new Set(usedIndices);
    nextUsed.add(index);
    if (nextUsed.size >= personaScenarios.length) {
      nextUsed.clear();
    }

    const pool = Array.from({ length: personaScenarios.length }, (_, i) => i)
      .filter((i) => i !== index && !nextUsed.has(i));
    const nextIndex = pool.length > 0
      ? pool[Math.floor(Math.random() * pool.length)]
      : Math.floor(Math.random() * personaScenarios.length);

    setUsedIndices(nextUsed);
    setIndex(nextIndex);
    setServerScore(null);
    setShowJudgingPanel(false);
    setScoringFailed(false);
    setShowResultsDialog(false);
    setAction('');
    setChipBubble(randomFrom(CHIP_GREETINGS));
    setChipVisible(true);
    triggerBriefing();
    setScoreStatus(`You are the ${role}. Read the scenario and make your call.`);
  }

  if (!mounted) return null;

  if (showLanding) return (
    <div className="landing-shell">
      <div className="landing-card">
        <div className="landing-brand"><Sparkles size={28} /> AI Twin Challenge</div>
        <h1 className="landing-title">Step into your AI persona.<br />Make the call.</h1>

        <div className="landing-steps">
          {[
            { n: '1', label: 'Pick your role',            sub: 'Choose from CFO, CTO, General Counsel and more' },
            { n: '2', label: 'Generate your avatar',      sub: 'Snap a photo — we turn it into a 3D caricature' },
            { n: '3', label: 'Set your priorities',       sub: 'Adjust sliders for risk, compliance, growth & AI trust' },
            { n: '4', label: 'Face the scenario',         sub: 'Read a chaotic AI situation and pick your response' },
            { n: '5', label: 'See how your twin decides', sub: 'Get coached on what the ideal executive would have done' },
          ].map((s) => (
            <div className="landing-step" key={s.n}>
              <div className="landing-step-n">{s.n}</div>
              <div>
                <div className="landing-step-label">{s.label}</div>
                <div className="landing-step-sub">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <button
          className="primary-btn landing-cta"
          type="button"
          onClick={() => { setShowLanding(false); setSetupOpen(true); }}
        >
          Build my AI Twin →
        </button>
      </div>
    </div>
  );

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
                <div className="small">{role}</div>
              </div>
            </div>

            {/* Sliders */}
            <div className="sliders-header">Your priorities <span className="sliders-hint-inline">· affects your score</span></div>
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
            <div className="scenario-content" key={scenario.id}>

                <div className="scenario-briefing">
                {/* Persona-in-role banner */}
                {isInitialized && (
                  <div className="persona-banner">
                    You are the <strong>{role}</strong> — how do you respond?
                  </div>
                )}

              <div className="scenario-tag">{scenario.personaFocus.join(' · ')}</div>
                <h1 className="scenario-title">{scenario.title}</h1>
                <p className="scenario-summary">{scenario.summary}</p>
                <p className="scenario-situation">{scenario.situation}</p>
              </div>

              <div className="decision-zone">
                <div className="decision-zone-header">
                  <div className="decision-zone-label">What would you do as the {role}?</div>
                  {isInitialized && chipVisible && (
                    <div className={`avatar-chip-wrap${chipWiggle ? ' chip-wiggle' : ''}${holoActive ? ' chip-holo' : ''}`}>
                      {chipBubble && (
                        <div className="avatar-chip-bubble" key={chipBubble}>{chipBubble}</div>
                      )}
                      <img src={resolvedAvatarSrc} alt="Twin" className="avatar-chip-img" />
                      {holoActive && (
                        <div className="chip-holo-rings">
                          <span className="holo-ring holo-ring-1" />
                          <span className="holo-ring holo-ring-2" />
                          <span className="holo-ring holo-ring-3" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
                  <div className="choice-grid">
                    {scenario.options.map((opt, i) => (
                      <button
                        key={opt.code}
                        ref={el => { optionRefs.current[i] = el; }}
                        type="button"
                        className={`choice ${
                          action === opt.code ? 'active' : ''
                        } ${
                          showJudgingPanel && opt.code === scenario.correctOption ? 'correct' : ''
                        } ${
                          showJudgingPanel && action === opt.code && opt.code !== scenario.correctOption ? 'wrong' : ''
                        }`}
                        onClick={() => {
                          setAction(opt.code);
                          setChipBubble(randomFrom(CHIP_REACTIONS));
                          setChipWiggle(true);
                          window.setTimeout(() => {
                            setChipWiggle(false);
                          }, 700);
                        }}
                        disabled={!isInitialized || showJudgingPanel || briefingActive}
                      >
                        <span className="choice-code">{opt.code}</span>
                        <span className="choice-label">{opt.label}</span>
                        {showJudgingPanel && opt.code === scenario.correctOption && (
                          <span className="choice-result-icon choice-correct-icon">✓</span>
                        )}
                        {showJudgingPanel && action === opt.code && opt.code !== scenario.correctOption && (
                          <span className="choice-result-icon choice-wrong-icon">✗</span>
                        )}                 
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
                  className={`ghost-btn ${activeTarget === 'edit' ? 'gesture-target-active' : ''}`}
                  ref={btnEditRef}
                  type="button"
                  onClick={() => setSetupOpen(true)}
                  title="Edit your AI Twin profile"
                >
                  ✎ Edit profile
                </button>
                <button
                  className={`secondary-btn ${activeTarget === 'next' ? 'gesture-target-active' : ''}`}
                  ref={btnNextRef}
                  type="button"
                  onClick={nextScenario}
                  disabled={!isInitialized || isScoring }
                  title={showJudgingPanel ? 'Already scored — your round is complete' : undefined}
                >
                  Try another scenario
                </button>

                {showJudgingPanel && !isScoring ? (
                  <button className="primary-btn" type="button" onClick={() => setShowResultsDialog(true)}>
                    View my results
                  </button>
                ) : (
                  <button
                    className={`primary-btn ${activeTarget === 'submit' ? 'gesture-target-active' : ''}`}
                    ref={btnSubmitRef}
                    type="button"
                    onClick={scoreRound}
                    disabled={!isInitialized || isScoring || !action }
                  >
                    {isScoring
                      ? <span className="btn-inline"><LoaderCircle size={15} className="spin" /> Asking your Twin…</span>
                      : 'How would my Twin decide?'}
                  </button>
                )}
              </div>              
            </div>
          </section>
        </section>
      </main>

      {/* ── Verdict overlay ── */}
      {verdictOverlay && (
        <div className={`verdict-overlay verdict-overlay--${verdictOverlay.type}`}>
          <div className="verdict-overlay-text">
            {verdictOverlay.text}
          </div>
        </div>
      )}

      {/* ── Mission briefing overlay ── */}
      {briefingActive && (
        <div className="briefing-overlay">
          <div className="briefing-scanline" />
          <div className="briefing-stamp">
            <span className="briefing-stamp-dot" />
              {randomFrom(BRIEFING_TEXTS)}
            <span className="briefing-stamp-dot" />
          </div>
        </div>
      )}

      {/* ── Dwell firing overlay ── */}
      {dwellFiring && (
        <div className="dwell-firing-overlay">
          <div className="dwell-firing-text">{dwellFiring}</div>
        </div>
      )}

      {/* ── Gesture screen cursor ── */}
      {GESTURE_ENABLED && gestureActive && !gesturePaused && gestureCursor && (
        <div
          className={`gesture-cursor ${activeTarget ? 'gesture-cursor--hover' : ''}`}
          style={{ left: gestureCursor.x, top: gestureCursor.y }}
        >
          <div className="gesture-cursor__ring" />
          <div className="gesture-cursor__dot" />
          {activeTarget && (
            <div className="gesture-cursor__label">
              {activeTarget === 'edit'    ? 'Edit profile'    :
              activeTarget === 'next'    ? 'Next scenario'   :
              activeTarget === 'submit'  ? 'Hold to submit'  :
              activeTarget?.startsWith('option-')
                ? `Option ${activeTarget.replace('option-', '')}`
                : ''}
            </div>
          )}
          {activeTarget && dwellProgress > 0 && (
            <svg className="gesture-cursor__dwell" viewBox="0 0 44 44">
              {/* Background track */}
              <circle
                cx="22" cy="22" r="20"
                fill="none"
                stroke="rgba(245,197,24,0.15)"
                strokeWidth="3"
              />
              {/* Glowing fill arc */}
              <circle
                cx="22" cy="22" r="20"
                fill="none"
                stroke="rgba(245,197,24,1)"
                strokeWidth="3.5"
                strokeDasharray={`${2 * Math.PI * 20}`}
                strokeDashoffset={`${2 * Math.PI * 20 * (1 - dwellProgress / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 22 22)"
                style={{
                  filter: 'drop-shadow(0 0 4px rgba(245,197,24,0.9))',
                  transition: 'stroke-dashoffset 0.05s linear',
                }}
              />
              {/* Center fill indicator — grows as progress increases */}
              <circle
                cx="22" cy="22"
                r={`${(dwellProgress / 100) * 8}`}
                fill="rgba(245,197,24,0.6)"
              />
            </svg>
          )}
        </div>
      )}

      {/* ── Gesture control panel ── */}
      {GESTURE_ENABLED && isInitialized && !setupOpen && (
        <div className="gesture-panel">
          <div className="gesture-panel__header">
            <span className="gesture-panel__title">👋 Gesture Control</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`gesture-panel__status ${
                gesturePaused ? 'is-paused' :
                gestureReady  ? 'is-ready'  : 'is-waiting'
              }`}>
                {gesturePaused ? '⏸ Paused' : gestureReady ? '● Ready' : gestureError ? '✕ Error' : '◌ Loading…'}
              </span>
              <button
                className="gesture-toggle-btn"
                type="button"
                onClick={() => setGesturePaused(p => !p)}
                title={gesturePaused ? 'Enable gesture control' : 'Disable gesture control'}
              >
                {gesturePaused ? '▶' : '⏸'}
              </button>
            </div>
          </div>
          <div className="gesture-panel__camera">
            <video
              ref={gestureVideoRef}
              className="gesture-panel__video"
              autoPlay playsInline muted
            />
            <canvas ref={gestureCanvasRef} className="gesture-panel__canvas" />
          </div>
          <div className="gesture-panel__meta">
            {gestureError
              ? <span className="gesture-panel__error">⚠ {gestureError}</span>
              : <span className="gesture-panel__hint">
                  Point at a button · Hold still 2s to activate
                </span>
            }
            {activeTarget && (
              <span style={{ color: '#f7c948', fontWeight: 700 }}>
                → {activeTarget === 'edit' ? 'Edit profile' : activeTarget === 'next' ? 'Next scenario' : 'Submit'}
              </span>
            )}
          </div>
        </div>
      )}
      
      {/* ── Setup modal ── */}
      {setupOpen && (
        <div className="setup-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="setup-title" onClick={(e) => { if (e.target === e.currentTarget) { stopCamera(); setSetupOpen(false); } }}>
          <div className="setup-modal">
            <div className="setup-modal-header">
              <div className="setup-kicker">Step 1 of 1</div>
              <h2 id="setup-title">Build your AI Twin</h2>
              <p>Choose your business persona, capture your photo, and generate your avatar before entering the challenge.</p>
            </div>

            <div className="setup-modal-body">
              <div className="setup-grid">
                {/* Left */}
                <div className="setup-form">
                  <div className="field-group">
                    <label className="label" htmlFor="role-select">Business persona</label>
                    <select id="role-select" className="select" value={role} onChange={(e) => setRole(e.target.value)}>
                      <option value="Head of Public Affairs">Head of Public Affairs</option>
                      <option value="Chief Risk Officer (CRO)">Chief Risk Officer (CRO)</option>
                      <option value="Chief Financial Officer (CFO)">Chief Financial Officer (CFO)</option>
                      <option value="Head of HR">Head of HR</option>
                      <option value="General Counsel (GC)">General Counsel (GC)</option>
                      <option value="Chief Technology Officer (CTO)">Chief Technology Officer (CTO)</option>
                      <option value="Head - Data & AI">Head - Data & AI</option>
                      <option value="Head of Global Operations">Head of Global Operations</option>
                      <option value="VP - Operations">VP - Operations</option>
                    </select>
                  </div>
                  <div style={{ display: 'none' }}>
                    <label className="label" htmlFor="style-select">Avatar style</label>
                    <select id="style-select" className="select" value={avatarStyle} onChange={(e) => setAvatarStyle(e.target.value as AvatarStyleValue)}>
                      {avatarStyleOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="setup-toolbar">
                    <button className="icon-btn" type="button" onClick={cameraOpen ? stopCamera : startCamera} aria-label="Toggle camera" disabled={isGeneratingAvatar}>
                      {cameraOpen ? <CameraOff size={15} /> : <Camera size={15} />}
                    </button>
                    <button className="secondary-btn compact-btn" type="button" onClick={() => { cancelCountdown(); capturePhoto(); }} disabled={!videoReady || isGeneratingAvatar}>
                      {cameraOpen && !videoReady ? 'Starting…' : 'Capture now'}
                    </button>
                    <button className="primary-btn compact-btn" type="button" onClick={() => generateAvatar()} disabled={!selectedImageBase64 || isGeneratingAvatar}>
                      {isGeneratingAvatar ? 'Generating…' : 'Generate avatar'}
                    </button>
                  </div>
                </div>

                {/* Right — preview */}
                <div className="setup-preview">
                  <div className="setup-preview-card">
                    <div className="setup-preview-header">
                      <span>Preview</span>
                      <span className="preview-persona-name">{personaName}</span>
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
                            <div className="camera-guide-frame" ref={guideFrameRef} />
                            <div className="camera-guide-text">Center your face in the frame</div>
                          </div>
                          {countdown !== null && (
                            <div className="camera-countdown-overlay">
                              <div className="camera-countdown-number">{countdown}</div>
                              <div className="camera-countdown-label">Auto-capturing…</div>
                              <button
                                className="camera-countdown-cancel"
                                type="button"
                                onClick={cancelCountdown}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
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
                            <div className="twin-ring-c" />
                            <span className="twin-spinner-icon"><Bot size={20} /></span>
                          </div>
                          <div className="avatar-generating-title">Creating your AI Twin…</div>
                          <LoadingQuip quips={AVATAR_QUIPS} />
                        </div>
                      )}
                    </div>
                    <div className="setup-preview-meta">
                      <div className="active-avatar-name">{personaName}</div>
                      <div className="small">{role}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="setup-modal-footer">
              {isInitialized && (
                <button className="secondary-btn" type="button" onClick={() => { stopCamera(); setSetupOpen(false); }}>Cancel</button>
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
          onClick={(e) => { if (e.target === e.currentTarget) { setShowResultsDialog(false); setShowJudgingPanel(true); } }}
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
              <button className="results-close-btn" type="button" onClick={() => { setShowResultsDialog(false); setShowJudgingPanel(true); }} aria-label="Close">✕</button>
            </div>

            {/* Body */}
            <div className="results-modal-body">
              {isScoring ? (
                <div className="score-loading" style={{ padding: '60px 20px' }}>
                  <div className="score-spinner-wrap">
                    <div className="twin-spinner twin-spinner-lg">
                      <div className="twin-ring ring-a" />
                      <div className="twin-ring ring-b" />
                      <div className="twin-ring-c" />
                      <span className="twin-spinner-icon">🧠</span>
                    </div>
                  </div>
                  <div className="score-loading-title">Your Twin is on it…</div>
                  <LoadingQuip quips={LOADING_QUIPS}/>
                </div>
              ) : (
                <>
                  {scoringFailed && (
                    <div className="score-fallback-note small" style={{ marginBottom: 16 }}>
                      ⚠ Live AI judging unavailable — showing estimated results.
                    </div>
                  )}

                  {/* ── 1. Score hero ── */}
                  <div className="results-hero">
                    <div className="results-hero-left">
                      {resolvedAvatarSrc && (
                        <img
                          src={resolvedAvatarSrc}
                          alt="Your avatar"
                          className="results-avatar"
                        />
                      )}
                      <div className="results-avatar-name">{personaName}</div>
                    </div>
                    <div className="results-hero-right">
                      <div className="results-action-compare">
                        <div className="rac-col">
                          <div className="rac-label">Your call</div>
                          <div className="rac-value rac-value--user">
                            {action
                              ? (scenario.options.find(o => o.code === action)?.label ?? action)
                              : '—'}
                          </div>
                        </div>
                        <div className="rac-vs">vs</div>
                        <div className="rac-col">
                          <div className="rac-label">The Right Call</div>
                          <div className="rac-value rac-value--ai">
                            {scenario.options.find(o => o.code === scenario.correctOption)?.label ?? scenario.correctOption}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── 2. Coach narrative ── */}
                  <div className="results-section">
                    <div className="results-section-title">Coach's take</div>
                    <p className="results-narrative">
                      <Typewriter text={activeScore.coachNarrative} />
                    </p>
                  </div>

                  {/* ── 3. Key gaps — only shown when gaps exist ── */}
                  <div className="results-section">
                    <div className="results-section-title">Your profile vs ideal {role}</div>
                    <div className="results-gaps">
                      {activeScore.gaps.map((g) => (
                        <div className="results-gap-row" key={g.label}>
                          <span className="results-gap-label">{g.label}</span>
                          <span className="results-gap-nums">{g.user} <span className="results-gap-arrow">→</span> {g.ideal} ideal</span>
                          <DeltaPill direction={g.direction} />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="results-modal-footer">
               <button
                className={`ghost-btn ${activeTarget === 'edit' ? 'gesture-target-active' : ''}`}
                type="button"
                onClick={() => { setShowResultsDialog(false); setSetupOpen(true); }}
              >
                ✎ Edit profile
              </button>
              <button className="secondary-btn" type="button" onClick={() => { setShowResultsDialog(false); setShowJudgingPanel(true); }}>
                Back to scenario
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

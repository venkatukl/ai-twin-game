'use client';

import { Bot, Camera, CameraOff, LoaderCircle, Pencil, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import scenarios from '@/data/scenarios.json';
import { Maximize2, Minimize2 } from 'lucide-react';

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

  const ROLES = [
    { value: 'Head of Public Affairs',       emoji: '📢', short: 'Public Affairs' },
    { value: 'Chief Risk Officer (CRO)',      emoji: '🛡️', short: 'Risk Officer' },
    { value: 'Chief Financial Officer (CFO)', emoji: '💰', short: 'CFO' },
    { value: 'Head of HR',                   emoji: '🤝', short: 'HR Head' },
    { value: 'General Counsel (GC)',          emoji: '⚖️', short: 'Legal Counsel' },
    { value: 'Chief Technology Officer (CTO)',emoji: '💻', short: 'CTO' },
    { value: 'Head - Data & AI',             emoji: '🤖', short: 'Data & AI' },
    { value: 'Head of Global Operations',    emoji: '🌍', short: 'Global Ops' },
    { value: 'VP - Operations',              emoji: '⚙️', short: 'VP Operations' },
  ];

  // Default slider presets per role — auto-applied on selection
  const ROLE_PRESETS: Record<string, { risk: number; compliance: number; growth: number; aiTrust: number; aiCost: number }> = {
    'Head of Public Affairs':        { risk: 35, compliance: 70, growth: 55, aiTrust: 50, aiCost: 45 },
    'Chief Risk Officer (CRO)':      { risk: 20, compliance: 90, growth: 30, aiTrust: 45, aiCost: 50 },
    'Chief Financial Officer (CFO)': { risk: 40, compliance: 80, growth: 50, aiTrust: 55, aiCost: 60 },
    'Head of HR':                    { risk: 35, compliance: 75, growth: 60, aiTrust: 60, aiCost: 45 },
    'General Counsel (GC)':          { risk: 25, compliance: 95, growth: 35, aiTrust: 40, aiCost: 50 },
    'Chief Technology Officer (CTO)':{ risk: 60, compliance: 55, growth: 80, aiTrust: 85, aiCost: 65 },
    'Head - Data & AI':              { risk: 55, compliance: 60, growth: 75, aiTrust: 90, aiCost: 70 },
    'Head of Global Operations':     { risk: 45, compliance: 75, growth: 60, aiTrust: 65, aiCost: 55 },
    'VP - Operations':               { risk: 40, compliance: 70, growth: 55, aiTrust: 60, aiCost: 50 },
  };

  const FIST_REACTIONS = [
    '✊ Power move!',
    '🥊 Easy there, champ!',
    '💪 We felt that!',
    '✊ Hulk smash!',
    '🤜 Knuckles detected!',
  ];
  
  const PALM_REACTIONS = [
    '🖐️ High five!',
    '✋ Stop right there!',
    '🖐️ Talk to the hand!',
    '✋ Jazz hands!',
    '🖐️ Whoa, calm down!',
  ];

  const VICTORY_REACTIONS = [
    '✌️ Peace out!',
    '✌️ Victory is yours!',
    '🤞 Fingers crossed!',
    '✌️ Two fingers, big decisions!',
    '✌️ Nice V sign!',
  ];

  const THUMBUP_REACTIONS = [
    '👍 You approve!',
    '👍 Great enthusiasm!',
    '👍 CEO energy!',
    '👍 Board approves!',
    '👍 That\'s the spirit!',
  ];

  const THUMBDOWN_REACTIONS = [
    '👎 Harsh critic!',
    '👎 The board disagrees!',
    '👎 Rejected!',
    '👎 Risk appetite: zero!',
    '👎 CFO says no!',
  ];

  const [sliderAnimating, setSliderAnimating] = useState(false);
  const sliderAnimRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const roleCardRefs = useRef<(HTMLButtonElement | null)[]>(
    Array(ROLES.length).fill(null)
  );
  const btnPersonaNextRef = useRef<HTMLButtonElement | null>(null);

  type GameScreen = 'landing' | 'persona' | 'capture' | 'game' | 'results';
  const [gameScreen, setGameScreen] = useState<GameScreen>('landing');

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
  const [setupOpen,            setSetupOpen]            = useState(false);
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
  const btnLandingRef     = useRef<HTMLButtonElement | null>(null);
  const btnRestartRef     = useRef<HTMLButtonElement | null>(null);
  const sliderDecRefs     = useRef<(HTMLButtonElement | null)[]>(Array(5).fill(null));
  const sliderIncRefs     = useRef<(HTMLButtonElement | null)[]>(Array(5).fill(null));
  const [gestureReaction, setGestureReaction] = useState<string | null>(null);
  const reactionTimeout   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastGestureRef    = useRef<string | null>(null);
  const gestureHoldFrames = useRef(0);
  const [autoRestartSeconds, setAutoRestartSeconds] = useState<number | null>(null);
  const autoRestartRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const [guideExpanded, setGuideExpanded] = useState(false);

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

  const [isFullscreen, setIsFullscreen] = useState(false);
  
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
  useEffect(() => { if (gameScreen === 'capture') setAvatarStyle(randomAvatarStyle()); }, [gameScreen]);

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
    if (gameScreen !== 'game' && gameScreen !== 'landing' && gameScreen !== 'persona' && gameScreen !== 'results') {
      stopGestureCamera();
      return;
    }
    if (gesturePaused) { stopGestureCamera(); return; }
    startGestureCamera();
    return () => stopGestureCamera();
  }, [GESTURE_ENABLED, gameScreen, gesturePaused]);

  
  useEffect(() => {
    if (gameScreen === 'persona') {
      setRisk(0); setCompliance(0); setGrowth(0); setAiTrust(0); setAiCost(0);
      setTimeout(() => selectRole(role), 400);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameScreen]);

  useEffect(() => {
    if (gameScreen === 'capture') {
      // Small delay so screen renders first, then camera opens
      setTimeout(() => startCamera(), 300);
    } else {
      stopCamera();
      cancelCountdown();
    }
  }, [gameScreen]);

  useEffect(() => {
    if (gameScreen === 'results') {
      // Start 30s countdown
      setAutoRestartSeconds(30);
      let remaining = 30;
      autoRestartRef.current = setInterval(() => {
        remaining -= 1;
        setAutoRestartSeconds(remaining);
        if (remaining <= 0) {
          clearInterval(autoRestartRef.current!);
          autoRestartRef.current = null;
          setAutoRestartSeconds(null);
          resetGame();
        }
      }, 1000);
    } else {
      // Clean up if leaving results screen early
      if (autoRestartRef.current) {
        clearInterval(autoRestartRef.current);
        autoRestartRef.current = null;
      }
      setAutoRestartSeconds(null);
    }
  }, [gameScreen]);


  // Full - Screen toggle
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);


  function triggerGestureReaction(text: string) {
    if (reactionTimeout.current) clearTimeout(reactionTimeout.current);
    setGestureReaction(text);
    reactionTimeout.current = setTimeout(() => setGestureReaction(null), 1000);
  }

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
    finally  { 
        setIsGeneratingAvatar(false);
        // Auto-advance to game screen after brief avatar reveal
        if (gameScreen === 'capture') {
          setTimeout(() => {
            completeSetup();
          }, 1800); // show avatar for 1.8s then advance
        }
     }
}

  function completeSetup() {
    stopCamera();
    setAvatarSrc(avatarSrc || sourceImageSrc || fallbackAvatarSrc);
    setIsInitialized(true);
    setGameScreen('game');
    triggerBriefing();
    setChipBubble(randomFrom(CHIP_GREETINGS));
    setChipVisible(true);
    setScoreStatus(`You are the ${role}. Read the scenario and make your call.`);
    setGesturePaused(false);
  }

  function selectRole(newRole: string) {
    setRole(newRole);
    const preset = ROLE_PRESETS[newRole];
    if (!preset) return;

    if (sliderAnimRef.current) clearInterval(sliderAnimRef.current);
    setSliderAnimating(true);

    const startRisk       = risk;
    const startCompliance = compliance;
    const startGrowth     = growth;
    const startAiTrust    = aiTrust;
    const startAiCost     = aiCost;

    const steps = 45;
    let step = 0;

    sliderAnimRef.current = setInterval(() => {
      step++;
      const t    = step / steps;
      const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out

      // Staggered start — each slider begins slightly later
      setRisk(step < 3  ? startRisk       : Math.round(startRisk       + (preset.risk        - startRisk)       * Math.max(0, ease - 0.10)));
      setCompliance(step < 5  ? startCompliance : Math.round(startCompliance + (preset.compliance - startCompliance) * Math.max(0, ease - 0.05)));
      setGrowth(step < 7  ? startGrowth     : Math.round(startGrowth     + (preset.growth      - startGrowth)     * Math.max(0, ease)));
      setAiTrust(step < 4  ? startAiTrust   : Math.round(startAiTrust   + (preset.aiTrust     - startAiTrust)    * Math.max(0, ease - 0.08)));
      setAiCost(step < 6  ? startAiCost    : Math.round(startAiCost    + (preset.aiCost      - startAiCost)     * Math.max(0, ease - 0.12)));

      if (step >= steps) {
        clearInterval(sliderAnimRef.current!);
        sliderAnimRef.current = null;
        setSliderAnimating(false);
        // Snap to exact values
        setRisk(preset.risk);
        setCompliance(preset.compliance);
        setGrowth(preset.growth);
        setAiTrust(preset.aiTrust);
        setAiCost(preset.aiCost);
      }
    }, 20);
  }

  function resetGame() {
    // Reset all game state to initial values
    setGameScreen('landing');
    setRole('Head of Public Affairs');
    setRisk(35);
    setCompliance(85);
    setGrowth(70);
    setAiTrust(55);
    setAiCost(40);
    setAction('');
    setAvatarSrc(null);
    setSourceImageSrc(null);
    setSelectedImageBase64(null);
    setIsInitialized(false);
    setShowJudgingPanel(false);
    setShowResultsDialog(false);
    setServerScore(null);
    setScoringFailed(false);
    setChipVisible(false);
    setChipBubble(null);
    setUsedIndices(new Set());
    setIndex(Math.floor(Math.random() * scenarios.length));
    setGesturePaused(false);
    stopGestureCamera();
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
    setGestureReaction(null);
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
        { key: 'landing',      ref: btnLandingRef },
        { key: 'persona-next', ref: btnPersonaNextRef },
        { key: 'edit',         ref: btnEditRef },
        { key: 'next',         ref: btnNextRef },
        { key: 'submit',       ref: btnSubmitRef },
        { key: 'restart',      ref: btnRestartRef },
        ...ROLES.map((r, i) => ({
          key: `role-${i}`,
          ref: { current: roleCardRefs.current[i] },
        })),
        ...scenario.options.map((opt, i) => ({
          key: `option-${opt.code}`,
          ref: { current: optionRefs.current[i] },
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          key: `slider-dec-${i}`,
          ref: { current: sliderDecRefs.current[i] },
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          key: `slider-inc-${i}`,
          ref: { current: sliderIncRefs.current[i] },
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

      // Funny reactions for non-click gestures
      const gestures = results.gestures?.[0];
      const topGesture = gestures?.[0]?.categoryName;

      if (topGesture && topGesture !== 'None') {
        if (topGesture === lastGestureRef.current) {
          gestureHoldFrames.current++;
        } else {
          lastGestureRef.current = topGesture;
          gestureHoldFrames.current = 0;
        }
        
        // Only trigger reaction on the 10th frame — gesture is stable
        if (gestureHoldFrames.current === 10) {

          // Thumb up — enlarge guide
            if (topGesture === 'Thumb_Up') {
              setGuideExpanded(true);
            }
            // Victory — collapse guide
            if (topGesture === 'Victory') {
              setGuideExpanded(false);
            }

          // if (topGesture === 'Open_Palm' && !dwellTarget.current) {
          //   triggerGestureReaction(randomFrom(PALM_REACTIONS));
          // }
          //if (topGesture === 'Victory') triggerGestureReaction(randomFrom(VICTORY_REACTIONS));
          //if (topGesture === 'Thumb_Up') {
            // Toggle guide AND show reaction
            //setGuideExpanded(true);
            //triggerGestureReaction(guideExpanded ? '👍 Guide closed!' : '👍 Enlarging guide!');
          //}
          //if (topGesture === 'Thumb_Up') triggerGestureReaction(randomFrom(THUMBUP_REACTIONS));
          //if (topGesture === 'Thumb_Down') triggerGestureReaction(randomFrom(THUMBDOWN_REACTIONS));
          if (topGesture === 'Closed_Fist') triggerGestureReaction(randomFrom(FIST_REACTIONS));
        }
      } else {
        lastGestureRef.current = null;
        gestureHoldFrames.current = 0;
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
              const label = hit === 'landing'      ? '✓ Starting…'
                : hit === 'persona-next' ? '✓ On to your photo!'
                : hit === 'edit'         ? '✓ Edit profile'
                : hit === 'next'         ? '✓ Next scenario'
                : hit === 'submit'       ? '✓ Submitting…'
                : hit === 'restart'      ? '✓ Play again'
                : hit?.startsWith('role-')
                  ? `✓ ${ROLES[parseInt(hit.replace('role-', ''))]?.short}`
                : hit?.startsWith('option-')
                  ? `✓ Option ${hit.replace('option-', '')} selected`
                : hit?.startsWith('slider-dec-')
                  ? `✓ Decreasing ${['Risk','Compliance','Growth','AI Trust','AI Cost'][parseInt(hit.replace('slider-dec-',''))]}`
                : hit?.startsWith('slider-inc-')
                  ? `✓ Increasing ${['Risk','Compliance','Growth','AI Trust','AI Cost'][parseInt(hit.replace('slider-inc-',''))]}`
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
      setGameScreen('results');
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
    setAction('');
    setChipBubble(randomFrom(CHIP_GREETINGS));
    setChipVisible(true);
    triggerBriefing();
    setScoreStatus(`You are the ${role}. Read the scenario and make your call.`);
  }

  if (!mounted) return null;

  if (gameScreen === 'landing') return (
    <>
      <div className="landing-shell">       
        <div className="landing-card">
          <div className="landing-brand"><Sparkles size={26} /> AI Twin Challenge</div>
          <h1 className="landing-title">Step into your AI persona.<br />Make the call.</h1>

          <div className="landing-gesture-hint">
            <span className="landing-gesture-hint-icon">👋</span>
            Use hand gestures to navigate — point your finger and hold still to select
          </div>

          <div className="landing-cards-row">

            <div className="landing-step-card">
              <div className="landing-step-card-number">1</div>
              <div className="landing-step-card-icon">🧑‍💼</div>
              <div className="landing-step-card-title">Select Role &amp;<br />Snap Your Photo.</div>
              <div className="landing-step-card-sub">Choose your executive persona — we turn your face into a 3D caricature automatically.</div>
            </div>

            <div className="landing-step-card landing-step-card--mid">
              <div className="landing-step-card-number">2</div>
              <div className="landing-step-card-icon">🎚️</div>
              <div className="landing-step-card-title">Set Executive<br />Priorities &amp; Risk.</div>
              <div className="landing-step-card-sub">Tune your risk appetite, compliance, growth and AI trust to match your style.</div>
            </div>

            <div className="landing-step-card">
              <div className="landing-step-card-number">3</div>
              <div className="landing-step-card-icon">🎯</div>
              <div className="landing-step-card-title">Play Scenario<br />&amp; Get Coached.</div>
              <div className="landing-step-card-sub">Face real AI chaos. Make your call. See how your Twin would decide.</div>
            </div>

          </div>

          <button
            ref={btnLandingRef}
            className="primary-btn landing-cta"
            type="button"
            onClick={() => setGameScreen('persona')}
          >
            Build my AI Twin →
          </button>

          <div className="landing-cta-hint">
            Point at the button above and hold your finger still for 2 seconds to start
          </div>
        </div>
      </div>

      <>
        {guideExpanded && (
          <div
            className="gesture-guide-backdrop"
            onClick={() => setGuideExpanded(false)}
          />
        )}
        <div
          className={`gesture-guide-image-wrap ${guideExpanded ? 'gesture-guide-expanded' : ''}`}
          onClick={() => setGuideExpanded(false)}
        >
          <img src="/gesture-guide.png" alt="Gesture guide" className="gesture-guide-image" />
          {!guideExpanded && (
            <div className="gesture-guide-expand-hint">👍 to enlarge · ✌️ to close</div>
          )}
        </div>
      </>

      {renderGestureCursor()}
      {renderGesturePanel()}
      
    </>
  );

  // ── Screen 2: Persona ────────────────────────────────────────────────────
  if (gameScreen === 'persona') return (
    <>
      <div className="persona-shell">
        <div className="persona-card">

          {/* Header */}
          <div className="persona-header">
            <div className="landing-brand"><Sparkles size={20} /> AI Twin Challenge</div>
            <div className="persona-step-indicator">Choose your role</div>
          </div>

          {/* Role grid */}
          <div className="persona-roles-grid">
            {ROLES.map((r, i) => (
              <button
                key={r.value}
                ref={el => { roleCardRefs.current[i] = el; }}
                type="button"
                className={`persona-role-card ${role === r.value ? 'persona-role-card--selected' : ''}`}
                onClick={() => selectRole(r.value)}
              >
                <span className="persona-role-emoji">{r.emoji}</span>
                <span className="persona-role-label">{r.short}</span>
                {role === r.value && <span className="persona-role-check">✓</span>}
              </button>
            ))}
          </div>

          {/* Sliders */}
          <div className="persona-sliders-section">
            <div className="persona-sliders-title">
              Your priorities
              <span className="sliders-hint-inline"> · auto-set for your role, adjust if needed</span>
            </div>
            <div className="persona-sliders-grid">
              {[
                { label: 'Risk appetite',      value: risk,       set: setRisk,       key: 'risk' },
                { label: 'Compliance focus',   value: compliance, set: setCompliance, key: 'comp' },
                { label: 'Growth drive',       value: growth,     set: setGrowth,     key: 'grow' },
                { label: 'AI trust',           value: aiTrust,    set: setAiTrust,    key: 'ait' },
                { label: 'AI cost discipline', value: aiCost,     set: setAiCost,     key: 'aic' },
              ].map((s, si) => (
                <div key={s.key} className={`persona-slider-row ${sliderAnimating ? 'slider-animating' : ''}`}>
                  <div className="persona-slider-label-row">
                    <span className="persona-slider-label">{s.label}</span>
                    <span className="persona-slider-value">{s.value}</span>
                  </div>
                  <div className="persona-slider-controls">
                    <button
                      ref={el => { sliderDecRefs.current[si] = el; }}
                      type="button"
                      className="slider-adj-btn"
                      onClick={() => s.set(Math.max(0, s.value - 10))}
                      disabled={sliderAnimating}
                    >−</button>
                    <input
                      type="range" min={0} max={100}
                      value={s.value}
                      className="input"
                      onChange={e => s.set(Number(e.target.value))}
                    />
                    <button
                      ref={el => { sliderIncRefs.current[si] = el; }}
                      type="button"
                      className="slider-adj-btn"
                      onClick={() => s.set(Math.min(100, s.value + 10))}
                      disabled={sliderAnimating}
                    >+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Next button */}
          <button
            ref={btnPersonaNextRef}
            className="primary-btn persona-next-btn"
            type="button"
            onClick={() => setGameScreen('capture')}
          >
            Next — Capture your photo →
          </button>
        </div>
      </div>

      {renderGestureCursor()}
      {renderGesturePanel()}
    </>
  );

  // ── Screen 3: Capture ────────────────────────────────────────────────────
  if (gameScreen === 'capture') return (
    <div className="capture-shell">

      {/* Ambient title */}
      <div className="capture-title-wrap">
        <div className="landing-brand"><Sparkles size={20} /> AI Twin Challenge</div>
        <h2 className="capture-title">
          {isGeneratingAvatar ? 'Creating your AI Twin…' :
          avatarSrc ? 'Meet your Twin!' :
          'Smile — your Twin is about to be born'}
        </h2>
      </div>

      {/* Main preview area */}
      <div className="capture-preview-wrap">
        {/* Camera live feed */}
        {cameraOpen && !selectedImageBase64 && (
          <div className="capture-camera-stage">
            <video
              ref={videoRef}
              autoPlay playsInline muted
              onCanPlay={() => setVideoReady(true)}
              className="capture-video"
            />
            {/* Countdown overlay */}
            {countdown !== null && (
              <div className="capture-countdown-overlay">
                <div className="capture-countdown-number">{countdown}</div>
                <div className="capture-countdown-label">Get ready…</div>
              </div>
            )}
            {/* Face guide ring */}
            <div className="capture-face-guide">
              <span className="guide-corner guide-corner--tl" />
              <span className="guide-corner guide-corner--tr" />
              <span className="guide-corner guide-corner--bl" />
              <span className="guide-corner guide-corner--br" />
            </div>
          </div>
        )}

        {/* Captured photo — shown briefly before generation */}
        {selectedImageBase64 && !isGeneratingAvatar && !avatarSrc && (
          <div className="capture-photo-reveal">
            <img
              src={`data:${selectedMimeType};base64,${selectedImageBase64}`}
              alt="Captured"
              className="capture-photo-img"
            />
            <div className="capture-photo-label">Got it! Generating your Twin…</div>
          </div>
        )}

        {/* Generating spinner */}
        {isGeneratingAvatar && (
          <div className="capture-generating">
            <div className="capture-spinner">
              <div className="capture-ring capture-ring-a" />
              <div className="capture-ring capture-ring-b" />
              <span className="capture-spinner-icon" style={{ fontSize: '28px' }}>🤖</span>
            </div>
            <div className="capture-generating-title">Creating your AI Twin…</div>
            <LoadingQuip quips={AVATAR_QUIPS} />
          </div>
        )}

        {/* Avatar reveal */}
        {avatarSrc && !isGeneratingAvatar && (
          <div className="capture-avatar-reveal">
            <img
              src={avatarSrc}
              alt="Your AI Twin"
              className="capture-avatar-img"
            />
            <div className="capture-avatar-name">{personaName}</div>
            <div className="capture-avatar-role">{role}</div>
          </div>
        )}        
      </div>

      {/* Separate overlay — sits above the preview box entirely */}
      {avatarSrc && !isGeneratingAvatar && (
        <div className="capture-avatar-entering">⚡ Entering the challenge…</div>
      )}

    </div>
  );

  function renderGestureCursor() {
    return (
      <>
        <button
          className="fullscreen-btn-fixed"
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        {dwellFiring && (
          <div className="dwell-firing-overlay">
            <div className="dwell-firing-text">{dwellFiring}</div>
          </div>
        )}
        {gestureReaction && (
          <div className="gesture-reaction-overlay">
            <div className="gesture-reaction-text">{gestureReaction}</div>
          </div>
        )}
        {GESTURE_ENABLED && gestureActive && !gesturePaused && gestureCursor && (
          <div
            className={`gesture-cursor ${activeTarget ? 'gesture-cursor--hover' : ''}`}
            style={{ left: gestureCursor.x, top: gestureCursor.y }}
          >
            <div className="gesture-cursor__ring" />
            <div className="gesture-cursor__dot" />
            {activeTarget && (
              <div className="gesture-cursor__label">
                {activeTarget === 'submit'  ? 'Hold to submit'  :
                activeTarget === 'restart' ? 'Play again' :
                activeTarget?.startsWith('option-')
                  ? `Option ${activeTarget.replace('option-', '')}` :
                activeTarget?.startsWith('role-')
                  ? ROLES[parseInt(activeTarget.replace('role-', ''))]?.short ?? '' :
                activeTarget?.startsWith('slider-dec-')
                  ? `− ${['Risk','Compliance','Growth','AI Trust','AI Cost'][parseInt(activeTarget.replace('slider-dec-',''))]}` :
                activeTarget?.startsWith('slider-inc-')
                  ? `+ ${['Risk','Compliance','Growth','AI Trust','AI Cost'][parseInt(activeTarget.replace('slider-inc-',''))]}` :
                activeTarget === 'landing'      ? 'Start game' :
                activeTarget === 'persona-next' ? 'Next — Capture photo' :
                ''}
              </div>
            )}
            {dwellProgress > 0 && (
              <svg className="gesture-cursor__dwell" viewBox="0 0 44 44">
                <circle
                  cx="22" cy="22" r="20"
                  fill="none"
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth="4"
                />
                <circle
                  cx="22" cy="22" r="20"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="4"
                  strokeDasharray={`${2 * Math.PI * 20}`}
                  strokeDashoffset={`${2 * Math.PI * 20 * (1 - dwellProgress / 100)}`}
                  strokeLinecap="round"
                  transform="rotate(-90 22 22)"
                  style={{ transition: 'stroke-dashoffset 0.05s linear' }}
                />
              </svg>
            )}
          </div>
        )}
      </>
    );
  }

  function renderGesturePanel() {
    if (!GESTURE_ENABLED) return null;
    const isCompact = gameScreen === 'game' || gameScreen === 'results';
    return (
      <div className={`gesture-panel ${isCompact ? 'gesture-panel--compact' : ''}`}>
        <div className="gesture-panel__header">
          <span className="gesture-panel__title">👋 Gesture Control</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`gesture-panel__status ${gesturePaused ? 'is-paused' : gestureReady ? 'is-ready' : 'is-waiting'}`}>
              {gesturePaused ? 'Paused' : gestureReady ? 'Ready' : gestureError ? 'Error' : 'Loading…'}
            </span>
            <button
              className="gesture-toggle-btn"
              type="button"
              onClick={() => setGesturePaused(p => !p)}
              title={gesturePaused ? 'Enable gesture' : 'Pause gesture'}
            >
              {gesturePaused ? '▶' : '⏸'}
            </button>
          </div>
        </div>
        <div className="gesture-panel__camera">
          <video ref={gestureVideoRef} className="gesture-panel__video" autoPlay playsInline muted />
          <canvas ref={gestureCanvasRef} className="gesture-panel__canvas" />
        </div>
        <div className="gesture-panel__meta">
          {gestureError
            ? <span className="gesture-panel__error">⚠ {gestureError}</span>
            : <span className="gesture-panel__hint">👆 Point at a button · Hold still 2s to activate</span>
              }
              {activeTarget && (
                <span style={{ color: '#1a5fa8', fontWeight: 700, fontSize: '11px' }}>
                  → {activeTarget === 'landing'      ? 'Start game' :
                    activeTarget === 'persona-next' ? 'Capture photo' :
                    activeTarget === 'submit'       ? 'Submit' :
                    activeTarget === 'restart'      ? 'Play again' :
                    activeTarget?.startsWith('option-') ? `Option ${activeTarget.replace('option-', '')}` :
                    activeTarget?.startsWith('role-')   ? ROLES[parseInt(activeTarget.replace('role-', ''))]?.short ?? activeTarget :
                    activeTarget?.startsWith('slider-dec-') ? `− ${['Risk','Compliance','Growth','AI Trust','AI Cost'][parseInt(activeTarget.replace('slider-dec-',''))]}` :
                    activeTarget?.startsWith('slider-inc-') ? `+ ${['Risk','Compliance','Growth','AI Trust','AI Cost'][parseInt(activeTarget.replace('slider-inc-',''))]}` :
                    activeTarget}
                </span>
              )}             
        </div>
      </div>
    );
  }

  if (gameScreen === 'results') return (
    <>
      <div className="results-shell">

        {/* Top bar — same as game screen 
        <div className="game-topbar">
          <div className="landing-brand"><Sparkles size={18} /> AI Twin Challenge</div>
          <div className="game-topbar-twin">
            <img src={resolvedAvatarSrc} alt="Twin" className="game-topbar-avatar" />
            <div className="game-topbar-meta">
              <div className="game-topbar-name">{personaName}</div>
              <div className="game-topbar-role">{role}</div>
            </div>
          </div>
        </div>
        */}

        {/* Results card */}
        <div className="results-screen-card">

          {/* Header */}
          <div className="results-screen-header">
            <div>
              <div className="setup-kicker">AI Verdict</div>
              <h2 className="results-modal-title">
                {isScoring ? 'Judging your decision…' : activeScore.verdict}
              </h2>
              <div className="results-modal-subtitle">{scenario.title}</div>
            </div>
          </div>

          {/* Body */}
          <div className="results-screen-body">
            {isScoring ? (
              <div className="score-loading">
                <div className="score-spinner-wrap">
                  <div className="twin-spinner twin-spinner-lg">
                    <div className="twin-ring ring-a" />
                    <div className="twin-ring ring-b" />
                    <div className="twin-ring-c" />
                    <span className="twin-spinner-icon">🧠</span>
                  </div>
                </div>
                <div className="score-loading-title">Your Twin is on it…</div>
                <LoadingQuip quips={LOADING_QUIPS} />
              </div>
            ) : (
              <>
                {scoringFailed && (
                  <div className="score-fallback-note small" style={{ marginBottom: 16 }}>
                    ⚠ Live AI judging unavailable — showing estimated results.
                  </div>
                )}

                {/* ── 1. Hero ── */}
                <div className="results-hero">
                  <div className="results-hero-left">
                    {resolvedAvatarSrc && (
                      <img src={resolvedAvatarSrc} alt="Your avatar" className="results-avatar" />
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

                {/* ── 3. Profile gaps ── */}
                {activeScore.gaps.length > 0 && (
                  <div className="results-section">
                    <div className="results-section-title">Your profile vs ideal {role}</div>
                    <div className="results-gaps">
                      {activeScore.gaps.map((g) => (
                        <div className="results-gap-row" key={g.label}>
                          <span className="results-gap-label">{g.label}</span>
                          <span className="results-gap-nums">
                            {g.user} <span className="results-gap-arrow">→</span> {g.ideal} ideal
                          </span>
                          <DeltaPill direction={g.direction} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer — single play again button */}
          <div className="results-screen-footer">
            <button
              ref={btnRestartRef}
              className={`primary-btn results-restart-btn ${activeTarget === 'restart' ? 'gesture-target-active' : ''}`}
              type="button"
              onClick={resetGame}
            >
              Play again →
            </button>
          </div>

          {autoRestartSeconds !== null && autoRestartSeconds <= 10 && (
            <div className="auto-restart-hint">
              Starting fresh in {autoRestartSeconds}s…
            </div>
          )}

        </div>

        {/* Verdict overlay fires on this screen */}
        {verdictOverlay && (
          <div className={`verdict-overlay verdict-overlay--${verdictOverlay.type}`}>
            <div className="verdict-overlay-text">{verdictOverlay.text}</div>
          </div>
        )}

        {renderGestureCursor()}
        {renderGesturePanel()}

      </div>
    </>
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="game-shell">

        {/* ── Top bar ── */}
        <div className="game-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="landing-brand"><Sparkles size={18} /> AI Twin Challenge</div>
          </div>
          <div className="game-topbar-twin">
            <img src={resolvedAvatarSrc} alt="Twin" className="game-topbar-avatar" />
            <div className="game-topbar-meta">
              <div className="game-topbar-name">{personaName}</div>
              <div className="game-topbar-role">{role}</div>
            </div>
          </div>
        </div>

        {/* ── Scenario card ── */}
        <div className="game-scenario-card" key={scenario.id}>

          {/* Briefing section */}
          <div className="game-scenario-body">
            <div className="persona-banner">
              You are the <strong>{role}</strong> — how do you respond?
            </div>
            <div className="scenario-tag">{scenario.personaFocus.join(' · ')}</div>
            <h1 className="scenario-title">{scenario.title}</h1>
            <p className="scenario-summary">{scenario.summary}</p>
            <p className="scenario-situation">{scenario.situation}</p>
          </div>

          {/* Decision zone */}
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
                    window.setTimeout(() => setChipWiggle(false), 700);
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

          {/* Footer — single submit */}
          <div className="scenario-footer-simple">
            <div className="footer-note">{scoreStatus}</div>
            <button
              ref={btnSubmitRef}
              className={`primary-btn scenario-submit-btn ${activeTarget === 'submit' ? 'gesture-target-active' : ''}`}
              type="button"
              onClick={scoreRound}
              disabled={!isInitialized || isScoring || !action}
            >
              {isScoring
                ? <span className="btn-inline"><LoaderCircle size={15} className="spin" /> Asking your Twin…</span>
                : 'How would my Twin decide?'}
            </button>
          </div>

        </div>
      </div>

      {/* ── Overlays ── */}
      {verdictOverlay && (
        <div className={`verdict-overlay verdict-overlay--${verdictOverlay.type}`}>
          <div className="verdict-overlay-text">{verdictOverlay?.text}</div>
        </div>
      )}
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

      {renderGestureCursor()}
      {renderGesturePanel()}     
      
    </>
  );
}

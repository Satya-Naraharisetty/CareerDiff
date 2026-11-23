import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Camera,
  CameraOff,
  CheckCircle,
  Clock,
  Code2,
  Copy,
  Hand,
  History,
  Info,
  Layers,
  Loader2,
  Minimize2,
  Network,
  Play,
  Send,
  Terminal,
  User,
} from 'lucide-react';
import { useInterviewStore } from '../stores/interviewStore';
import { BrowserSpeechSynthesizer } from '../lib/speechSynthesis';
import { registerActiveStream, stopAllMediaHardware } from '../lib/audio';

interface InterviewRoomProps {
  onConclude: () => void;
}

export type TechnicalWorkspace = 'NONE' | 'CODE' | 'DIAGRAM' | 'TERMINAL';

interface DiagramPreset {
  name: string;
  syntax: string;
  description: string;
}

const GEMINI_LIVE_VOICES = [
  { id: 'Puck', label: 'Alex (Male)', description: 'Conversational, warm, natural male interviewer (Recommended)' },
  { id: 'Aoede', label: 'Maya (Female)', description: 'Articulate, expressive, natural female interviewer' },
];

const DIAGRAM_PRESETS: DiagramPreset[] = [
  {
    name: 'Microservices & Gateway',
    description: 'Client -> API Gateway -> Auth / Orders / Payments -> DB & Kafka',
    syntax: `flowchart TD
    Client[Web & Mobile Clients] --> Gateway[API Gateway / Envoy]
    Gateway --> Auth[Auth Service]
    Gateway --> OrderSvc[Order Microservice]
    Gateway --> PaymentSvc[Payment Service]
    OrderSvc --> DB[(PostgreSQL Primary)]
    PaymentSvc --> Bus[(Kafka Event Bus)]`,
  },
  {
    name: 'Transactional Outbox',
    description: 'Service -> ACID Commit -> Poller -> Kafka Broker -> Deduplicating Consumers',
    syntax: `sequenceDiagram
    App->>DB: 1. Begin Transaction
    App->>DB: 2. Insert Order & Outbox Row
    App->>DB: 3. Commit ACID Transaction
    Poller->>DB: 4. SELECT FOR UPDATE SKIP LOCKED
    Poller->>Kafka: 5. Publish Event (Idempotent)
    Kafka-->>Consumer: 6. Consume & Deduplicate`,
  },
  {
    name: 'Multi-Region Replicas',
    description: 'Anycast LB -> Regional Clusters -> Primary DB with Read Replicas',
    syntax: `flowchart LR
    LB[Global Anycast LB] --> RegionA[Region US-East]
    LB --> RegionB[Region EU-Central]
    RegionA --> PrimaryDB[(Primary DB - Read/Write)]
    RegionB --> ReplicaDB[(Read Replica - Read-Only)]
    PrimaryDB -. Async Replication .-> ReplicaDB`,
  },
  {
    name: 'Distributed Lock Cache',
    description: 'Worker -> Redis Redlock Lease -> DB Ledger -> Unlock',
    syntax: `sequenceDiagram
    Worker->>Redis: SET lock:order_123 NX PX 5000
    Redis-->>Worker: OK (Acquired)
    Worker->>DB: UPDATE account SET balance = balance - 100
    Worker->>Redis: EVAL release_lock_lua
    Redis-->>Worker: Lock Released`,
  },
];

const ARCHETYPE_CONFIG: Record<
  string,
  { label: string; badgeClass: string; icon: string; defaultWorkspace?: TechnicalWorkspace }
> = {
  WARMUP_MOTIVATION: {
    label: 'Warmup & Role Motivation',
    badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80',
    icon: '☕',
    defaultWorkspace: 'NONE',
  },
  SKILL_FUNDAMENTALS: {
    label: 'Skill Fundamentals',
    badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
    icon: '⚡',
    defaultWorkspace: 'NONE',
  },
  SYSTEM_ARCHITECTURE: {
    label: 'System Architecture',
    badgeClass: 'bg-indigo-950/80 text-indigo-300 border-indigo-800/80',
    icon: '🏛️',
    defaultWorkspace: 'DIAGRAM',
  },
  SCENARIO_DECISION: {
    label: 'Architectural Dilemma',
    badgeClass: 'bg-purple-950/80 text-purple-300 border-purple-800/80',
    icon: '⚖️',
    defaultWorkspace: 'DIAGRAM',
  },
  ANALYZING_DESIGN: {
    label: 'System Design Framing',
    badgeClass: 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80',
    icon: '📐',
    defaultWorkspace: 'DIAGRAM',
  },
  DEBUGGING_INCIDENT: {
    label: 'Production Incident Triage',
    badgeClass: 'bg-rose-950/80 text-rose-300 border-rose-800/80',
    icon: '🐞',
    defaultWorkspace: 'TERMINAL',
  },
  CODE_REVIEW: {
    label: 'Live Code Review & Implementation',
    badgeClass: 'bg-teal-950/80 text-teal-300 border-teal-800/80',
    icon: '💻',
    defaultWorkspace: 'CODE',
  },
  COMPANY_SPECIFIC: {
    label: 'Company Domain Challenge',
    badgeClass: 'bg-blue-950/80 text-blue-300 border-blue-800/80',
    icon: '🏢',
    defaultWorkspace: 'NONE',
  },
  REVERSE_QA: {
    label: 'Candidate Reverse Q&A',
    badgeClass: 'bg-violet-950/80 text-violet-300 border-violet-800/80',
    icon: '❓',
    defaultWorkspace: 'NONE',
  },
};

const SvgDiagramPreview: React.FC<{ syntax: string }> = ({ syntax }) => {
  const isSequence = syntax.trim().startsWith('sequenceDiagram');

  if (isSequence) {
    const lines = syntax
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('sequenceDiagram'));
    const actors = Array.from(
      new Set(
        lines.flatMap((l) => {
          const m = l.match(/([a-zA-Z0-9_]+)\s*(?:->>|-->>)\s*([a-zA-Z0-9_]+)/);
          return m ? [m[1], m[2]] : [];
        })
      )
    );

    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs overflow-x-auto space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2 text-[11px] text-zinc-400">
          <span className="flex items-center gap-1.5 text-sky-400 font-semibold">
            <Layers className="h-3.5 w-3.5" /> Sequence Topology
          </span>
          <span className="text-[11px] text-zinc-500">{actors.length} Participants</span>
        </div>
        <div className="flex gap-4 items-center justify-around py-2">
          {actors.map((actor, idx) => (
            <div
              key={actor}
              className="px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 font-bold text-center text-xs shadow-sm flex flex-col items-center gap-1"
            >
              <span>{actor}</span>
              <span className="text-[10px] font-normal text-zinc-500">Actor #{idx + 1}</span>
            </div>
          ))}
        </div>
        <div className="space-y-1.5 pt-2 border-t border-zinc-800/60">
          {lines.map((l, i) => {
            const m = l.match(/([a-zA-Z0-9_]+)\s*(->>|-->>)\s*([a-zA-Z0-9_]+):\s*(.*)/);
            if (!m) return null;
            const [, from, arrow, to, desc] = m;
            const isAsync = arrow === '-->>';
            return (
              <div
                key={i}
                className="flex items-center gap-2 text-[11px] bg-zinc-900/60 px-3 py-1.5 rounded border border-zinc-800/80"
              >
                <span className="text-sky-400 font-semibold">{from}</span>
                <span className="text-zinc-500">{isAsync ? '-->>' : '->>'}</span>
                <span className="text-emerald-400 font-semibold">{to}</span>
                <span className="text-zinc-500">:</span>
                <span className="text-zinc-300">{desc}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Flowchart rendering
  const lines = syntax
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('flowchart') && !l.startsWith('graph'));

  const parsedNodes: { id: string; label: string }[] = [];
  const parsedEdges: { from: string; to: string; label?: string }[] = [];

  for (const line of lines) {
    const edgeMatch = line.match(/([a-zA-Z0-9_]+)(?:\[.*?\])?\s*-->\s*(?:\|.*?\|\s*)?([a-zA-Z0-9_]+)(?:\[.*?\])?/);
    if (edgeMatch) {
      parsedEdges.push({ from: edgeMatch[1], to: edgeMatch[2] });
    }
    const nodeMatches = line.matchAll(/([a-zA-Z0-9_]+)\[(.*?)\]/g);
    for (const nm of nodeMatches) {
      if (!parsedNodes.some((n) => n.id === nm[1])) {
        parsedNodes.push({ id: nm[1], label: nm[2] });
      }
    }
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs overflow-x-auto space-y-3">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2 text-[11px] text-zinc-400">
        <span className="flex items-center gap-1.5 text-sky-400 font-semibold">
          <Network className="h-3.5 w-3.5" /> Directed Architecture Graph
        </span>
        <span className="text-[11px] text-zinc-500">
          {parsedNodes.length} Nodes · {parsedEdges.length} Edges
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 py-2">
        {parsedNodes.map((node) => (
          <div
            key={node.id}
            className="p-2.5 rounded-lg border border-sky-950 bg-sky-950/20 text-zinc-200 text-xs shadow-sm flex flex-col gap-0.5"
          >
            <span className="text-[10px] font-mono text-sky-400 uppercase tracking-wider font-semibold">
              {node.id}
            </span>
            <span className="font-medium text-zinc-100">{node.label}</span>
          </div>
        ))}
      </div>
      {parsedEdges.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-zinc-800/60">
          {parsedEdges.map((edge, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-[11px] bg-zinc-900 px-2 py-1 rounded border border-zinc-800 text-zinc-300"
            >
              <span className="text-sky-300">{edge.from}</span>
              <span className="text-zinc-500">→</span>
              <span className="text-emerald-300">{edge.to}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const getLanguageTemplates = (lang: string) => {
  const common = [
    {
      name: 'SQL Schema',
      language: 'SQL',
      snippet: `-- ACID Ledger & Transactional Outbox
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    balance NUMERIC(14, 2) NOT NULL CHECK (balance >= 0)
);

CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

-- Atomically debit account and queue event
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 'user_abc';
INSERT INTO outbox_events (aggregate_type, payload) VALUES ('ORDER_PLACED', '{"amount": 100}');
COMMIT;`,
    },
  ];

  switch (lang.toLowerCase()) {
    case 'go':
    case 'golang':
      return [
        {
          name: 'Worker Pool',
          language: 'Go',
          snippet: `package main

import (
    "context"
    "fmt"
    "sync"
)

func WorkerPool[T any, R any](ctx context.Context, workers int, tasks []T, fn func(T) R) []R {
    taskCh := make(chan T, len(tasks))
    resCh := make(chan R, len(tasks))
    var wg sync.WaitGroup

    for i := 0; i < workers; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for t := range taskCh {
                resCh <- fn(t)
            }
        }()
    }

    for _, t := range tasks { taskCh <- t }
    close(taskCh)
    wg.Wait()
    close(resCh)

    var results []R
    for r := range resCh { results = append(results, r) }
    return results
}`,
        },
        ...common,
      ];
    case 'typescript':
    case 'javascript':
      return [
        {
          name: 'Async Pool',
          language: 'TypeScript',
          snippet: `// Bounded Concurrent Promise Worker Pool
async function asyncPool<T, R>(limit: number, items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const ret: Promise<R>[] = [];
  const executing = new Set<Promise<R>>();
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    ret.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(ret);
}`,
        },
        ...common,
      ];
    default: // Python
      return [
        {
          name: 'Sliding Limiter',
          language: 'Python',
          snippet: `import time

def check_rate_limit(request_timestamps: list[float], limit: int = 5, window_sec: float = 60.0) -> bool:
    """Sliding-window rate limiter algorithm."""
    now = time.time()
    cutoff = now - window_sec
    valid = [ts for ts in request_timestamps if ts > cutoff]
    if len(valid) >= limit:
        return False
    valid.append(now)
    return True

print("Allowed:", check_rate_limit([time.time() - 10, time.time() - 5]))`,
        },
        {
          name: 'Redlock Concurrency',
          language: 'Python',
          snippet: `# Distributed Lock with Lease TTL
async def acquire_lock(redis, resource_id: str, ttl_ms: int = 5000):
    token = str(uuid.uuid4())
    acquired = await redis.set(f"lock:{resource_id}", token, px=ttl_ms, nx=True)
    if not acquired:
        raise LockContentionError(f"Resource {resource_id} is locked by another worker")
    return token`,
        },
        ...common,
      ];
  }
};

function getScaffoldedCodeForQuestion(transcript: string, lang: string): string {
  const t = transcript.toLowerCase();
  const isGo = lang.toLowerCase().includes('go');
  const isTs = lang.toLowerCase().includes('script');

  if (t.includes('rate limit') || t.includes('sliding') || t.includes('token bucket')) {
    if (isGo) {
      return `package main

import (
    "sync"
    "time"
)

type SlidingLimiter struct {
    mu       sync.Mutex
    history  []time.Time
    limit    int
    window   time.Duration
}

func (l *SlidingLimiter) Allow() bool {
    l.mu.Lock()
    defer l.mu.Unlock()
    now := time.Now()
    cutoff := now.Add(-l.window)
    valid := l.history[:0]
    for _, t := range l.history {
        if t.After(cutoff) { valid = append(valid, t) }
    }
    if len(valid) >= l.limit { return false }
    l.history = append(valid, now)
    return true
}`;
    }
    if (isTs) {
      return `class SlidingWindowLimiter {
  private timestamps: number[] = [];
  constructor(private limit = 10, private windowMs = 60000) {}

  allow(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(ts => now - ts < this.windowMs);
    if (this.timestamps.length >= this.limit) return false;
    this.timestamps.push(now);
    return true;
  }
}`;
    }
    return `import time

class SlidingWindowLimiter:
    def __init__(self, limit: int = 10, window_sec: float = 60.0):
        self.limit = limit
        self.window_sec = window_sec
        self.history: list[float] = []

    def allow(self) -> bool:
        now = time.time()
        self.history = [t for t in self.history if now - t < self.window_sec]
        if len(self.history) >= self.limit:
            return False
        self.history.append(now)
        return True

limiter = SlidingWindowLimiter(limit=3, window_sec=10.0)
print("Allowed:", [limiter.allow() for _ in range(4)])`;
  }

  if (t.includes('outbox') || t.includes('kafka') || t.includes('transaction')) {
    return `-- Transactional Outbox Pattern Table Definition & Worker Query
CREATE TABLE orders (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    total NUMERIC(10,2) NOT NULL,
    status VARCHAR(32) NOT NULL
);

CREATE TABLE outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ NULL
);

-- Poller query avoiding table lock contention:
-- SELECT id, payload FROM outbox WHERE processed_at IS NULL ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED;`;
  }

  return `# Starter Implementation Context for ${lang}
def solve_challenge():
    """Implement your core logic here."""
    pass

if __name__ == '__main__':
    print("Ready for implementation")`;
}

function getScaffoldedDiagramForQuestion(transcript: string): string {
  const t = transcript.toLowerCase();
  if (t.includes('outbox') || t.includes('kafka') || t.includes('transaction')) {
    return DIAGRAM_PRESETS[1].syntax;
  }
  if (t.includes('lock') || t.includes('redis') || t.includes('cache')) {
    return DIAGRAM_PRESETS[3].syntax;
  }
  if (t.includes('region') || t.includes('replica') || t.includes('geo')) {
    return DIAGRAM_PRESETS[2].syntax;
  }
  return DIAGRAM_PRESETS[0].syntax;
}

function getScaffoldedIncidentLogs(): string[] {
  const ts = new Date().toISOString().substring(11, 19);
  return [
    `[${ts}.104] [FATAL] [db-connection-pool] PoolExhaustionException: Active: 100/100, Idle: 0, Pending: 842`,
    `[${ts}.320] [WARN]  [api-gateway] Upstream latency degraded: p99=4850ms, threshold=500ms`,
    `[${ts}.510] [ERROR] [checkout-service] 504 Gateway Timeout while acquiring PostgreSQL client connection`,
    `[${ts}.782] [WARN]  [circuit-breaker] Circuit state transitioned from CLOSED to OPEN for db_primary_pool`,
    `[${ts}.991] [INFO]  [health-check] Liveness probe failed on 4 replica containers in cluster us-east-1a`,
  ];
}

const AudioEqualizer: React.FC<{
  audioLevel: number;
  isRecording: boolean;
  isInterviewerSpeaking: boolean;
}> = ({ audioLevel, isRecording, isInterviewerSpeaking }) => {
  const bars = 16;
  return (
    <div className="flex items-center gap-2.5 h-9 px-3 py-1 rounded-xl bg-zinc-950/80 border border-zinc-800/80 backdrop-blur-md shrink-0 shadow-sm">
      <div className="flex items-end gap-[3px] h-5 w-24 sm:w-28">
        {Array.from({ length: bars }).map((_, i) => {
          let heightPercent = 15;
          if (isRecording) {
            const factor = Math.sin((i / (bars - 1)) * Math.PI) * 0.7 + 0.3;
            heightPercent = Math.min(100, Math.max(15, Math.round(audioLevel * 100 * factor + (i % 3) * 10)));
          } else if (isInterviewerSpeaking) {
            heightPercent = Math.min(100, Math.max(20, Math.round(50 + Math.sin(i * 1.5) * 35)));
          }

          return (
            <div
              key={i}
              className={`flex-1 rounded-full transition-all duration-75 ${
                isRecording
                  ? 'bg-emerald-400 shadow-sm shadow-emerald-500/30'
                  : isInterviewerSpeaking
                    ? 'bg-sky-400 shadow-sm shadow-sky-500/30 animate-pulse'
                    : 'bg-zinc-800'
              }`}
              style={{ height: `${heightPercent}%` }}
            />
          );
        })}
      </div>
      <div className="flex flex-col text-[11px] font-mono leading-tight">
        <span
          className={
            isRecording
              ? 'text-emerald-400 font-semibold'
              : isInterviewerSpeaking
                ? 'text-sky-300 font-semibold'
                : 'text-zinc-500'
          }
        >
          {isRecording ? 'LIVE AUDIO' : isInterviewerSpeaking ? 'INTERVIEWER' : 'STANDBY'}
        </span>
        <span className="text-zinc-500 hidden sm:inline text-[10px]">
          {isRecording ? 'Mic Active' : isInterviewerSpeaking ? 'Speaking' : 'Ready'}
        </span>
      </div>
    </div>
  );
};

export const InterviewRoom: React.FC<InterviewRoomProps> = ({ onConclude }) => {
  const {
    interviewId,
    state: sessionState,
    mode,
    targetSeniority,
    blueprint,
    turns,
    partialTranscript,
    isSubmitting,
    currentTopic,
    error,
    isRecording,
    audioLevel,
    isInterviewerSpeaking,
    remainingSeconds,
    isVoiceMuted,
    preferredLanguage,
    wsStatus,
    notice,
    sendTypedAnswer,
    startInterview,
    rehydrateSession,
    initVoiceSession,
    startVoiceRecording,
    stopVoiceRecording,
    disconnectVoiceSession,
    bargeIn,
    concludeSession,
  } = useInterviewStore();

  // Dynamic Workspace State
  const [activeWorkspace, setActiveWorkspace] = useState<TechnicalWorkspace>('NONE');
  const [scratchpadCode, setScratchpadCode] = useState('');
  const [diagramCode, setDiagramCode] = useState<string>(DIAGRAM_PRESETS[0].syntax);
  const [incidentLogs, setIncidentLogs] = useState<string[]>([]);
  const [incidentScript, setIncidentScript] = useState<string>('');
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [attachScratchpad, setAttachScratchpad] = useState(true);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [executionOutput, setExecutionOutput] = useState<string | null>(null);
  const [isRunningCode, setIsRunningCode] = useState(false);

  // Camera State
  const [showCamera, setShowCamera] = useState<boolean>(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('careerdiff_camera_enabled');
      if (stored !== null) return stored === 'true';
    }
    return true;
  });
  const [typedAnswer, setTypedAnswer] = useState('');
  const [confirmingConclude, setConfirmingConclude] = useState(false);
  const autoConcludedRef = useRef(false);
  const [isRoomCameraActive, setIsRoomCameraActive] = useState<boolean>(false);

  // Voice Persona
  const [selectedGeminiVoice, setSelectedGeminiVoice] = useState<string>(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('careerdiff_gemini_voice');
      return stored === 'Aoede' || stored === 'Kore' ? 'Aoede' : 'Puck';
    }
    return 'Puck';
  });

  const handleVoiceChange = (newVoice: string) => {
    setSelectedGeminiVoice(newVoice);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('careerdiff_gemini_voice', newVoice);
    }
  };

  const handleToggleCamera = useCallback(() => {
    setShowCamera((prev) => {
      const next = !prev;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('careerdiff_camera_enabled', next ? 'true' : 'false');
        }
      } catch {}
      return next;
    });
  }, []);

  const [typingTurnIndex, setTypingTurnIndex] = useState<number | null>(null);
  const [typedText, setTypedText] = useState<string>('');

  const lastSpokenTurnRef = useRef<number | null>(null);
  const lastAutoArchetypeTurnRef = useRef<number | null>(null);
  const activeSynthesizerCancelRef = useRef<(() => void) | null>(null);
  const roomVideoRef = useRef<HTMLVideoElement | null>(null);
  const roomStreamRef = useRef<MediaStream | null>(null);

  const setRoomVideoRef = useCallback((node: HTMLVideoElement | null) => {
    roomVideoRef.current = node;
    if (node && roomStreamRef.current) {
      if (node.srcObject !== roomStreamRef.current) {
        node.srcObject = roomStreamRef.current;
      }
      node.play().catch((err) => {
        console.warn('Interview room camera play failed:', err);
      });
    }
  }, []);

  const activeTemplates = React.useMemo(
    () => getLanguageTemplates(preferredLanguage || 'Python'),
    [preferredLanguage]
  );

  // Auto-scaffold technical workspaces conditionally based on interviewer question
  useEffect(() => {
    if (turns.length === 0) return;
    const latestTurn = turns[turns.length - 1];

    if (
      latestTurn.speaker === 'INTERVIEWER' &&
      latestTurn.turn_index !== lastAutoArchetypeTurnRef.current
    ) {
      lastAutoArchetypeTurnRef.current = latestTurn.turn_index;
      const arch = latestTurn.question_archetype || '';
      const transcript = (latestTurn.transcript || '').toLowerCase();

      // 1. Coding Question / Code Review Archetype
      if (
        arch === 'CODE_REVIEW' ||
        transcript.includes('code') ||
        transcript.includes('implement') ||
        transcript.includes('function') ||
        transcript.includes('algorithm')
      ) {
        setActiveWorkspace('CODE');
        if (latestTurn.code_sample && latestTurn.code_sample.trim()) {
          setScratchpadCode(latestTurn.code_sample.trim());
        } else {
          const scaffolded = getScaffoldedCodeForQuestion(transcript, preferredLanguage || 'Python');
          setScratchpadCode(scaffolded);
        }
      }
      // 2. System Architecture / Design Framing / Dilemma Archetype
      else if (
        arch === 'SYSTEM_ARCHITECTURE' ||
        arch === 'ANALYZING_DESIGN' ||
        arch === 'SCENARIO_DECISION' ||
        transcript.includes('architecture') ||
        transcript.includes('diagram') ||
        transcript.includes('microservice') ||
        transcript.includes('system design')
      ) {
        setActiveWorkspace('DIAGRAM');
        const scaffoldedDiagram = getScaffoldedDiagramForQuestion(transcript);
        setDiagramCode(scaffoldedDiagram);
      }
      // 3. Incident Triage / Production Debugging Archetype
      else if (
        arch === 'DEBUGGING_INCIDENT' ||
        transcript.includes('incident') ||
        transcript.includes('outage') ||
        transcript.includes('debug') ||
        transcript.includes('crash') ||
        transcript.includes('504')
      ) {
        setActiveWorkspace('TERMINAL');
        const logs = getScaffoldedIncidentLogs();
        setIncidentLogs(logs);
        setIncidentScript(`# Incident Triage Diagnostic Runner (${preferredLanguage || 'Python'})
# Analyze root cause of 504 timeouts & connection pool exhaustion
affected_endpoints = ["/api/v1/checkout", "/api/v1/orders"]
active_connections = 100
max_pool_limit = 100

print(f"Database Pool Contention: {active_connections}/{max_pool_limit} (100% Saturated)")
print("Triage Recommendation: Increase read-replica offloading & apply circuit breaker.")`);
      }
      // 4. Purely verbal/behavioral/warmup questions -> Clean Option A Video HUD
      else if (
        arch === 'WARMUP_MOTIVATION' ||
        arch === 'SKILL_FUNDAMENTALS' ||
        arch === 'COMPANY_SPECIFIC' ||
        arch === 'REVERSE_QA'
      ) {
        setActiveWorkspace('NONE');
      }
    }
  }, [turns, preferredLanguage]);

  const handleRunCode = async (codeToRun?: string) => {
    const code = (codeToRun || scratchpadCode).trim();
    if (!code) return;
    setIsRunningCode(true);
    setExecutionOutput(null);

    const langLower = (preferredLanguage || 'python').toLowerCase();

    if (langLower.includes('script')) {
      const workerSrc = `
        const logs = [];
        const fmt = (a) => (typeof a === 'object' ? JSON.stringify(a) : String(a));
        console.log = (...args) => logs.push(args.map(fmt).join(' '));
        console.error = console.log;
        self.onmessage = (e) => {
          try {
            const res = (0, eval)(e.data);
            let out = logs.join('\\n');
            if (res !== undefined) out = out ? out + '\\nReturned: ' + fmt(res) : 'Returned: ' + fmt(res);
            self.postMessage({ ok: true, out });
          } catch (err) {
            self.postMessage({ ok: false, out: (err && err.message) || String(err) });
          }
        };
      `;
      const blobUrl = URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' }));
      const worker = new Worker(blobUrl);
      const finish = (text: string) => {
        worker.terminate();
        URL.revokeObjectURL(blobUrl);
        setExecutionOutput(text);
        setIsRunningCode(false);
      };
      const timeout = window.setTimeout(() => finish('Execution stopped: exceeded 5 second time limit.'), 5000);
      worker.onmessage = (e: MessageEvent<{ ok: boolean; out: string }>) => {
        clearTimeout(timeout);
        finish(e.data.ok ? e.data.out || '✓ JavaScript executed cleanly.' : `JavaScript Error:\n${e.data.out}`);
      };
      worker.onerror = (e) => {
        clearTimeout(timeout);
        finish(`JavaScript Error:\n${e.message}`);
      };
      worker.postMessage(code);
      return;
    }

    if (langLower === 'python') {
      try {
        const win = window as any;
        if (!win.loadPyodide) {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';
          script.integrity = 'sha384-i3R37b3tF+HWudsUf1VSEOY2YxwSNMqY8DQa9Z0O3xh+NkJ9o+yjcGyIi5huj+nB';
          script.crossOrigin = 'anonymous';
          document.head.appendChild(script);
          await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load WebAssembly Python runner'));
          });
        }
        if (!win.__pyodideInstance) {
          win.__pyodideInstance = await win.loadPyodide();
        }
        const pyodide = win.__pyodideInstance;
        const stdoutBuffer: string[] = [];
        pyodide.setStdout({
          batched: (str: string) => {
            stdoutBuffer.push(str);
          },
        });
        const result = await pyodide.runPythonAsync(code);
        let finalOut = stdoutBuffer.join('\n');
        if (result !== undefined && result !== null) {
          finalOut = finalOut ? `${finalOut}\nReturned: ${result}` : `Returned: ${result}`;
        }
        setExecutionOutput(finalOut || '✓ Python executed with exit code 0.');
      } catch (err: any) {
        setExecutionOutput(`Execution Error:\n${err.message || String(err)}`);
      } finally {
        setIsRunningCode(false);
      }
      return;
    }

    setExecutionOutput(
      `ℹ️ ${preferredLanguage} Syntax Formatted:\nCode is prepared and will attach to your next turn submission.`
    );
    setIsRunningCode(false);
  };

  const hasStartedRef = useRef(false);
  const hasVoiceInitedRef = useRef(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const hasStarted = turns.length > 0;
  useEffect(() => {
    if (sessionState === 'COMPLETED' || !hasStarted) return;
    const interval = window.setInterval(() => {
      useInterviewStore.setState((s) => ({
        remainingSeconds: Math.max(0, s.remainingSeconds - 1),
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionState, hasStarted]);

  useEffect(() => {
    if (interviewId && turns.length === 0) {
      rehydrateSession(interviewId).catch((err) => {
        console.warn('Interview session rehydration notice:', err);
      });
    }
  }, [interviewId, turns.length, rehydrateSession]);

  useEffect(() => {
    if (sessionState === 'CREATED' && !hasStartedRef.current && mode === 'TEXT') {
      hasStartedRef.current = true;
      startInterview();
    }
    if (mode === 'VOICE' && wsStatus === 'disconnected' && !hasVoiceInitedRef.current) {
      hasVoiceInitedRef.current = true;
      initVoiceSession();
    }
  }, [sessionState, mode, wsStatus, startInterview, initVoiceSession]);

  // Candidate camera lifecycle
  useEffect(() => {
    let active = true;
    if (showCamera) {
      const preferredVideoId =
        typeof localStorage !== 'undefined' ? localStorage.getItem('careerdiff_preferred_video_device') : null;

      const acquireCamera = async () => {
        try {
          let stream: MediaStream | null = null;
          if (preferredVideoId) {
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                video: {
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  facingMode: 'user',
                  deviceId: { exact: preferredVideoId },
                },
              });
            } catch {
              try {
                stream = await navigator.mediaDevices.getUserMedia({
                  video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user',
                    deviceId: { ideal: preferredVideoId },
                  },
                });
              } catch {
                stream = null;
              }
            }
          }

          if (!stream) {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user',
              },
            });
          }

          if (!active) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          registerActiveStream(stream);
          roomStreamRef.current = stream;
          setIsRoomCameraActive(true);
          if (roomVideoRef.current) {
            roomVideoRef.current.srcObject = stream;
            roomVideoRef.current.play().catch(() => {});
          }
        } catch (err) {
          console.warn('Candidate camera not available in interview room:', err);
          if (active) {
            setIsRoomCameraActive(false);
          }
        }
      };

      acquireCamera();
    } else {
      setIsRoomCameraActive(false);
      if (roomStreamRef.current) {
        roomStreamRef.current.getTracks().forEach((track) => track.stop());
        roomStreamRef.current = null;
      }
      if (roomVideoRef.current) {
        roomVideoRef.current.pause();
        roomVideoRef.current.srcObject = null;
      }
    }

    return () => {
      active = false;
      if (roomStreamRef.current) {
        roomStreamRef.current.getTracks().forEach((track) => track.stop());
        roomStreamRef.current = null;
      }
      if (roomVideoRef.current) {
        roomVideoRef.current.pause();
        roomVideoRef.current.srcObject = null;
      }
    };
  }, [showCamera]);

  useEffect(() => {
    if (roomVideoRef.current && roomStreamRef.current && isRoomCameraActive) {
      if (roomVideoRef.current.srcObject !== roomStreamRef.current) {
        roomVideoRef.current.srcObject = roomStreamRef.current;
      }
      roomVideoRef.current.play().catch(() => {});
    }
  }, [isRoomCameraActive]);

  // Synchronized real-time typewriter for interviewer question
  useEffect(() => {
    if (turns.length === 0) return;
    const latestTurn = turns[turns.length - 1];

    if (
      latestTurn.speaker === 'INTERVIEWER' &&
      latestTurn.turn_index !== lastSpokenTurnRef.current
    ) {
      lastSpokenTurnRef.current = latestTurn.turn_index;
      setTypingTurnIndex(latestTurn.turn_index);
      setTypedText('');

      if (activeSynthesizerCancelRef.current) {
        activeSynthesizerCancelRef.current();
        activeSynthesizerCancelRef.current = null;
      }

      const onTypingProgress = (current: string) => {
        setTypedText(current);
      };

      const silent = mode === 'VOICE' || isVoiceMuted;

      const onEnd = () => {
        setTypingTurnIndex(null);
        activeSynthesizerCancelRef.current = null;
        if (mode === 'VOICE') return;
        useInterviewStore.setState({ isInterviewerSpeaking: false });
      };

      if (silent) {
        activeSynthesizerCancelRef.current = BrowserSpeechSynthesizer.fallbackTypewriter(
          latestTurn.transcript,
          { onTypingProgress, onEnd }
        );
        return;
      }

      useInterviewStore.setState({ isInterviewerSpeaking: true });
      activeSynthesizerCancelRef.current = BrowserSpeechSynthesizer.speak(
        latestTurn.transcript,
        {
          voiceName: selectedGeminiVoice,
          onStart: () => {},
          onEnd,
          onError: () => onEnd(),
          onBoundary: (_, charIndex) => {
            const nextSpace = latestTurn.transcript.indexOf(' ', charIndex);
            const sliceEnd = nextSpace === -1 ? latestTurn.transcript.length : nextSpace;
            setTypedText(latestTurn.transcript.slice(0, sliceEnd));
          },
        }
      );
    }
  }, [turns, mode, isVoiceMuted, selectedGeminiVoice]);

  const cleanupHardwareMedia = () => {
    try {
      if (roomStreamRef.current) {
        roomStreamRef.current.getTracks().forEach((track) => track.stop());
        roomStreamRef.current = null;
      }
      if (roomVideoRef.current) {
        roomVideoRef.current.pause();
        roomVideoRef.current.srcObject = null;
      }
      stopAllMediaHardware();
      if (mode === 'VOICE') {
        disconnectVoiceSession();
      }
    } catch (e) {
      console.warn('Hardware media cleanup error:', e);
    }
  };

  const handleDoneSpeaking = useCallback(async () => {
    if (!isRecording) return;
    await stopVoiceRecording();
  }, [isRecording, stopVoiceRecording]);

  const handleBargeIn = useCallback(() => {
    if (activeSynthesizerCancelRef.current) {
      activeSynthesizerCancelRef.current();
      activeSynthesizerCancelRef.current = null;
    }
    setTypingTurnIndex(null);
    bargeIn();
  }, [bargeIn]);

  useEffect(() => {
    const handleRoomKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        handleBargeIn();
      } else if (e.key === 'Enter' && mode === 'VOICE' && isRecording) {
        e.preventDefault();
        handleDoneSpeaking();
      } else if (e.key === 'Enter' && mode === 'VOICE' && !isRecording && !isInterviewerSpeaking && typingTurnIndex === null) {
        e.preventDefault();
        startVoiceRecording().catch(() => {});
      } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        setActiveWorkspace((prev) => (prev === 'CODE' ? 'NONE' : 'CODE'));
      } else if (e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        setActiveWorkspace((prev) => (prev === 'DIAGRAM' ? 'NONE' : 'DIAGRAM'));
      } else if (e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        setActiveWorkspace((prev) => (prev === 'TERMINAL' ? 'NONE' : 'TERMINAL'));
      }
    };

    window.addEventListener('keydown', handleRoomKeyDown);
    return () => window.removeEventListener('keydown', handleRoomKeyDown);
  }, [mode, isRecording, isInterviewerSpeaking, typingTurnIndex, handleDoneSpeaking, handleBargeIn, startVoiceRecording]);

  const handleConclude = async () => {
    setConfirmingConclude(false);
    setIsRoomCameraActive(false);
    cleanupHardwareMedia();
    try {
      await concludeSession();
    } finally {
      onConclude();
    }
  };

  const requestConclude = () => {
    if (confirmingConclude) {
      void handleConclude();
      return;
    }
    setConfirmingConclude(true);
    window.setTimeout(() => setConfirmingConclude(false), 5000);
  };

  useEffect(() => {
    if (remainingSeconds <= 0 && hasStarted && sessionState !== 'COMPLETED' && !autoConcludedRef.current) {
      autoConcludedRef.current = true;
      void handleConclude();
    }
  }, [remainingSeconds, hasStarted, sessionState]);

  const lastTurn = turns[turns.length - 1];
  const lastInterviewerTurn = [...turns].reverse().find((t) => t.speaker === 'INTERVIEWER');
  const lastCandidateTurn = [...turns].reverse().find((t) => t.speaker === 'CANDIDATE');

  const awaitingCandidate =
    !!lastTurn && lastTurn.speaker === 'INTERVIEWER' && !isSubmitting && sessionState !== 'COMPLETED';
  const showComposer = mode === 'TEXT';

  const handleSubmitTyped = async () => {
    const text = typedAnswer.trim();
    if (!text || isSubmitting) return;
    const code =
      attachScratchpad && activeWorkspace === 'CODE' && scratchpadCode.trim()
        ? scratchpadCode
        : attachScratchpad && activeWorkspace === 'DIAGRAM' && diagramCode.trim()
          ? diagramCode
          : undefined;
    setTypedAnswer('');
    await sendTypedAnswer(text, code);
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] supports-[height:100dvh]:h-[calc(100dvh-3.5rem)] max-w-7xl flex-col px-3 py-3 sm:px-5">
      {/* Top Session Control Bar */}
      <div className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/90 px-3.5 py-2.5 backdrop-blur-md shadow-sm">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 font-mono">
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  sessionState === 'COMPLETED' ? 'bg-zinc-500' : 'bg-emerald-400 animate-ping'
                }`}
              />
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  sessionState === 'COMPLETED' ? 'bg-zinc-500' : 'bg-emerald-500'
                }`}
              />
            </span>
            <span className="font-semibold text-xs sm:text-sm text-zinc-100">{targetSeniority} Track</span>
          </div>

          <div className="h-4 w-px bg-zinc-800" />

          <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
            <span>Topic:</span>
            <span className="font-medium text-zinc-200 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 max-w-[140px] sm:max-w-none truncate">
              {currentTopic || 'Session Warmup'}
            </span>
            {lastInterviewerTurn?.question_archetype && ARCHETYPE_CONFIG[lastInterviewerTurn.question_archetype] && (
              <span
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-mono border ${
                  ARCHETYPE_CONFIG[lastInterviewerTurn.question_archetype].badgeClass
                }`}
              >
                <span>{ARCHETYPE_CONFIG[lastInterviewerTurn.question_archetype].icon}</span>
                <span className="hidden md:inline">{ARCHETYPE_CONFIG[lastInterviewerTurn.question_archetype].label}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
          {/* Remaining Time */}
          <div className="flex items-center gap-2 rounded-lg bg-zinc-950 px-3 py-1 border border-zinc-800 shadow-sm">
            <Clock
              className={`h-3.5 w-3.5 ${
                remainingSeconds < 300 ? 'text-amber-400 animate-pulse' : 'text-emerald-400'
              }`}
            />
            <span className="font-mono text-xs sm:text-sm font-semibold tracking-wider text-zinc-100">
              {formatTimer(remainingSeconds)}
            </span>
          </div>

          {/* Voice Selector */}
          <div className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs font-mono">
            <span className="text-[11px] text-zinc-500 hidden sm:inline">Voice:</span>
            <select
              value={selectedGeminiVoice}
              onChange={(e) => handleVoiceChange(e.target.value)}
              title="Interviewer Voice Persona"
              className="bg-transparent text-[11px] font-mono text-zinc-200 focus:outline-none cursor-pointer max-w-[110px] truncate"
            >
              {GEMINI_LIVE_VOICES.map((v) => (
                <option key={v.id} value={v.id} className="bg-zinc-900 text-zinc-200">
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          {/* Technical Workspace Toggle Pill */}
          <div className="flex items-center rounded-lg bg-zinc-950 border border-zinc-800 p-0.5">
            <button
              type="button"
              onClick={() => setActiveWorkspace('NONE')}
              title="Full Video Focus (Option A)"
              className={`px-2 py-1 text-[11px] font-mono rounded transition-colors ${
                activeWorkspace === 'NONE'
                  ? 'bg-zinc-800 text-white font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              ☕ Video Focus
            </button>
            <button
              type="button"
              onClick={() => setActiveWorkspace('CODE')}
              title="Toggle Code Editor (Alt+S)"
              className={`flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded transition-colors ${
                activeWorkspace === 'CODE'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/80 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Code2 className="h-3 w-3" />
              <span className="hidden sm:inline">Code</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveWorkspace('DIAGRAM')}
              title="Toggle Architecture Canvas (Alt+D)"
              className={`flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded transition-colors ${
                activeWorkspace === 'DIAGRAM'
                  ? 'bg-sky-950 text-sky-300 border border-sky-800/80 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Network className="h-3 w-3" />
              <span className="hidden sm:inline">Diagram</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveWorkspace('TERMINAL')}
              title="Toggle Incident Debugger (Alt+T)"
              className={`flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded transition-colors ${
                activeWorkspace === 'TERMINAL'
                  ? 'bg-rose-950 text-rose-300 border border-rose-800/80 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Terminal className="h-3 w-3" />
              <span className="hidden sm:inline">Terminal</span>
            </button>
          </div>

          {/* Conclude Button */}
          <button
            type="button"
            onClick={requestConclude}
            disabled={isSubmitting}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold transition-all shadow-sm ${
              confirmingConclude
                ? 'border-rose-600 bg-rose-950/80 text-rose-200 animate-pulse'
                : 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-100'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="hidden sm:inline">Compiling...</span>
              </>
            ) : (
              <>
                <CheckCircle className="h-3.5 w-3.5" />
                <span>{confirmingConclude ? 'Confirm End' : 'End & Score'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Notifications / Errors */}
      {error && (
        <div className="mb-2.5 flex items-center gap-2 rounded-lg border border-red-900/60 bg-red-950/40 p-2.5 text-xs text-red-300 font-mono">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="mb-2.5 flex items-center gap-2 rounded-lg border border-sky-900/60 bg-sky-950/30 p-2.5 text-xs text-sky-200">
          <Info className="h-4 w-4 shrink-0 text-sky-400" />
          <span>{notice}</span>
        </div>
      )}

      {/* Main Interactive Stage */}
      <div
        className={`flex-1 min-h-0 ${
          activeWorkspace !== 'NONE' ? 'grid grid-cols-1 lg:grid-cols-12 gap-3.5' : 'flex flex-col'
        }`}
      >
        {/* OPTION A: IMMERSIVE VIDEO HUD CONTAINER */}
        <div
          className={`relative flex flex-col min-h-0 rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-2xl transition-all duration-300 ${
            activeWorkspace !== 'NONE' ? 'lg:col-span-5 h-[360px] lg:h-full' : 'flex-1'
          }`}
        >
          {/* Background Video Element (Candidate 720p HD Feed) */}
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black overflow-hidden flex items-center justify-center">
            {showCamera ? (
              <video
                ref={setRoomVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover scale-x-[-1] transition-opacity duration-300 ${
                  isRoomCameraActive ? 'opacity-100' : 'opacity-0'
                }`}
              />
            ) : null}

            {(!showCamera || !isRoomCameraActive) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-500 font-mono text-xs">
                <div className="relative w-24 h-24 rounded-full bg-zinc-900/80 border border-zinc-800 flex items-center justify-center shadow-inner">
                  <User className="h-10 w-10 text-zinc-600" />
                  <span className="absolute inset-0 rounded-full border border-emerald-500/20 animate-ping" />
                </div>
                <span>{showCamera ? 'Connecting Camera Stream...' : 'Camera Disabled'}</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/60 pointer-events-none" />
          </div>

          {/* TOP HUD: Ambient Badges (Overlaid on Video) */}
          <div className="relative z-10 flex items-center justify-between p-3 sm:p-4 pointer-events-auto">
            {/* AI Interviewer Badge */}
            <div className="flex items-center gap-2 bg-slate-950/80 backdrop-blur-md border border-sky-500/30 px-3 py-1.5 rounded-full shadow-lg">
              <Bot className="h-4 w-4 text-sky-400" />
              <div className="flex flex-col text-[11px] leading-tight">
                <span className="font-bold text-sky-300 font-mono">
                  {selectedGeminiVoice === 'Aoede' ? 'Maya (Monty AI)' : 'Alex (Monty AI)'}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {isInterviewerSpeaking ? 'Speaking...' : 'Listening...'}
                </span>
              </div>
            </div>

            {/* Candidate Audio & Equalizer */}
            <div className="flex items-center gap-2">
              <AudioEqualizer
                audioLevel={audioLevel}
                isRecording={isRecording}
                isInterviewerSpeaking={isInterviewerSpeaking}
              />
            </div>
          </div>

          {/* DUAL-COLUMN TRANSLUCENT REAL-TIME TRANSCRIPT OVERLAY */}
          <div className="relative z-10 flex-1 flex flex-col justify-end p-3 sm:p-5 pointer-events-auto overflow-y-auto space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-end">
              {/* LEFT: Interviewer Live Streaming Transcript */}
              <div className="flex flex-col gap-1.5">
                <div className="rounded-2xl border border-sky-500/25 bg-slate-950/85 p-3.5 sm:p-4.5 backdrop-blur-xl shadow-2xl text-zinc-100 transition-all">
                  <div className="flex items-center justify-between gap-2 mb-1.5 font-mono text-[11px]">
                    <span className="font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                      Interviewer
                    </span>
                    <span className="text-zinc-500">
                      Turn #{lastInterviewerTurn ? lastInterviewerTurn.turn_index : 0}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm font-sans leading-relaxed text-zinc-100 whitespace-pre-wrap">
                    {typingTurnIndex !== null
                      ? typedText
                      : lastInterviewerTurn?.transcript || 'Waiting for interviewer introduction...'}
                    {typingTurnIndex !== null && (
                      <span className="inline-block w-1.5 h-3.5 ml-1 bg-sky-400 animate-pulse align-baseline rounded-[1px]" />
                    )}
                  </p>
                </div>
              </div>

              {/* RIGHT: Candidate Live Streaming Transcript */}
              <div className="flex flex-col gap-1.5 items-end">
                <div className="w-full rounded-2xl border border-emerald-500/35 bg-slate-950/85 p-3.5 sm:p-4.5 backdrop-blur-xl shadow-2xl text-zinc-100 transition-all">
                  <div className="flex items-center justify-between gap-2 mb-1.5 font-mono text-[11px]">
                    <span className="text-zinc-500">
                      Turn #{lastCandidateTurn ? lastCandidateTurn.turn_index : 1}
                    </span>
                    <span className="font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      {isRecording && (
                        <span className="text-[10px] text-emerald-400 font-mono animate-pulse">
                          ● STREAMING
                        </span>
                      )}
                      You (Candidate)
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm font-sans leading-relaxed text-zinc-100 whitespace-pre-wrap">
                    {isRecording && partialTranscript && partialTranscript.trim()
                      ? partialTranscript
                      : lastCandidateTurn?.transcript ||
                        (isRecording ? 'Listening for your voice...' : 'Speak into your microphone naturally...')}
                    {isRecording && (
                      <span className="inline-block w-1.5 h-3.5 ml-1 bg-emerald-400 animate-pulse align-baseline rounded-[1px]" />
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Conversation History Drawer (Collapsible) */}
            {showHistoryDrawer && turns.length > 2 && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/95 p-3 backdrop-blur-2xl space-y-2 text-xs font-mono shadow-2xl">
                <div className="flex items-center justify-between text-zinc-400 border-b border-zinc-800 pb-1.5 mb-1">
                  <span className="flex items-center gap-1.5 font-semibold text-zinc-200">
                    <History className="h-3.5 w-3.5 text-zinc-400" /> Earlier Turns ({turns.length - 2})
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowHistoryDrawer(false)}
                    className="text-[11px] text-zinc-400 hover:text-white"
                  >
                    Hide
                  </button>
                </div>
                {turns.slice(0, -2).map((t, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded border text-[11px] font-sans ${
                      t.speaker === 'INTERVIEWER'
                        ? 'border-sky-950 bg-sky-950/20 text-zinc-300'
                        : 'border-emerald-950 bg-emerald-950/20 text-zinc-200'
                    }`}
                  >
                    <span className="font-semibold font-mono text-[10px] uppercase text-zinc-400 mr-2">
                      {t.speaker}:
                    </span>
                    {t.transcript}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* BOTTOM HUD: Controls & Ergonomics Bar */}
          <div className="relative z-10 flex items-center justify-between px-3 sm:px-4 py-2.5 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-auto border-t border-zinc-800/50">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleCamera}
                title="Toggle Camera"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition-colors ${
                  showCamera
                    ? 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
                    : 'border-rose-900 bg-rose-950/80 text-rose-300'
                }`}
              >
                {showCamera ? <Camera className="h-3.5 w-3.5 text-emerald-400" /> : <CameraOff className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{showCamera ? 'Camera On' : 'Camera Off'}</span>
              </button>

              {turns.length > 2 && (
                <button
                  type="button"
                  onClick={() => setShowHistoryDrawer((prev) => !prev)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 text-xs font-mono"
                >
                  <History className="h-3 w-3" />
                  <span>{showHistoryDrawer ? 'Hide History' : 'History'}</span>
                </button>
              )}
            </div>

            {/* Barge-In Action */}
            <div className="flex items-center gap-2">
              {(isInterviewerSpeaking || typingTurnIndex !== null) && (
                <button
                  type="button"
                  onClick={handleBargeIn}
                  title="Interrupt Interviewer (Esc)"
                  className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/20 text-amber-200 border border-amber-500/50 hover:bg-amber-500/30 text-xs font-semibold animate-pulse shadow-sm"
                >
                  <Hand className="h-3.5 w-3.5 text-amber-300" />
                  <span>Interrupt</span>
                  <kbd className="hidden md:inline-block px-1 py-0.2 text-[10px] font-mono bg-zinc-900 text-amber-300 rounded border border-amber-500/40">
                    Esc
                  </kbd>
                </button>
              )}
              <span className="text-[11px] font-mono text-zinc-400 hidden lg:inline">
                Natural Voice Active · Speak to respond
              </span>
            </div>
          </div>
        </div>

        {/* CONDITIONAL TECHNICAL WORKSPACES PANEL */}
        {activeWorkspace !== 'NONE' && (
          <div className="lg:col-span-7 flex flex-col min-h-0 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-3.5 sm:p-4 backdrop-blur-md shadow-2xl font-mono space-y-3">
            {/* Workspace Header & Tool Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setActiveWorkspace('CODE')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-medium transition-colors ${
                      activeWorkspace === 'CODE'
                        ? 'bg-zinc-800 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Code2 className="h-3 w-3 text-emerald-400" />
                    <span>Code Editor</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveWorkspace('DIAGRAM')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-medium transition-colors ${
                      activeWorkspace === 'DIAGRAM'
                        ? 'bg-zinc-800 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Network className="h-3 w-3 text-sky-400" />
                    <span>Whiteboard Canvas</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveWorkspace('TERMINAL')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-medium transition-colors ${
                      activeWorkspace === 'TERMINAL'
                        ? 'bg-zinc-800 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Terminal className="h-3 w-3 text-rose-400" />
                    <span>Incident Terminal</span>
                  </button>
                </div>
                {activeWorkspace === 'CODE' && (
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] font-mono font-medium text-emerald-400 border border-zinc-700">
                    {preferredLanguage || 'Python'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {activeWorkspace === 'CODE' && (
                  <button
                    type="button"
                    onClick={() => handleRunCode()}
                    disabled={isRunningCode || !scratchpadCode.trim()}
                    className="flex items-center gap-1 rounded bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-400 border border-emerald-800/80 px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                  >
                    {isRunningCode ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-emerald-400" />}
                    <span>{isRunningCode ? 'Executing...' : 'Run Code'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const content =
                      activeWorkspace === 'CODE'
                        ? scratchpadCode
                        : activeWorkspace === 'DIAGRAM'
                          ? diagramCode
                          : incidentLogs.join('\n');
                    navigator.clipboard.writeText(content);
                    setCopiedSnippet(true);
                    setTimeout(() => setCopiedSnippet(false), 2000);
                  }}
                  title="Copy content"
                  className="rounded p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setActiveWorkspace('NONE')}
                  title="Minimize workspace (Return to Full Video Focus)"
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono text-zinc-400 hover:text-white rounded border border-zinc-800 hover:border-zinc-700"
                >
                  <Minimize2 className="h-3 w-3" />
                  <span>Minimize</span>
                </button>
              </div>
            </div>

            {/* 1. CODE EDITOR WORKSPACE */}
            {activeWorkspace === 'CODE' && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-500">Contextual Boilerplate:</span>
                    {activeTemplates.map((tmpl) => (
                      <button
                        key={tmpl.name}
                        type="button"
                        onClick={() => setScratchpadCode(tmpl.snippet)}
                        className="rounded bg-zinc-950 px-2 py-0.5 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 border border-zinc-800 transition-colors"
                      >
                        {tmpl.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 min-h-[200px] flex flex-col">
                  <textarea
                    value={scratchpadCode}
                    onChange={(e) => setScratchpadCode(e.target.value)}
                    placeholder="Write clean implementation code or algorithmic primitives here..."
                    className="w-full flex-1 rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 resize-none leading-relaxed"
                  />
                </div>

                {executionOutput && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] text-zinc-300 space-y-1.5 shadow-inner">
                    <div className="flex items-center justify-between text-zinc-500 border-b border-zinc-800/80 pb-1">
                      <span className="flex items-center gap-1.5 font-semibold text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {preferredLanguage || 'Execution'} Terminal Output
                      </span>
                      <button
                        type="button"
                        onClick={() => setExecutionOutput(null)}
                        className="text-[11px] text-zinc-400 hover:text-white"
                      >
                        Clear
                      </button>
                    </div>
                    <pre className="whitespace-pre-wrap overflow-x-auto max-h-32 text-zinc-200 font-mono text-[11px] leading-relaxed">
                      {executionOutput}
                    </pre>
                  </div>
                )}
              </>
            )}

            {/* 2. ARCHITECTURE WHITEBOARD CANVAS */}
            {activeWorkspace === 'DIAGRAM' && (
              <>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-zinc-500">Architecture Presets:</span>
                  {DIAGRAM_PRESETS.map((dp) => (
                    <button
                      key={dp.name}
                      type="button"
                      onClick={() => setDiagramCode(dp.syntax)}
                      className="rounded bg-zinc-950 px-2 py-0.5 text-zinc-400 hover:text-sky-300 hover:border-sky-800 border border-zinc-800 transition-colors"
                      title={dp.description}
                    >
                      {dp.name}
                    </button>
                  ))}
                </div>

                <SvgDiagramPreview syntax={diagramCode} />

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>Mermaid Canvas Definition</span>
                    <span>Supports flowchart TD/LR &amp; sequenceDiagram</span>
                  </div>
                  <textarea
                    value={diagramCode}
                    onChange={(e) => setDiagramCode(e.target.value)}
                    placeholder="flowchart TD\n  Client --> Gateway\n  Gateway --> DB[(PostgreSQL)]"
                    rows={3}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 font-mono text-[11px] text-zinc-300 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 resize-none leading-relaxed"
                  />
                </div>
              </>
            )}

            {/* 3. INCIDENT DEBUGGING & TRIAGE TERMINAL */}
            {activeWorkspace === 'TERMINAL' && (
              <>
                <div className="flex items-center justify-between text-[11px] text-zinc-400 border-b border-zinc-800 pb-1.5">
                  <span className="flex items-center gap-1.5 font-semibold text-rose-400">
                    <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" /> Live Production Cluster Logs
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500">Source: us-east-1 (5 nodes)</span>
                </div>

                <div className="rounded-lg border border-zinc-800 bg-black/90 p-3 font-mono text-[11px] text-zinc-300 max-h-40 overflow-y-auto space-y-1 shadow-inner">
                  {incidentLogs.map((log, i) => (
                    <div
                      key={i}
                      className={`leading-relaxed ${
                        log.includes('FATAL') || log.includes('ERROR')
                          ? 'text-rose-400 font-semibold'
                          : log.includes('WARN')
                            ? 'text-amber-400'
                            : 'text-zinc-400'
                      }`}
                    >
                      {log}
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>Diagnostic Triage Script ({preferredLanguage || 'Python'})</span>
                    <button
                      type="button"
                      onClick={() => handleRunCode(incidentScript)}
                      disabled={isRunningCode}
                      className="flex items-center gap-1 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 px-2 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-40"
                    >
                      <Play className="h-3 w-3 fill-rose-300" />
                      <span>Run Triage</span>
                    </button>
                  </div>
                  <textarea
                    value={incidentScript}
                    onChange={(e) => setIncidentScript(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 font-mono text-[11px] text-zinc-300 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 resize-none leading-relaxed"
                  />
                </div>

                {executionOutput && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 font-mono text-[11px] text-zinc-300">
                    <span className="text-rose-400 font-semibold block mb-1">Diagnostic Output:</span>
                    <pre className="whitespace-pre-wrap overflow-x-auto text-zinc-200 max-h-24 leading-relaxed">
                      {executionOutput}
                    </pre>
                  </div>
                )}
              </>
            )}

            {/* Attach Workspace Content to Submission */}
            <div className="flex items-center justify-between pt-1 text-[11px] text-zinc-400 border-t border-zinc-800/60">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={attachScratchpad}
                  onChange={(e) => setAttachScratchpad(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-950 text-white focus:ring-0 focus:ring-offset-0"
                />
                <span>Attach workspace artifact to current turn evaluation</span>
              </label>
              {copiedSnippet && <span className="text-emerald-400 font-semibold">Copied!</span>}
            </div>
          </div>
        )}
      </div>

      {/* Fallback Text Input Composer for TEXT mode */}
      {showComposer && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmitTyped();
          }}
          className="mt-3 space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/90 p-3 shadow-lg"
        >
          <textarea
            value={typedAnswer}
            onChange={(e) => setTypedAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void handleSubmitTyped();
              }
            }}
            rows={2}
            placeholder={awaitingCandidate ? 'Type your answer… (Ctrl+Enter to send)' : 'Waiting for interviewer…'}
            disabled={sessionState === 'COMPLETED'}
            className="w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 font-mono"
          />
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Ctrl+Enter to send</span>
            <button
              type="submit"
              disabled={!typedAnswer.trim() || isSubmitting || sessionState === 'COMPLETED'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Send
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

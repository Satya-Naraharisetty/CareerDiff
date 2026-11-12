import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle,
  Clock,
  Code2,
  Copy,
  Hand,
  Layers,
  Loader2,
  Mic,
  MicOff,
  Network,
  Play,
  Send,
  Trash2,
  User,
  Video,
  VideoOff,
  Volume2,
  X,
} from 'lucide-react';
import { useInterviewStore } from '../stores/interviewStore';

interface InterviewRoomProps {
  onConclude: () => void;
}

interface DiagramPreset {
  name: string;
  syntax: string;
  description: string;
}

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
  { label: string; badgeClass: string; icon: string }
> = {
  WARMUP_MOTIVATION: {
    label: 'Warmup & Role Motivation',
    badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80',
    icon: '☕',
  },
  SKILL_FUNDAMENTALS: {
    label: 'Skill Fundamentals',
    badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
    icon: '⚡',
  },
  SYSTEM_ARCHITECTURE: {
    label: 'System Architecture',
    badgeClass: 'bg-indigo-950/80 text-indigo-300 border-indigo-800/80',
    icon: '🏛️',
  },
  SCENARIO_DECISION: {
    label: 'Architectural Dilemma',
    badgeClass: 'bg-purple-950/80 text-purple-300 border-purple-800/80',
    icon: '⚖️',
  },
  ANALYZING_DESIGN: {
    label: 'System Design Framing',
    badgeClass: 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80',
    icon: '📐',
  },
  DEBUGGING_INCIDENT: {
    label: 'Production Incident Triage',
    badgeClass: 'bg-rose-950/80 text-rose-300 border-rose-800/80',
    icon: '🐞',
  },
  CODE_REVIEW: {
    label: 'Live Code Review',
    badgeClass: 'bg-teal-950/80 text-teal-300 border-teal-800/80',
    icon: '💻',
  },
  COMPANY_SPECIFIC: {
    label: 'Company Domain Challenge',
    badgeClass: 'bg-blue-950/80 text-blue-300 border-blue-800/80',
    icon: '🏢',
  },
  REVERSE_QA: {
    label: 'Candidate Reverse Q&A',
    badgeClass: 'bg-violet-950/80 text-violet-300 border-violet-800/80',
    icon: '❓',
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
            <Layers className="h-3.5 w-3.5" /> Sequence Lifecycle Topology
          </span>
          <span className="text-[10px] text-zinc-500">{actors.length} Participants</span>
        </div>
        <div className="flex justify-around gap-2 pb-2">
          {actors.map((actor) => (
            <div
              key={actor}
              className="rounded-lg border border-sky-800/60 bg-sky-950/40 px-3 py-1 text-center font-bold text-sky-300 shadow-sm text-[11px]"
            >
              {actor}
            </div>
          ))}
        </div>
        <div className="space-y-1.5 pt-1 border-t border-zinc-800/80">
          {lines.map((step, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 rounded bg-zinc-900/80 px-2.5 py-1.5 border border-zinc-800/80 text-zinc-300 text-[11px]"
            >
              <span className="text-zinc-500 font-bold">{idx + 1}.</span>
              <span className="text-sky-400">⟶</span>
              <span className="truncate">{step.replace(/^[a-zA-Z0-9_]+\s*(?:->>|-->>)\s*[a-zA-Z0-9_]+:\s*/, '')}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Flowchart visualizer
  const nodeMatches = Array.from(
    syntax.matchAll(/([a-zA-Z0-9_]+)(?:\[(.*?)\]|\(\[(.*?)\]\))/g)
  );
  const nodes = nodeMatches.map((m) => ({
    id: m[1],
    label: m[2] || m[3] || m[1],
    isDb: syntax.includes(`${m[1]}[(`),
  }));

  const connections = Array.from(
    syntax.matchAll(/([a-zA-Z0-9_]+)\s*(?:-->|-\.->)\s*([a-zA-Z0-9_]+)/g)
  ).map((m) => ({ from: m[1], to: m[2] }));

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs overflow-x-auto space-y-4">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2 text-[11px] text-zinc-400">
        <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
          <Network className="h-3.5 w-3.5" /> Architecture Component Graph
        </span>
        <span className="text-[10px] text-zinc-500">{nodes.length} Components, {connections.length} Edges</span>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 py-2">
        {nodes.map((node, i) => (
          <React.Fragment key={node.id}>
            <div
              className={`rounded-xl px-3.5 py-2 text-center shadow-md border transition-all ${node.isDb
                  ? 'border-indigo-700/80 bg-indigo-950/40 text-indigo-300 ring-1 ring-indigo-500/20'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-200'
                }`}
            >
              <div className="text-[10px] text-zinc-500 font-mono uppercase">
                {node.isDb ? 'Storage / Queue' : 'Service Node'}
              </div>
              <div className="text-xs font-bold font-sans mt-0.5">{node.label}</div>
            </div>
            {i < nodes.length - 1 && (
              <span className="text-emerald-400 text-sm font-bold animate-pulse">➔</span>
            )}
          </React.Fragment>
        ))}
      </div>

      {connections.length > 0 && (
        <div className="border-t border-zinc-800/80 pt-2 flex flex-wrap gap-2 text-[10px] text-zinc-400">
          <span className="text-zinc-500">Connections:</span>
          {connections.map((c, idx) => (
            <span
              key={idx}
              className="rounded bg-zinc-900 px-2 py-0.5 border border-zinc-800 font-mono text-zinc-300"
            >
              {c.from} ➔ {c.to}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

interface ScratchpadTemplate {
  name: string;
  snippet: string;
  language: string;
}

const getLanguageTemplates = (lang: string = 'Python'): ScratchpadTemplate[] => {
  const common: ScratchpadTemplate[] = [
    {
      name: 'SQL Ledger',
      language: 'SQL',
      snippet: `-- Idempotent Financial Ledger Table
CREATE TABLE ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    account_id UUID NOT NULL,
    amount_cents BIGINT NOT NULL,
    direction VARCHAR(6) CHECK (direction IN ('DEBIT', 'CREDIT')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ledger_account_created ON ledger_entries (account_id, created_at DESC);`,
    },
    {
      name: 'Kafka Partitioning',
      language: 'Topology',
      snippet: `[Payment Producer] 
       | (Partition Key: account_id)
       v
[Kafka Topic: payment-events]
   |---> [Partition 0] ---> [Consumer Worker A (Strict In-Order)]
   |---> [Partition 1] ---> [Consumer Worker B (Strict In-Order)]`,
    },
  ];

  switch (lang.toLowerCase()) {
    case 'java':
      return [
        {
          name: 'Virtual Threads',
          language: 'Java',
          snippet: `// Java 21+ Virtual Threads High-Throughput Executor
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    IntStream.range(0, 10_000).forEach(i -> {
        executor.submit(() -> {
            Thread.sleep(Duration.ofMillis(10));
            return i;
        });
    });
}`,
        },
        {
          name: 'Concurrent LRU',
          language: 'Java',
          snippet: `// Thread-Safe LRU Cache with ReentrantReadWriteLock
public class ConcurrentLRUCache<K, V> {
    private final int capacity;
    private final Map<K, V> cache;
    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();
    public ConcurrentLRUCache(int cap) {
        this.capacity = cap;
        this.cache = new LinkedHashMap<>(cap, 0.75f, true) {
            protected boolean removeEldestEntry(Map.Entry<K, V> e) {
                return size() > capacity;
            }
        };
    }
}`,
        },
        ...common,
      ];
    case 'go':
      return [
        {
          name: 'Worker Pool',
          language: 'Go',
          snippet: `// Buffered Worker Pool with Context Cancellation
func RunWorkerPool(ctx context.Context, jobs <-chan int, results chan<- int, workers int) {
    var wg sync.WaitGroup
    for w := 1; w <= workers; w++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()
            for {
                select {
                case <-ctx.Done():
                    return
                case j, ok := <-jobs:
                    if !ok { return }
                    results <- j * 2
                }
            }
        }(w)
    }
    wg.Wait()
}`,
        },
        {
          name: 'Sliding Limiter',
          language: 'Go',
          snippet: `// Sliding Window Rate Limiter with sync.Mutex
type Limiter struct {
    mu      sync.Mutex
    history []time.Time
    limit   int
    window  time.Duration
}
func (l *Limiter) Allow() bool {
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
        {
          name: 'Sliding Limiter',
          language: 'TypeScript',
          snippet: `// Sliding-window rate limiter
function checkRateLimit(timestamps: number[], limit = 5, windowMs = 60000): boolean {
  const now = Date.now();
  const valid = timestamps.filter(ts => now - ts < windowMs);
  if (valid.length >= limit) return false;
  valid.push(now);
  return true;
}
console.log("Allowed:", checkRateLimit([Date.now() - 5000]));`,
        },
        ...common,
      ];
    case 'rust':
      return [
        {
          name: 'Channel Pipeline',
          language: 'Rust',
          snippet: `// MPSC Channel Pipeline with Tokio
use tokio::sync::mpsc;
#[tokio::main]
async fn main() {
    let (tx, mut rx) = mpsc::channel(100);
    tokio::spawn(async move {
        for i in 0..5 {
            tx.send(format!("event_{}", i)).await.unwrap();
        }
    });
    while let Some(msg) = rx.recv().await {
        println!("Processed: {}", msg);
    }
}`,
        },
        ...common,
      ];
    default: // Python
      return [
        {
          name: 'RRF Fusion (RAG)',
          language: 'Python',
          snippet: `def reciprocal_rank_fusion(dense_ranks: dict[str, int], bm25_ranks: dict[str, int], k: int = 60) -> list[tuple[str, float]]:
    """Combines dense vector search and sparse BM25 ranks using RRF."""
    rrf_scores: dict[str, float] = {}
    for doc_id, rank in dense_ranks.items():
        rrf_scores[doc_id] = rrf_scores.get(doc_id, 0.0) + (1.0 / (k + rank))
    for doc_id, rank in bm25_ranks.items():
        rrf_scores[doc_id] = rrf_scores.get(doc_id, 0.0) + (1.0 / (k + rank))
    return sorted(rrf_scores.items(), key=lambda item: item[1], reverse=True)

dense = {"doc_1": 1, "doc_2": 2, "doc_3": 3}
bm25 = {"doc_2": 1, "doc_4": 2, "doc_1": 3}
print("Fused rankings:", reciprocal_rank_fusion(dense, bm25))`,
        },
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

const AudioEqualizer: React.FC<{
  audioLevel: number;
  isRecording: boolean;
  isInterviewerSpeaking: boolean;
}> = ({ audioLevel, isRecording, isInterviewerSpeaking }) => {
  const bars = 16;
  return (
    <div className="flex items-center gap-2.5 h-9 px-3 py-1 rounded-lg bg-zinc-950 border border-zinc-800 shrink-0">
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
              className={`flex-1 rounded-full transition-all duration-75 ${isRecording
                  ? 'bg-emerald-400 shadow-sm shadow-emerald-500/20'
                  : isInterviewerSpeaking
                    ? 'bg-zinc-200 animate-pulse'
                    : 'bg-zinc-800'
                }`}
              style={{ height: `${heightPercent}%` }}
            />
          );
        })}
      </div>
      <div className="flex flex-col text-[10px] font-mono leading-tight">
        <span
          className={
            isRecording
              ? 'text-emerald-400 font-semibold'
              : isInterviewerSpeaking
                ? 'text-zinc-200 font-semibold'
                : 'text-zinc-500'
          }
        >
          {isRecording ? 'PCM STREAM' : isInterviewerSpeaking ? 'INTERVIEWER' : 'STANDBY'}
        </span>
        <span className="text-zinc-600 hidden sm:inline text-[9px]">16kHz Mono</span>
      </div>
    </div>
  );
};

export const InterviewRoom: React.FC<InterviewRoomProps> = ({ onConclude }) => {
  const {
    state: sessionState,
    mode,
    targetSeniority,
    blueprint,
    turns,
    partialTranscript,
    isSubmitting,
    wsStatus,
    isRecording,
    audioLevel,
    isInterviewerSpeaking,
    currentTopic,
    remainingSeconds,
    preferredLanguage,
    error,
    startInterview,
    submitTextTurn,
    initVoiceSession,
    startVoiceRecording,
    stopVoiceRecording,
    bargeIn,
    concludeSession,
  } = useInterviewStore();

  const [textInput, setTextInput] = useState('');
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [scratchpadCode, setScratchpadCode] = useState('');
  const [scratchpadTab, setScratchpadTab] = useState<'CODE' | 'DIAGRAM'>('CODE');
  const [diagramCode, setDiagramCode] = useState<string>(DIAGRAM_PRESETS[0].syntax);
  const [attachScratchpad, setAttachScratchpad] = useState(true);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [executionOutput, setExecutionOutput] = useState<string | null>(null);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [showCamera, setShowCamera] = useState<boolean>(true);
  const [isRoomCameraActive, setIsRoomCameraActive] = useState<boolean>(false);
  const [showTextFallbackInVoice, setShowTextFallbackInVoice] = useState<boolean>(false);
  const roomVideoRef = useRef<HTMLVideoElement | null>(null);
  const roomStreamRef = useRef<MediaStream | null>(null);

  const activeTemplates = React.useMemo(
    () => getLanguageTemplates(preferredLanguage || 'Python'),
    [preferredLanguage]
  );

  const handleRunCode = async () => {
    if (!scratchpadCode.trim()) return;
    setIsRunningCode(true);
    setExecutionOutput(null);

    const langLower = (preferredLanguage || 'python').toLowerCase();

    // Browser JavaScript / TypeScript Execution
    if (langLower.includes('script')) {
      const logs: string[] = [];
      const originalLog = console.log;
      try {
        console.log = (...args: any[]) =>
          logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
        const res = new Function(scratchpadCode)();
        let out = logs.join('\n');
        if (res !== undefined) out = out ? `${out}\nReturned: ${res}` : `Returned: ${res}`;
        setExecutionOutput(out || '✓ JavaScript executed successfully with exit code 0.');
      } catch (err: any) {
        setExecutionOutput(`JavaScript Execution Error:\n${err.message || String(err)}`);
      } finally {
        console.log = originalLog;
        setIsRunningCode(false);
      }
      return;
    }

    // Python WebAssembly Execution (Pyodide)
    if (langLower === 'python') {
      try {
        const win = window as any;
        if (!win.loadPyodide) {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';
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
        const result = await pyodide.runPythonAsync(scratchpadCode);
        let finalOut = stdoutBuffer.join('\n');
        if (result !== undefined && result !== null) {
          finalOut = finalOut ? `${finalOut}\nReturned: ${result}` : `Returned: ${result}`;
        }
        setExecutionOutput(finalOut || '✓ Python executed with exit code 0 (no output).');
      } catch (err: any) {
        setExecutionOutput(`Execution Error:\n${err.message || String(err)}`);
      } finally {
        setIsRunningCode(false);
      }
      return;
    }

    // Non-interpreted languages (Java, Go, Rust, C++, C#, SQL)
    setExecutionOutput(
      `ℹ️ ${preferredLanguage} Syntax Ready:\nIn-browser WebAssembly execution is active for Python and JavaScript.\nYour ${preferredLanguage} architecture snippet is formatted and will be automatically attached to your next turn for AI evaluation.`
    );
    setIsRunningCode(false);
  };
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const hasStartedRef = useRef(false);
  const hasVoiceInitedRef = useRef(false);

  // Auto-scroll on turns or partial text updates
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, partialTranscript, isInterviewerSpeaking]);

  // Initialize session on mount
  useEffect(() => {
    if (sessionState === 'CREATED' && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startInterview();
    }
    if (mode === 'VOICE' && wsStatus === 'disconnected' && !hasVoiceInitedRef.current) {
      hasVoiceInitedRef.current = true;
      initVoiceSession();
    }
  }, [sessionState, mode, wsStatus, startInterview, initVoiceSession]);

  // Camera stream lifecycle for candidate self-preview in interview room
  useEffect(() => {
    let active = true;
    if (showCamera) {
      navigator.mediaDevices
        ?.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: 'user' },
        })
        .then((stream) => {
          if (!active) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          roomStreamRef.current = stream;
          setIsRoomCameraActive(true);
          if (roomVideoRef.current) {
            roomVideoRef.current.srcObject = stream;
            roomVideoRef.current.play().catch(() => {});
          }
        })
        .catch((err) => {
          console.warn('Candidate camera not available in interview room:', err);
          if (active) {
            setIsRoomCameraActive(false);
            setShowCamera(false);
          }
        });
    }

    return () => {
      active = false;
      if (roomStreamRef.current) {
        roomStreamRef.current.getTracks().forEach((track) => track.stop());
        roomStreamRef.current = null;
      }
    };
  }, [showCamera]);

  // Cleanup on unmount: guarantee hardware microphone and camera are stopped when leaving room
  useEffect(() => {
    return () => {
      stopVoiceRecording();
      if (roomStreamRef.current) {
        roomStreamRef.current.getTracks().forEach((track) => track.stop());
        roomStreamRef.current = null;
      }
    };
  }, [stopVoiceRecording]);

  // Global ergonomics keyboard listeners (Space = Mic, Esc = Barge-In, S = Scratchpad)
  useEffect(() => {
    const handleRoomKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.code === 'Space' && mode === 'VOICE' && wsStatus === 'connected') {
        e.preventDefault();
        if (isRecording) {
          stopVoiceRecording();
        } else {
          startVoiceRecording();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        bargeIn();
      } else if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowScratchpad((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleRoomKeyDown);
    return () => window.removeEventListener('keydown', handleRoomKeyDown);
  }, [mode, wsStatus, isRecording, stopVoiceRecording, startVoiceRecording, bargeIn]);

  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!textInput.trim() || isSubmitting) return;

    const msg = textInput;
    let snippet: string | undefined = undefined;
    if (attachScratchpad) {
      if (scratchpadTab === 'DIAGRAM' && diagramCode.trim()) {
        snippet = `\`\`\`mermaid\n${diagramCode.trim()}\n\`\`\``;
      } else if (scratchpadCode.trim()) {
        snippet = scratchpadCode.trim();
        if (executionOutput) {
          snippet = `${snippet}\n\n[Console Output]:\n${executionOutput}`;
        }
      }
    }
    setTextInput('');
    await submitTextTurn(msg, snippet);
  };

  const handleConclude = async () => {
    const taskId = await concludeSession();
    if (taskId !== null) {
      onConclude();
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-6xl flex-col px-4 py-4 sm:px-6">
      {/* Session Top Status Bar */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/90 px-4 py-3 backdrop-blur-md shadow-sm">
        {/* Left: Active topic & state */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 font-mono">
            <span className="relative flex h-2.5 w-2.5">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${sessionState === 'COMPLETED' ? 'bg-zinc-500' : 'bg-emerald-400 animate-ping'
                }`} />
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${sessionState === 'COMPLETED' ? 'bg-zinc-500' : 'bg-emerald-500'
                }`} />
            </span>
            <span className="font-semibold text-xs sm:text-sm text-zinc-100">{targetSeniority} Track</span>
          </div>

          <div className="h-4 w-px bg-zinc-800" />

          <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
            <span>Topic:</span>
            <span className="font-medium text-zinc-200 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 max-w-[150px] sm:max-w-none truncate">
              {currentTopic || 'Session Warmup'}
            </span>
            {blueprint?.topics?.find((t) => t.topic_name === currentTopic && t.mapped_claims_count > 0) && (
              <span className="hidden lg:inline-flex items-center gap-1 rounded bg-emerald-950/60 px-2 py-0.5 text-[10px] font-mono font-medium text-emerald-400 border border-emerald-800/40">
                <CheckCircle className="h-3 w-3 text-emerald-400" />
                Claim Grounded
              </span>
            )}
          </div>

          <span className="hidden md:inline-flex rounded border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[11px] font-mono text-zinc-400">
            {sessionState}
          </span>
        </div>

        {/* Right Section: Countdown Timer & Conclude Action */}
        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
          {/* Countdown timer */}
          <div className="flex items-center gap-2 rounded-lg bg-zinc-950 px-3 py-1.5 border border-zinc-800">
            <Clock className={`h-3.5 w-3.5 ${remainingSeconds < 300 ? 'text-amber-400 animate-pulse' : 'text-zinc-400'}`} />
            <span className="font-mono text-xs sm:text-sm font-semibold tracking-wider text-zinc-100">
              {formatTimer(remainingSeconds)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Scratchpad Toggle Button */}
            <button
              type="button"
              onClick={() => setShowScratchpad((prev) => !prev)}
              title="Toggle Architecture & Code Scratchpad (Key: S)"
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-mono font-medium border transition-colors ${showScratchpad
                  ? 'border-zinc-500 bg-zinc-800 text-white shadow-sm'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Scratchpad</span>
              <kbd className="hidden md:inline-block px-1 py-0.5 text-[9px] font-mono bg-zinc-900 text-zinc-400 rounded border border-zinc-800">S</kbd>
              {scratchpadCode.trim() && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              )}
            </button>

            {/* Camera Preview Toggle Button */}
            <button
              type="button"
              onClick={() => setShowCamera((prev) => !prev)}
              title="Toggle Candidate Video Self-Preview"
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-mono font-medium border transition-colors ${
                showCamera
                  ? 'border-emerald-700/80 bg-emerald-950/40 text-emerald-300 shadow-sm'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
              }`}
            >
              {showCamera ? (
                <Video className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <VideoOff className="h-3.5 w-3.5 text-zinc-500" />
              )}
              <span className="hidden sm:inline">Camera</span>
            </button>

            <button
              type="button"
              onClick={handleConclude}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 sm:px-3.5 py-1.5 text-xs font-semibold text-zinc-950 shadow-sm hover:bg-zinc-200 disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Compiling...
                </>
              ) : (
                <>
                  <CheckCircle className="h-3.5 w-3.5" />
                  Conclude &amp; Score
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-300 font-mono">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Middle Work Area: Split Screen when Scratchpad is open */}
      <div className={`flex-1 min-h-0 ${showScratchpad ? 'grid grid-cols-1 lg:grid-cols-12 gap-4' : 'flex flex-col'}`}>
        {/* Main Conversation Stream & Input Column */}
        <div className={`relative flex flex-col min-h-0 ${showScratchpad ? 'lg:col-span-7' : 'flex-1'}`}>
          {/* Floating Candidate Camera Self-Preview */}
          {showCamera && isRoomCameraActive && (
            <div className="absolute top-3 right-3 z-20 w-36 sm:w-44 rounded-xl border border-zinc-700 bg-zinc-950/90 shadow-2xl overflow-hidden backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
              <div className="relative aspect-video w-full bg-zinc-900">
                <video
                  ref={roomVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
                <div className="absolute top-1 left-1 flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-950/70 border border-zinc-800/80 text-[9px] font-mono text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Self-View
                </div>
                <button
                  type="button"
                  onClick={() => setShowCamera(false)}
                  className="absolute top-1 right-1 p-0.5 rounded bg-zinc-950/70 text-zinc-400 hover:text-white transition-colors"
                  title="Hide camera preview"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-6 space-y-4 backdrop-blur-sm shadow-inner">
            {turns.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center text-zinc-500 py-12">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400 mb-3" />
                <p className="text-sm font-medium text-zinc-300 font-mono">Initiating interview state machine...</p>
                <p className="text-xs text-zinc-500 mt-1 font-mono">Generating initial warmup greeting.</p>
              </div>
            )}

            {turns.map((turn, idx) => {
              const isInterviewer = turn.speaker === 'INTERVIEWER';
              return (
                <div
                  key={idx}
                  className={`flex gap-3 sm:gap-4 ${isInterviewer ? 'justify-start' : 'justify-end'}`}
                >
                  {isInterviewer && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300">
                      <Bot className="h-4 w-4 text-zinc-300" />
                    </div>
                  )}

                  <div
                    className={`max-w-[90%] sm:max-w-[75%] rounded-xl p-4 shadow-sm ${isInterviewer
                        ? 'rounded-tl-none border border-zinc-800 bg-zinc-950 text-zinc-200'
                        : 'rounded-tr-none border border-zinc-700 bg-zinc-800 text-white'
                      }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5 font-mono">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold tracking-tight">
                          {isInterviewer ? 'CareerDiff Evaluator' : 'Candidate'}
                        </span>
                        {turn.action_taken && (
                          <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300 border border-zinc-800">
                            {turn.action_taken}
                          </span>
                        )}
                        {turn.question_archetype && ARCHETYPE_CONFIG[turn.question_archetype] && (
                          <span
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono border ${ARCHETYPE_CONFIG[turn.question_archetype].badgeClass
                              }`}
                          >
                            <span>{ARCHETYPE_CONFIG[turn.question_archetype].icon}</span>
                            <span>{ARCHETYPE_CONFIG[turn.question_archetype].label}</span>
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-500">Turn #{turn.turn_index}</span>
                    </div>

                    <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans">{turn.transcript}</p>

                    {turn.code_sample && (
                      <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 overflow-x-auto shadow-inner">
                        <div className="flex items-center justify-between text-[10px] text-zinc-400 border-b border-zinc-800/80 pb-1.5 mb-2">
                          <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                            <span>💻</span> Attached Code Sample for Review
                          </span>
                          <span className="text-zinc-500 font-mono text-[9px]">Inspect concurrency / memory leaks</span>
                        </div>
                        <pre className="whitespace-pre font-mono text-xs text-zinc-300 leading-relaxed">
                          {turn.code_sample}
                        </pre>
                      </div>
                    )}
                  </div>

                  {!isInterviewer && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300">
                      <User className="h-4 w-4 text-zinc-300" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Live Partial Speech Feedback (Candidate speaking) */}
            {partialTranscript && (
              <div className="flex justify-end gap-3 sm:gap-4 animate-in fade-in duration-150">
                <div className="max-w-[75%] rounded-xl rounded-tr-none bg-zinc-900 border border-zinc-700 p-4 text-white shadow-sm font-mono">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-semibold text-zinc-300">Live Transcription</span>
                    <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                  </div>
                  <p className="text-xs sm:text-sm text-zinc-200">{partialTranscript}...</p>
                </div>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700">
                  <User className="h-4 w-4 text-zinc-300" />
                </div>
              </div>
            )}

            {/* Interviewer Speaking Notification Indicator */}
            {isInterviewerSpeaking && (
              <div className="flex items-center gap-2.5 text-xs text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 w-fit font-mono">
                <Volume2 className="h-3.5 w-3.5 animate-pulse text-zinc-300" />
                <span>Interviewer audio streaming in progress...</span>
              </div>
            )}

            {isSubmitting && (
              <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                Analyzing technical turn and selecting adaptive action...
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Bottom Interaction Console */}
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/90 p-4 backdrop-blur-md shadow-sm">
            {mode === 'VOICE' ? (
              /* Voice Mode Controls */
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  {/* Mic Button & State */}
                  <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:items-center sm:gap-4">
                    <button
                      type="button"
                      onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                      disabled={wsStatus !== 'connected'}
                      className={`flex items-center justify-center gap-2 rounded-lg py-2.5 px-4 sm:px-5 text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] ${
                        isRecording
                          ? 'bg-rose-600 text-white shadow-rose-600/20 hover:bg-rose-500'
                          : 'bg-white text-zinc-950 hover:bg-zinc-200 shadow-sm'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {isRecording ? (
                        <>
                          <MicOff className="h-4 w-4" />
                          <span>Stop Recording</span>
                          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-rose-700 text-white rounded border border-rose-500/50">Space</kbd>
                        </>
                      ) : (
                        <>
                          <Mic className="h-4 w-4" />
                          <span>Speak</span>
                          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-zinc-100 text-zinc-800 rounded border border-zinc-300">Space</kbd>
                        </>
                      )}
                    </button>

                    {/* Instant Barge-In Preemption Button */}
                    <button
                      type="button"
                      onClick={bargeIn}
                      title="Interrupt Interviewer Speech (<150ms preemption, Key: Esc)"
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 sm:px-4 py-2.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 hover:text-white transition-all active:scale-[0.98]"
                    >
                      <Hand className="h-3.5 w-3.5 text-zinc-300" />
                      <span>Barge-In</span>
                      <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-zinc-900 text-zinc-400 rounded border border-zinc-700">Esc</kbd>
                    </button>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    {/* 16-Bar Responsive Equalizer */}
                    <AudioEqualizer
                      audioLevel={audioLevel}
                      isRecording={isRecording}
                      isInterviewerSpeaking={isInterviewerSpeaking}
                    />

                    <button
                      type="button"
                      onClick={() => setShowTextFallbackInVoice((prev) => !prev)}
                      className="text-[11px] font-mono text-zinc-400 hover:text-zinc-200 underline decoration-zinc-700 underline-offset-2 shrink-0 transition-colors"
                    >
                      {showTextFallbackInVoice ? 'Hide Text' : 'Type / Edit'}
                    </button>
                  </div>
                </div>

                {/* Optional Text Fallback Input in Voice Mode */}
                {showTextFallbackInVoice && (
                  <form onSubmit={handleSendText} className="flex gap-2 pt-2 border-t border-zinc-800 animate-in fade-in duration-150">
                    <input
                      type="text"
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="Type or paste technical answer if preferred..."
                      disabled={isSubmitting || sessionState === 'COMPLETED'}
                      className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 sm:px-4 py-2 text-xs sm:text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 disabled:opacity-50 font-sans"
                    />
                    <button
                      type="submit"
                      disabled={isSubmitting || !textInput.trim() || sessionState === 'COMPLETED'}
                      className="shrink-0 flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-sm"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>Send</span>
                    </button>
                  </form>
                )}
              </div>
            ) : (
              /* Text Mode Controls */
              <form onSubmit={handleSendText} className="flex gap-2">
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Type your technical response here (e.g. architecture tradeoffs, failure modes)..."
                  disabled={isSubmitting || sessionState === 'COMPLETED'}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 sm:px-4 py-2.5 text-xs sm:text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 disabled:opacity-50 transition-all font-sans"
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !textInput.trim() || sessionState === 'COMPLETED'}
                  className="shrink-0 flex items-center justify-center gap-2 rounded-lg bg-white px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-sm"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline">Submit Turn</span>
                  <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-zinc-100 text-zinc-800 rounded border border-zinc-300">↵</kbd>
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Scratchpad Panel */}
        {showScratchpad && (
          <div className="lg:col-span-5 flex flex-col min-h-0 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 backdrop-blur-sm shadow-sm font-mono space-y-3">
            {/* Scratchpad Header with Mode Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setScratchpadTab('CODE')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-medium transition-colors ${scratchpadTab === 'CODE'
                        ? 'bg-zinc-800 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                  >
                    <Code2 className="h-3 w-3" />
                    <span>Code</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScratchpadTab('DIAGRAM')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-medium transition-colors ${scratchpadTab === 'DIAGRAM'
                        ? 'bg-zinc-800 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                  >
                    <Network className="h-3 w-3 text-sky-400" />
                    <span>Architecture Diagram</span>
                  </button>
                </div>
                {scratchpadTab === 'CODE' && (
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono font-medium text-emerald-400 border border-zinc-700">
                    {preferredLanguage || 'Python'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {scratchpadTab === 'CODE' && (
                  <button
                    type="button"
                    onClick={handleRunCode}
                    disabled={isRunningCode || !scratchpadCode.trim()}
                    title={`Execute or prepare ${preferredLanguage || 'Python'} code`}
                    className="flex items-center gap-1 rounded bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-400 border border-emerald-800/80 px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                  >
                    {isRunningCode ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3 fill-emerald-400" />
                    )}
                    <span>{isRunningCode ? 'Running...' : 'Run Code'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const content = scratchpadTab === 'CODE' ? scratchpadCode : diagramCode;
                    navigator.clipboard.writeText(content);
                    setCopiedSnippet(true);
                    setTimeout(() => setCopiedSnippet(false), 2000);
                  }}
                  disabled={scratchpadTab === 'CODE' ? !scratchpadCode.trim() : !diagramCode.trim()}
                  title="Copy to clipboard"
                  className="rounded p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => (scratchpadTab === 'CODE' ? setScratchpadCode('') : setDiagramCode(''))}
                  disabled={scratchpadTab === 'CODE' ? !scratchpadCode.trim() : !diagramCode.trim()}
                  title="Clear"
                  className="rounded p-1 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {scratchpadTab === 'CODE' ? (
              <>
                {/* Quick Template Inserters */}
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className="text-zinc-500">Presets:</span>
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

                {/* Monospace Code Editor Area */}
                <div className="flex-1 min-h-[220px] flex flex-col">
                  <textarea
                    value={scratchpadCode}
                    onChange={(e) => setScratchpadCode(e.target.value)}
                    placeholder="Draft SQL schemas, distributed lock algorithms, or concurrency primitives here..."
                    className="w-full flex-1 rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 resize-none leading-relaxed"
                  />
                </div>

                {/* Live WebAssembly / JS Output Terminal */}
                {executionOutput && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] text-zinc-300 space-y-1.5 shadow-inner">
                    <div className="flex items-center justify-between text-zinc-500 border-b border-zinc-800/80 pb-1">
                      <span className="flex items-center gap-1.5 font-semibold text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {preferredLanguage || 'Execution'} Output
                      </span>
                      <button
                        type="button"
                        onClick={() => setExecutionOutput(null)}
                        className="text-[10px] text-zinc-400 hover:text-white"
                      >
                        Clear
                      </button>
                    </div>
                    <pre className="whitespace-pre-wrap overflow-x-auto max-h-36 text-zinc-200 font-mono text-[11px] leading-relaxed">
                      {executionOutput}
                    </pre>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Diagram Presets */}
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className="text-zinc-500">Diagram Presets:</span>
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

                {/* SVG Visual Canvas */}
                <SvgDiagramPreview syntax={diagramCode} />

                {/* Diagram Syntax Editor */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-zinc-500">
                    <span>Mermaid Syntax Editor</span>
                    <span>Supports flowchart TD/LR &amp; sequenceDiagram</span>
                  </div>
                  <textarea
                    value={diagramCode}
                    onChange={(e) => setDiagramCode(e.target.value)}
                    placeholder="flowchart TD\n  Client --> Gateway\n  Gateway --> DB[(PostgreSQL)]"
                    rows={4}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 font-mono text-[11px] text-zinc-300 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 resize-none leading-relaxed"
                  />
                </div>
              </>
            )}

            {/* Attach to Turn Checkbox */}
            <div className="flex items-center justify-between pt-1 text-[11px] text-zinc-400">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={attachScratchpad}
                  onChange={(e) => setAttachScratchpad(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-950 text-white focus:ring-0 focus:ring-offset-0"
                />
                <span>Attach to next turn submission</span>
              </label>
              {copiedSnippet && (
                <span className="text-emerald-400 font-semibold">Copied!</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

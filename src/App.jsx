import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus,
  Sparkles,
  Calendar,
  MessageSquare,
  Mail,
  Smartphone,
  Trash2,
  ChevronRight,
  ChevronLeft,
  X,
  Layers,
  Volume2,
  VolumeX
} from 'lucide-react';

// --- TEENAGE ENGINEERING / APPLE PRO MINIMALIST CONFIG ---
const UNIT_CONFIG = {
  months: {
    id: 'months',
    label: 'Months',
    singular: 'Month',
    short: 'MO',
    border: 'border-white/50',
    fillOpacity: 'opacity-100',
    barClass: 'bg-white',
    text: 'text-white',
    hex: '#ffffff',
    level: '100% Solid White',
    maxRender: 24,
  },
  days: {
    id: 'days',
    label: 'Days',
    singular: 'Day',
    short: 'DA',
    ms: 1000 * 60 * 60 * 24,
    border: 'border-white/35',
    fillOpacity: 'opacity-80',
    barClass: 'bg-neutral-200',
    text: 'text-neutral-200',
    hex: '#e5e5e5',
    level: '80% Frosted Silver',
    maxRender: 45,
  },
  hours: {
    id: 'hours',
    label: 'Hours',
    singular: 'Hour',
    short: 'HR',
    ms: 1000 * 60 * 60,
    border: 'border-white/25',
    fillOpacity: 'opacity-50',
    barClass: 'bg-neutral-400',
    text: 'text-neutral-300',
    hex: '#a3a3a3',
    level: '50% Smoked Glass',
    maxRender: 48,
  },
  minutes: {
    id: 'minutes',
    label: 'Minutes',
    singular: 'Minute',
    short: 'MIN',
    ms: 1000 * 60,
    border: 'border-white/20',
    fillOpacity: 'opacity-25',
    barClass: 'bg-neutral-600',
    text: 'text-neutral-400',
    hex: '#737373',
    level: '25% Ghost Obsidian',
    maxRender: 60,
  }
};

const SOURCE_ICONS = {
  calendar: { icon: Calendar, label: 'Calendar' },
  slack: { icon: MessageSquare, label: 'Slack' },
  email: { icon: Mail, label: 'Email' },
  phone: { icon: Smartphone, label: 'Reminder' }
};

// --- TRUE CALENDAR MONTHS ENGINE ---
const addCalendarMonths = (date, months) => {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
};

const calendarMonthsRemaining = (from, to) => {
  const start = new Date(from);
  const end = new Date(to);
  if (end <= start) return 0;
  let months = (end.getFullYear() - start.getFullYear()) * 12
    + (end.getMonth() - start.getMonth());
  let anchor = addCalendarMonths(start, months);
  if (anchor > end) {
    months -= 1;
    anchor = addCalendarMonths(start, months);
  }
  const nextAnchor = addCalendarMonths(start, months + 1);
  const fraction = (end - anchor) / (nextAnchor - anchor);
  return months + fraction;
};

const addMonthsAmount = (date, amount) => {
  const whole = Math.floor(amount);
  const frac = amount - whole;
  const base = addCalendarMonths(date, whole);
  if (frac === 0) return base;
  const next = addCalendarMonths(date, whole + 1);
  return new Date(base.getTime() + frac * (next.getTime() - base.getTime()));
};

const exactBlocksForUnit = (unitKey, fromMs, toMs) => {
  if (unitKey === 'months') {
    return calendarMonthsRemaining(new Date(fromMs), new Date(toMs));
  }
  return Math.max(0, toMs - fromMs) / UNIT_CONFIG[unitKey].ms;
};

// --- CORE CALCULATION ENGINE ---
const calculateStackData = (task, currentNow, forcedScale = 'auto') => {
  if (!task) return null;
  const remainingMs = Math.max(0, task.deadline - currentNow);
  const isExpired = remainingMs <= 0;

  let unitKey = forcedScale;
  if (forcedScale === 'auto') {
    const totalDays = remainingMs / UNIT_CONFIG.days.ms;
    const totalHours = remainingMs / UNIT_CONFIG.hours.ms;
    if (totalDays > 45) {
      unitKey = 'months';
    } else if (totalDays >= 2) {
      unitKey = 'days';
    } else if (totalHours >= 2) {
      unitKey = 'hours';
    } else {
      unitKey = 'minutes';
    }
  }

  const config = UNIT_CONFIG[unitKey];
  const exactBlocks = exactBlocksForUnit(unitKey, currentNow, task.deadline);
  const totalBlocks = isExpired ? 0 : Math.ceil(exactBlocks);
  const renderedBlocks = Math.min(totalBlocks, config.maxRender);
  const firstRenderedBlock = totalBlocks === 0 ? 0 : totalBlocks - renderedBlocks + 1;
  const topBlockProgress = isExpired ? 0 : (exactBlocks % 1 === 0 ? 1 : exactBlocks % 1);
  const isLastBlock = !isExpired && totalBlocks === 1;

  const d = Math.floor(remainingMs / UNIT_CONFIG.days.ms);
  const h = Math.floor((remainingMs % UNIT_CONFIG.days.ms) / UNIT_CONFIG.hours.ms);
  const m = Math.floor((remainingMs % UNIT_CONFIG.hours.ms) / UNIT_CONFIG.minutes.ms);
  const s = Math.floor((remainingMs % UNIT_CONFIG.minutes.ms) / 1000);

  return {
    unitKey,
    config,
    exactBlocks,
    totalBlocks,
    renderedBlocks,
    firstRenderedBlock,
    overflowBlocks: Math.max(0, totalBlocks - config.maxRender),
    topBlockProgress,
    isLastBlock,
    isExpired,
    remainingMs,
    breakdown: { d, h, m, s }
  };
};

// --- PERSISTENCE ---
const TASKS_STORAGE_KEY = 'timetres-tasks-v1';

const isValidStoredTask = (t) => (
  t && typeof t === 'object'
  && typeof t.id === 'string' && t.id.length > 0
  && typeof t.title === 'string' && t.title.trim().length > 0
  && Number.isFinite(Number(t.deadline))
  && typeof t.source === 'string'
);

const loadStoredTasks = () => {
  try {
    if (typeof localStorage === 'undefined') return getInitialTasks();
    const raw = localStorage.getItem(TASKS_STORAGE_KEY);
    if (!raw) return getInitialTasks();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return getInitialTasks();
    const valid = parsed.filter(isValidStoredTask).map((t) => ({
      ...t,
      deadline: Number(t.deadline),
      createdAt: Number(t.createdAt) || Date.now(),
    }));
    return valid.length > 0 || parsed.length === 0 ? valid : getInitialTasks();
  } catch (e) {
    return getInitialTasks();
  }
};

const getInitialTasks = () => {
  const now = Date.now();
  const min = 60 * 1000;
  const hr = 60 * min;
  const day = 24 * hr;

  return [
    {
      id: 'task-1',
      title: 'Pack & Board Flight',
      category: 'Personal',
      source: 'phone',
      createdAt: now - (2 * hr),
      deadline: now + (4.8 * hr),
      notes: 'Gate B12. Passport and chargers.'
    },
    {
      id: 'task-2',
      title: 'Production Release',
      category: 'Engineering',
      source: 'slack',
      createdAt: now - (45 * min),
      deadline: now + (52 * min),
      notes: 'Deploy prior to evening peak.'
    },
    {
      id: 'task-3',
      title: 'Utilities & Fiber Invoice',
      category: 'Finance',
      source: 'email',
      createdAt: now - (5 * day),
      deadline: now + (19.6 * day),
      notes: 'Auto-extracted invoice.'
    },
    {
      id: 'task-4',
      title: 'Final Tax Submission',
      category: 'Legal',
      source: 'calendar',
      createdAt: now - (2 * hr),
      deadline: now + (0.85 * hr),
      notes: 'Sign and submit documentation.'
    },
    {
      id: 'task-5',
      title: 'Q1 Architecture',
      category: 'Roadmap',
      source: 'calendar',
      createdAt: now - (30 * day),
      deadline: now + (135 * day),
      notes: 'Pipeline infrastructure milestone.'
    }
  ];
};

export default function App() {
  const [tasks, setTasks] = useState(() => loadStoredTasks());
  const [selectedTaskId, setSelectedTaskId] = useState('task-1');
  const [scaleOverride, setScaleOverride] = useState('auto');
  const [viewMode, setViewMode] = useState('focus'); // 'focus' | 'skyline'
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [now, setNow] = useState(Date.now());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);

  // New task form state
  const [newTitle, setNewTitle] = useState('');
  const [newAmount, setNewAmount] = useState(5);
  const [newUnit, setNewUnit] = useState('hours');
  const [newSource, setNewSource] = useState('calendar');
  const [newNotes, setNewNotes] = useState('');
  const [addError, setAddError] = useState('');

  // AI Ingest
  const [aiInputText, setAiInputText] = useState(
    'Hey team, we need the final presentation and spreadsheet finished in 4 hours before the board meeting!'
  );
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const dockRef = useRef(null);

  // Swipe gesture detection for mobile
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const touchEndX = useRef(null);
  const touchEndY = useRef(null);

  // 1-second live clock ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Save tasks to localStorage
  useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
      }
    } catch (e) { /* ignore */ }
  }, [tasks]);

  // Audio Alerts
  const alertedRef = useRef(new Set());

  const playAlertSound = () => {
    if (!soundEnabled) return;
    try {
      if (typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      [0, 0.25].forEach((start) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + 0.25);
      });
    } catch (e) { /* ignore */ }
  };

  const fireDeadlineAlert = (task) => {
    playAlertSound();
    try {
      if (typeof window !== 'undefined' && 'Notification' in window
        && Notification.permission === 'granted') {
        new Notification('TIMETRES — ZERO BLOCKS', {
          body: task.title,
          tag: 'timetres-' + task.id,
        });
      }
    } catch (e) { /* ignore */ }
  };

  useEffect(() => {
    tasks.forEach((task) => {
      if (task.deadline > now) {
        alertedRef.current.delete(task.id);
        return;
      }
      if (!alertedRef.current.has(task.id)) {
        alertedRef.current.add(task.id);
        fireDeadlineAlert(task);
      }
    });
    const liveIds = new Set(tasks.map((t) => t.id));
    alertedRef.current.forEach((id) => {
      if (!liveIds.has(id)) alertedRef.current.delete(id);
    });
  }, [tasks, now]);

  const requestNotificationPermission = () => {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window
        && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch (e) { /* ignore */ }
  };

  const activeTask = useMemo(() => {
    return tasks.find(t => t.id === selectedTaskId) || tasks[0] || null;
  }, [tasks, selectedTaskId]);

  const activeStack = useMemo(() => {
    return calculateStackData(activeTask, now, scaleOverride);
  }, [activeTask, now, scaleOverride]);

  const activeTaskIndex = useMemo(() => {
    return tasks.findIndex(t => t.id === activeTask?.id);
  }, [tasks, activeTask]);

  const nextTask = () => {
    if (tasks.length <= 1) return;
    const nextIdx = (activeTaskIndex + 1) % tasks.length;
    setSelectedTaskId(tasks[nextIdx].id);
  };

  const prevTask = () => {
    if (tasks.length <= 1) return;
    const prevIdx = (activeTaskIndex - 1 + tasks.length) % tasks.length;
    setSelectedTaskId(tasks[prevIdx].id);
  };

  // Touch Swipe Handlers for Mobile
  const handleTouchStart = (e) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchStartY.current = e.targetTouches[0].clientY;
  };

  const handleTouchMove = (e) => {
    touchEndX.current = e.targetTouches[0].clientX;
    touchEndY.current = e.targetTouches[0].clientY;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const dx = touchStartX.current - touchEndX.current;
    const dy = (touchStartY.current || 0) - (touchEndY.current || 0);

    // Only swipe if horizontal move is greater than vertical move (prevent interfering with vertical scrolling)
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 45) {
      if (dx > 0) {
        nextTask(); // Swiped left -> next
      } else {
        prevTask(); // Swiped right -> prev
      }
    }
    touchStartX.current = null;
    touchEndX.current = null;
    touchStartY.current = null;
    touchEndY.current = null;
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (showAddModal || showAIModal) return;
      if (e.key === 'ArrowRight' || e.key === 'k') nextTask();
      if (e.key === 'ArrowLeft' || e.key === 'j') prevTask();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tasks, activeTaskIndex, showAddModal, showAIModal]);

  // Handlers
  const handleAddTask = (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const amount = Number(newAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 365) {
      setAddError('Enter a duration between 1 and 365 blocks.');
      return;
    }
    setAddError('');

    const deadline = newUnit === 'months'
      ? addMonthsAmount(new Date(now), amount).getTime()
      : now + (amount * UNIT_CONFIG[newUnit].ms);
    requestNotificationPermission();

    const created = {
      id: 'task-' + Date.now(),
      title: newTitle.trim(),
      category: 'Custom',
      source: newSource,
      createdAt: now,
      deadline,
      notes: newNotes.trim() || 'Manual entry'
    };

    setTasks(prev => [created, ...prev]);
    setSelectedTaskId(created.id);
    setScaleOverride('auto');
    setNewTitle('');
    setNewNotes('');
    setNewAmount(5);
    setNewUnit('hours');
    setNewSource('calendar');
    setShowAddModal(false);
  };

  const handleDeleteTask = (id, e) => {
    if (e) e.stopPropagation();
    const filtered = tasks.filter(t => t.id !== id);
    setTasks(filtered);
    if (selectedTaskId === id) {
      setSelectedTaskId(filtered.length > 0 ? filtered[0].id : null);
    }
  };

  const handleAISmartExtract = async () => {
    if (!aiInputText.trim()) return;
    setIsAiLoading(true);
    setAiError('');

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      setAiError('VITE_GEMINI_API_KEY required for AI parsing');
      setIsAiLoading(false);
      return;
    }
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

    const systemPrompt = `You are the ingestion engine for "Timetres", a minimalist time countdown app.
Extract the task title, duration quantity, duration unit ('minutes', 'hours', 'days', or 'months'), source icon ('slack', 'email', 'calendar', 'phone'), and a concise context note.`;

    const payload = {
      contents: [{ parts: [{ text: aiInputText }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING", description: "Concise actionable title (max 30 chars)" },
            amount: { type: "NUMBER", description: "Remaining duration quantity" },
            unit: { type: "STRING", enum: ["minutes", "hours", "days", "months"] },
            source: { type: "STRING", enum: ["slack", "email", "calendar", "phone"] },
            notes: { type: "STRING", description: "1-sentence summary" }
          },
          required: ["title", "amount", "unit", "source", "notes"]
        }
      }
    };

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      const rawJson = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawJson) throw new Error('Empty response');

      const cleaned = rawJson.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleaned);
      const aiAmount = Number(parsed?.amount);
      if (!Number.isFinite(aiAmount) || aiAmount <= 0) throw new Error('Invalid duration');

      const aiTitle = typeof parsed?.title === 'string' && parsed.title.trim()
        ? parsed.title.trim().slice(0, 30)
        : 'AI Task';
      const unitKey = UNIT_CONFIG[parsed.unit] ? parsed.unit : 'hours';
      const deadline = unitKey === 'months'
        ? addMonthsAmount(new Date(now), aiAmount).getTime()
        : now + (aiAmount * UNIT_CONFIG[unitKey].ms);

      const newTask = {
        id: 'task-ai-' + Date.now(),
        title: aiTitle,
        category: 'AI',
        source: SOURCE_ICONS[parsed.source] ? parsed.source : 'slack',
        createdAt: now,
        deadline,
        notes: typeof parsed?.notes === 'string' && parsed.notes.trim() ? parsed.notes : aiInputText
      };

      setTasks(prev => [newTask, ...prev]);
      setSelectedTaskId(newTask.id);
      setScaleOverride('auto');
      setShowAIModal(false);
    } catch (err) {
      setAiError('Could not parse text. Enter manually.');
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] min-h-[100dvh] bg-black text-neutral-100 flex flex-col justify-between font-mono selection:bg-white selection:text-black overflow-hidden relative overscroll-none touch-manipulation">
      <style>{`
        @keyframes pulseStrobe {
          0%, 100% { opacity: 1; filter: drop-shadow(0 0 25px rgba(255,255,255,0.9)); }
          50% { opacity: 0.35; filter: drop-shadow(0 0 5px rgba(255,255,255,0.2)); }
        }
        .strobe-alert {
          animation: pulseStrobe 1.2s ease-in-out infinite;
        }
        .block-slab {
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), filter 0.2s ease;
        }
        .block-slab:active {
          filter: brightness(1.3);
        }
      `}</style>

      {/* Laser point background pattern */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)`,
          backgroundSize: '24px 24px'
        }}
      />

      {/* --- FLOATING HEADER --- */}
      <header className="relative z-30 w-full max-w-4xl mx-auto px-4 py-3 sm:px-6 sm:py-5 flex items-center justify-between safe-top">
        {/* Brand identity */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-2.5 h-2.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)] flex-shrink-0" />
          <span className="text-[11px] sm:text-xs font-bold tracking-[0.3em] text-white">
            TIMETRES
          </span>
          <span className="hidden sm:inline text-[10px] text-neutral-600 tracking-widest pl-1">
            REV.02
          </span>
        </div>

        {/* Center Task Navigation Pager */}
        {tasks.length > 0 && (
          <div className="flex items-center gap-1 sm:gap-2 text-xs text-neutral-400">
            <button
              onClick={prevTask}
              disabled={tasks.length <= 1}
              className="p-1 sm:p-1.5 hover:text-white disabled:opacity-20 active:scale-95 transition-all"
              title="Previous Stack"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[10px] sm:text-[11px] tracking-wider text-neutral-300">
              {String(activeTaskIndex + 1).padStart(2, '0')}/{String(tasks.length).padStart(2, '0')}
            </span>
            <button
              onClick={nextTask}
              disabled={tasks.length <= 1}
              className="p-1 sm:p-1.5 hover:text-white disabled:opacity-20 active:scale-95 transition-all"
              title="Next Stack"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Right Action Icons */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? "Audio Alert Enabled" : "Audio Alert Muted"}
            className="p-1.5 text-neutral-500 hover:text-white active:scale-90 transition-all"
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => setViewMode(viewMode === 'focus' ? 'skyline' : 'focus')}
            title="Toggle Monolith vs Skyline View"
            className={`p-1.5 border transition-all ${
              viewMode === 'skyline'
                ? 'bg-white text-black border-white'
                : 'text-neutral-400 hover:text-white border-neutral-800 bg-neutral-950'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setShowAIModal(true)}
            title="AI Ingestion"
            className="px-2 py-1 text-[10px] border border-neutral-800 hover:border-neutral-500 text-neutral-300 hover:text-white bg-neutral-950 transition-colors flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3" />
            <span className="hidden xs:inline tracking-wider">AI</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            title="Add New Stack"
            className="px-2.5 py-1 text-[10px] sm:text-xs bg-white text-black font-bold hover:bg-neutral-200 transition-all flex items-center gap-1 shadow-[0_0_12px_rgba(255,255,255,0.2)]"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span className="tracking-wider">NEW</span>
          </button>
        </div>
      </header>

      {/* --- MAIN SCULPTURAL STAGE (Swipeable on touchscreens) --- */}
      <main
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="flex-1 relative z-20 flex flex-col items-center justify-center max-w-xl w-full mx-auto px-4 sm:px-6 my-auto select-none"
      >
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center my-auto">
            <div className="w-10 h-10 border border-neutral-800 flex items-center justify-center mb-3">
              <div className="w-3 h-3 bg-white" />
            </div>
            <p className="text-xs tracking-widest text-white uppercase mb-1">ZERO ACTIVE STACKS</p>
            <p className="text-[11px] text-neutral-500 max-w-xs mb-4 font-sans">Tap New above to initialize your first countdown block.</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-5 py-2 bg-white text-black font-bold text-xs tracking-widest active:scale-95 transition-all"
            >
              + CREATE FIRST STACK
            </button>
          </div>
        ) : viewMode === 'focus' && activeTask && activeStack ? (
          /* ================= MONOLITHIC FOCUS VIEW ================= */
          <div className="w-full flex flex-col items-center justify-center my-auto">
            
            {/* Task Title & Meta */}
            <div className="text-center mb-2 sm:mb-4 max-w-md px-2">
              <div className="inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] uppercase tracking-[0.25em] text-neutral-500 mb-1">
                <span>{SOURCE_ICONS[activeTask.source]?.label || 'Task'}</span>
                <span>·</span>
                <span className="text-neutral-400 font-bold">{activeStack.config.level}</span>
                {activeStack.overflowBlocks > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-neutral-300">+{activeStack.overflowBlocks}</span>
                  </>
                )}
              </div>

              <h2 className="text-lg xs:text-xl sm:text-2xl font-black text-white tracking-tight uppercase leading-snug line-clamp-2">
                {activeTask.title}
              </h2>

              {activeTask.notes && (
                <p className="text-[11px] text-neutral-500 tracking-wide mt-0.5 font-sans line-clamp-1">
                  {activeTask.notes}
                </p>
              )}
            </div>

            {/* Monolithic Number */}
            <div className="flex items-baseline justify-center gap-2 sm:gap-3 mb-2 sm:mb-3">
              <span className={`text-6xl xs:text-7xl sm:text-8xl font-black tracking-tighter leading-none ${
                activeStack.isLastBlock ? 'text-white strobe-alert' : 'text-white'
              }`}>
                {String(activeStack.totalBlocks).padStart(2, '0')}
              </span>
              <div className="flex flex-col text-left">
                <span className="text-xs sm:text-sm font-bold tracking-[0.2em] text-neutral-400 uppercase">
                  {activeStack.totalBlocks === 1 ? activeStack.config.singular : activeStack.config.label}
                </span>
                <span className="text-[9px] text-neutral-600 tracking-widest uppercase">
                  {activeStack.isLastBlock ? 'FINAL BUFFER' : 'REMAINING'}
                </span>
              </div>
            </div>

            {/* THE MONOLITHIC GLASS TOWER (Responsive viewport height on mobile) */}
            <div className="relative w-full max-w-[260px] xs:max-w-[290px] sm:max-w-[320px] h-[250px] xs:h-[290px] sm:h-[350px] md:h-[380px] flex flex-col justify-end items-center p-3 sm:p-4 bg-black border border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.1)]">
              
              {/* Corner crosshairs */}
              <div className="absolute top-1.5 left-1.5 text-[8px] text-neutral-700 select-none">+</div>
              <div className="absolute top-1.5 right-1.5 text-[8px] text-neutral-700 select-none">+</div>
              <div className="absolute bottom-1.5 left-1.5 text-[8px] text-neutral-700 select-none">+</div>
              <div className="absolute bottom-1.5 right-1.5 text-[8px] text-neutral-700 select-none">+</div>

              {/* Laser guide lines */}
              <div className="pointer-events-none absolute inset-x-3 inset-y-3 flex flex-col justify-between opacity-15">
                {[...Array(5)].map((_, idx) => (
                  <div key={idx} className="w-full border-b border-neutral-700 flex justify-between text-[8px] text-neutral-600">
                    <span>—</span>
                    <span>—</span>
                  </div>
                ))}
              </div>

              {/* Slabs */}
              {activeStack.isExpired ? (
                <div className="my-auto flex flex-col items-center text-center p-4">
                  <div className="w-7 h-7 border border-white mb-2 flex items-center justify-center">
                    <div className="w-2 h-2 bg-white" />
                  </div>
                  <p className="text-xs font-bold tracking-widest text-white uppercase">ZERO BLOCKS</p>
                  <p className="text-[10px] text-neutral-500 mt-1">DEADLINE REACHED</p>
                </div>
              ) : (
                <div className="w-full flex flex-col-reverse gap-1 relative z-10 justify-start h-full">
                  {Array.from({ length: activeStack.renderedBlocks }).map((_, index) => {
                    const isTopBlock = index === activeStack.renderedBlocks - 1;
                    const blockNumber = activeStack.firstRenderedBlock + index;

                    const slabHeight = activeStack.renderedBlocks === 1
                      ? 'h-24 sm:h-32'
                      : activeStack.renderedBlocks <= 5
                        ? 'h-11 sm:h-14'
                        : activeStack.renderedBlocks <= 12
                          ? 'h-5 sm:h-6'
                          : activeStack.renderedBlocks <= 24
                            ? 'h-3 sm:h-3.5'
                            : 'h-1.5 sm:h-2';

                    return (
                      <div
                        key={index}
                        title={`Block #${blockNumber}`}
                        className={`block-slab relative w-full ${slabHeight} bg-[#0c0c0c] border ${
                          activeStack.isLastBlock
                            ? 'border-white shadow-[0_0_20px_rgba(255,255,255,0.7)]'
                            : activeStack.config.border
                        } overflow-hidden flex items-center justify-between px-2 select-none`}
                      >
                        {/* Slab Interior Fill */}
                        <div
                          className={`absolute inset-y-0 left-0 ${activeStack.config.barClass} ${activeStack.config.fillOpacity} transition-all duration-500`}
                          style={{
                            width: isTopBlock ? `${Math.max(6, activeStack.topBlockProgress * 100)}%` : '100%'
                          }}
                        />

                        {/* Top Specular Line */}
                        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/70 to-transparent pointer-events-none" />

                        {/* Block Index Label */}
                        {activeStack.renderedBlocks <= 12 && (
                          <div className="relative z-10 w-full flex items-center justify-between text-[9px] sm:text-[10px] font-mono font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
                            <span className="opacity-90">#{String(blockNumber).padStart(2, '0')}</span>
                            {isTopBlock && (
                              <span className="text-[8px] sm:text-[9px] bg-black/80 px-1 py-0.5 border border-white/20">
                                {Math.round(activeStack.topBlockProgress * 100)}%
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Base Laser Line */}
              <div className="w-full h-[1px] mt-2 bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_15px_rgba(255,255,255,0.8)]" />
            </div>

            {/* Digital Telemetry */}
            <div className="mt-4 sm:mt-5 flex items-center gap-2 sm:gap-3 text-[11px] sm:text-xs tracking-widest text-neutral-400 font-mono">
              <span className="text-white font-bold">{String(activeStack.breakdown.d).padStart(2, '0')}D</span>
              <span className="text-neutral-700">:</span>
              <span className="text-white font-bold">{String(activeStack.breakdown.h).padStart(2, '0')}H</span>
              <span className="text-neutral-700">:</span>
              <span className="text-white font-bold">{String(activeStack.breakdown.m).padStart(2, '0')}M</span>
              <span className="text-neutral-700">:</span>
              <span className="text-white font-bold">{String(activeStack.breakdown.s).padStart(2, '0')}S</span>
            </div>

            {/* Resolution Selector Tabs */}
            <div className="mt-3 sm:mt-4 inline-flex items-center gap-0.5 sm:gap-1 p-0.5 sm:p-1 border border-neutral-800 bg-neutral-950">
              <button
                onClick={() => setScaleOverride('auto')}
                className={`px-2 py-1 sm:px-2.5 sm:py-1 text-[9px] sm:text-[10px] font-bold tracking-wider uppercase transition-all ${
                  scaleOverride === 'auto'
                    ? 'bg-white text-black'
                    : 'text-neutral-500 hover:text-white'
                }`}
              >
                AUTO
              </button>
              {Object.values(UNIT_CONFIG).map(u => (
                <button
                  key={u.id}
                  onClick={() => setScaleOverride(u.id)}
                  className={`px-2 py-1 sm:px-2.5 sm:py-1 text-[9px] sm:text-[10px] font-bold tracking-wider uppercase transition-all ${
                    activeStack.unitKey === u.id && scaleOverride !== 'auto'
                      ? 'bg-white text-black'
                      : 'text-neutral-500 hover:text-white'
                  }`}
                >
                  {u.short}
                </button>
              ))}
            </div>

            {/* Swipe hint on touch devices */}
            <div className="sm:hidden text-[9px] text-neutral-600 tracking-widest mt-2 uppercase">
              ← SWIPE TO SWITCH STACKS →
            </div>

          </div>
        ) : (
          /* ================= SKYLINE ARRAY VIEW ================= */
          <div className="w-full py-4 overflow-y-auto max-h-[70dvh] no-scrollbar">
            <div className="text-center mb-4">
              <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 mb-0.5">ARRAY</p>
              <h2 className="text-sm sm:text-base font-bold tracking-tight text-white uppercase">SKYLINE VIEW</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {tasks.map(task => {
                const st = calculateStackData(task, now, scaleOverride);
                const isSelected = task.id === activeTask?.id;
                return (
                  <div
                    key={task.id}
                    onClick={() => {
                      setSelectedTaskId(task.id);
                      setViewMode('focus');
                    }}
                    className={`cursor-pointer p-3 border transition-all flex flex-col items-center bg-[#070707] ${
                      isSelected ? 'border-white ring-1 ring-white' : 'border-neutral-800'
                    }`}
                  >
                    <div className="w-full flex items-center justify-between text-[9px] text-neutral-500 font-mono mb-1.5">
                      <span className="uppercase">{task.source}</span>
                      <span className="text-white font-bold">{st.totalBlocks}{st.config.short}</span>
                    </div>

                    <div className="w-full h-24 bg-black border border-neutral-800 flex flex-col-reverse gap-0.5 p-1.5 overflow-hidden mb-2">
                      {Array.from({ length: Math.min(st.renderedBlocks, 12) }).map((_, idx) => (
                        <div
                          key={idx}
                          className={`w-full h-1.5 ${st.config.barClass} ${st.config.fillOpacity}`}
                        />
                      ))}
                    </div>

                    <h4 className="text-[11px] font-bold text-white text-center truncate w-full uppercase">
                      {task.title}
                    </h4>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* --- HORIZONTAL DOCK / TASK DIAL STRIP --- */}
      {viewMode === 'focus' && tasks.length > 0 && (
        <footer className="relative z-30 w-full max-w-2xl mx-auto px-4 py-2 border-t border-neutral-900 safe-bottom">
          <div
            ref={dockRef}
            className="flex items-center gap-2 overflow-x-auto py-1 scroll-smooth no-scrollbar w-full touch-pan-x"
          >
            {tasks.map((task, idx) => {
              const st = calculateStackData(task, now, 'auto');
              const isSelected = task.id === activeTask?.id;

              return (
                <button
                  key={task.id}
                  onClick={() => setSelectedTaskId(task.id)}
                  className={`group flex items-center gap-1.5 px-2.5 py-1.5 border text-xs transition-all whitespace-nowrap flex-shrink-0 active:scale-95 ${
                    isSelected
                      ? 'bg-neutral-900 border-white text-white font-bold shadow-[0_0_10px_rgba(255,255,255,0.15)]'
                      : 'bg-black border-neutral-800 text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  <span className="text-[9px] font-mono text-neutral-500">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate max-w-[100px] xs:max-w-[130px] uppercase text-[10px] tracking-wide">
                    {task.title}
                  </span>
                  <span className="text-[9px] font-mono text-neutral-400 pl-0.5">
                    {st.totalBlocks}{st.config.short}
                  </span>

                  {tasks.length > 1 && (
                    <span
                      onClick={(e) => handleDeleteTask(task.id, e)}
                      title="Delete Stack"
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-white transition-opacity ml-1"
                    >
                      <Trash2 className="w-3 h-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </footer>
      )}

      {/* ================= MODAL: ADD STACK ================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0a0a0a] border border-white/20 max-w-md w-full p-5 sm:p-6 shadow-2xl relative max-h-[85dvh] overflow-y-auto no-scrollbar">
            <div className="flex items-center justify-between mb-5 pb-2 border-b border-neutral-800">
              <span className="text-[11px] sm:text-xs font-bold tracking-[0.25em] text-white uppercase">
                + NEW MONOLITH STACK
              </span>
              <button onClick={() => setShowAddModal(false)} className="text-neutral-500 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddTask} className="space-y-4">
              <div>
                <label className="block text-[9px] sm:text-[10px] font-bold tracking-widest uppercase text-neutral-400 mb-1">
                  TASK IDENTIFIER
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., SHIP FIRMWARE UPDATE"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-black border border-neutral-800 text-white text-xs font-mono uppercase focus:outline-none focus:border-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] sm:text-[10px] font-bold tracking-widest uppercase text-neutral-400 mb-1">
                    BLOCK QUANTITY
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    required
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-black border border-neutral-800 text-white text-xs font-mono focus:outline-none focus:border-white"
                  />
                </div>
                <div>
                  <label className="block text-[9px] sm:text-[10px] font-bold tracking-widest uppercase text-neutral-400 mb-1">
                    TIME UNIT
                  </label>
                  <select
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    className="w-full px-3 py-2 bg-black border border-neutral-800 text-white text-xs font-mono uppercase focus:outline-none focus:border-white"
                  >
                    <option value="minutes">MINUTES (25% GHOST)</option>
                    <option value="hours">HOURS (50% SMOKED)</option>
                    <option value="days">DAYS (80% SILVER)</option>
                    <option value="months">MONTHS (100% WHITE)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[9px] sm:text-[10px] font-bold tracking-widest uppercase text-neutral-400 mb-1">
                  SOURCE PROTOCOL
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(SOURCE_ICONS).map(([key, item]) => (
                    <button
                      type="button"
                      key={key}
                      onClick={() => setNewSource(key)}
                      className={`py-2 text-[9px] sm:text-[10px] font-mono uppercase border transition-all ${
                        newSource === key
                          ? 'bg-white text-black border-white font-bold'
                          : 'bg-black text-neutral-500 border-neutral-800 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[9px] sm:text-[10px] font-bold tracking-widest uppercase text-neutral-400 mb-1">
                  CONTEXT NOTE (OPTIONAL)
                </label>
                <input
                  type="text"
                  placeholder="Milestone, gate, or flight number"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-black border border-neutral-800 text-white text-xs font-mono focus:outline-none focus:border-white"
                />
              </div>

              {addError && (
                <div className="p-2 border border-white text-xs text-white font-mono">
                  {addError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs text-neutral-400 hover:text-white font-mono"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-white hover:bg-neutral-200 text-black font-bold text-xs font-mono uppercase"
                >
                  INITIALIZE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: AI INGEST ================= */}
      {showAIModal && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0a0a0a] border border-white/20 max-w-lg w-full p-5 sm:p-6 shadow-2xl relative max-h-[85dvh] overflow-y-auto no-scrollbar">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-neutral-800">
              <span className="text-[11px] sm:text-xs font-bold tracking-[0.25em] text-white uppercase flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                AI INGESTION PARSER
              </span>
              <button onClick={() => setShowAIModal(false)} className="text-neutral-500 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[9px] sm:text-[10px] font-bold tracking-widest uppercase text-neutral-400 mb-1">
                  RAW UNSTRUCTURED TEXT
                </label>
                <textarea
                  rows={4}
                  value={aiInputText}
                  onChange={(e) => setAiInputText(e.target.value)}
                  className="w-full p-3 bg-black border border-neutral-800 text-white text-xs font-mono focus:outline-none focus:border-white"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  "Finish presentation in 5 hours before flight",
                  "Server cert expires in 45 minutes",
                  "Quarterly report due in 12 days"
                ].map((sample, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setAiInputText(sample)}
                    className="text-[9px] bg-neutral-950 hover:bg-neutral-800 text-neutral-400 px-2 py-1 border border-neutral-800"
                  >
                    "{sample}"
                  </button>
                ))}
              </div>

              {aiError && (
                <div className="p-2 border border-white text-xs text-white font-mono">
                  {aiError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAIModal(false)}
                  className="px-4 py-2 text-xs text-neutral-400 hover:text-white font-mono"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  disabled={isAiLoading}
                  onClick={handleAISmartExtract}
                  className="px-5 py-2 bg-white hover:bg-neutral-200 text-black font-bold text-xs font-mono uppercase flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isAiLoading ? 'PARSING...' : 'EXTRACT STACK'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

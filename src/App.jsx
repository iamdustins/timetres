import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus,
  Sparkles,
  Calendar,
  MessageSquare,
  Mail,
  Smartphone,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Maximize2,
  Minimize2,
  ChevronRight,
  ChevronLeft,
  Sliders,
  FastForward,
  RotateCcw,
  Layers,
  Zap,
  Flame,
  X
} from 'lucide-react';

// --- CONFIGURATION & CONSTANTS (MINIMALIST HIGH-GLOSS MONOCHROME) ---
// Squares and blocks feature distinct opacities and gradients of pure white and smoked glass
const UNIT_CONFIG = {
  months: {
    id: 'months',
    label: 'Months',
    singular: 'Month',
    // 100% / Platinum high-gloss white glass
    color: 'from-white via-neutral-100 to-neutral-300',
    border: 'border-white/40',
    glow: 'shadow-[0_0_25px_rgba(255,255,255,0.25)]',
    text: 'text-white',
    bgSoft: 'bg-white/10',
    badge: 'bg-white/15 text-white border-white/30 backdrop-blur-md',
    hex: '#ffffff',
    opacityLevel: '100% Platinum',
    dotClass: 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]',
    maxRender: 24,
  },
  days: {
    id: 'days',
    label: 'Days',
    singular: 'Day',
    ms: 1000 * 60 * 60 * 24,
    // 75% / Silver frosted glass
    color: 'from-neutral-200 via-neutral-300 to-neutral-400',
    border: 'border-white/30',
    glow: 'shadow-[0_0_20px_rgba(255,255,255,0.18)]',
    text: 'text-neutral-200',
    bgSoft: 'bg-white/10',
    badge: 'bg-white/10 text-neutral-200 border-white/20 backdrop-blur-md',
    hex: '#e5e5e5',
    opacityLevel: '75% Silver',
    dotClass: 'bg-neutral-300 shadow-[0_0_6px_rgba(255,255,255,0.5)]',
    maxRender: 45,
  },
  hours: {
    id: 'hours',
    label: 'Hours',
    singular: 'Hour',
    ms: 1000 * 60 * 60,
    // 50% / Smoked obsidian glass
    color: 'from-neutral-400 via-neutral-500 to-neutral-600',
    border: 'border-white/20',
    glow: 'shadow-[0_0_15px_rgba(255,255,255,0.12)]',
    text: 'text-neutral-300',
    bgSoft: 'bg-white/5',
    badge: 'bg-white/10 text-neutral-300 border-white/15 backdrop-blur-md',
    hex: '#a3a3a3',
    opacityLevel: '50% Smoked',
    dotClass: 'bg-neutral-500 shadow-[0_0_4px_rgba(255,255,255,0.3)]',
    maxRender: 48,
  },
  minutes: {
    id: 'minutes',
    label: 'Minutes',
    singular: 'Minute',
    ms: 1000 * 60,
    // 25% / Ghost obsidian glass with glowing white bevel
    color: 'from-neutral-600 via-neutral-700 to-neutral-800',
    border: 'border-white/15',
    glow: 'shadow-[0_0_15px_rgba(255,255,255,0.08)]',
    text: 'text-neutral-400',
    bgSoft: 'bg-white/5',
    badge: 'bg-white/10 text-neutral-400 border-white/15 backdrop-blur-md',
    hex: '#737373',
    opacityLevel: '25% Ghost',
    dotClass: 'bg-neutral-700 border border-white/30',
    maxRender: 60,
  }
};

const SOURCE_ICONS = {
  calendar: { icon: Calendar, label: 'Google Calendar', color: 'text-neutral-300' },
  slack: { icon: MessageSquare, label: 'Slack', color: 'text-neutral-300' },
  email: { icon: Mail, label: 'Gmail', color: 'text-neutral-300' },
  phone: { icon: Smartphone, label: 'iOS Reminders', color: 'text-neutral-300' }
};

// --- TRUE CALENDAR MONTHS ---
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

// --- CORE BLOCK CALCULATION ENGINE ---
const calculateStackData = (task, currentNow, forcedScale = 'auto') => {
  if (!task) return null;
  const remainingMs = Math.max(0, task.deadline - currentNow);
  const isExpired = remainingMs <= 0;

  // Determine appropriate unit
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

  // Top block fraction (erodes smoothly 0.0 to 1.0)
  const topBlockProgress = isExpired ? 0 : (exactBlocks % 1 === 0 ? 1 : exactBlocks % 1);

  // Single-block urgency threshold
  const isLastBlock = !isExpired && totalBlocks === 1;
  const isCritical = !isExpired && (totalBlocks <= 2 || unitKey === 'minutes');

  // Detailed digital breakdown
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
    isCritical,
    isExpired,
    remainingMs,
    breakdown: { d, h, m, s }
  };
};

// --- PERSISTENCE (localStorage) ---
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
      title: 'Laundry & Pack Before Flight',
      category: 'Personal',
      source: 'phone',
      createdAt: now - (2 * hr),
      deadline: now + (4.8 * hr),
      notes: 'Flight boards at Gate B12. Do not forget passport and chargers.'
    },
    {
      id: 'task-2',
      title: 'Push Hotfix to Production',
      category: 'Engineering',
      source: 'slack',
      createdAt: now - (45 * min),
      deadline: now + (52 * min),
      notes: 'From @sarah in #devops: "Needs to go live before the 6 PM traffic spike."'
    },
    {
      id: 'task-3',
      title: 'Pay Electric & Fiber Bill',
      category: 'Finance',
      source: 'email',
      createdAt: now - (5 * day),
      deadline: now + (19.6 * day),
      notes: 'Auto-extracted from billing@citypower.com invoice.'
    },
    {
      id: 'task-4',
      title: 'Submit Final Tax Return',
      category: 'Legal',
      source: 'calendar',
      createdAt: now - (2 * hr),
      deadline: now + (0.85 * hr),
      notes: 'Accountant needs the signed PDF doc immediately.'
    },
    {
      id: 'task-5',
      title: 'Q1 Product Architecture Launch',
      category: 'Roadmap',
      source: 'calendar',
      createdAt: now - (30 * day),
      deadline: now + (135 * day),
      notes: 'Full pipeline migration milestone across services.'
    }
  ];
};

export default function App() {
  const [tasks, setTasks] = useState(() => loadStoredTasks());
  const [selectedTaskId, setSelectedTaskId] = useState('task-1');
  const [scaleOverride, setScaleOverride] = useState('auto');
  const [viewMode, setViewMode] = useState('focus');
  const [screensaverMode, setScreensaverMode] = useState(false);

  const [timeOffset, setTimeOffset] = useState(0);
  const [now, setNow] = useState(Date.now());

  const [showAddModal, setShowAddModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newAmount, setNewAmount] = useState(5);
  const [newUnit, setNewUnit] = useState('hours');
  const [newSource, setNewSource] = useState('calendar');
  const [newNotes, setNewNotes] = useState('');
  const [addError, setAddError] = useState('');

  const [aiInputText, setAiInputText] = useState(
    'Hey team, the client just slacked me—we need to have the final deck and budget spreadsheet submitted in 4 hours before their board meeting!'
  );
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const dockRef = useRef(null);

  // Live clock ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now() + timeOffset);
    }, 1000);
    return () => clearInterval(interval);
  }, [timeOffset]);

  useEffect(() => {
    setNow(Date.now() + timeOffset);
  }, [timeOffset]);

  // Sync to localStorage
  useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
      }
    } catch (e) { /* storage unavailable */ }
  }, [tasks]);

  // Audio & Notification Alerts
  const alertedRef = useRef(new Set());

  const playAlertSound = () => {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      [0, 0.3].forEach((start) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + 0.3);
      });
    } catch (e) { /* ignore */ }
  };

  const fireDeadlineAlert = (task) => {
    playAlertSound();
    try {
      if (typeof window !== 'undefined' && 'Notification' in window
        && Notification.permission === 'granted') {
        new Notification('Timetres — time is up!', {
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

  // Handlers
  const handleAddTask = (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const amount = Number(newAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 365) {
      setAddError('Enter a number of blocks between 1 and 365.');
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
      notes: newNotes.trim() || 'Added manually to Timetres.'
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
      setAiError('Add VITE_GEMINI_API_KEY — AI ingest is disabled without it');
      setIsAiLoading(false);
      return;
    }
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

    const systemPrompt = `You are the ingestion engine for "Timetres", a visual countdown app.
Extract the core task title, estimate how much time remains until the deadline based on the text,
choose the best source icon ('slack', 'email', 'calendar', or 'phone'), and write a short 1-sentence
context note.`;

    const payload = {
      contents: [{ parts: [{ text: aiInputText }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING", description: "Actionable short task title (max 35 chars)" },
            amount: { type: "NUMBER", description: "Numeric quantity of time remaining" },
            unit: { type: "STRING", enum: ["minutes", "hours", "days", "months"] },
            source: { type: "STRING", enum: ["slack", "email", "calendar", "phone"] },
            notes: { type: "STRING", description: "Brief summary of who asked or why it matters" }
          },
          required: ["title", "amount", "unit", "source", "notes"]
        }
      }
    };

    const fetchWithBackoff = async (retries = 3, delay = 1000) => {
      try {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const err = new Error(`API status ${res.status}`);
          err.status = res.status;
          err.retryable = res.status === 429 || res.status >= 500;
          throw err;
        }
        return await res.json();
      } catch (err) {
        if (retries <= 0 || err.retryable === false) throw err;
        await new Promise(r => setTimeout(r, delay));
        return fetchWithBackoff(retries - 1, delay * 2);
      }
    };

    try {
      const result = await fetchWithBackoff();
      const rawJson = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawJson) throw new Error('Could not parse response');

      const cleanedJson = rawJson.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      const extracted = JSON.parse(cleanedJson);
      const aiAmount = Number(extracted?.amount);
      if (!Number.isFinite(aiAmount) || aiAmount <= 0 || aiAmount > 365 * 12) {
        throw new Error('Invalid AI extraction: amount out of range');
      }
      const aiTitle = typeof extracted?.title === 'string' && extracted.title.trim()
        ? extracted.title.trim().slice(0, 35)
        : 'AI Extracted Task';
      const unitKey = UNIT_CONFIG[extracted.unit] ? extracted.unit : 'hours';
      const deadline = unitKey === 'months'
        ? addMonthsAmount(new Date(now), aiAmount).getTime()
        : now + (aiAmount * UNIT_CONFIG[unitKey].ms);

      const newTask = {
        id: 'task-ai-' + Date.now(),
        title: aiTitle,
        category: 'AI Webhook',
        source: SOURCE_ICONS[extracted.source] ? extracted.source : 'slack',
        createdAt: now,
        deadline,
        notes: typeof extracted?.notes === 'string' && extracted.notes.trim() ? extracted.notes : aiInputText
      };

      setTasks(prev => [newTask, ...prev]);
      setSelectedTaskId(newTask.id);
      setScaleOverride('auto');
      setShowAIModal(false);
    } catch (error) {
      setAiError('Could not reach AI extraction service. Try again or add manually.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const triggerPanicDemo = () => {
    if (!activeTask) return;
    const currentUnit = activeStack?.unitKey || 'hours';
    setScaleOverride(currentUnit);
    const updatedDeadline = currentUnit === 'months'
      ? addMonthsAmount(new Date(now), 0.75).getTime()
      : now + (UNIT_CONFIG[currentUnit].ms * 0.75);
    setTasks(prev => prev.map(t => t.id === activeTask.id ? { ...t, deadline: updatedDeadline } : t));
  };

  const scrollDock = (dir) => {
    if (!dockRef.current) return;
    dockRef.current.scrollBy({ left: dir * 280, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-black text-neutral-100 flex flex-col font-sans selection:bg-white/20 selection:text-white overflow-x-hidden relative">
      <style>{`
        @keyframes dangerShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px) rotate(-0.5deg); }
          75% { transform: translateX(2px) rotate(0.5deg); }
        }
        .animate-danger-shake {
          animation: dangerShake 0.4s ease-in-out infinite;
        }
        .jenga-block {
          transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .jenga-block:hover {
          transform: scaleX(1.025) translateY(-1px);
          filter: brightness(1.2);
        }
      `}</style>

      {/* Ambient specular highlight glow behind the stack */}
      <div
        className="pointer-events-none fixed inset-0 transition-all duration-1000 opacity-20"
        style={{
          background: activeStack?.isLastBlock
            ? 'radial-gradient(circle at 50% 45%, rgba(255, 255, 255, 0.18) 0%, transparent 60%)'
            : 'radial-gradient(circle at 50% 45%, rgba(255, 255, 255, 0.08) 0%, transparent 55%)'
        }}
      />

      {/* Architectural subtle micro-grid */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)`,
          backgroundSize: '32px 32px'
        }}
      />

      {/* --- TOP BAR --- */}
      {!screensaverMode ? (
        <header className="relative z-20 border-b border-white/[0.08] bg-black/80 backdrop-blur-2xl px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-b from-neutral-800 to-black p-[1px] border border-white/20 shadow-xl shadow-black">
              <div className="w-full h-full bg-black rounded-[11px] flex flex-col items-center justify-center gap-1 p-2">
                <div className="w-full h-1 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
                <div className="w-3/4 h-1 rounded-full bg-white/60" />
                <div className="w-1/2 h-1 rounded-full bg-white/30" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-[0.25em] text-white">
                  TIMETRES
                </h1>
                <span className="text-[10px] font-mono tracking-widest px-2 py-0.5 rounded-full bg-white/10 text-neutral-300 border border-white/15">
                  MONOCHROME
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 font-medium tracking-wide hidden sm:block">
                Physical Diminishing Block System
              </p>
            </div>
          </div>

          {/* Center Monochrome Opacity Legend */}
          <div className="hidden xl:flex items-center gap-2 bg-neutral-950/90 border border-white/10 px-3.5 py-1.5 rounded-full text-xs shadow-inner">
            <span className="text-neutral-400 font-medium mr-1">Resolution:</span>
            {Object.values(UNIT_CONFIG).map(u => (
              <button
                key={u.id}
                onClick={() => setScaleOverride(scaleOverride === u.id ? 'auto' : u.id)}
                className={`flex items-center gap-2 px-2.5 py-1 rounded-full transition-all ${
                  activeStack?.unitKey === u.id
                    ? 'bg-neutral-800 text-white ring-1 ring-white/30 shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-sm ${u.dotClass}`} />
                <span className="text-[11px] font-medium">{u.singular} ({u.opacityLevel})</span>
              </button>
            ))}
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex bg-neutral-950 border border-white/10 rounded-xl p-0.5 shadow-sm">
              <button
                onClick={() => setViewMode('focus')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'focus'
                    ? 'bg-white text-black shadow-md'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Single Stack
              </button>
              <button
                onClick={() => setViewMode('skyline')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                  viewMode === 'skyline'
                    ? 'bg-white text-black shadow-md'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Skyline
              </button>
            </div>

            {/* AI Ingest */}
            <button
              onClick={() => setShowAIModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-neutral-900/90 hover:bg-neutral-800 text-neutral-200 border border-white/15 hover:border-white/30 transition-all shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-neutral-300" />
              <span className="hidden sm:inline">AI Ingest</span>
            </button>

            {/* Add Stack Button */}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-white hover:bg-neutral-200 text-black transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)]"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Add Stack</span>
            </button>

            {/* Screensaver Mode */}
            <button
              onClick={() => setScreensaverMode(true)}
              title="Enter Ambient Mode"
              className="p-2 rounded-xl bg-neutral-900/90 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-white/10 transition-all"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </header>
      ) : (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
          <button
            onClick={() => setScreensaverMode(false)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-950/80 hover:bg-neutral-900 text-neutral-200 text-xs font-medium border border-white/20 backdrop-blur-md shadow-2xl transition-all"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span>Exit Ambient Mode</span>
          </button>
        </div>
      )}

      {/* --- MAIN STAGE --- */}
      <main className="flex-1 relative z-10 flex flex-col justify-between max-w-7xl w-full mx-auto px-4 sm:px-6 py-4">
        {tasks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
            <h2 className="text-2xl font-black text-white tracking-tight">No deadlines yet — add one</h2>
            <p className="text-sm text-neutral-400 mt-2">Create your first Timetres stack to start the physical countdown.</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-6 px-5 py-2.5 rounded-xl text-xs font-bold bg-white hover:bg-neutral-200 text-black shadow-[0_0_20px_rgba(255,255,255,0.2)]"
            >
              Add Stack
            </button>
          </div>
        ) : viewMode === 'focus' && activeTask && activeStack ? (
          /* ================= SINGLE FOCUS STACK VIEW ================= */
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center my-auto py-2">
            
            {/* LEFT COLUMN: Task Context & Resolution Shifter */}
            <div className="lg:col-span-4 flex flex-col gap-4 order-2 lg:order-1">
              <div className="bg-neutral-950/80 border border-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-2xl relative overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent">
                
                {/* Source Badge */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-neutral-300 bg-black/80 px-3 py-1 rounded-full border border-white/10">
                    {(() => {
                      const SrcIcon = SOURCE_ICONS[activeTask.source]?.icon || Calendar;
                      return <SrcIcon className="w-3.5 h-3.5 text-neutral-300" />;
                    })()}
                    <span>Synced via {SOURCE_ICONS[activeTask.source]?.label || 'Calendar'}</span>
                  </div>

                  <span className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${activeStack.config.badge}`}>
                    {activeStack.config.label} Scale
                  </span>
                </div>

                {/* Task Title */}
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight mb-2">
                  {activeTask.title}
                </h2>
                <p className="text-sm text-neutral-400 leading-relaxed mb-5">
                  {activeTask.notes}
                </p>

                {/* Digital Readout Card */}
                <div className="bg-black/90 border border-white/10 rounded-xl p-4 mb-5 shadow-inner">
                  <div className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold mb-2 flex items-center justify-between">
                    <span>Exact Time Remaining</span>
                    <Clock className="w-3.5 h-3.5 text-neutral-400" />
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-neutral-950/90 rounded-lg py-2 border border-white/[0.08]">
                      <div className="text-xl sm:text-2xl font-black font-mono text-white">
                        {String(activeStack.breakdown.d).padStart(2, '0')}
                      </div>
                      <div className="text-[10px] uppercase text-neutral-500 font-semibold">Days</div>
                    </div>
                    <div className="bg-neutral-950/90 rounded-lg py-2 border border-white/[0.08]">
                      <div className="text-xl sm:text-2xl font-black font-mono text-white">
                        {String(activeStack.breakdown.h).padStart(2, '0')}
                      </div>
                      <div className="text-[10px] uppercase text-neutral-500 font-semibold">Hours</div>
                    </div>
                    <div className="bg-neutral-950/90 rounded-lg py-2 border border-white/[0.08]">
                      <div className="text-xl sm:text-2xl font-black font-mono text-white">
                        {String(activeStack.breakdown.m).padStart(2, '0')}
                      </div>
                      <div className="text-[10px] uppercase text-neutral-500 font-semibold">Mins</div>
                    </div>
                    <div className="bg-neutral-950/90 rounded-lg py-2 border border-white/[0.08]">
                      <div className="text-xl sm:text-2xl font-black font-mono text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]">
                        {String(activeStack.breakdown.s).padStart(2, '0')}
                      </div>
                      <div className="text-[10px] uppercase text-neutral-400 font-semibold">Secs</div>
                    </div>
                  </div>
                </div>

                {/* Scale Shift Switcher */}
                {!screensaverMode && (
                  <div>
                    <div className="flex items-center justify-between text-xs text-neutral-400 mb-2">
                      <span className="font-semibold flex items-center gap-1.5 text-neutral-300">
                        <Sliders className="w-3.5 h-3.5 text-white" />
                        Shift Block Resolution:
                      </span>
                      <span className="text-[11px] text-neutral-500 font-mono">
                        {scaleOverride === 'auto' ? 'Auto-Scaling' : 'Locked'}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 bg-black p-1.5 rounded-xl border border-white/10">
                      <button
                        onClick={() => setScaleOverride('auto')}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                          scaleOverride === 'auto'
                            ? 'bg-white text-black shadow-md'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        Auto
                      </button>
                      {Object.values(UNIT_CONFIG).map(u => (
                        <button
                          key={u.id}
                          onClick={() => setScaleOverride(u.id)}
                          className={`py-1.5 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${
                            activeStack.unitKey === u.id && scaleOverride !== 'auto'
                              ? 'bg-neutral-800 text-white ring-1 ring-white/40'
                              : 'text-neutral-400 hover:text-white'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${u.dotClass}`} />
                          <span>{u.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Time Simulator Controls */}
              {!screensaverMode && (
                <div className="bg-neutral-950/60 border border-white/10 rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                      <FastForward className="w-3.5 h-3.5 text-white" />
                      Time Simulator
                    </span>
                    {timeOffset !== 0 && (
                      <button
                        onClick={() => setTimeOffset(0)}
                        className="text-xs text-neutral-300 hover:text-white flex items-center gap-1 font-medium underline"
                      >
                        <RotateCcw className="w-3 h-3" /> Reset to Live
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400">
                    Test the physical erosion or trigger the high-urgency single block:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setTimeOffset(prev => prev + UNIT_CONFIG.hours.ms)}
                      className="px-2.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-xs font-semibold text-neutral-200 border border-white/10 transition-all"
                    >
                      +1 Hour
                    </button>
                    <button
                      onClick={() => setTimeOffset(prev => prev + UNIT_CONFIG.days.ms)}
                      className="px-2.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-xs font-semibold text-neutral-200 border border-white/10 transition-all"
                    >
                      +1 Day
                    </button>
                    <button
                      onClick={triggerPanicDemo}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white border border-white/30 flex items-center justify-center gap-1.5 transition-all shadow-sm"
                    >
                      <Flame className="w-3.5 h-3.5 text-white" />
                      Simulate "1 Block Left!"
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* CENTER COLUMN: THE SHINY PHYSICAL OBSIDIAN & WHITE STACK */}
            <div className="lg:col-span-5 flex flex-col items-center justify-center order-1 lg:order-2 relative min-h-[440px] sm:min-h-[500px]">

              {/* Floating Counter Badge */}
              <div className="text-center mb-4 relative z-10">
                <div className="inline-flex items-baseline gap-2.5">
                  <span className={`text-6xl sm:text-7xl font-black tracking-tighter ${
                    activeStack.isLastBlock ? 'text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.8)] animate-pulse' : 'text-white'
                  }`}>
                    {activeStack.totalBlocks}
                  </span>
                  <span className={`text-xl sm:text-2xl font-bold uppercase tracking-widest text-neutral-300`}>
                    {activeStack.totalBlocks === 1 ? activeStack.config.singular : activeStack.config.label}
                  </span>
                </div>
                <div className="text-xs text-neutral-400 mt-1 font-mono tracking-wide">
                  {activeStack.isExpired
                    ? 'DEADLINE REACHED — STACK HIT ZERO'
                    : activeStack.isLastBlock
                      ? 'FINAL BLOCK REMAINING — ACT IMMEDIATELY'
                      : `Each block represents 1 ${activeStack.config.singular.toLowerCase()} (${activeStack.config.opacityLevel})`}
                </div>
              </div>

              {/* THE SHINY BLACK SILO CONTAINER */}
              <div className="relative w-full max-w-[320px] sm:max-w-[360px] h-[360px] sm:h-[400px] flex flex-col justify-end items-center px-6 pt-6 pb-3 rounded-3xl bg-black/90 border border-white/15 shadow-[inset_0_2px_16px_rgba(255,255,255,0.06),0_25px_60px_rgba(0,0,0,0.95)] backdrop-blur-2xl overflow-hidden">
                
                {/* Precision Background Measure Lines */}
                <div className="pointer-events-none absolute inset-x-4 inset-y-4 flex flex-col justify-between opacity-15">
                  {[...Array(6)].map((_, idx) => (
                    <div key={idx} className="w-full border-b border-dashed border-neutral-600 flex justify-between text-[9px] font-mono text-neutral-400 pb-0.5">
                      <span>—</span>
                      <span>—</span>
                    </div>
                  ))}
                </div>

                {/* Overflow Indicator */}
                {activeStack.overflowBlocks > 0 && (
                  <div className="relative z-20 mb-2 px-3 py-1 rounded-full bg-neutral-900/95 border border-white/20 text-xs font-bold text-neutral-200 shadow-xl">
                    + {activeStack.overflowBlocks} more {activeStack.config.label.toLowerCase()} queued above
                  </div>
                )}

                {/* THE PHYSICAL BLOCKS */}
                {activeStack.isExpired ? (
                  <div className="my-auto flex flex-col items-center text-center p-4">
                    <CheckCircle2 className="w-12 h-12 text-white mb-2 opacity-90 drop-shadow-[0_0_12px_rgba(255,255,255,0.6)]" />
                    <p className="text-base font-black text-white tracking-wide">Zero Blocks Left</p>
                    <p className="text-xs text-neutral-400 mt-1">Countdown expired. Mark complete or extend deadline.</p>
                  </div>
                ) : (
                  <div
                    className={`w-full flex flex-col-reverse gap-1.5 relative z-10 justify-start h-full ${
                      activeStack.isLastBlock ? 'animate-danger-shake justify-center' : ''
                    }`}
                  >
                    {Array.from({ length: activeStack.renderedBlocks }).map((_, index) => {
                      const isTopBlock = index === activeStack.renderedBlocks - 1;
                      const blockNumber = activeStack.firstRenderedBlock + index;

                      const dynamicHeight = activeStack.renderedBlocks === 1
                        ? 'h-32'
                        : activeStack.renderedBlocks <= 5
                          ? 'h-14'
                          : activeStack.renderedBlocks <= 12
                            ? 'h-7'
                            : activeStack.renderedBlocks <= 24
                              ? 'h-4'
                              : 'h-2.5';

                      const jengaOffset = index % 3 === 0 ? 'translate-x-0.5' : index % 3 === 1 ? '-translate-x-0.5' : '';

                      return (
                        <div
                          key={index}
                          title={`Block #${blockNumber} (${activeStack.config.singular})`}
                          className={`jenga-block relative w-full ${dynamicHeight} ${jengaOffset} rounded-lg bg-gradient-to-b from-neutral-800/90 via-neutral-900/95 to-black border ${
                            activeStack.isLastBlock
                              ? 'border-white shadow-[0_0_35px_rgba(255,255,255,0.7)]'
                              : activeStack.config.border
                          } overflow-hidden flex items-center justify-between px-3 select-none shadow-[0_4px_14px_rgba(0,0,0,0.9)]`}
                        >
                          {/* Active Fill with Unit Opacity & Gradient */}
                          <div
                            className={`absolute inset-y-0 left-0 bg-gradient-to-r ${
                              activeStack.isLastBlock
                                ? 'from-white via-neutral-200 to-white'
                                : activeStack.config.color
                            } ${isTopBlock ? 'opacity-100' : 'opacity-90'} transition-all duration-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]`}
                            style={{
                              width: isTopBlock ? `${Math.max(8, activeStack.topBlockProgress * 100)}%` : '100%'
                            }}
                          />

                          {/* Specular Top Shine Line */}
                          <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/60 to-transparent pointer-events-none" />

                          {/* Glossy Top-Half Sheen */}
                          <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.08] to-transparent pointer-events-none" />

                          {/* Block Interior Label */}
                          {activeStack.renderedBlocks <= 12 && (
                            <div className="relative z-10 w-full flex items-center justify-between text-[11px] font-mono font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                              <span className="flex items-center gap-1.5">
                                <span className="opacity-80">#{blockNumber}</span>
                                {activeStack.isLastBlock && (
                                  <span className="uppercase tracking-wider bg-black/60 px-2 py-0.5 rounded text-white border border-white/40 animate-pulse">
                                    FINAL BLOCK
                                  </span>
                                )}
                              </span>
                              {isTopBlock && (
                                <span className="text-[10px] bg-black/60 px-1.5 py-0.5 rounded border border-white/20">
                                  {Math.round(activeStack.topBlockProgress * 100)}% left
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Polished Chrome Mirror Pedestal */}
                <div className="w-full h-1 mt-3 rounded-full bg-gradient-to-r from-transparent via-white/80 to-transparent shadow-[0_0_20px_rgba(255,255,255,0.4)]" />
              </div>
            </div>

            {/* RIGHT COLUMN: Urgency Diagnosis & Scale Matrix */}
            <div className="lg:col-span-3 flex flex-col gap-4 order-3">
              <div className={`rounded-2xl p-5 border backdrop-blur-2xl transition-all relative overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent ${
                activeStack.isLastBlock
                  ? 'bg-neutral-900/90 border-white/60 shadow-[0_0_40px_rgba(255,255,255,0.15)]'
                  : 'bg-neutral-950/80 border-white/10 shadow-2xl'
              }`}>
                <div className="flex items-center gap-2.5 mb-3">
                  <div className={`p-2 rounded-xl ${
                    activeStack.isLastBlock ? 'bg-white text-black animate-bounce shadow-lg' : 'bg-neutral-900 text-white border border-white/15'
                  }`}>
                    {activeStack.isLastBlock ? <AlertTriangle className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">
                      {activeStack.isLastBlock ? 'Final Block Triggered' : 'Stack Status'}
                    </h3>
                    <p className="text-xs text-neutral-400">
                      {activeStack.isLastBlock ? 'Buffer fully depleted' : 'Diminishing block gauge'}
                    </p>
                  </div>
                </div>

                {activeStack.isLastBlock ? (
                  <p className="text-xs sm:text-sm text-neutral-200 font-medium leading-relaxed">
                    You are down to your <span className="font-bold underline text-white">final {activeStack.config.singular.toLowerCase()} block</span>. Finish this now before the physical stack reaches zero.
                  </p>
                ) : (
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    Currently eroding <span className="font-bold text-white">Block #{activeStack.totalBlocks}</span> ({Math.round(activeStack.topBlockProgress * 100)}% of this {activeStack.config.singular.toLowerCase()} remaining){activeStack.overflowBlocks > 0 ? ` — rendering blocks ${activeStack.firstRenderedBlock}–${activeStack.totalBlocks}` : ''}.
                  </p>
                )}

                {/* Opacity Matrix Mini Card */}
                <div className="mt-4 pt-4 border-t border-white/10 space-y-2 text-xs">
                  <div className="font-semibold text-neutral-400 mb-1">Block Scale Opacities:</div>
                  {Object.values(UNIT_CONFIG).map(u => (
                    <div
                      key={u.id}
                      onClick={() => setScaleOverride(u.id)}
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
                        activeStack.unitKey === u.id ? 'bg-neutral-800 text-white font-bold border border-white/20' : 'text-neutral-400 hover:bg-neutral-900/60 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`w-3.5 h-3.5 rounded ${u.dotClass}`} />
                        <span>{u.label}</span>
                      </div>
                      <span className="font-mono text-[11px] text-neutral-300">
                        {Math.ceil(exactBlocksForUnit(u.id, now, activeTask.deadline))} blocks
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        ) : (
          /* ================= SKYLINE MULTI-STACK VIEW ================= */
          <div className="flex-1 flex flex-col justify-center py-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-black text-white tracking-tight">Active Deadline Stacks</h2>
              <p className="text-xs text-neutral-400 mt-1">Select any stack to inspect its diminishing physical blocks</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 items-end">
              {tasks.map(task => {
                const st = calculateStackData(task, now, scaleOverride);
                const SrcIcon = SOURCE_ICONS[task.source]?.icon || Calendar;
                return (
                  <div
                    key={task.id}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedTaskId(task.id);
                        setViewMode('focus');
                      }
                    }}
                    onClick={() => {
                      setSelectedTaskId(task.id);
                      setViewMode('focus');
                    }}
                    className={`group cursor-pointer rounded-2xl p-4 bg-neutral-950/70 hover:bg-neutral-900/90 border transition-all flex flex-col items-center shadow-lg hover:shadow-2xl ${
                      selectedTaskId === task.id ? 'border-white/80 ring-1 ring-white/40' : 'border-white/10'
                    }`}
                  >
                    <div className="w-full flex items-center justify-between text-xs text-neutral-400 mb-2">
                      <SrcIcon className="w-3.5 h-3.5 text-neutral-400 group-hover:text-white transition-colors" />
                      <span className="font-mono font-bold text-white">
                        {st.totalBlocks} {st.config.label}
                      </span>
                    </div>

                    {/* Mini Visual Stack in Smoked Glass */}
                    <div
                      title={st.totalBlocks > 0 ? `Blocks ${st.totalBlocks - Math.min(st.renderedBlocks, 18) + 1}–${st.totalBlocks} of ${st.totalBlocks}` : 'No blocks left'}
                      className="w-full h-48 bg-black rounded-xl p-3 border border-white/10 flex flex-col-reverse gap-1 justify-start overflow-hidden mb-3 relative shadow-inner"
                    >
                      {Array.from({ length: Math.min(st.renderedBlocks, 18) }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-full h-2.5 rounded-[2px] bg-gradient-to-r ${st.config.color} shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] ${
                            i === Math.min(st.renderedBlocks, 18) - 1 ? 'opacity-100' : 'opacity-80'
                          }`}
                        />
                      ))}
                    </div>

                    <h4 className="text-sm font-bold text-white text-center line-clamp-1 group-hover:underline transition-all">
                      {task.title}
                    </h4>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* --- BOTTOM HORIZONTAL SCROLLING TASK DOCK --- */}
        <section className="relative z-20 mt-4 pt-3 border-t border-white/10">
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                Queued Deadlines ({tasks.length})
              </span>
              <span className="text-[11px] text-neutral-500 hidden sm:inline">
                — Scroll to switch active countdown
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => scrollDock(-1)}
                className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-white/10"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => scrollDock(1)}
                className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-white/10"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div
            ref={dockRef}
            className="flex items-stretch gap-3 overflow-x-auto pb-2 pt-1 scroll-smooth"
          >
            {tasks.map(task => {
              const st = calculateStackData(task, now, 'auto');
              const isSelected = task.id === activeTask?.id;
              const SrcIcon = SOURCE_ICONS[task.source]?.icon || Calendar;

              return (
                <div
                  key={task.id}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedTaskId(task.id);
                    }
                  }}
                  onClick={() => setSelectedTaskId(task.id)}
                  className={`group relative flex-shrink-0 w-64 sm:w-72 rounded-2xl p-3.5 cursor-pointer transition-all border flex items-center gap-3.5 select-none ${
                    isSelected
                      ? 'bg-neutral-900/95 border-white/80 ring-1 ring-white/50 shadow-[0_0_25px_rgba(255,255,255,0.12)] -translate-y-0.5'
                      : 'bg-neutral-950/60 hover:bg-neutral-900/80 border-white/10 opacity-75 hover:opacity-100'
                  }`}
                >
                  {/* Mini Vertical Stack Preview Bar */}
                  <div
                    title={st.totalBlocks > 0 ? `Blocks ${st.totalBlocks - Math.min(st.totalBlocks, 8) + 1}–${st.totalBlocks} of ${st.totalBlocks}` : 'No blocks left'}
                    className="w-6 h-14 bg-black rounded-lg p-1 border border-white/10 flex flex-col-reverse gap-0.5 justify-start overflow-hidden flex-shrink-0"
                  >
                    {Array.from({ length: Math.min(st.totalBlocks, 8) }).map((_, idx) => (
                      <div
                        key={idx}
                        className={`w-full h-1.5 rounded-[1px] bg-gradient-to-r ${st.config.color}`}
                      />
                    ))}
                  </div>

                  {/* Card Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                        <SrcIcon className="w-3 h-3 text-neutral-400" />
                        {task.source}
                      </span>
                      <span className={`text-xs font-black font-mono ${
                        st.isLastBlock ? 'text-white animate-pulse' : 'text-neutral-200'
                      }`}>
                        {st.totalBlocks} {st.totalBlocks === 1 ? st.config.singular : st.config.label}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-white truncate">
                      {task.title}
                    </h4>

                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] text-neutral-400 font-mono">
                        {st.breakdown.d}d {st.breakdown.h}h {st.breakdown.m}m
                      </span>
                      {tasks.length > 1 && (
                        <button
                          onClick={(e) => handleDeleteTask(task.id, e)}
                          title="Delete Stack"
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded hover:bg-white/10 text-neutral-400 hover:text-white transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Quick Add Card */}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex-shrink-0 w-44 rounded-2xl p-3.5 border border-dashed border-white/20 hover:border-white/50 bg-neutral-950/40 hover:bg-neutral-900/60 flex flex-col items-center justify-center gap-1.5 text-neutral-400 hover:text-white transition-all"
            >
              <Plus className="w-5 h-5" />
              <span className="text-xs font-bold">New Deadline</span>
            </button>
          </div>
        </section>
      </main>

      {/* ================= MODAL 1: ADD MANUAL DEADLINE STACK ================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0a0a0a] border border-white/20 rounded-3xl max-w-md w-full p-6 shadow-[0_0_60px_rgba(0,0,0,0.95)] animate-in fade-in zoom-in-95 duration-200 relative overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-white" />
                Add New Timetres Stack
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-neutral-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddTask} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                  What needs to get done?
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Pay rent, Finish laundry, Board flight..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black border border-white/15 text-white text-sm focus:outline-none focus:border-white focus:ring-1 focus:ring-white/40"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                    Number of Blocks
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    required
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black border border-white/15 text-white text-sm font-mono focus:outline-none focus:border-white focus:ring-1 focus:ring-white/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                    Block Resolution
                  </label>
                  <select
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black border border-white/15 text-white text-sm focus:outline-none focus:border-white focus:ring-1 focus:ring-white/40"
                  >
                    <option value="minutes">Minutes (25% Ghost)</option>
                    <option value="hours">Hours (50% Smoked)</option>
                    <option value="days">Days (75% Silver)</option>
                    <option value="months">Months (100% Platinum)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                  Source Integration
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(SOURCE_ICONS).map(([key, item]) => {
                    const Icon = item.icon;
                    return (
                      <button
                        type="button"
                        key={key}
                        onClick={() => setNewSource(key)}
                        className={`py-2 px-2 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all ${
                          newSource === key
                            ? 'bg-neutral-800 border-white text-white shadow-sm'
                            : 'bg-black border-white/10 text-neutral-400 hover:text-white'
                        }`}
                      >
                        <Icon className="w-4 h-4 text-neutral-300" />
                        <span className="capitalize">{key}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                  Context / Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Gate number, invoice link, or reminder..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-black border border-white/15 text-white text-sm focus:outline-none focus:border-white focus:ring-1 focus:ring-white/40"
                />
              </div>

              {addError && (
                <div className="p-3 rounded-xl bg-neutral-900 border border-white/30 text-xs text-white">
                  {addError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-xs font-black bg-white hover:bg-neutral-200 text-black shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                >
                  Build Stack
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: GEMINI AI INGESTION ================= */}
      {showAIModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0a0a0a] border border-white/20 rounded-3xl max-w-lg w-full p-6 shadow-[0_0_60px_rgba(0,0,0,0.95)] relative overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-neutral-900 text-white border border-white/20">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">
                    AI Smart Ingest
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Parse natural text, emails, or messages into diminishing blocks
                  </p>
                </div>
              </div>
              <button onClick={() => setShowAIModal(false)} className="text-neutral-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                  Paste any message or note:
                </label>
                <textarea
                  rows={4}
                  value={aiInputText}
                  onChange={(e) => setAiInputText(e.target.value)}
                  placeholder="e.g., Flight leaves in 5 hours need to finish laundry first..."
                  className="w-full p-3.5 rounded-xl bg-black border border-white/15 text-white text-sm focus:outline-none focus:border-white focus:ring-1 focus:ring-white/40"
                />
              </div>

              {/* Sample Presets */}
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[11px] text-neutral-400 w-full">Try an example:</span>
                {[
                  "Laundry needs to be done before my flight leaves in 5 hours!",
                  "Email from Landlord: Rent bill is due in 14 days.",
                  "Urgent Slack from DevOps: Server SSL cert expires in 35 minutes!"
                ].map((sample, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setAiInputText(sample)}
                    className="text-[11px] bg-black hover:bg-neutral-900 text-neutral-300 px-2.5 py-1 rounded-lg border border-white/10 transition-all text-left truncate max-w-full"
                  >
                    "{sample}"
                  </button>
                ))}
              </div>

              {aiError && (
                <div className="p-3 rounded-xl bg-neutral-900 border border-white/30 text-xs text-white">
                  {aiError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAIModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isAiLoading}
                  onClick={handleAISmartExtract}
                  className="px-5 py-2.5 rounded-xl text-xs font-black bg-white hover:bg-neutral-200 text-black shadow-[0_0_20px_rgba(255,255,255,0.2)] flex items-center gap-2 disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isAiLoading ? 'Extracting with Gemini...' : 'Convert to Timetres Stack'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

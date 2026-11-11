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

// --- CONFIGURATION & CONSTANTS ---
const UNIT_CONFIG = {
  months: {
    id: 'months',
    label: 'Months',
    singular: 'Month',
    // IMPROVEMENT 3: a month has no fixed ms value — calendar months are
    // 28–31 days. Use calendarMonthsRemaining() / addMonthsAmount()
    // instead of remainingMs / config.ms for this unit.
    color: 'from-purple-500 to-indigo-600',
    border: 'border-purple-400/50',
    glow: 'shadow-[0_0_20px_rgba(168,85,247,0.35)]',
    text: 'text-purple-400',
    bgSoft: 'bg-purple-500/10',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    hex: '#a855f7',
    maxRender: 24,
  },

  days: {
    id: 'days',
    label: 'Days',
    singular: 'Day',
    ms: 1000 * 60 * 60 * 24,
    color: 'from-cyan-400 to-blue-600',
    border: 'border-cyan-300/50',
    glow: 'shadow-[0_0_20px_rgba(6,182,212,0.35)]',
    text: 'text-cyan-400',
    bgSoft: 'bg-cyan-500/10',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    hex: '#06b6d4',
    maxRender: 45,
  },
  hours: {
    id: 'hours',
    label: 'Hours',
    singular: 'Hour',
    ms: 1000 * 60 * 60,
    color: 'from-amber-400 to-orange-500',
    border: 'border-amber-300/60',
    glow: 'shadow-[0_0_25px_rgba(245,158,11,0.4)]',
    text: 'text-amber-400',
    bgSoft: 'bg-amber-500/10',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    hex: '#f59e0b',
    maxRender: 48,
  },
  minutes: {
    id: 'minutes',
    label: 'Minutes',
    singular: 'Minute',
    ms: 1000 * 60,
    color: 'from-rose-500 to-red-600',
    border: 'border-rose-400/70',
    glow: 'shadow-[0_0_30px_rgba(244,63,94,0.55)]',
    text: 'text-rose-500',
    bgSoft: 'bg-rose-500/10',
    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    hex: '#f43f5e',
    maxRender: 60,
  }
};

const SOURCE_ICONS = {
  calendar: { icon: Calendar, label: 'Google Calendar', color: 'text-blue-400' },
  slack: { icon: MessageSquare, label: 'Slack', color: 'text-emerald-400' },
  email: { icon: Mail, label: 'Gmail', color: 'text-rose-400' },
  phone: { icon: Smartphone, label: 'iOS Reminders', color: 'text-amber-400' }
};

// --- IMPROVEMENT 3: TRUE CALENDAR MONTHS ---
// A month block is one calendar month, not a fixed 30 days. These helpers
// are pure top-level functions so they can be unit-tested in isolation.

// Add whole calendar months to a date, clamping the day to the end of the
// target month (Jan 31 + 1 month = Feb 28/29, not Mar 3).
const addCalendarMonths = (date, months) => {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
};

// Fractional calendar months between two dates. Whole months are counted
// by calendar date; the partial final month is the fraction of the
// calendar month it spans, so Jan 31 -> Mar 15 is ~1.54 months, not 1.5.
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

// Add a (possibly fractional) number of calendar months to a date.
// 0.75 of a month = 75% of the way through the current calendar month.
const addMonthsAmount = (date, amount) => {
  const whole = Math.floor(amount);
  const frac = amount - whole;
  const base = addCalendarMonths(date, whole);
  if (frac === 0) return base;
  const next = addCalendarMonths(date, whole + 1);
  return new Date(base.getTime() + frac * (next.getTime() - base.getTime()));
};

// Exact blocks for a unit between two timestamps. Months use calendar
// math; days/hours/minutes use their fixed ms values.
const exactBlocksForUnit = (unitKey, fromMs, toMs) => {
  if (unitKey === 'months') {
    return calendarMonthsRemaining(new Date(fromMs), new Date(toMs));
  }
  return Math.max(0, toMs - fromMs) / UNIT_CONFIG[unitKey].ms;
};

// --- CORE BLOCK CALCULATION ENGINE (top-level so it can be tested) ---
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
  // IMPROVEMENT 3: months use calendar math, not remainingMs / 30 days.
  const exactBlocks = exactBlocksForUnit(unitKey, currentNow, task.deadline);
  const totalBlocks = isExpired ? 0 : Math.ceil(exactBlocks);
  const renderedBlocks = Math.min(totalBlocks, config.maxRender);
  // FIX 3: rendered blocks are the TOP renderedBlocks blocks, numbered
  // firstRenderedBlock..totalBlocks; only the true top block erodes.
  const firstRenderedBlock = totalBlocks === 0 ? 0 : totalBlocks - renderedBlocks + 1;

  // Top block fraction (how much of the top block has eroded: 0.0 to 1.0)
  const topBlockProgress = isExpired ? 0 : (exactBlocks % 1 === 0 ? 1 : exactBlocks % 1);

  // Is this the "DO IT NOW" single-block threshold?
  const isLastBlock = !isExpired && totalBlocks === 1;
  const isCritical = !isExpired && (totalBlocks <= 2 || unitKey === 'minutes');

  // Detailed digital breakdown
  const d = Math.floor(remainingMs / UNIT_CONFIG.days.ms);
  const h = Math.floor((remainingMs % UNIT_CONFIG.days.ms) / UNIT_CONFIG.hours.ms);
  const m = Math.floor((remainingMs % UNIT_CONFIG.hours.ms) /
    UNIT_CONFIG.minutes.ms);
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

// --- IMPROVEMENT 1: PERSISTENCE (localStorage) ---
const TASKS_STORAGE_KEY = 'timetres-tasks-v1';

const isValidStoredTask = (t) => (
  t && typeof t === 'object'
  && typeof t.id === 'string' && t.id.length > 0
  && typeof t.title === 'string' && t.title.trim().length > 0
  && Number.isFinite(Number(t.deadline))
  && typeof t.source === 'string'
);

// Load saved tasks, falling back to the built-in presets when nothing is
// stored or the stored data is missing/invalid. Guarded so a corrupt
// value (or a non-browser environment) never breaks startup.
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
    // An empty array is a valid saved state (user deleted everything).
    // Only fall back to presets when nothing valid survived.
    return valid.length > 0 || parsed.length === 0 ? valid : getInitialTasks();
  } catch (e) {
    return getInitialTasks();
  }
};

// Initial preset deadlines relative to "now"
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
    deadline: now + (4.8 * hr), // ~5 hours left (Amber Hours Stack)
    notes: 'Flight boards at Gate B12. Do not forget passport and chargers.'
  },
  {
    id: 'task-2',
    title: 'Push Hotfix to Production',
    category: 'Engineering',
    source: 'slack',
    createdAt: now - (45 * min),
    deadline: now + (52 * min), // 52 mins left (Red Minutes Stack - Panic approaching!)
    notes: 'From @sarah in #devops: "Needs to go live before the 6 PM traffic spike."'
  },
  {
    id: 'task-3',
    title: 'Pay Electric & Fiber Bill',
    category: 'Finance',
    source: 'email',
    createdAt: now - (5 * day),
    deadline: now + (19.6 * day), // 20 days left (Cyan Days Stack)
    notes: 'Auto-extracted from billing@citypower.com invoice.'
  },
  {
    id: 'task-4',

      title: 'Submit Final Tax Return',
      category: 'Legal',
      source: 'calendar',
      createdAt: now - (2 * hr),
      deadline: now + (0.85 * hr), // 51 mins left in Auto (Minutes Stack) — 1 block only if viewed in Hours
      notes: 'Accountant needs the signed PDF doc immediately.'
    },
    {
      id: 'task-5',
      title: 'Q1 Product Architecture Launch',
      category: 'Roadmap',
      source: 'calendar',
      createdAt: now - (30 * day),
      deadline: now + (135 * day), // 135 days = ~4.5 calendar-month blocks in Auto (Purple Months Stack, calendar months — exact count depends on which months it spans)
      notes: 'Full n8n + Firebase pipeline migration milestone.'
    }
  ];
};

export default function App() {
 // --- STATE ---
 // IMPROVEMENT 1: load saved tasks from localStorage (falls back to presets).
 const [tasks, setTasks] = useState(() => loadStoredTasks());
 const [selectedTaskId, setSelectedTaskId] = useState('task-1');
 const [scaleOverride, setScaleOverride] = useState('auto'); // 'auto' | 'months' | 'days' | 'hours' | 'minutes'
 const [viewMode, setViewMode] = useState('focus'); // 'focus' (1 at a time) | 'skyline' (all stacks)
 const [screensaverMode, setScreensaverMode] = useState(false);

 // Time machine simulation offset (in ms) so user can test watching blocks drop
 const [timeOffset, setTimeOffset] = useState(0);
 const [now, setNow] = useState(Date.now());

 // Modals
 const [showAddModal, setShowAddModal] = useState(false);
 const [showAIModal, setShowAIModal] = useState(false);

 // New task form state
 const [newTitle, setNewTitle] = useState('');
 const [newAmount, setNewAmount] = useState(5);
 const [newUnit, setNewUnit] = useState('hours');
 const [newSource, setNewSource] = useState('calendar');
 const [newNotes, setNewNotes] = useState('');
// FIX 4: shown when Add Task validation fails (see handleAddTask).
const [addError, setAddError] = useState('');

 // AI Smart Ingest state

 const [aiInputText, setAiInputText] = useState(
   'Hey team, the client just slacked me—we need to have the final deck and budget spreadsheet submitted in 4 hours before their board meeting!'
 );
 const [isAiLoading, setIsAiLoading] = useState(false);
 const [aiError, setAiError] = useState('');

 const dockRef = useRef(null);

 // --- LIVE CLOCK TICKER ---
 useEffect(() => {
   const interval = setInterval(() => {
     setNow(Date.now() + timeOffset);
   }, 1000);
   return () => clearInterval(interval);
 }, [timeOffset]);

 // Keep 'now' immediately updated when scrubbing time offset
 useEffect(() => {
   setNow(Date.now() + timeOffset);
 }, [timeOffset]);

 // IMPROVEMENT 1: save tasks to localStorage on every change, so a page
 // refresh does not lose them. Failures (private mode, quota) are ignored.
 useEffect(() => {
   try {
     if (typeof localStorage !== 'undefined') {
       localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
     }
   } catch (e) { /* storage unavailable — app still works in memory */ }
 }, [tasks]);

 // IMPROVEMENT 2: deadline alert — one sound + notification per task.
 // alertedRef tracks task ids already alerted; an id is cleared again if
 // its deadline moves back into the future, so it can alert again later.
 const alertedRef = useRef(new Set());

 const playAlertSound = () => {
   try {
     if (typeof window === 'undefined') return;
     const AudioCtx = window.AudioContext || window.webkitAudioContext;
     if (!AudioCtx) return;
     const ctx = new AudioCtx();
     // Two short beeps (880 Hz sine), no external audio file needed.
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
   } catch (e) { /* audio unavailable — the on-screen state still shows */ }
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
   } catch (e) { /* notifications unavailable — sound + UI still fire */ }
 };

 // Check once per tick (now updates every second): alert for any task
 // whose deadline has just been reached, exactly once per task.
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
   // Prune ids of tasks that no longer exist.
   const liveIds = new Set(tasks.map((t) => t.id));
   alertedRef.current.forEach((id) => {
     if (!liveIds.has(id)) alertedRef.current.delete(id);
   });
 }, [tasks, now]);

 // Ask for notification permission only after a user gesture (adding a
 // task), never on page load. Safe to call when already granted/denied.
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

 // --- HANDLERS ---
 const handleAddTask = (e) => {

  e.preventDefault();
  if (!newTitle.trim()) return;
  // FIX 4: validate the amount (input min/max is 1–365) instead of
  // creating an instantly-expired task from 0, a negative, or NaN.
  const amount = Number(newAmount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 365) {
    setAddError('Enter a number of blocks between 1 and 365.');
    return;
  }
  setAddError('');

  // IMPROVEMENT 3: months use calendar math, not amount * 30 days.
  const deadline = newUnit === 'months'
    ? addMonthsAmount(new Date(now), amount).getTime()
    : now + (amount * UNIT_CONFIG[newUnit].ms);
  // IMPROVEMENT 2: adding a task is a user gesture, so this is the right
  // moment to ask for notification permission (never on page load).
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
   // FIX 4: reset the whole form, not just title/notes.
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
     // FIX 5: when nothing is left, clear the selection so the UI can
     // show the empty state instead of pointing at a deleted task.
     setSelectedTaskId(filtered.length > 0 ? filtered[0].id : null);
   }
 };

 // --- GEMINI AI EXTRACTION PIPELINE ---
 const handleAISmartExtract = async () => {
   if (!aiInputText.trim()) return;
   setIsAiLoading(true);
   setAiError('');

   // FIX 1: API key comes from Vite env, never hardcoded in the client.
   // The Gemini API still requires the key as a query param; a backend
   // proxy that holds the key server-side is the safe production route.
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

  // Exponential backoff retry wrapper
  // FIX 1: only retry on 429 / 5xx / network errors. A 401/403 (bad or
  // missing key) will never succeed on retry, so fail fast instead.
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

   // FIX 7: strip a surrounding ```json fence, then validate what the
   // model returned before trusting it.
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
   // IMPROVEMENT 3: months use calendar math, not amount * 30 days.
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

  // Trigger a quick demo of the "1 Block Left!" panic mode
  const triggerPanicDemo = () => {
    if (!activeTask) return;
    const currentUnit = activeStack?.unitKey || 'hours';
    // FIX 2: lock the scale to the current unit first, so auto-scaling
    // cannot re-scale the 0.75-block deadline into many smaller blocks.
    setScaleOverride(currentUnit);
    // Set deadline to 0.75 of 1 single block in current scale.
    // IMPROVEMENT 3: for months that is 75% through the current
    // calendar month, not 0.75 * 30 days.
    const updatedDeadline = currentUnit === 'months'
      ? addMonthsAmount(new Date(now), 0.75).getTime()
      : now + (UNIT_CONFIG[currentUnit].ms * 0.75);
    setTasks(prev => prev.map(t => t.id === activeTask.id ? { ...t, deadline: updatedDeadline } :
t));
  };

 const scrollDock = (dir) => {
   if (!dockRef.current) return;
   dockRef.current.scrollBy({ left: dir * 280, behavior: 'smooth' });
 };

 return (

  <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans
selection:bg-cyan-500 selection:text-slate-950 overflow-x-hidden relative">
    {/* Custom Styles for Block Physics & Animations */}
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
        transition: all 0.35s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .jenga-block:hover {
        transform: scaleX(1.04) translateY(-1px);
        filter: brightness(1.2);
      }
      /* Custom subtle scrollbars */
      ::-webkit-scrollbar {
        height: 6px;
        width: 6px;
      }
      ::-webkit-scrollbar-track {
        background: rgba(15, 23, 42, 0.4);
      }
      ::-webkit-scrollbar-thumb {
        background: rgba(71, 85, 105, 0.5);
        border-radius: 9999px;
      }
    `}</style>

   {/* Ambient radial background glow that shifts color with current stack */}
   <div
     className="pointer-events-none fixed inset-0 transition-all duration-1000 opacity-20"

     style={{
       background: activeStack?.isLastBlock
        ? 'radial-gradient(circle at 50% 45%, #ef4444 0%, transparent 65%)'
        : `radial-gradient(circle at 50% 45%, ${activeStack?.config?.hex || '#06b6d4'} 0%, transparent 60%)`
     }}
    />

    {/* Subtle grid background */}
    <div
      className="pointer-events-none fixed inset-0 opacity-[0.04]"
      style={{
        backgroundImage: `linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)`,
        backgroundSize: '36px 36px'
      }}
    />

    {/* --- TOP BAR (Hidden in Screensaver Mode unless hovered) --- */}
    {!screensaverMode ? (
      <header className="relative z-20 border-b border-slate-800/80 bg-slate-950/60
backdrop-blur-xl px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 via-blue-500
to-purple-600 p-[1px] shadow-lg shadow-cyan-500/20">
           <div className="w-full h-full bg-slate-950 rounded-[11px] flex flex-col items-center
justify-center gap-0.5 p-1.5">
             <div className="w-full h-1.5 rounded-full bg-rose-500 animate-pulse" />
             <div className="w-full h-1.5 rounded-full bg-amber-400" />
             <div className="w-full h-1.5 rounded-full bg-cyan-400" />
           </div>
          </div>
          <div>
           <div className="flex items-center gap-2">
             <h1 className="text-xl font-black tracking-wider bg-clip-text text-transparent
bg-gradient-to-r from-white via-slate-200 to-slate-400">
              TIMETRES
             </h1>
             <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5
rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              Prototype
             </span>
           </div>

        <p className="text-xs text-slate-400 hidden sm:block">
          Visual Diminishing Block Countdown
        </p>
       </div>
      </div>

      {/* Center Color Key Legend */}
      <div className="hidden xl:flex items-center gap-2 bg-slate-900/90 border
border-slate-800 px-3.5 py-1.5 rounded-full text-xs">
        <span className="text-slate-400 font-medium mr-1">Block Value:</span>
        {Object.values(UNIT_CONFIG).map(u => (
          <button
            key={u.id}
            onClick={() => setScaleOverride(scaleOverride === u.id ? 'auto' : u.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all ${
              activeStack?.unitKey === u.id
                ? 'bg-slate-800 text-white ring-1 ring-slate-600 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className={`w-2.5 h-2.5 rounded-sm bg-gradient-to-r ${u.color}`} />
            <span>1 Block = 1 {u.singular}</span>
          </button>
        ))}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2">
        {/* View Mode Toggle: Focus vs All Skyline */}
        <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-0.5">
          <button
           onClick={() => setViewMode('focus')}
           className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
             viewMode === 'focus'
               ? 'bg-slate-800 text-white shadow'
               : 'text-slate-400 hover:text-slate-200'
           }`}
          >
           Single Stack
          </button>
          <button
           onClick={() => setViewMode('skyline')}
           className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex
items-center gap-1 ${

           viewMode === 'skyline'
             ? 'bg-slate-800 text-white shadow'
             : 'text-slate-400 hover:text-slate-200'
         }`}
        >
         <Layers className="w-3.5 h-3.5" />
         Skyline
        </button>
       </div>

       {/* AI Webhook Simulator Button */}
       <button
         onClick={() => setShowAIModal(true)}
         className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold
bg-gradient-to-r from-purple-600/20 to-indigo-600/20 hover:from-purple-600/30
hover:to-indigo-600/30 text-purple-300 border border-purple-500/30 transition-all shadow-sm"
       >
         <Sparkles className="w-3.5 h-3.5 text-purple-400" />
         <span className="hidden sm:inline">AI Ingest</span>
       </button>

       {/* Add Task Button */}
       <button
         onClick={() => setShowAddModal(true)}
         className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold
bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all shadow-lg shadow-cyan-500/20"
       >
         <Plus className="w-4 h-4 stroke-[2.5]" />
         <span>Add Stack</span>
       </button>

       {/* Screensaver / Ambient Mode Toggle */}
       <button
         onClick={() => setScreensaverMode(true)}
         title="Enter Ambient Screensaver Mode"
         className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400
hover:text-white border border-slate-800 transition-all"
       >
         <Maximize2 className="w-4 h-4" />
       </button>
      </div>
    </header>
   ):(
    /* Floating exit button when in Screensaver Mode */

     <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
      <button
       onClick={() => setScreensaverMode(false)}
       className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/80
hover:bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700/70
backdrop-blur-md shadow-2xl transition-all"
      >
       <Minimize2 className="w-3.5 h-3.5" />
       <span>Exit Screensaver</span>
      </button>
     </div>
   )}

   {/* --- MAIN STAGE --- */}
   <main className="flex-1 relative z-10 flex flex-col justify-between max-w-7xl w-full mx-auto
px-4 sm:px-6 py-4">

     {tasks.length === 0 ? (
      /* FIX 5: proper empty state instead of falling through silently. */
      <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
        <h2 className="text-2xl font-black text-white tracking-tight">No deadlines yet — add one</h2>
        <p className="text-sm text-slate-400 mt-2">Create your first Timetres stack to start the countdown.</p>
        <button
          onClick={() => setShowAddModal(true)}
          className="mt-6 px-5 py-2.5 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20"
        >
          Add Stack
        </button>
      </div>
     ) : viewMode === 'focus' && activeTask && activeStack ? (
      /* ================= SINGLE FOCUS STACK VIEW ================= */
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center my-auto py-2">

        {/* LEFT COLUMN: Task Context & Scale Shifter */}
        <div className="lg:col-span-4 flex flex-col gap-4 order-2 lg:order-1">
          <div className="bg-slate-900/70 border border-slate-800/90 backdrop-blur-xl
rounded-2xl p-5 shadow-2xl">
           {/* Source Badge */}
           <div className="flex items-center justify-between gap-2 mb-3">
             <div className="flex items-center gap-2 text-xs font-medium text-slate-400
bg-slate-950/70 px-3 py-1 rounded-full border border-slate-800">
              {(() => {
                const SrcIcon = SOURCE_ICONS[activeTask.source]?.icon || Calendar;
                return <SrcIcon className={`w-3.5 h-3.5
${SOURCE_ICONS[activeTask.source]?.color || 'text-cyan-400'}`} />;
              })()}
              <span>Synced via {SOURCE_ICONS[activeTask.source]?.label ||
'Calendar'}</span>
             </div>

           <span className={`text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full
border ${activeStack.config.badge}`}>
             {activeStack.config.label} Scale
           </span>
          </div>

           {/* Task Title */}
           <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight
leading-tight mb-2">
             {activeTask.title}
           </h2>
           <p className="text-sm text-slate-400 leading-relaxed mb-5">
             {activeTask.notes}
           </p>

          {/* Digital Readout Card */}
          <div className="bg-slate-950/90 border border-slate-800/80 rounded-xl p-4 mb-5">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold
mb-2 flex items-center justify-between">
             <span>Exact Time Remaining</span>
             <Clock className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
             <div className="bg-slate-900/90 rounded-lg py-2 border border-slate-800/60">
               <div className="text-xl sm:text-2xl font-black font-mono text-white">
                {String(activeStack.breakdown.d).padStart(2, '0')}
               </div>
               <div className="text-[10px] uppercase text-slate-400 font-semibold">Days</div>
             </div>
             <div className="bg-slate-900/90 rounded-lg py-2 border border-slate-800/60">
               <div className="text-xl sm:text-2xl font-black font-mono text-white">
                {String(activeStack.breakdown.h).padStart(2, '0')}
               </div>
               <div className="text-[10px] uppercase text-slate-400
font-semibold">Hours</div>
             </div>
             <div className="bg-slate-900/90 rounded-lg py-2 border border-slate-800/60">
               <div className="text-xl sm:text-2xl font-black font-mono text-white">
                {String(activeStack.breakdown.m).padStart(2, '0')}
               </div>
               <div className="text-[10px] uppercase text-slate-400 font-semibold">Mins</div>
             </div>
             <div className="bg-slate-900/90 rounded-lg py-2 border border-slate-800/60">
               <div className="text-xl sm:text-2xl font-black font-mono text-cyan-400">
                {String(activeStack.breakdown.s).padStart(2, '0')}
               </div>
               <div className="text-[10px] uppercase text-slate-400 font-semibold">Secs</div>
             </div>
            </div>
          </div>

          {/* Scale Shift Switcher (View by Months / Days / Hours / Minutes) */}
          {!screensaverMode && (
            <div>
             <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
               <span className="font-semibold flex items-center gap-1.5">
                 <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                 Shift Block Resolution:
               </span>
               <span className="text-[11px] text-slate-500">
                 {scaleOverride === 'auto' ? 'Auto-Scaling' : 'Manual Lock'}
               </span>
             </div>
             <div className="grid grid-cols-5 gap-1.5 bg-slate-950 p-1.5 rounded-xl border
border-slate-800">
               <button
                 onClick={() => setScaleOverride('auto')}
                 className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                   scaleOverride === 'auto'
                     ? 'bg-slate-800 text-white shadow-sm'
                     : 'text-slate-400 hover:text-slate-200'
                 }`}
               >
                 Auto
               </button>
               {Object.values(UNIT_CONFIG).map(u => (
                 <button
                   key={u.id}
                   onClick={() => setScaleOverride(u.id)}
                   className={`py-1.5 rounded-lg text-xs font-bold transition-all flex flex-col
items-center justify-center gap-0.5 ${
                     activeStack.unitKey === u.id && scaleOverride !== 'auto'
                       ? 'bg-slate-800 text-white ring-1 ring-slate-600'
                       : 'text-slate-400 hover:text-slate-200'
                   }`}
                 >
                   <span className={`w-2 h-2 rounded-full bg-gradient-to-r ${u.color}`} />
                   <span>{u.label}</span>
                 </button>
               ))}
             </div>
            </div>
          )}
         </div>

          {/* Interactive Time Scrubber / Demo Controls */}
          {!screensaverMode && (
            <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-4 flex
flex-col gap-3">
             <div className="flex items-center justify-between">
               <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex
items-center gap-1.5">
                 <FastForward className="w-3.5 h-3.5 text-amber-400" />
                 Time Simulator
               </span>
               {timeOffset !== 0 && (
                 <button
                  onClick={() => setTimeOffset(0)}
                  className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1
font-medium"
                 >
                  <RotateCcw className="w-3 h-3" /> Reset to Live
                 </button>
               )}
             </div>
             <p className="text-xs text-slate-400">
               Test how the stack erodes or trigger the "Last Block" alarm state:
             </p>
             <div className="flex flex-wrap gap-2">
               <button
                 onClick={() => setTimeOffset(prev => prev + UNIT_CONFIG.hours.ms)}
                 className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs
font-semibold text-slate-200 border border-slate-700 transition-all"
               >
                 +1 Hour
               </button>
               <button
                 onClick={() => setTimeOffset(prev => prev + UNIT_CONFIG.days.ms)}
                 className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs
font-semibold text-slate-200 border border-slate-700 transition-all"
               >
                 +1 Day
               </button>
               <button
                 onClick={triggerPanicDemo}
                 className="flex-1 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30
text-xs font-bold text-rose-300 border border-rose-500/40 flex items-center justify-center gap-1.5
transition-all"

            >
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              Simulate "1 Block Left!"
            </button>
           </div>
          </div>
        )}
       </div>

        {/* CENTER COLUMN: THE VISUAL JENGA / TIMETRES STACK */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center order-1 lg:order-2
relative min-h-[420px] sm:min-h-[480px]">

         {/* Top Floating Counter Badge */}
         <div className="text-center mb-4 relative z-10">
           <div className="inline-flex items-baseline gap-2">
            <span className={`text-5xl sm:text-6xl font-black tracking-tighter ${
              activeStack.isLastBlock ? 'text-rose-500 animate-pulse' : 'text-white'
            }`}>
              {activeStack.totalBlocks}
            </span>
            <span className={`text-xl sm:text-2xl font-bold uppercase tracking-wide
${activeStack.config.text}`}>
              {activeStack.totalBlocks === 1 ? activeStack.config.singular :
activeStack.config.label}
            </span>
           </div>
           <div className="text-xs text-slate-400 mt-0.5">
            {activeStack.isExpired
              ? 'Deadline has passed!'
              : activeStack.isLastBlock
                ? 'FINAL BLOCK REMAINING — ACT IMMEDIATELY'
                : `Each block equals 1 ${activeStack.config.singular.toLowerCase()} until
deadline`}
           </div>
         </div>

        {/* THE STACK SILO CONTAINER */}
        <div className="relative w-full max-w-[300px] sm:max-w-[340px] h-[340px]
sm:h-[380px] flex flex-col justify-end items-center px-6 pt-6 pb-3 rounded-3xl bg-slate-950/70
border border-slate-800/90 shadow-inner overflow-hidden">

          {/* Background Measure Lines */}

           <div className="pointer-events-none absolute inset-x-4 inset-y-4 flex flex-col
justify-between opacity-20">
            {[...Array(6)].map((_, idx) => (
              <div key={idx} className="w-full border-b border-dashed border-slate-600 flex
justify-between text-[9px] font-mono text-slate-400 pb-0.5">
                <span>—</span>
                <span>—</span>
              </div>
            ))}
           </div>

          {/* Overflow Indicator if > maxRender */}
          {activeStack.overflowBlocks > 0 && (
            <div className="relative z-20 mb-2 px-3 py-1 rounded-full bg-slate-900/95 border
border-slate-700 text-xs font-bold text-slate-300 shadow-lg">
             + {activeStack.overflowBlocks} more {activeStack.config.label.toLowerCase()}
queued above
            </div>
          )}

          {/* THE BLOCKS */}
          {activeStack.isExpired ? (
            <div className="my-auto flex flex-col items-center text-center p-4">
             <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-2 opacity-80" />
             <p className="text-base font-bold text-white">Zero Blocks Left</p>
             <p className="text-xs text-slate-400 mt-1">Time is up! Mark complete or extend
deadline.</p>
            </div>
          ):(
            <div
             className={`w-full flex flex-col-reverse gap-1.5 relative z-10 justify-start h-full ${
               activeStack.isLastBlock ? 'animate-danger-shake justify-center' : ''
             }`}
            >
             {Array.from({ length: activeStack.renderedBlocks }).map((_, index) => {
               const isTopBlock = index === activeStack.renderedBlocks - 1;
               // FIX 3: rendered blocks are the TOP blocks, so number them
               // firstRenderedBlock..totalBlocks (e.g. 16–60, not 1–45).
               // Only the true top block gets the erosion fill; the rest
               // below it are complete and render 100% full.
               const blockNumber = activeStack.firstRenderedBlock + index;

              // Dynamic height so 1 block is massive and 40 blocks still fit sleekly
              const dynamicHeight = activeStack.renderedBlocks === 1
                ? 'h-28'
                : activeStack.renderedBlocks <= 5
                  ? 'h-12'
                  : activeStack.renderedBlocks <= 12

                  ? 'h-6'
                  : activeStack.renderedBlocks <= 24
                    ? 'h-3.5'
                    : 'h-2';

               // Subtle Jenga horizontal offset for realism
               const jengaOffset = index % 3 === 0 ? 'translate-x-0.5' : index % 3 === 1 ?
'-translate-x-0.5' : '';

             return (
              <div
                key={index}
                title={`Block #${blockNumber} (${activeStack.config.singular})`}
                className={`jenga-block relative w-full ${dynamicHeight} ${jengaOffset}
rounded-lg bg-slate-900/90 border ${
                  activeStack.isLastBlock
                    ? 'border-rose-500 shadow-[0_0_35px_rgba(244,63,94,0.7)]'
                    : activeStack.config.border
                } overflow-hidden flex items-center justify-between px-3 select-none`}
              >
                {/* Active Fill Bar inside the block (top block erodes live!) */}
                <div
                  className={`absolute inset-y-0 left-0 bg-gradient-to-r ${
                    activeStack.isLastBlock ? 'from-rose-600 via-red-500 to-orange-500' :
activeStack.config.color
                  } ${isTopBlock ? 'opacity-95' : 'opacity-85'} transition-all duration-500`}
                  style={{
                    width: isTopBlock ? `${Math.max(8, activeStack.topBlockProgress * 100)}%` :
'100%'
                  }}
                />

                {/* 3D Top Bevel Highlight */}
                <div className="absolute inset-x-0 top-0 h-[1px] bg-white/30
pointer-events-none" />

                 {/* Block Interior Label (visible when blocks are tall enough) */}
                 {activeStack.renderedBlocks <= 12 && (
                   <div className="relative z-10 w-full flex items-center justify-between
text-[11px] font-mono font-bold text-white drop-shadow">
                    <span className="flex items-center gap-1.5">
                      <span className="opacity-75">#{blockNumber}</span>
                      {activeStack.isLastBlock && (

                        <span className="uppercase tracking-wider bg-black/40 px-2 py-0.5
rounded text-rose-200 animate-pulse">
                         FINAL BLOCK — DO IT NOW!
                        </span>
                      )}
                    </span>
                    {isTopBlock && (
                      <span className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded">
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

          {/* Glowing Base Pedestal */}
          <div className={`w-full h-2.5 mt-2 rounded-full bg-gradient-to-r
${activeStack.config.color} ${activeStack.config.glow}`} />
         </div>
        </div>

        {/* RIGHT COLUMN: Urgency Diagnosis & Last-Block Trigger Alert */}
        <div className="lg:col-span-3 flex flex-col gap-4 order-3">
          {/* THE "LAST BLOCK" URGENCY BANNER */}
          <div className={`rounded-2xl p-5 border backdrop-blur-xl transition-all ${
            activeStack.isLastBlock
             ? 'bg-rose-950/60 border-rose-500/80 shadow-[0_0_40px_rgba(244,63,94,0.3)]'
             : activeStack.isCritical
               ? 'bg-amber-950/40 border-amber-500/50'
               : 'bg-slate-900/70 border-slate-800/90'
          }`}>
            <div className="flex items-center gap-2.5 mb-3">
             <div className={`p-2 rounded-xl ${
               activeStack.isLastBlock ? 'bg-rose-500 text-white animate-bounce' : 'bg-slate-800 text-cyan-400'
             }`}>
               {activeStack.isLastBlock ? <AlertTriangle className="w-5 h-5" /> : <Zap
className="w-5 h-5" />}
             </div>
             <div>

            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              {activeStack.isLastBlock ? 'Last Block Triggered!' : 'Stack Status'}
            </h3>
            <p className="text-xs text-slate-400">
              {activeStack.isLastBlock ? 'Zero buffer remaining' : 'Visual pressure gauge'}
            </p>
           </div>
          </div>

          {activeStack.isLastBlock ? (
            <p className="text-xs sm:text-sm text-rose-200 font-medium leading-relaxed">
             You are down to your <span className="font-bold underline">final
{activeStack.config.singular.toLowerCase()} block</span>. Stop everything else—this needs to
get done right now before the stack hits zero.
            </p>
          ):(
            <p className="text-xs text-slate-300 leading-relaxed">
             Currently burning through <span className="font-bold text-white">Block
#{activeStack.totalBlocks}</span> ({Math.round(activeStack.topBlockProgress * 100)}% of this
{activeStack.config.singular.toLowerCase()} left){activeStack.overflowBlocks > 0 ? ` — showing blocks ${activeStack.firstRenderedBlock}–${activeStack.totalBlocks}` : ''}. When only 1 block remains, Timetres triggers
maximum urgency mode.
            </p>
          )}

            {/* Color Scale Breakdown Mini Card */}
            <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-2 text-xs">
              <div className="font-semibold text-slate-400 mb-1">How Timetres Scales:</div>
              {Object.values(UNIT_CONFIG).map(u => (
               <div
                 key={u.id}
                 onClick={() => setScaleOverride(u.id)}
                 className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer
transition-all ${
                   activeStack.unitKey === u.id ? 'bg-slate-800/90 text-white font-bold' :
'text-slate-400 hover:bg-slate-800/40'
                 }`}
               >
                 <div className="flex items-center gap-2">
                   <span className={`w-3 h-3 rounded bg-gradient-to-r ${u.color}`} />
                   <span>{u.label} Blocks</span>
                 </div>
                 <span className="font-mono text-[11px]">
                   {Math.ceil(exactBlocksForUnit(u.id, now, activeTask.deadline))} {u.label.toLowerCase()}
                 </span>

             </div>
           ))}
         </div>
        </div>
       </div>

      </div>
     ):(
      /* ================= SKYLINE MULTI-STACK VIEW ================= */
      <div className="flex-1 flex flex-col justify-center py-6">
        <div className="text-center mb-6">
         <h2 className="text-2xl font-black text-white tracking-tight">All Active Deadline
Stacks</h2>
         <p className="text-xs text-slate-400">Click any stack to inspect or shift its time
resolution</p>
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
              className={`group cursor-pointer rounded-2xl p-4 bg-slate-900/60
hover:bg-slate-900 border transition-all flex flex-col items-center ${
                selectedTaskId === task.id ? 'border-cyan-500/60 ring-1 ring-cyan-500/30' :
'border-slate-800'
              }`}
            >
              <div className="w-full flex items-center justify-between text-xs text-slate-400
mb-2">
                <SrcIcon className={`w-3.5 h-3.5 ${SOURCE_ICONS[task.source]?.color}`} />
                <span className={`font-mono font-bold ${st.config.text}`}>
                  {st.totalBlocks} {st.config.label}
                </span>
              </div>

            {/* Mini Visual Stack */}
            {/* FIX 3: this renders the TOP miniCount blocks (last = true top). */}
             <div
              title={st.totalBlocks > 0 ? `Blocks ${st.totalBlocks - Math.min(st.renderedBlocks, 18) + 1}–${st.totalBlocks} of ${st.totalBlocks}` : 'No blocks left'}
              className="w-full h-48 bg-slate-950/80 rounded-xl p-3 border
border-slate-800/80 flex flex-col-reverse gap-1 justify-start overflow-hidden mb-3">
              {Array.from({ length: Math.min(st.renderedBlocks, 18) }).map((_, i) => (
                <div
                  key={i}
                  className={`w-full h-2.5 rounded-sm bg-gradient-to-r ${st.config.color} ${
                    i === Math.min(st.renderedBlocks, 18) - 1 ? 'opacity-95' : 'opacity-80'
                  }`}
                />
              ))}
             </div>

             <h4 className="text-sm font-bold text-white text-center line-clamp-1
group-hover:text-cyan-400 transition-colors">
              {task.title}
             </h4>
            </div>
          );
        })}
       </div>
      </div>
    )}

    {/* --- BOTTOM HORIZONTAL SCROLLING TASK DOCK --- */}
    <section className="relative z-20 mt-4 pt-3 border-t border-slate-800/80">
      <div className="flex items-center justify-between mb-2 px-1">
       <div className="flex items-center gap-2">
         <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
           Queued Deadlines ({tasks.length})
         </span>
         <span className="text-[11px] text-slate-500 hidden sm:inline">
           — Scroll left/right to switch active countdown
         </span>
       </div>
       <div className="flex items-center gap-1.5">
         <button
           onClick={() => scrollDock(-1)}
           className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400
hover:text-white border border-slate-800"
         >
           <ChevronLeft className="w-4 h-4" />
         </button>
         <button
           onClick={() => scrollDock(1)}

          className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400
hover:text-white border border-slate-800"
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
             className={`group relative flex-shrink-0 w-64 sm:w-72 rounded-2xl p-3.5
cursor-pointer transition-all border flex items-center gap-3.5 select-none ${
               isSelected
                 ? 'bg-slate-900/95 border-cyan-400/60 shadow-lg shadow-cyan-500/10 -translate-y-0.5'
                 : 'bg-slate-900/40 hover:bg-slate-900/80 border-slate-800/80 opacity-80 hover:opacity-100'
             }`}
           >
             {/* Mini Vertical Stack Preview Bar on Left of Card */}
             {/* FIX 3: preview shows the TOP 8 blocks (last = true top). */}
             <div
              title={st.totalBlocks > 0 ? `Blocks ${st.totalBlocks - Math.min(st.totalBlocks, 8) + 1}–${st.totalBlocks} of ${st.totalBlocks}` : 'No blocks left'}
              className="w-6 h-14 bg-slate-950 rounded-lg p-1 border border-slate-800 flex
flex-col-reverse gap-0.5 justify-start overflow-hidden flex-shrink-0">
               {Array.from({ length: Math.min(st.totalBlocks, 8) }).map((_, idx) => (
                 <div
                   key={idx}
                   className={`w-full h-1.5 rounded-[2px] bg-gradient-to-r ${st.config.color}`}
                 />
               ))}
             </div>

           {/* Card Details */}
           <div className="flex-1 min-w-0">
             <div className="flex items-center justify-between gap-1 mb-1">

              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase
tracking-wider text-slate-400">
                <SrcIcon className={`w-3 h-3 ${SOURCE_ICONS[task.source]?.color}`} />
                {task.source}
              </span>
              <span className={`text-xs font-extrabold font-mono ${
                st.isLastBlock ? 'text-rose-400 animate-pulse' : st.config.text
              }`}>
                {st.totalBlocks} {st.totalBlocks === 1 ? st.config.singular : st.config.label}
              </span>
            </div>

            <h4 className="text-sm font-bold text-white truncate">
             {task.title}
            </h4>

             <div className="flex items-center justify-between mt-1">
               <span className="text-[11px] text-slate-400 font-mono">
                 {st.breakdown.d}d {st.breakdown.h}h {st.breakdown.m}m
               </span>
               {tasks.length > 1 && (
                 <button
                  onClick={(e) => handleDeleteTask(task.id, e)}
                  title="Delete Stack"
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded
hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-all"
                 >
                  <Trash2 className="w-3.5 h-3.5" />
                 </button>
               )}
             </div>
            </div>
           </div>
         );
       })}

       {/* Quick Add Card at End of Dock */}
       <button
         onClick={() => setShowAddModal(true)}
         className="flex-shrink-0 w-44 rounded-2xl p-3.5 border border-dashed
border-slate-800 hover:border-cyan-500/50 bg-slate-900/20 hover:bg-slate-900/50 flex flex-col
items-center justify-center gap-1.5 text-slate-400 hover:text-cyan-400 transition-all"
       >
         <Plus className="w-5 h-5" />

        <span className="text-xs font-bold">New Deadline</span>
      </button>
     </div>
    </section>
   </main>

    {/* ================= MODAL 1: ADD MANUAL DEADLINE STACK
================= */}
    {showAddModal && (
      <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center
justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6
shadow-2xl animate-in fade-in zoom-in-95 duration-200">
         <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-cyan-400" />
            Add New Timetres Stack
          </h3>
          <button onClick={() => setShowAddModal(false)} className="text-slate-400
hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
         </div>

       <form onSubmit={handleAddTask} className="space-y-4">
         <div>
           <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">
            What needs to get done?
           </label>
           <input
            type="text"
            required
            placeholder="e.g., Pay rent, Finish laundry, Board flight..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800
text-white text-sm focus:outline-none focus:border-cyan-400"
           />
         </div>

        <div className="grid grid-cols-2 gap-3">
         <div>
          <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">
            Number of Blocks

            </label>
            <input
             type="number"
             min="1"
             max="365"
             required
             value={newAmount}
             onChange={(e) => setNewAmount(e.target.value)}
             className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800
text-white text-sm font-mono focus:outline-none focus:border-cyan-400"
            />
           </div>
           <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">
             Block Time Unit
            </label>
            <select
             value={newUnit}
             onChange={(e) => setNewUnit(e.target.value)}
             className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800
text-white text-sm focus:outline-none focus:border-cyan-400"
            >
             <option value="minutes">Minutes (Red)</option>
             <option value="hours">Hours (Amber)</option>
             <option value="days">Days (Cyan)</option>
             <option value="months">Months (Purple)</option>
            </select>
           </div>
         </div>

        <div>
         <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">
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
               className={`py-2 px-2 rounded-xl border text-xs font-semibold flex flex-col
items-center gap-1 transition-all ${

                 newSource === key
                   ? 'bg-slate-800 border-cyan-400 text-white'
                   : 'bg-slate-950 border-slate-800 text-slate-400'
               }`}
              >
               <Icon className={`w-4 h-4 ${item.color}`} />
               <span className="capitalize">{key}</span>
              </button>
            );
          })}
         </div>
        </div>

         <div>
           <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">
            Context / Notes (Optional)
           </label>
           <input
            type="text"
            placeholder="Gate number, invoice link, or reminder..."
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800
text-white text-sm focus:outline-none focus:border-cyan-400"
           />
         </div>

         {addError && (
           <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
             {addError}
           </div>
         )}

         <div className="flex justify-end gap-2 pt-2">
          <button
           type="button"
           onClick={() => setShowAddModal(false)}
           className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400
hover:text-white"
          >
           Cancel
          </button>
          <button
           type="submit"
           className="px-5 py-2.5 rounded-xl text-xs font-bold bg-cyan-500
hover:bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20"
          >
           Build Stack
          </button>
         </div>

       </form>
      </div>
     </div>
   )}

    {/* ================= MODAL 2: GEMINI AI WEBHOOK INGESTION SIMULATOR
================= */}
    {showAIModal && (
      <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center
justify-center p-4">
        <div className="bg-slate-900 border border-purple-500/40 rounded-3xl max-w-lg w-full
p-6 shadow-2xl">
         <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
             <Sparkles className="w-5 h-5" />
            </div>
            <div>
             <h3 className="text-lg font-extrabold text-white">
               AI Smart Deadline Ingestion
             </h3>
             <p className="text-xs text-slate-400">
               Simulates n8n + Gemini parsing Slack messages, emails, or texts
             </p>
            </div>
          </div>
          <button onClick={() => setShowAIModal(false)} className="text-slate-400
hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
         </div>

       <div className="space-y-4 mt-4">
         <div>
          <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">
           Paste any unstructured message, email, or voice note:
          </label>
          <textarea
           rows={4}
           value={aiInputText}
           onChange={(e) => setAiInputText(e.target.value)}
           placeholder="e.g., Flight leaves in 5 hours need to finish laundry first..."
           className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-white
text-sm focus:outline-none focus:border-purple-400"

         />
        </div>

        {/* Sample Presets */}
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[11px] text-slate-400 w-full">Try an example prompt:</span>
          {[
            "Laundry needs to be done before my flight leaves in 5 hours!",
            "Email from Landlord: Rent bill is due in 14 days.",
            "Urgent Slack from DevOps: Server SSL cert expires in 35 minutes!"
          ].map((sample, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setAiInputText(sample)}
              className="text-[11px] bg-slate-950 hover:bg-slate-800 text-slate-300 px-2.5 py-1
rounded-lg border border-slate-800 transition-all text-left truncate max-w-full"
            >
              "{sample}"
            </button>
          ))}
        </div>

         {aiError && (
           <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs
text-rose-300">
            {aiError}
           </div>
         )}

         <div className="flex justify-end gap-2 pt-2">
          <button
           type="button"
           onClick={() => setShowAIModal(false)}
           className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400
hover:text-white"
          >
           Cancel
          </button>
          <button
           type="button"
           disabled={isAiLoading}
           onClick={handleAISmartExtract}

              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r
from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white shadow-lg
shadow-purple-500/25 flex items-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isAiLoading ? 'Extracting Blocks with Gemini...' : 'Convert to Timetres Stack'}</span>
            </button>
           </div>
         </div>
        </div>
       </div>
     )}
    </div>
  );
}


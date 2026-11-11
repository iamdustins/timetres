# Timetres — fixes applied

Reconstructed faithfully from `Untitled_document.pdf` (32 pages, including the image-only pages 14 and 23, which were just continuation code). No features, tasks, UI, or styling were dropped. Each fix below is marked in `App.jsx` with a short `// FIX n:` comment.

## Setup

- Drop `App.jsx` into a Vite React + Tailwind project.
- Install: `npm install lucide-react` (Tailwind already assumed — the `animate-in fade-in zoom-in-95` classes in the Add modal need the `tailwindcss-animate` plugin, or they simply do nothing).
- **Gemini key:** create a `.env` file in the project root with:
  ```
  VITE_GEMINI_API_KEY=your_key_here
  ```
  Then restart the dev server. Without it, AI ingest shows "Add VITE_GEMINI_API_KEY — AI ingest is disabled without it" and does not call the API. A backend proxy that holds the key server-side is the safe production route — the key is still sent as the query param the Gemini API requires, so do not commit `.env`.

## Fixes

1. **API key (Fix 1)** — `handleAISmartExtract`: removed the hardcoded empty `const apiKey = ""`. The key is now read from `import.meta.env.VITE_GEMINI_API_KEY`, with a clear early error if missing. `fetchWithBackoff` no longer retries on 401/403 (fail fast); it retries only on 429 / 5xx / network errors. Also fixed the Gemini URL split in the PDF (`generateCo` + `ntent`) — it is now one continuous `generateContent` string.
2. **Panic demo (Fix 2)** — `triggerPanicDemo` now calls `setScaleOverride(currentUnit)` before setting the deadline to `now + 0.75 × unit`, so auto-scaling cannot re-scale it away. Verified: 0.75 h in Hours = exactly 1 block (in Auto it would have become 45 minute-blocks).
3. **Overflow blocks (Fix 3)** — `calculateStackData` now returns `firstRenderedBlock = totalBlocks - renderedBlocks + 1`. The focus stack numbers its rendered blocks `firstRenderedBlock..totalBlocks` (e.g. 60 blocks in Days = 16–60, not 1–45), and only the true top block gets the erosion fill; complete blocks below it render 100% full. Skyline mini-stack and dock preview were fixed consistently — they show the top 18 / top 8 blocks, with a `title` stating the range (e.g. "Blocks 16–60 of 60"). The "burning through Block #totalBlocks" text now also shows that range when overflowing.
4. **Add Task validation (Fix 4)** — `handleAddTask` rejects non-finite, ≤ 0, or > 365 amounts with an on-screen error ("Enter a number of blocks between 1 and 365.") instead of creating an instantly-expired task. After a successful add it now resets `newAmount` to 5, `newUnit` to `'hours'`, and `newSource` to `'calendar'` (title/notes were already reset).
5. **Delete-all (Fix 5)** — `handleDeleteTask` clears `selectedTaskId` to `null` when the last task is deleted. The main stage now shows a proper empty state in both views: "No deadlines yet — add one", with an Add Stack button, instead of silently falling through to an empty Skyline grid.
6. **Dead code (Fix 6)** — removed the unused `Info` import from `lucide-react`, and removed the unused `@keyframes pulseGlow` and `@keyframes floatSlow` CSS.
7. **AI extraction validation (Fix 7)** — after `JSON.parse`, the code strips a surrounding ```` ```json ```` fence if present, then validates: amount must be a finite number > 0 and ≤ 365×12, title must be a non-empty string truncated to 35 chars. Invalid output falls through to the existing "Could not reach AI extraction service…" error.
8. **Misleading preset comments (Fix 8)** — task-4 (0.85 h) now says "51 mins left in Auto (Minutes Stack) — 1 block only if viewed in Hours"; task-5 (135 days) now says "135 days = 5 month-blocks in Auto (Purple Months Stack, 30-day months)".
9. **Accessibility (Fix 9)** — the delete button is now visible on focus as well as hover (`focus:opacity-100`). Skyline and dock cards got `role="button"`, `tabIndex={0}`, and an `onKeyDown` handler for Enter/Space. No visual design was changed otherwise.

## Improvements (2026-11-09, approved by Dustin)

10. **Persistence (Improvement 1)** — tasks are saved to `localStorage` under key `timetres-tasks-v1` on every change (`useEffect` on `tasks`), and loaded on start via `loadStoredTasks()`. Loading is guarded: `JSON.parse` is wrapped in try/catch and each stored task is validated (string `id`, non-empty string `title`, finite numeric `deadline`, string `source`); missing, corrupt, non-array, or all-invalid data falls back to the built-in preset tasks. A saved empty array is a valid state (user deleted everything) and is kept, not replaced by presets. If storage is unavailable (private mode, quota), the app still works in memory.
11. **Deadline alert (Improvement 2)** — a `useEffect` on `[tasks, now]` checks once per tick: when a task's deadline is reached, it plays a short two-beep sound (Web Audio oscillator, 880 Hz sine, no external file) and, if the browser has granted Notification permission, shows a notification ("Timetres — time is up!" with the task title). Each task alerts exactly once per deadline (tracked in an `alertedRef` set); if a deadline moves back into the future the id is cleared so it can alert again, and ids of deleted tasks are pruned. Notification permission is requested only after a user gesture — in `handleAddTask` via `requestNotificationPermission()` — never on page load. Everything is wrapped in try/catch, so a blocked sound/notification never breaks the app.
12. **Real calendar months (Improvement 3)** — the fixed 30-day month (`ms: 1000*60*60*24*30`) is gone from `UNIT_CONFIG.months`. New top-level pure helpers: `addCalendarMonths` (clamps the day to the end of the target month, so Jan 31 + 1 month = Feb 28), `calendarMonthsRemaining` (whole months by calendar date plus the fraction of the partial final month), `addMonthsAmount` (handles fractional months, e.g. 0.75 of a month = 75% through the current calendar month), and `exactBlocksForUnit` (months use calendar math; days/hours/minutes use their fixed ms). `calculateStackData` was moved to top level (it only ever used `UNIT_CONFIG`) so the month math can be tested directly; it now uses `exactBlocksForUnit` for the month unit. All month deadline math uses calendar months: Add Task, AI ingest, the panic demo (0.75 of a calendar month), and the "How Timetres Scales" mini-card. Days/hours/minutes logic, the digital breakdown, and the auto-scale threshold (>45 days → months) are unchanged. The task-5 preset comment now says "135 days = ~4.5 calendar-month blocks … exact count depends on which months it spans".

### How to use them

- **Persistence:** automatic — nothing to set up. Tasks survive a refresh; clearing browser data for the site resets to the presets.
- **Deadline alert:** add any task once and the browser will ask for notification permission (only then). Allow it for pop-up alerts; the sound plays either way. Denying it only disables the pop-up, not the sound or the on-screen "Zero Blocks Left" state.
- **Calendar months:** automatic — a month block is now one real calendar month (28–31 days). A deadline exactly one calendar month out is exactly 1 month-block; Jan 31 → Mar 15 is ~1.48 months, not 45 ÷ 30 = 1.5.

### Verification (2026-11-09)

- **Parser:** `@babel/parser` (JSX, module mode) parses the final `App.jsx` with **zero syntax errors** (1,661 lines).
- **Logic test:** a Node script extracting the actual `calculateStackData`, calendar helpers, and `loadStoredTasks` from the file passed **23/23 checks**, including: Jan 15 → Feb 15 = exactly 1 month-block; Jan 31 → Feb 28 = 1 month-block; Jan 31 → Mar 15 ≈ 1.484 (not 1.5); 135 days out gives 4.484 months in winter (Nov 9) vs 4.400 in summer (May 9); 61 days = 3 month-blocks in January but 2 in June; 4.8 h → 5 hour-blocks, 0.85 h in Auto → 51 minute-blocks, 61-day overflow still renders 45 with first block 17, expired → 0 blocks; stored-task loading works for valid data, missing/corrupt/non-array/all-invalid data falls back to presets, and a saved empty array stays empty.
- **Not re-verified:** running the app in a browser / Vite dev server, and the live Gemini call (no key was available, by design).

## Verification (original fixes, 2026-11-08)

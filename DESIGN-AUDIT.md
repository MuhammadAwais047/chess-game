# Gambit (chess) — Design, UX and Accessibility Audit

**Read-only audit.** No source file was modified, created, committed or pushed. `git status --short` was empty before and after; contrast/layout experiments were injected only into a test page in a local browser.

**Product:** “Complete chess game with FIDE rules, legal-move hints, and a three-level minimax AI. Vanilla JS with drag, click, and keyboard input.”
**Files reviewed:** `index.html` (125 lines), `styles.css` (354), `app.js` (980), `README.md`.
**Method:** full static read; runtime inspection in local Chromium at 320×568, 375×812, 768×1024, 1024×768, 1440×900, 812×375 and 568×320; DOM geometry via `getBoundingClientRect`; Chromium accessibility-tree snapshot; contrast computed with the WCAG 2.x relative-luminance formula from the actual hex values, with alpha compositing for translucent layers. Browser-only or assistive-technology-dependent items are marked **needs runtime verification**.

---

## 1. Executive summary

### Health score: **46 / 100**

| Dimension | Score | Weight | Contribution | Summary |
|---|---:|---:|---:|---|
| Information architecture & layout | 65 | 15% | 9.8 | Clear board-first desktop shell; weak mobile order and a settings model that hides pending vs active state. |
| UX & copy | 60 | 20% | 12.0 | Complete game flow and good result copy; illegal moves are silent, promotion is a trap, AI can freeze the UI, end-game closure is incomplete. |
| Visual system | 40 | 25% | 10.0 | Strong palette and card craft, but pieces and every board-state layer fail contrast; tokens are partial. |
| Accessibility (WCAG 2.2 AA) | 38 | 25% | 9.5 | Keyboard input exists, but the grid is not exposed as a grid, states are invisible, and status messages are not announced. |
| Responsive | 32 | 15% | 4.8 | Portrait mostly holds; board rows collapse, empty ranks become 0 px high in landscape, and zoom clips the board. |
| **Overall** | | | **46** | |

For a sighted desktop mouse user the experience is closer to **70/100**; the score reflects the shipped experience for keyboard, screen-reader and low-vision users and on phones. The failures are concentrated and fixable — most are CSS, a small amount of ARIA, and focus/announcement plumbing, not a redesign.

### Top five issues

| # | Severity | Issue | Why it matters |
|---|---|---|---|
| 1 | **Critical** | **The board is not an 8×8 square grid.** `.board` declares only columns (`styles.css:137`), leaving rows implicit and content-sized. Measured row heights were `88 88 44 44 44 44 88 88` at 1024×768 and `44 44 44 44 0 0 0 0` at 812×375 — empty ranks collapsed to zero and the board was clipped. | The playing surface is geometrically wrong, shifts as pieces move, distorts hint dots into ellipses, and is unplayable in landscape. |
| 2 | **Critical** | **White pieces are 1.33:1 on light squares.** White uses hollow Unicode glyphs (`app.js:20-23`) filled `#fffdf6` (`styles.css:161`) on `#e8ddc4` (`styles.css:19`). | White pieces are nearly invisible on half the board — the single most damaging visual defect. |
| 3 | **Critical** | **The ARIA grid does not exist in the accessibility tree.** `role="grid"` (`index.html:38`) has no `role="row"` children; cells are direct children (`app.js:495, 534`). Chromium exposed 64 `gridcell` nodes under a region, with **no grid and no row nodes**, and the grid’s “Use arrow keys” label was lost. | Screen-reader users do not get grid navigation or the board instructions, and selection/legal moves are not represented. |
| 4 | **Critical** | **Focus, selected, last-move, legal-move and check indicators are effectively invisible.** Measured state-to-square contrast: focus 1.03/2.62, selected 1.01/1.50, last move 1.04/1.23, legal dot 2.27/1.95, capture ring 3.10/2.40, check 1.60/1.20 (light/dark squares). | Keyboard users cannot see where they are; mouse users cannot see what is selected or what the AI just played. |
| 5 | **High** | **Status messages and dialogs are not accessible.** Checkmate announces, then is overwritten by “You played Qg7#” (`app.js:691` vs `722`); turn and check are never announced; promotion and game-over do not move focus, are not modal, have no Escape/cancel, and hiding them drops focus to `<body>`. | The most important moments in the game — check, promotion, result — are silent or lost. |

---

## 2. What already works

These are genuine strengths, not consolation prizes:

1. **The rules engine and SAN implementation are complete on inspection** — castling, en passant, promotion, checkmate, stalemate, 50-move, threefold repetition and insufficient material are all implemented (`app.js:659-683`, `726-749`, `801-817`); move generation filters pseudo-legal moves through check (`app.js:343-350`). Engine correctness/perft was not re-run in this design audit.
2. **Board-first desktop information architecture** — the board occupies the primary column, with a 320 px side panel (`styles.css:106-111`); the hierarchy is immediately understandable to a sighted desktop user.
3. **A real token layer exists** for the core palette, radii and fonts (`styles.css:2-27`): `--bg`, `--panel`, `--ink`, `--muted`, `--gold`, `--mint`, `--coral`, `--sq-light`, `--sq-dark`, `--radius`. Most surfaces use it.
4. **Text contrast on the dark UI is mostly strong**: `--ink` 15.80:1 on `#121824`, `--muted` 6.77:1, `--mint` 11.66:1, `--coral` 6.60:1, `--gold` 11.98:1 on `#161e2d`, solid-button text 12.12:1 / 9.14:1.
5. **Keyboard play is fully implemented**: roving tabindex (`app.js:497`, `860-867`), arrow keys with a file-wrap guard (`app.js:868-878`), Enter/Space activation (`app.js:879-883`), and focus restoration after re-render (`app.js:486, 538-541`).
6. **A live region already exists** (`index.html:121`) and is used for moves; the infrastructure for announcements is present.
7. **`prefers-reduced-motion` is handled** (`styles.css:347-354`), including `scroll-behavior` (`styles.css:352`).
8. **Zoom is not locked** — the viewport meta has no `maximum-scale` or `user-scalable=no` (`index.html:5`).
9. **Skip link, landmarks and language** are present: skip link (`index.html:12`), `<main>`, `<aside aria-label="Game panel">`, `<footer>`, and `lang="en"` (`index.html:2`).
10. **Responsive single-column switch works at 980 px** (`styles.css:331-335`), and there was no horizontal page scroll at 320 px in portrait.
11. **Drag has click and keyboard alternatives**, so WCAG 2.2 SC 2.5.7 (Dragging Movements) passes.
12. **The AI search yields one paint before blocking** (`app.js:756-757`), so “Computer thinking…” is visible before the main thread freezes; a new-game token prevents a stale result from landing (`app.js:753, 758`).
13. **Undo correctly rolls back repetition counts** (`app.js:801-808`) and disables while empty/thinking (`app.js:618`).
14. **No dependencies, no build step, lightweight page** — good baseline performance and maintainability.

---

## 3. Information architecture and layout

### Structure as shipped

```
header.topbar  [skip link, brand, New game, Flip board]
main.wrap
├─ section.board-zone  (aria-label "Chess board")
│  ├─ #top-strip      (name, captured, material, turn ring)
│  ├─ .board-frame → #board (role=grid, 64 cells)
│  │                + promo overlay + game-over overlay
│  └─ #bottom-strip
└─ aside.side  (aria-label "Game panel")
   ├─ status card     (turn + detail + dot)
   ├─ match setup     (side, level, hint)
   ├─ moves           (ol, count, Take back)
   └─ legend
footer, toast (#toast role=status), live region (#live)
```

### L-01 — Critical — Board grid geometry is not square

**Evidence.** `styles.css:135-142`:

```css
.board {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  aspect-ratio: 1 / 1;
  border-radius: 10px; overflow: hidden;
  ...
  touch-action: none;
}
```

There is no `grid-template-rows`, so rows are implicit `auto` and sized by content. `aspect-ratio` sets the container height, and `align-content: normal` distributes the leftover space evenly across rows — preserving the difference between content-sized rows rather than making them equal. `1fr` is `minmax(auto, 1fr)`, so columns also refuse to shrink below the piece’s min-content width.

Measured:

| Viewport | Board | Measured row pattern | Cell size | Result |
|---|---:|---|---|---|
| 1024×768 | 528×528 | `88 88 44 44 44 44 88 88` px | 66×88 or 66×44 | Not square |
| 1440×900 | 660×660 | `104.5 ×4 / 60.5 ×4` px | 82.5×104.5 / 82.5×60.5 | Not square |
| 768×1024 | 720×720 | `112 ×4 / 68 ×4` px | 90×112 / 90×68 | Not square |
| 375×812 | 351.2×351.2 | `60.03 ×4 / 27.76 ×4` px | 43.9×60.03 / 43.9×27.76 | Not square |
| 320×568 | 296×296 | empty squares measured **37×23.2** px | 37×23.2 empty | Target-size failure |
| 812×375 | 135.2 (clipped) | `44 ×4 / 0 ×4` px | columns 8×44 = 352 > 135 | **Empty ranks are 0 px; board clipped** |
| 568×320 | 80 (clipped) | `48.85 ×4 / 0 ×4` px | piece 48.85 | **Unusable** |

Additional evidence:

- Row heights are **position-dependent and change during play**: at 1024×768 the initial rows were `88/44`; after 16 plies they were `66/66`. Ranks therefore resize as pieces enter and leave them, causing layout shift while the user is aiming.
- The hint dot is `width: 26%; height: 26%` (`styles.css:181-186`), so on a 43.9×27.8 cell it renders as a **9.6×6 ellipse**, not a dot.
- The piece size is `min(7.2vw, 44px)` (`styles.css:153`) — viewport-relative, not board-relative, and capped at 44 px. On a 660 px board with 82.5×104.5 cells, pieces are 44 px, i.e. 53% of cell width and 42% of row height. The board looks sparse and inconsistent rather than deliberate.

**Impact.** This is the root defect behind the landscape failure, the 320 px target-size failure, the distorted legal-move indicators, layout shift, and the “small pieces on a large board” look. It is the first thing to fix.

**Recommendation.** Give the grid explicit, shrinkable tracks and size pieces from the board, not the viewport. Add a floor so short viewports scroll instead of clipping.

```css
.board {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  grid-template-rows: repeat(8, minmax(0, 1fr));
  aspect-ratio: 1 / 1;
  container-type: inline-size;
  overflow: hidden;
}
.sq .piece { font-size: min(9cqw, 44px); } /* 72% of a square */

.board-frame {
  width: 100%;
  max-width: min(720px, calc(100dvh - 240px));
  min-width: min(280px, 100%);
  margin: 0 auto;
}
```

`min-width` wins over a smaller `max-width` per CSS, so at 812×375 the board becomes 280 px and the page scrolls vertically instead of clipping empty ranks to 0 px. `9cqw` is 9% of board width; a square is 12.5%, so pieces occupy 72% of the square at every size.

Optional landscape enhancement for ≥700 px wide:

```css
@media (orientation: landscape) and (max-height: 560px) and (min-width: 700px) {
  .wrap { grid-template-columns: minmax(0, 1fr) 280px; }
  .board-frame { max-width: calc(100dvh - 88px); }
}
```

### L-02 — Medium — Side-panel order prioritises setup over the move history

**Evidence.** `index.html:64-99`: status card, then “Match setup”, then “Moves”. The setup card is a pre-game decision; the move list is consulted continuously during play. On mobile the same order is stacked below the board (`styles.css:331-335`).

**Impact.** Users scroll past configuration to review moves; on a 375×812 phone the move list and setup are below the first viewport, so the AI’s last move is not visible without scrolling. The last-move highlight is the only on-board cue (and it is nearly invisible — see V-02), so this compounds.

**Recommendation.** Reorder to **status → moves → setup (collapsed) → legend**; add a compact “last move” line inside the status card (e.g. “Computer played Nf6”) so the move is visible without scrolling; make Match setup a disclosure on mobile.

### L-03 — Medium — No game persistence or refresh warning

**Evidence.** All state lives in memory (`app.js:435-454`); `init()` rebuilds from a fresh position (`app.js:962-967`). There is no `localStorage`, history API or `beforeunload` handling.

**Impact.** A refresh, closing the tab, or a mobile browser discarding the page silently loses the entire game. This is a trust issue for a game that can last 30+ minutes.

**Recommendation.** Snapshot `{pos, history, positions, settings}` to `localStorage` after each commit; on load offer “Resume game” or restore automatically with a “New game” affordance. Do not use a `beforeunload` prompt. (Proposal; product decision.)

### L-04 — Low — “New game” is destructive with no confirmation or undo

**Evidence.** `index.html:22` and `app.js:926`: the header button immediately calls `newGame()` and shows a toast “New game”. `newGame()` clears history, repetition map and overlays (`app.js:768-789`).

**Impact.** A misclick next to “Flip board” discards an in-progress game with no recovery.

**Recommendation.** When `state.history.length > 0`, either confirm (“Start a new game? Your current game will be lost.”) or replace the toast with an “Undo” action that restores the snapshot. Keep the immediate path for an untouched board.

### L-05 — Low — “Review board” makes the result unrecoverable

**Evidence.** `index.html:50`; `app.js:928`:

```js
els["over-close"].addEventListener("click", () => { els["game-over"].hidden = true; });
```

The overlay cannot be reopened; `endGame()` (`app.js:685-692`) is the only code that shows it.

**Impact.** Once closed, the result is only visible as status text; users cannot re-read the summary or return to “Play again” without starting a game from the header.

**Recommendation.** Rename to “Close” and add a persistent “Show result” control in the status card (or a game-result button) that reopens the overlay; or keep the overlay open until the next game.

### L-06 — Low — The move list is display-only; no review/navigation

**Evidence.** `renderMoves()` outputs spans (`app.js:601-615`); there is no click/keyboard handler for move entries. `state.history` does store `posBefore` (`app.js:695`), so review is technically cheap.

**Impact.** “Move history” invites clicking a move to review the position; nothing happens. Take back is the only way to revisit.

**Recommendation.** Make moves buttons or a listbox that restores `posBefore` in a read-only review mode (or at minimum show a tooltip “Take back to review”). Structural, later.

---

## 4. UX and copy

### U-01 — High — Illegal moves fail silently

**Evidence.** `app.js:707-712`:

```js
const candidates = all.filter(m => m.from === from && m.to === to);
if (!candidates.length) return false;
```

The click handler (`app.js:844-857`) then calls `clearSelection()` when the target is not a legal move; no toast, no live message, no visual error. Runtime check: clicking e2→e5 cleared the selection, left `#toast` empty and `#live` unchanged. Dragging to an illegal square simply re-renders (`app.js:912`).

**Impact.** New users cannot tell whether they mis-clicked, the piece cannot move that way, or the app is broken. This is the most common error path in a chess UI and it has zero feedback. It maps to WCAG 3.3.1 (Error Identification) and 4.1.3.

**Recommendation.** Keep the selection, mark the target briefly, and explain in one sentence:
- Visual: 1 px shake/outline on the destination (respect reduced motion) or a short inline line under the board.
- Text: “That move isn’t legal. A pawn on e2 can move to e3 or e4.”
- Announce: “Illegal move. e5 is not a legal destination for the pawn on e2.”

```js
if (!candidates.length) {
  const msg = `${sqName(to)} is not a legal destination for the ${pieceName(state.pos.board[from])} on ${sqName(from)}.`;
  toast(msg);
  announce("Illegal move. " + msg);
  return false;
}
```

### U-02 — High — The AI search blocks the main thread; “thinking” can freeze for seconds

**Evidence.** `app.js:751-765`: a `setTimeout(..., 260)` lets the UI paint once, then `chooseAiMove()` runs synchronously; the search calls `legalMoves()` at every minimax node (`app.js:401-421`), which is expensive. Local Chromium timings: Casual ≈147 ms, Sharp ≈570 ms, Ruthless ≈1,815 ms; at 4× CPU throttling, Ruthless ≈23,591 ms (plus the 260 ms delay). Timings are hardware-dependent; the ratio between levels is the point.

**Impact.** During the search the UI cannot repaint, the “thinking” dot’s pulse animation freezes (the CSS animation is main-thread), clicks are queued, and “New game” cannot actually cancel the search. On a low-end phone, Ruthless is a multi-second hang.

**Recommendation.** Move the search to a Web Worker and time-box it; keep a search id so a new game terminates the worker.

```js
const ai = new Worker("ai-worker.js");
let searchId = 0;
function maybeAiMove() {
  if (state.gameOver || state.pos.turn === state.playerColor) return;
  const id = ++searchId;
  state.thinking = true; renderStatus();
  ai.postMessage({ id, pos: state.pos, level: state.aiLevel });
  ai.onmessage = ({ data }) => {
    if (data.id !== searchId) return;
    state.thinking = false;
    if (data.move) commitMove(data.move, data.san);
    else checkGameOver();
  };
}
```

Pass a time budget (e.g. 300 / 800 / 2,000 ms) into the worker and return the best move found. Remove the fixed 260 ms delay once the UI no longer blocks. As an interim fix, reduce Ruthless depth or add move ordering/transposition; do not leave a synchronous multi-second search in the event handler.

### U-03 — High — Promotion is a modal trap with no cancel, focus or announcement

**Evidence.** `app.js:726-749`: the overlay is shown by toggling `hidden` (`app.js:748`), but there is no `focus()`, no Escape handler, no cancel, and no live announcement. Buttons are labelled “Promote to Q/R/B/N” (`app.js:734`) — letters, not piece names. The overlay has `role="dialog"` but no `aria-modal` (`index.html:40`). Runtime check: after opening promotion, `document.activeElement` was `<body>`.

The board remains in the tab order behind the visually covering overlay (`styles.css:205-210` only paints/scrims it); pressing Enter on the still-focused board square re-triggers the click handler and reopens promotion (`app.js:844-857`).

**Impact.** Keyboard users are stranded on the body, can tab into content behind the dialog, cannot cancel an accidental promotion attempt, and hear “Promote to Q” rather than “Promote to queen”.

**Recommendation.** Make it a true modal: `aria-modal="true"`, focus the queen button, trap Tab, Escape cancels (the move has not been committed yet — `commitMove` is only called from the button handler), restore focus to the destination square, and announce “Promotion. Choose queen, rook, bishop or knight.” Use full piece names in labels. Mark the board `inert` while open.

### U-04 — High — End-of-game closure is broken in three ways

**Evidence and runtime results.** After a mate-in-one (`Qg7#`):

1. **The result announcement is overwritten.** `endGame()` announces the result (`app.js:691`), then `playerMove()` announces the move (`app.js:722`); `#live` ended as **“You played Qg7#”** while the overlay said “Checkmate / White wins”. The AI path has the same bug (`app.js:764`).
2. **Focus is not moved to the alertdialog.** `endGame()` has no `focus()` call (`app.js:685-692`); focus stays on the board cell or body. The overlay is `role="alertdialog"` but not `aria-modal` (`index.html:46`).
3. **The turn ring remains after the game is over.** Measured `#top-strip` class `player-strip strip-turn` with `gameOver: true`. Cause: `renderAll()` runs before `checkGameOver()` (`app.js:701-702`), and `endGame()` only calls `renderStatus()` (`app.js:690`), so the strip’s `strip-turn` state from the previous position is never cleared — even though `renderStrips()` explicitly guards on `!state.gameOver` (`app.js:589-590`).

Hiding the overlay via “Play again” or “Review board” removes the focused element, so focus falls to `<body>`.

**Impact.** Screen-reader users often never hear the result; sighted users see a stale “black to move” ring on a finished game; keyboard users lose their place when the overlay closes.

**Recommendation.** Combine the move and result in one announcement, move focus into the dialog, make it modal, and re-render the strips after setting `gameOver`:

```js
// in playerMove / maybeAiMove
commitMove(move, san);
if (!state.gameOver) announce("You played " + san);
// endGame already announced "<title>. <sub>"

// in endGame, after state.gameOver is set
renderStrips();
renderStatus();
playAgain.focus(); // and aria-modal="true" on the alertdialog
```

For “Review board”, close the dialog and focus a persistent “Show result” button or the status card. Use Escape to review, not to dismiss into nowhere.

### U-05 — Medium — Pending settings look active; the level shown in status is the committed level

**Evidence.** Clicking a level immediately toggles `is-active` and `aria-checked` (`app.js:948-957`) but only sets `pendingLevel` (`app.js:956`); `aiLevel` changes only in `newGame()` (`app.js:771`). The status line reports the *committed* level (`app.js:641`). Side selection behaves the same way (`app.js:937-947`).

**Impact.** Mid-game, the “Ruthless” button appears selected while the AI is still Sharp; “Black” appears selected while the user is White. The only explanation is an 11.5 px, 3.56:1 hint (`styles.css:272`) that can be overwritten by other messages (`app.js:786, 946`).

**Recommendation.** Separate pending from active visually: badge the pending choice “Next game”, keep the active choice with a solid/checked style, and put a persistent “Applies next game” line next to the group. Or apply changes immediately where safe (level can apply to the next AI move; side must wait). Either way, make the model visible.

### U-06 — Medium — First-run copy omits keyboard control and the AI loop

**Evidence.** The only instructions are the four legend lines (`index.html:104-107`): click, dots/rings, castling, drag. Keyboard is documented only in `README.md:19`; the page never mentions arrow keys, Enter/Space, Take back, level differences, or that the computer replies automatically. The board’s `aria-label` mentions arrow keys (`index.html:38`), but that label is not exposed as a grid (see A-01).

**Impact.** A keyboard user may never discover that the board is operable; a first-time user may not understand why the board locks after their move. The legend also omits that “Take back” rewinds both plies, which can surprise users.

**Recommendation.** Add a fifth legend line (“Keyboard: Tab to the board, arrows to move, Enter to select”) and a short first-run status detail: “You’re white. Click a piece, then a highlighted square; the computer replies automatically.” Put the level meanings in the setup card without inventing ratings: “Casual — fastest, more variety; Sharp — deeper search, less randomness; Ruthless — deepest search, no randomness” (this matches `SEARCH` at `app.js:377-381`).

### U-07 — Low — Copy and terminology inconsistencies

**Evidence.**
- Move count counts **plies**, not moves: `app.js:613-614` uses `state.history.length`, so two plies read “2 moves”. Chess convention is “1 move” (one full move) or “2 plies”.
- Status level is lowercase: `"Move 3 · level " + ["", "casual", "sharp", "ruthless"][state.aiLevel]` (`app.js:641`) versus buttons “Casual / Sharp / Ruthless” (`index.html:84-86`).
- After a new game the hint becomes “Playing white.” (`app.js:786`), replacing the useful “Changes apply on the next new game.” (`index.html:89`).
- Undo announces twice: `toast("Move taken back")` and `announce("Move taken back")` (`app.js:815-816`).
- “New game”, “Play again” and “Take back” are three different mental models for reset/undo; acceptable, but the header “New game” has no context that it discards a game.

**Recommendation.** Count full moves or label “plies”; capitalise the level or lowercase the buttons consistently; restore the “applies next game” hint after every settings interaction; keep one announcement channel for undo; add “Your current game will be lost” to the destructive action.

### U-08 — Low — The material score and captured strips are ambiguous

**Evidence.** `renderStrips()` sets `top-score` to `"—"` when material is even (`app.js:584-585`) and the element has only `title="Material advantage"` (`index.html:34, 59`). Captured pieces are a run of glyphs with an `aria-label` naming the capturing side but not the pieces or counts (`app.js:574-575`).

**Impact.** “—” reads as “missing data” rather than “material is even”; a screen reader may read a string of chess glyphs.

**Recommendation.** Use a real accessible name and visible copy: “Material even”, “White +3”, “Black +1”; give captured strips `role="img"` with a count label (“Black has captured 2 pawns and a knight”) and `aria-hidden` on the glyph text.

---

## 5. Visual system

### V-01 — Critical — White pieces fail contrast on light squares

**Evidence.** `app.js:20-23` uses hollow white glyphs (`♔♕♖♗♘♙`) for white; `styles.css:161-162`:

```css
.piece.w { color: #fffdf6; }
.piece.b { color: #17130e; }
```

Computed against `--sq-light: #e8ddc4` (`styles.css:19`), white is **1.33:1**; against `--sq-dark: #a97d55`, white is 3.59:1. Black is 13.71:1 on light and 5.06:1 on dark.

**Impact.** White pieces are defined only by a thin white outline and a soft drop shadow (`styles.css:158`), so they almost disappear on light squares. This fails WCAG 1.4.11 (3:1 non-text) and, on small screens where the glyph is ~23 px, 1.4.3 (4.5:1 text). It is the most visible quality problem in the product.

**Recommendation.** Use solid glyphs for both colors and give white a dark outline, or move to two-tone SVG pieces. Minimal fix:

```js
// app.js — use solid glyphs for both colors
const GLYPH = { wK:"♚", wQ:"♛", wR:"♜", wB:"♝", wN:"♞", wP:"♟",
                bK:"♚", bQ:"♛", bR:"♜", bB:"♝", bN:"♞", bP:"♟" };
```

```css
.piece.w {
  color: #fdf8ec;
  text-shadow:
    -1px -1px 0 #17130e, 1px -1px 0 #17130e,
    -1px 1px 0 #17130e, 1px 1px 0 #17130e;
}
```

The dark outline establishes the shape boundary at 13.71:1 on light and 5.06:1 on dark. For production, SVG pieces with a controlled outline are more consistent across platforms and remove dependence on Unicode chess glyphs. **Needs runtime verification** across Windows/macOS/Android/iOS font stacks.

### V-02 — Critical — The entire state layer is below 3:1

All values are composited against the underlying square and computed with the WCAG formula; “light/dark” are `#e8ddc4` / `#a97d55`.

| State | CSS source | Composite color | Ratio light | Ratio dark | 3:1? |
|---|---|---|---:|---:|---|
| Focus ring | `styles.css:150` `outline: 3px solid var(--gold)` | `#f5d889` | **1.03** | **2.62** | No |
| Selected | `styles.css:21-22, 165-170` gold @ .5 / .38 | `#efdba7` / `#c6a069` | **1.01** | **1.50** | No |
| Last move | `styles.css:171-175` mint @ .25 | `#cae0c1` / `#9a986e` | **1.04** | **1.23** | No |
| Legal quiet dot | `styles.css:181-187` dark @ .38 / .40 | `#97947f` / `#6b5438` | **2.27** | **1.95** | No |
| Capture ring | `styles.css:188-194` border dark @ .5 / .52 | `#7e7d69` / `#59482f` | 3.10 | **2.40** | Half |
| Check (radial center) | `styles.css:176-179` coral @ .65 | `#f4979b` / `#de7574` | **1.60** | **1.20** | No |

**Impact.** In addition to WCAG 1.4.11 and 1.4.1, this breaks the core loop: a user cannot reliably see which square is selected, which squares are legal, which piece just moved, or where the king is in check. On mobile the last-move highlight is the only on-board cue of the AI’s reply, so a 1.04:1 tint means the user may not see what the opponent did. The focus ring makes keyboard play effectively blind.

**Recommendation.** Do not brighten the board; use dark, high-contrast shapes on both square colors. `#0b0f16` gives **14.23:1** on light and **5.26:1** on dark, so one ink works on both.

```css
:root { --state: #0b0f16; }

.sq.sel { box-shadow: inset 0 0 0 3px var(--state); }
.sq.sel::after { background: rgba(245, 216, 137, .18); } /* warmth, not the cue */

.sq.lastmove::before {
  content: ""; position: absolute; left: 0; top: 0;
  width: 12px; height: 12px;
  background: linear-gradient(135deg, #0b0f16 50%, transparent 50%);
  z-index: 2;
}

.sq.hint::after { width: 28%; height: 28%; background: #0b0f16; opacity: .9; }
.sq.hint.cap::after { border: 4px solid #0b0f16; }

.sq.check::after {
  border: 3px solid #0b0f16;
  background: radial-gradient(circle at center,
    rgba(251, 113, 133, .55) 0%, rgba(251, 113, 133, .18) 55%, transparent 72%);
}

.sq:focus-visible {
  outline: 3px solid #0b0f16;
  outline-offset: -3px;
}
```

Keep the coral glow as a secondary, non-essential cue; the dark ring and the announced “Check” carry the meaning. Also fix V-01 and the hint dot shape will follow once the cells are square.

### V-03 — Medium — State is conveyed by color alone, and states are not distinguishable from each other

**Evidence.** Selected, last-move, check and legal-target states are all tinted overlays with different hues (`styles.css:165-194`); the only non-color cue is the dot/ring shape for hints. Selected and last-move can coexist on the same square (the selected piece may be the piece that just moved), producing a blend. The active segment in Match setup is distinguished only by gold text, a 12% gold background and a 40% gold border (`styles.css:268-270`).

**Impact.** Fails WCAG 1.4.1 for users with color-vision deficiency; also fails the practical “which state is this?” test for everyone because the contrasts are so low.

**Recommendation.** Pair each state with a distinct shape: selection = 3 px inset ring; last move = corner triangle; legal quiet = dot; capture = ring; check = ring + radial glow. For the segmented control, add a check mark or a filled indicator in addition to color. This is largely covered by the snippet in V-02.

### V-04 — Medium — Design-token coverage is partial; design debt is explicit

**Evidence.** Good semantic tokens exist (`styles.css:2-27`), but these values bypass them:

- Piece colors `#fffdf6`, `#17130e` (`styles.css:161-162`).
- Solid button gradient and text `#f5d889`, `#e3b95c`, `#241c05` (`styles.css:97-99`), skip-link text `#241c05` (`styles.css:52`).
- State overlays `rgba(...)` (`styles.css:165-194`), board shadow (`styles.css:140`), overlay scrims (`styles.css:208, 315`), status-dot glows (`styles.css:250-253`), promo light square `#d9cdb2` (`styles.css:232`), scrollbar colors (`styles.css:326-328`), coordinate colors.
- Motion durations are scattered (`0.08s`, `0.12s`, `0.15s`, `0.2s`) with no `--dur-*` / `--ease-*`.
- Z-index values are uncoordinated (`0, 1, 2, 10, 20, 40, 60`) with no scale.
- Breakpoints are magic numbers (`980px`, `640px`) and the board cap uses `240px` (`styles.css:134`).
- Unused tokens: `--bg-deep`, `--coral-soft`, `--sky` (`styles.css:4, 17, 18`).
- `.btn.ghost` is used in HTML (`index.html:22-23, 50, 97`) but has no rule; `.status-body`, `.controls-card`, `.legend-card` likewise have no rules. Harmless today, but it signals naming drift.

**Impact.** State fixes will be re-invented per component; dark/light theming or a brand refresh would require touching many rules; the “system” is a palette, not a contract.

**Recommendation.** Add the missing semantic tokens (`--piece-light`, `--piece-dark`, `--piece-outline`, `--state`, `--focus`, `--scrim`, `--shadow-board`, `--dur-fast`, `--ease-out`, `--z-board`, `--z-overlay`, `--z-toast`), delete or use the three unused tokens, and write a one-page `DESIGN.md` with the component inventory and state matrix. This is a documentation/token task, not a redesign.

### V-05 — Medium — Small text uses `--faint`, which fails 4.5:1

**Evidence.** `--faint: #62708a` (`styles.css:11`) is used for 10.5–12 px text: brand tag (`styles.css:84-87`), control labels (`styles.css:260`), control hints (`styles.css:272`), move numbers (`styles.css:282`), move count (`styles.css:289`), footer (`styles.css:304`). Computed: **3.34:1** on `#161e2d`, **3.56:1** on `#121824`, **3.84:1** on `#0b0f16` — below 4.5:1 for normal text.

**Impact.** WCAG 1.4.3 failure across the side panel and footer; the “applies next game” hint is exactly the text that explains U-05 and it is the least legible text on the page.

**Recommendation.** Raise the token to `#7d8ca2` (**5.62:1** on `#0b0f16`, **5.20:1** on `#121824`) or reserve `--faint` for non-text decoration and use `--muted` for small copy.

### V-06 — Low — Coordinates are low-contrast and duplicate the accessible name

**Evidence.** `styles.css:196-203`: 10 px, `opacity: 0.8`, color `--sq-dark` on light / `--sq-light` on dark. Composited: **2.17:1** on light, **2.27:1** on dark. The cell’s `aria-label` already includes the square name (`app.js:496`), so the visible coordinates are decorative duplicates.

**Impact.** Coordinates are hard to read for low-vision users; they also add noise to the accessibility tree if not hidden.

**Recommendation.** Use `color: #17130e; opacity: 1` on both square colors (**13.71:1** light, **5.06:1** dark) and add `aria-hidden="true"` to the coordinate spans.

### V-07 — Low — No `:active` state and weak hover feedback

**Evidence.** Buttons have hover and focus but no `:active` (`styles.css:91-103`); the board’s hover cue is a 3 px gold inset at 75% (`styles.css:195`), which is about 1.5–2:1 against the squares. Drag state scales the piece (`styles.css:160`).

**Impact.** Presses feel unconfirmed; the hover cue does not help identify the square.

**Recommendation.** Add a small `transform: translateY(1px)` on `:active` and use the dark state ink for the hover ring; keep transitions under reduced-motion rules.

---

## 6. Accessibility (WCAG 2.2 AA)

### A-01 — Critical — The ARIA grid is structurally invalid and is not exposed as a grid

**Evidence.** `index.html:38`:

```html
<div class="board" id="board" role="grid" aria-label="Chess board. Use arrow keys to explore squares."></div>
```

`app.js:489-497, 534` appends 64 `div role="gridcell"` directly to the grid; there are no `role="row"` elements and no `aria-rowcount` / `aria-colcount` / `aria-rowindex` / `aria-colindex`. The required owned element for `grid` is `row` (or `rowgroup` containing rows), so the structure is invalid.

**Runtime evidence.** In the Chromium accessibility snapshot, the board appeared as a **region named “Chess board” containing 64 `gridcell` nodes; there was no `grid` node and no `row` node.** The grid’s own label (“Use arrow keys…”) was not exposed because the grid role was not exposed.

**Impact.** Screen readers do not enter grid navigation mode; users do not get row/column context; the instruction to use arrow keys is lost. The roving-tabindex keyboard handler still works if a cell receives focus, but browse-mode arrow keys may be intercepted by the screen reader, so the board can become unnavigable in practice. **Needs runtime verification with NVDA/JAWS/VoiceOver.**

**Recommendation.** Build real rows and give the grid dimensions and instructions:

```js
for (let r = 0; r < 8; r++) {
  const row = document.createElement("div");
  row.setAttribute("role", "row");
  row.setAttribute("aria-rowindex", String(r + 1));
  for (let c = 0; c < 8; c++) {
    const sq = document.createElement("div");
    sq.setAttribute("role", "gridcell");
    sq.setAttribute("aria-colindex", String(c + 1));
    /* ...existing square construction... */
    row.appendChild(sq);
  }
  frag.appendChild(row);
}
```

```css
.board { display: grid; grid-template-rows: repeat(8, minmax(0, 1fr)); }
.board [role="row"] { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); }
```

```html
<div id="board" role="grid" aria-rowcount="8" aria-colcount="8"
     aria-label="Chess board" aria-describedby="board-help">
```

Add a screen-reader-only `#board-help`: “Use arrow keys to move between squares. Press Enter or Space to select a piece, then Enter on a highlighted square to move. Escape cancels the selection.”

### A-02 — High — Selection and legal moves are not represented in the accessibility tree

**Evidence.** `renderBoard()` sets `aria-label` to the square and piece only (`app.js:496`), never `aria-selected`, never “selected”, and never lists legal targets. Legal targets are only CSS classes (`app.js:519-524`). Selecting a piece calls `renderBoard()` (`app.js:825-831`) with no live announcement.

**Impact.** A screen-reader user can hear “e2 white pawn” but cannot learn which moves are legal, which piece is selected, or whether a move is a capture. The board is operable by keyboard but not usable by ear. This is the highest-value screen-reader gap after A-01.

**Recommendation.**
- Set `aria-selected="true"` on the selected cell (and `"false"` on the others).
- Append the legal targets to the selected cell’s label.
- Announce selection and targets.

```js
sq.setAttribute("aria-selected", idx === state.selected ? "true" : "false");
if (idx === state.selected) {
  const targets = state.legalForSelected.map(m => sqName(m.to)).join(", ");
  sq.setAttribute("aria-label",
    `${sqName(idx)} ${pieceName(state.pos.board[idx])} selected. Legal moves: ${targets}.`);
}
```

```js
// in selectSquare(), after computing legalForSelected
const targets = state.legalForSelected.map(m => sqName(m.to)).join(", ");
announce(`${sqName(idx)} ${pieceName(piece)} selected. ` +
         (targets ? `Legal moves: ${targets}.` : "No legal moves."));
```

### A-03 — Critical — Focus and board states fail non-text contrast

This is the accessibility consequence of V-02; values are repeated here for the WCAG mapping. The focus ring is a 3 px gold outline at `-3px` offset (`styles.css:150`), which is **1.03:1** on light squares and **2.62:1** on dark squares. The selected, last-move, hint and check states are **1.01–3.10:1**. WCAG 1.4.11 requires 3:1 for visual information required to identify states; 2.4.7 requires a visible focus indicator. Both fail. (2.4.13 Focus Appearance is AAA in WCAG 2.2; the dark ink fix in V-02 exceeds it for free.)

**Recommendation.** Change the focus outline to `#0b0f16` (14.23/5.26) and apply the state inks from V-02. Add a keyboard test to the definition of done: tab to the board, arrow to a light square, and verify the focus ring is visible against both square colors at 100% and 200% zoom.

### A-04 — High — Dialogs are not modal, do not manage focus, and cannot be cancelled

**Evidence.** Promotion: `role="dialog"` without `aria-modal` (`index.html:40`); shown via `hidden` (`app.js:748`); no `focus()`, no Escape, no focus trap; the board stays focusable behind it. Game over: `role="alertdialog"` without `aria-modal` (`index.html:46`); no focus call (`app.js:685-692`). Closing either overlay hides the focused element and focus falls to `<body>` (`app.js:737, 784, 928`). Runtime: promotion left `activeElement` as `<body>`.

**Impact.** WCAG 2.4.3 (Focus Order), 1.3.1 (Info and Relationships) and 2.1.1 (Keyboard) are compromised; keyboard and screen-reader users can interact with obscured content and lose their place. The promotion dialog is the only way to complete a promotion, so this blocks the game flow.

**Recommendation.**
- Add `aria-modal="true"` and a description to both dialogs.
- Save the previously focused element; focus the first meaningful control (Queen for promotion, “Play again” for game over).
- Trap Tab within the dialog, handle Escape (cancel promotion; review board for game over), and restore focus to the destination square / a “Show result” control.
- Set `inert` on `header`, `main` and `footer` while open:

```js
function openModal(overlay, initial) {
  overlay.hidden = false;
  document.querySelectorAll("header, main, footer").forEach(el => { el.inert = true; });
  initial.focus();
}
function closeModal(overlay, returnTo) {
  overlay.hidden = true;
  document.querySelectorAll("header, main, footer").forEach(el => { el.inert = false; });
  returnTo?.focus();
}
```

### A-05 — High — Status messages are not announced, and the result announcement is overwritten

**Evidence.**
- `renderStatus()` updates visible text but the status card has no `aria-live` (`index.html:64-70`; `app.js:617-643`), so turn changes, “Computer thinking…”, and “in check” are silent.
- `announce()` writes to `#live` (`app.js:475`), but `endGame()` announces the result (`app.js:691`) and the caller then overwrites it with the move (`app.js:722`, `764`). Runtime: `#live` = “You played Qg7#” with a checkmate overlay open.
- Illegal moves and promotion opening produce no announcement (`app.js:712`, `726-749`).
- Undo announces twice: `toast` and `#live` (`app.js:815-816`).

**Impact.** WCAG 4.1.3 (Status Messages): check, thinking, turn ownership, promotion and the game result are not conveyed without moving focus. The result being overwritten is a correctness bug in the announcement layer, not just a style issue.

**Recommendation.** Adopt an announcement policy and keep it to one message per event:

| Event | Message |
|---|---|
| Player move | “You played Nf3.” + (if check) “Check.” + (if your turn) “Your move.” |
| AI move | “Computer played Nf6.” + (if check) “Check.” |
| Result | “Qg7#. Checkmate. White wins.” — do not announce the move separately |
| Thinking | “Computer is thinking.” (once) |
| Selection | “e2 white pawn selected. Legal moves: e3, e4.” |
| Illegal attempt | “Illegal move. e5 is not legal for the pawn on e2.” |
| Promotion open | “Promotion. Choose queen, rook, bishop or knight.” |
| Undo | “Move taken back. Your move.” |
| New game | “New game. You are white. Your move.” |

Minimal ordering fix:

```js
commitMove(move, san);
if (!state.gameOver) announce("You played " + san);
```

and the same guard in `maybeAiMove()` (`app.js:764`). Do not put `aria-live` on the status card itself; it re-renders on every move and would announce “Move 4 · level sharp” repeatedly.

### A-06 — High — `touch-action: none` blocks page scroll and pinch-zoom on the board

**Evidence.** `styles.css:141`: `user-select: none; touch-action: none;` on `.board`. Per spec, this disables browser handling of panning and pinch-zoom initiated on the element. At 320 px the board is 296 px wide and the page is taller than the viewport, so most swipe gestures start on the board.

**Impact.** Mobile users cannot scroll from the board to the side panel (moves, setup) and cannot pinch-zoom the board. This is a practical 1.4.4 / 1.4.10 risk and a significant usability issue; click-to-move already provides a complete touch path, so drag does not need to reserve all gestures.

**Recommendation.** Allow native gestures and gate drag behind a long-press/threshold, or drop touch drag in favour of click-to-move:

```css
.board { touch-action: manipulation; }
```

If drag must remain, add a 120 ms hold or 8 px threshold before calling `setPointerCapture` (`app.js:890-904`), so a normal swipe scrolls and a deliberate drag moves. **Needs device verification on iOS Safari and Android Chrome.**

### A-07 — Medium — Radio groups are buttons with `role="radio"` but no radio keyboard model

**Evidence.** `index.html:76-78` and `83-86` use `<button role="radio">` inside `role="radiogroup"`. All five buttons are in the tab order; arrow keys do nothing. The visible “Play as” label uses `for="side-select"` where `#side-select` is a `<div>` (`index.html:75`), so the label is not associated with anything. `aria-checked` is updated correctly (`app.js:940-944`, `951-955`).

**Impact.** WCAG 2.1.1 is technically satisfied (Tab + Space works), but the ARIA pattern is non-conforming and confusing: screen readers announce a radio group where arrow keys do not move the selection, and there are five tab stops where two are expected. The visible label is not connected to the group.

**Recommendation.** Use native radio inputs inside `<fieldset>`/`<legend>`; this gives grouping, checked state and arrow-key navigation for free.

```html
<fieldset class="ctl-row">
  <legend class="ctl-label">Play as</legend>
  <div class="seg">
    <label class="seg-btn"><input type="radio" name="side" value="w" checked> White</label>
    <label class="seg-btn"><input type="radio" name="side" value="b"> Black</label>
  </div>
</fieldset>
```

If the button markup must stay, implement roving tabindex + Arrow/Home/End inside each group.

### A-08 — Medium — No top-level heading; skip-link target is not focusable

**Evidence.** There is no `<h1>` anywhere in `index.html` (`28-111`); the first headings are `<h2>` at lines 47, 73, 93 and 102. The skip link points to `#main` (`index.html:12`), but `<main>` has no `tabindex="-1"` (`index.html:28`).

**Impact.** Heading navigation starts at level 2, and the document has no single top-level description (the `<title>` covers the tab, not the page outline). Activating the skip link scrolls, but some screen readers do not move their virtual cursor to `<main>`; the bypass mechanism is weaker than intended. SC 2.4.1 is partially met; 2.4.6 is better served with a real h1.

**Recommendation.** Add a visually hidden or visible h1 (“Gambit — play chess against the computer”) at the top of `<main>`, add `tabindex="-1"` to `<main>`, and focus it when the skip link is used. Add `scroll-margin-top: 72px` so the sticky header does not cover the target.

### A-09 — Medium — Captured pieces and material score have weak semantics

**Evidence.** `index.html:33, 58` put `aria-label` on generic spans; `app.js:574-575` sets a label naming only the side; the glyph text remains. `top-score`/`bottom-score` start empty and become “—” or “+3” (`app.js:584-585`) with only a `title` (`index.html:34, 59`). Chromium exposed the captured spans as `generic "Pieces captured by black"`, so the label is not ignored, but it does not convey the pieces or counts, and the glyphs may still be read.

**Impact.** Screen-reader users cannot tell what was captured or the material balance; “—” is read as a dash. WCAG 1.3.1 / 4.1.2.

**Recommendation.** Use `role="img"` with a count-based label, hide the decorative glyphs, and give the score a real label:

```html
<span id="top-captured" role="img" aria-label="Black has captured 2 pawns and a knight"></span>
<span id="top-score" aria-label="Material even"></span>
```

### A-10 — Low — Re-render focus restoration and glyph reading need AT verification

**Evidence.** `renderBoard()` rebuilds all 64 cells on every selection/render (`app.js:536-537`); focus is restored only if the board contained focus (`app.js:486, 538-541`). The piece glyph span and coordinate spans are not `aria-hidden` (`app.js:503-510, 528-532`).

**Impact.** In some screen readers, replacing the focused DOM node can drop or repeat the announcement; the glyphs and coordinates may be read after the cell label, adding noise. The code’s intent is good; the behavior needs real AT testing.

**Recommendation.** Add `aria-hidden="true"` to `.coord` and `.piece` spans (the cell label already carries the information), and test focus restoration with NVDA + Firefox/Chrome and VoiceOver + Safari. If re-rendering causes churn, update cell attributes in place instead of replacing the subtree.

### A-11 — Low — Duplicate live regions

**Evidence.** `#toast` is `role="status"` (`index.html:120`) and `#live` is `aria-live="polite"` (`index.html:121`); undo writes the same message to both (`app.js:815-816`).

**Impact.** Screen readers may announce “Move taken back” twice; the toast is also visible, so the duplication is perceptible.

**Recommendation.** Keep `#live` as the single announcement channel and set `aria-live="off"`/`role="presentation"` on the toast, or only use the toast for sighted feedback.

### WCAG 2.2 AA mapping

| Finding | Issue | Success criterion | Level | Result |
|---|---|---|---|---|
| L-01, R-01 | Board rows collapse; content clipped in landscape | 1.4.10 Reflow | AA | **Fail** (runtime) |
| L-01, R-02 | Empty-square targets 37×23.2 at 320; 0 px in landscape | 2.5.8 Target Size (Minimum) | AA | **Fail** (runtime) |
| V-01 | White pieces 1.33:1 on light squares | 1.4.11 Non-text Contrast | AA | **Fail** |
| V-02, A-03 | Focus/selected/last-move/legal/check 1.01–2.62 | 1.4.11; 2.4.7 Focus Visible | AA | **Fail** |
| V-03 | States conveyed by color only | 1.4.1 Use of Color | A | **Fail** |
| A-01 | Grid without rows; no grid node in AX tree | 1.3.1 Info and Relationships; 4.1.2 Name, Role, Value | A | **Fail** |
| A-02 | No selected state or legal-move information | 4.1.2; 4.1.3 Status Messages | A / AA | **Fail** |
| A-05 | Check/turn/result not announced; result overwritten | 4.1.3 Status Messages | AA | **Fail** |
| A-04 | Dialogs not modal; focus not moved/trapped/restored; no Escape | 2.4.3 Focus Order; 1.3.1; 2.1.1 Keyboard | A | **Fail** |
| V-05 | Small text at 3.34–3.84:1 | 1.4.3 Contrast (Minimum) | AA | **Fail** |
| V-06 | Coordinates 2.17/2.27:1 | 1.4.3 | AA | **Fail** |
| A-06 | `touch-action:none` blocks pan/zoom on the board | 1.4.4 Resize Text; 1.4.10 Reflow | AA | **Partial / risk** |
| A-07 | Fake radio groups; unassociated label | 2.1.1; 4.1.2 | A | **Partial** |
| A-08 | No h1; skip target not focusable | 2.4.1 Bypass Blocks; 2.4.6 Headings | A / AA | **Partial** |
| A-09 | Captured/material semantics | 1.3.1; 4.1.2 | A | **Partial** |
| U-01 | Illegal move produces no error message | 3.3.1 Error Identification | A | **Fail** |
| U-02 | AI blocks the main thread | (no direct SC; UX/performance) | — | **High UX** |
| — | Keyboard board operation (arrows/Enter/Space) | 2.1.1 Keyboard | A | **Pass** |
| — | Drag has click/keyboard alternatives | 2.5.7 Dragging Movements | AA | **Pass** |
| — | Language, title, zoom not locked | 3.1.1; 2.4.2; 1.4.4 (lock) | A / AA | **Pass** |
| — | Reduced motion | 2.3.3 (AAA) | AAA | **Pass** |
| — | Pause/stop/hide; flashing; media alternatives | 2.2.2; 2.3.1; 1.2.x | A/AA | **Not applicable** |
| — | Consistent help; redundant entry; accessible auth | 3.2.6; 3.3.7; 3.3.8 | A/AA | **Not applicable** |

**Highest-value a11y fixes, in order:** L-01 geometry → V-01 pieces → V-02 focus/state inks → A-01 grid rows → A-02 selected/legal → A-05 announcement policy → A-04 dialogs → V-05 faint text. The first five are all achievable in CSS plus a small `renderBoard()` rewrite.

---

## 7. Responsive behaviour

### Measured results

| Viewport | Board | Rows / cells | Hierarchy | Verdict |
|---|---:|---|---|---|
| 320×568 | 296 | empty cells 37×23.2 | board + strips + status at fold; setup/moves/legend below | Playable but targets fail 2.5.8; tiny cells; board non-square |
| 375×812 | 351.2 | rows 60.03/27.76 | board + status visible; moves/setup below fold | Playable portrait; non-square; move list not visible |
| 768×1024 | 720 | rows 112/68 | board 720; panel below | Portrait tablet works; non-square; huge rows |
| 1024×768 | 528 | rows 88/44 | two columns; 108 px of the board column unused | Desktop works but board is smaller than available |
| 1440×900 | 660 | rows 104.5/60.5 | two columns; large empty margins from 1240 cap | Board capped by height, not width; non-square |
| 812×375 landscape | 135.2 | rows 44/0; columns 8×44 = 352 | status starts at y≈348; setup/moves off-screen | **Unplayable: empty ranks 0 px, board clipped** |
| 568×320 landscape | 80 | rows 48.85/0; columns 44 | status y≈278.8 | **Unplayable: pieces overflow, ranks clipped** |

### R-01 — Critical — Landscape phones are unplayable

**Evidence.** `styles.css:134`:

```css
.board-frame { width: 100%; max-width: min(720px, calc(100vh - 240px)); }
```

At 375 px viewport height this computes to 135 px. Combined with `grid-template-columns: repeat(8, 1fr)` and the 44 px piece min-content (`styles.css:153`), the eight columns need 352 px and are clipped by `overflow: hidden` (`styles.css:139`). Rows: four occupied at 44 px and four empty at 0 px, total 176 px, also clipped. The result is a non-interactive strip, not a board.

**Impact.** Any phone rotated to landscape cannot be used. This also affects browser windows with short heights (split screen, small laptop windows).

**Recommendation.** Apply the `minmax(0, 1fr)` tracks and the 280 px floor from L-01; use `100dvh` instead of `100vh`; and add the optional two-column landscape layout for widths ≥700 px. A 280 px board with vertical scrolling is far better than a clipped 135 px board with 0 px empty ranks.

### R-02 — High — 320 px portrait fails target size

**Evidence.** At 320×568 the board is 296 px; empty squares measure **37×23.2 px**. The `hint` dot is 26% of both dimensions, so it is 9.6×6.1 px — an ellipse.

**Impact.** WCAG 2.5.8 (24×24) fails on the empty ranks; touch users will mis-tap. The legal-move indicator is not a reliable shape.

**Recommendation.** Square tracks (L-01) make the cells 37×37 at 320 px, which passes; keep the minimum board at 280 px so cells never fall below 35 px. Increase the hint dot to 28–30% of the square.

### R-03 — Medium — `100vh - 240px` is a magic number and unstable on mobile

**Evidence.** `styles.css:134`. The 240 px mixes topbar (60), strips (2×44), padding (24 top + 48 bottom) and a cushion; it is not derived from the actual layout. On mobile browsers, `100vh` may report the large viewport (toolbar hidden), so the board can be taller than the visible area and push the bottom strip/status under the toolbar.

**Impact.** The board size is unpredictable; on some devices the bottom player strip is partially hidden; at 200% zoom on a 1280×1024 screen the computed board is 272 px while the 8×44 px columns need 352 px — the board clips (1.4.4). At 400% zoom the computed board is 16 px. **Needs runtime verification at 200%/400% zoom.**

**Recommendation.** Use `100dvh` with a floor and let the page scroll:

```css
max-width: min(720px, calc(100dvh - 212px));
min-width: min(280px, 100%);
```

The exact subtraction should be derived from the actual chrome: topbar 60 + strips 88 + main padding 24 + gap 16 + a 24 px cushion = 212. Verify at 200% zoom and on iOS Safari with the toolbar visible/hidden.

### R-04 — Medium — Desktop board is capped below the available column

**Evidence.** At 1024×768 the board column is 636 px wide, but the board is 528 px (`100vh - 240`); at 1440×900 the column is 852 px, but the board is 660 px. The board never reaches its 720 px intent on common laptop heights.

**Impact.** The primary content is smaller than the space available; pieces are 44 px in 82.5×104.5 cells at 1440, so the board looks sparse. Users get less board for the same page.

**Recommendation.** Prefer width once the viewport is tall enough, or allow a small vertical scroll: `max-width: min(720px, 100%)` with `calc(100dvh - 212px)` as a soft cap only when it exceeds 480 px. Re-check at 1024×768 and 1440×900.

### R-05 — Low — 320 px header fits with zero slack

**Evidence.** Runtime: `scrollWidth === clientWidth === 320`; `.brand-tag` is hidden at ≤640 (`styles.css:340`), and `.btn` shrinks to 7×10 px / 12 px (`styles.css:341`).

**Impact.** Passes today, but any longer label, larger text setting or localization overflows the header.

**Recommendation.** Allow the brand word to truncate or wrap the action group; test at 320 px with 200% text size and with “New game”/“Flip board” localized.

### R-06 — Low — Sticky side panel behaves correctly

**Evidence.** At 1024×768 with 16 plies, the side panel grows to ~890 px and scrolls normally; the top becomes negative at max scroll and the legend remains reachable. This was verified and is not a bug.

**Recommendation.** Keep the sticky behavior at desktop; it is a strength. Re-test after reordering the cards (L-02).

---

## 8. Prioritised action plan

Effort estimates assume one engineer familiar with the code; they exclude real screen-reader testing and visual QA.

### Quick wins — under 1 hour (highest impact per minute)

| # | Change | Files | Effort | Fixes |
|---|---|---|---|---|
| 1 | Add `grid-template-rows: repeat(8, minmax(0, 1fr))`; change columns to `minmax(0, 1fr)`; add `container-type: inline-size` and `font-size: min(9cqw, 44px)`; add a 280 px floor to `.board-frame` | `styles.css:134-153` | 20 min | L-01, R-01, R-02, hint distortion |
| 2 | Use solid glyphs for white and add a 1 px dark outline | `app.js:20-23`, `styles.css:161` | 10 min | V-01 |
| 3 | Replace state tints with `#0b0f16` rings/dots and dark focus outline | `styles.css:150, 165-194` | 15 min | V-02, V-03, A-03 |
| 4 | Raise `--faint` to `#7d8ca2`; set coordinates to `#17130e`, opacity 1 | `styles.css:11, 196-203` | 5 min | V-05, V-06 |
| 5 | Guard the move announcement so it cannot overwrite the result | `app.js:722, 764` | 5 min | A-05 (result) |
| 6 | Re-render strips after `gameOver` is set | `app.js:685-692` | 5 min | U-04 (stale turn ring) |

### Then — under half a day

| # | Change | Files | Effort | Fixes |
|---|---|---|---|---|
| 7 | Rebuild `renderBoard()` with `role="row"` wrappers, `aria-rowindex/colindex`, `aria-rowcount/colcount`, `aria-selected`, selected-cell label with legal targets | `app.js:484-542`, `index.html:38`, `styles.css:135` | 3–4 h | A-01, A-02 |
| 8 | Add the announcement policy (selection, illegal, check, thinking, result, undo, new game) and remove the duplicate toast/live for undo | `app.js:467-475, 707-817` | 2 h | A-05, U-01, U-07 |
| 9 | Make promotion and game-over true modals: `aria-modal`, focus, trap, Escape/cancel, restore focus, full piece names | `index.html:39-52`, `app.js:685-749` | 2 h | U-03, U-04, A-04 |
| 10 | Add illegal-move feedback (toast + live + keep selection) | `app.js:707-724, 844-857` | 45 min | U-01 |
| 11 | Change `.board` to `touch-action: manipulation`; gate drag behind a threshold or make click-to-move the touch default | `styles.css:141`, `app.js:890-904` | 45 min | A-06 |
| 12 | Replace fake radio groups with native radios/fieldset or implement roving tabindex + arrows; fix the `label for` | `index.html:72-90`, `app.js:937-958` | 1 h | A-07 |
| 13 | Add h1, `tabindex="-1"` on main, `scroll-margin-top`, and the missing keyboard line in the legend | `index.html:12, 28, 101-109` | 30 min | A-08, U-06 |
| 14 | Add captured/material accessible labels and `aria-hidden` on glyphs/coordinates | `index.html:30-60`, `app.js:499-510, 528-532, 574-585` | 45 min | A-09, A-10 |
| 15 | Add a confirmation or undo toast for New game | `app.js:926` | 30 min | L-04 |
| 16 | Use `100dvh`, derive the board cap from the actual chrome, add the landscape two-column rule | `styles.css:134` | 1 h | R-01, R-03, R-04 |

### Later — structural

| # | Change | Effort | Why |
|---|---|---|---|
| 17 | Move the search to a Web Worker with a time budget and cancellation; remove the fixed 260 ms delay | 0.5–1 day | U-02; removes multi-second freezes |
| 18 | Replace Unicode pieces with two-tone SVG sprites from one source | 0.5–1 day | V-01 durability, cross-platform consistency, easier states |
| 19 | Complete the token layer and write `DESIGN.md` (component inventory, state matrix, Do/Don’t, token contract) | 0.5 day | V-04; prevents drift |
| 20 | Add game persistence/resume and optional URL state | 0.5–1 day | L-03 |
| 21 | Add move-list review (click a move to restore `posBefore`, then return to live) | 0.5 day | L-06 |
| 22 | Add automated checks: axe-core on load and after moves; Playwright geometry assertions (square cells, no clipping at 320/812×375, 200% zoom); visual regression for state layers | 1 day | Prevents regressions; makes the audit's measurements a gate |
| 23 | Real AT testing: NVDA + Firefox/Chrome, VoiceOver + Safari, iOS/Android touch, 200%/400% zoom, forced-colors | 0.5 day | Closes the remaining “needs runtime verification” items |

**Definition of done for the accessibility work:** the AX tree exposes a `grid` with 8 `row`s and 64 `gridcell`s; selection and legal targets are announced; check, turn and result each produce one announcement; promotion and game over are modal, focus-managed and cancellable; every square is at least 24×24 CSS px at 320 px; every state indicator is ≥3:1 against both square colors; the board is square at every viewport; and 200% zoom does not clip the board.

---

## 9. Assumptions, limitations and open questions

### Confirmed requirements (from the product description and README)

- Complete FIDE rules, legal-move hints, three AI levels.
- Click, drag and keyboard input.
- Responsive layout, reduced-motion support, no dependencies or build step.
- Public, MIT, no secrets.

### Assumptions (not supplied by the product owner)

- **Audience:** casual chess players on desktop and phone, playing one game against the computer; no accounts, no multiplayer, no persistence requirement stated.
- **Dark-only UI is intentional.** No light theme or `prefers-color-scheme` support exists; this audit treats that as a brand choice, not a defect.
- **Board maximum of 720 px is intentional** (`styles.css:134`).
- **Severity and the 0–100 scores are expert judgment**, not user-research findings; no analytics, usability sessions or support data were provided. The score is weighted toward the stated “highest-value” accessibility scope.
- **Contrast is computed against the nearest flat color.** Backdrop-blur surfaces (topbar, overlay) and the radial gradient’s outer stops are approximated; the reported values are the best case for the blurred surfaces and the center for the check glow. The check edge is lower than 1.60/1.20.
- **Runtime measurements are from local Chromium on a desktop-class machine.** Actual mobile performance, iOS Safari `touch-action` behavior, and dynamic viewport units need device testing.

### Limitations

- No screen reader (NVDA/JAWS/VoiceOver) was run; accessibility-tree structure and code behavior were inspected. Items marked **needs runtime verification** require AT testing.
- No real iOS/Android device was used; touch behavior is inferred from CSS semantics and pointer-event code.
- 200%/400% zoom and forced-colors mode were computed from the CSS, not fully exercised; they are flagged.
- Font glyph availability across platforms was not tested; the Unicode chess glyphs may render differently or fall back to a symbol font.
- Engine correctness/perft was not re-run; the audit is a design/UX/accessibility audit, not an engine review.

### Open questions for the product owner

1. **Persistence:** should a refresh resume the game, or is a fresh start acceptable?
2. **Settings model:** should level changes apply immediately, and side changes only on a new game? Should the UI show both “active” and “next game” values?
3. **Touch drag:** is drag on touch a must-have, or can click-to-move be the touch default so native scroll/pinch works?
4. **Board size:**
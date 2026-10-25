/* ============ Gambit — chess ============ */
(function () {
  "use strict";

  // ---------- Board representation ----------
  // 64-length array, index 0 = a8 ... 63 = h1. Pieces: "wP".."bK" or null.
  const FILES = "abcdefgh";
  const START = (() => {
    const b = new Array(64).fill(null);
    const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];
    for (let f = 0; f < 8; f++) {
      b[f] = "b" + back[f];
      b[8 + f] = "bP";
      b[48 + f] = "wP";
      b[56 + f] = "w" + back[f];
    }
    return b;
  })();

  const GLYPH = {
    wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
    bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
  };
  const VAL = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

  function sqName(i) { return FILES[i % 8] + (8 - Math.floor(i / 8)); }
  function fileOf(i) { return i % 8; }
  function rankOf(i) { return Math.floor(i / 8); } // 0 = rank 8

  // ---------- Game state ----------
  function newPosition() {
    return {
      board: START.slice(),
      turn: "w",
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      ep: null,            // en-passant target square index or null
      halfmove: 0,         // for 50-move rule
      fullmove: 1,
      kings: { w: 60, b: 4 },
    };
  }

  function clonePosition(p) {
    return {
      board: p.board.slice(),
      turn: p.turn,
      castling: { ...p.castling },
      ep: p.ep,
      halfmove: p.halfmove,
      fullmove: p.fullmove,
      kings: { ...p.kings },
    };
  }

  // ---------- Move generation ----------
  // Move: { from, to, piece, capture, promo, flags: "ep"|"castleK"|"castleQ"|null }

  function onBoard(f, r) { return f >= 0 && f < 8 && r >= 0 && r < 8; }
  const KNIGHT_D = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const BISHOP_D = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const ROOK_D = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const KING_D = [...BISHOP_D, ...ROOK_D];

  function colorOf(piece) { return piece[0]; }
  function typeOf(piece) { return piece[1]; }

  function pseudoMoves(pos, forColor) {
    const moves = [];
    const b = pos.board;
    const push = (from, to, promo) => {
      moves.push({
        from, to,
        piece: b[from],
        capture: b[to] || (promo === undefined ? null : null),
        promo: promo || null,
        flags: null,
      });
    };
    const slide = (from, dirs) => {
      const f0 = fileOf(from), r0 = rankOf(from);
      for (const [df, dr] of dirs) {
        let f = f0 + df, r = r0 + dr;
        while (onBoard(f, r)) {
          const idx = r * 8 + f;
          const target = b[idx];
          if (!target) push(from, idx);
          else {
            if (colorOf(target) !== forColor) push(from, idx);
            break;
          }
          f += df; r += dr;
        }
      }
    };

    for (let i = 0; i < 64; i++) {
      const piece = b[i];
      if (!piece || colorOf(piece) !== forColor) continue;
      const t = typeOf(piece);
      const f0 = fileOf(i), r0 = rankOf(i);

      if (t === "P") {
        const dir = forColor === "w" ? -1 : 1;
        const startRank = forColor === "w" ? 6 : 1;
        const promoRank = forColor === "w" ? 0 : 7;
        // Forward.
        const one = (r0 + dir) * 8 + f0;
        if (onBoard(f0, r0 + dir) && !b[one]) {
          if (r0 + dir === promoRank) {
            for (const pr of ["Q", "R", "B", "N"]) push(i, one, pr);
          } else push(i, one);
          // Double-step.
          if (r0 === startRank) {
            const two = (r0 + 2 * dir) * 8 + f0;
            if (!b[two]) push(i, two);
          }
        }
        // Captures (incl. en passant).
        for (const df of [-1, 1]) {
          const f = f0 + df, r = r0 + dir;
          if (!onBoard(f, r)) continue;
          const idx = r * 8 + f;
          if (b[idx] && colorOf(b[idx]) !== forColor) {
            if (r === promoRank) {
              for (const pr of ["Q", "R", "B", "N"]) push(i, idx, pr);
            } else push(i, idx);
          } else if (!b[idx] && pos.ep === idx) {
            moves.push({ from: i, to: idx, piece: b[i], capture: b[idx - dir * 8], promo: null, flags: "ep" });
          }
        }
      } else if (t === "N") {
        for (const [df, dr] of KNIGHT_D) {
          const f = f0 + df, r = r0 + dr;
          if (!onBoard(f, r)) continue;
          const idx = r * 8 + f;
          if (!b[idx] || colorOf(b[idx]) !== forColor) push(i, idx);
        }
      } else if (t === "B") slide(i, BISHOP_D);
      else if (t === "R") slide(i, ROOK_D);
      else if (t === "Q") slide(i, KING_D);
      else if (t === "K") {
        for (const [df, dr] of KING_D) {
          const f = f0 + df, r = r0 + dr;
          if (!onBoard(f, r)) continue;
          const idx = r * 8 + f;
          if (!b[idx] || colorOf(b[idx]) !== forColor) push(i, idx);
        }
        // Castling: squares empty, not through attack, rights intact.
        const home = forColor === "w" ? 60 : 4;
        if (i === home && !isAttacked(pos, home, forColor === "w" ? "b" : "w")) {
          const enemy = forColor === "w" ? "b" : "w";
          const kRight = forColor === "w" ? pos.castling.wK : pos.castling.bK;
          const qRight = forColor === "w" ? pos.castling.wQ : pos.castling.bQ;
          if (kRight && !b[home + 1] && !b[home + 2] &&
              b[home + 3] === forColor + "R" &&
              !isAttacked(pos, home + 1, enemy) && !isAttacked(pos, home + 2, enemy)) {
            moves.push({ from: i, to: home + 2, piece: b[i], capture: null, promo: null, flags: "castleK" });
          }
          if (qRight && !b[home - 1] && !b[home - 2] && !b[home - 3] &&
              b[home - 4] === forColor + "R" &&
              !isAttacked(pos, home - 1, enemy) && !isAttacked(pos, home - 2, enemy)) {
            moves.push({ from: i, to: home - 2, piece: b[i], capture: null, promo: null, flags: "castleQ" });
          }
        }
      }
    }
    return moves;
  }

  function isAttacked(pos, sq, byColor) {
    const b = pos.board;
    const f0 = fileOf(sq), r0 = rankOf(sq);
    // Pawns.
    const pDir = byColor === "w" ? 1 : -1; // attacker pawn sits one rank "behind" in its move direction
    for (const df of [-1, 1]) {
      const f = f0 + df, r = r0 + pDir;
      if (onBoard(f, r) && b[r * 8 + f] === byColor + "P") return true;
    }
    // Knights.
    for (const [df, dr] of KNIGHT_D) {
      const f = f0 + df, r = r0 + dr;
      if (onBoard(f, r) && b[r * 8 + f] === byColor + "N") return true;
    }
    // King.
    for (const [df, dr] of KING_D) {
      const f = f0 + df, r = r0 + dr;
      if (onBoard(f, r) && b[r * 8 + f] === byColor + "K") return true;
    }
    // Sliders.
    const rays = [
      { dirs: BISHOP_D, types: ["B", "Q"] },
      { dirs: ROOK_D, types: ["R", "Q"] },
    ];
    for (const { dirs, types } of rays) {
      for (const [df, dr] of dirs) {
        let f = f0 + df, r = r0 + dr;
        while (onBoard(f, r)) {
          const p = b[r * 8 + f];
          if (p) {
            if (colorOf(p) === byColor && types.includes(typeOf(p))) return true;
            break;
          }
          f += df; r += dr;
        }
      }
    }
    return false;
  }

  function inCheck(pos, color) {
    return isAttacked(pos, pos.kings[color], color === "w" ? "b" : "w");
  }

  function applyMove(pos, move) {
    const b = pos.board;
    const p = b[move.from];
    const color = colorOf(p);
    const next = clonePosition(pos);

    // Move piece.
    next.board[move.to] = move.promo ? color + move.promo : p;
    next.board[move.from] = null;

    // En passant capture.
    if (move.flags === "ep") {
      next.board[move.to + (color === "w" ? 8 : -8)] = null;
    }
    // Castling: move the rook too.
    if (move.flags === "castleK") {
      const home = color === "w" ? 60 : 4;
      next.board[home + 1] = next.board[home + 3];
      next.board[home + 3] = null;
    }
    if (move.flags === "castleQ") {
      const home = color === "w" ? 60 : 4;
      next.board[home - 1] = next.board[home - 4];
      next.board[home - 4] = null;
    }

    // King square cache.
    if (typeOf(p) === "K") next.kings[color] = move.to;

    // Castling rights.
    if (typeOf(p) === "K") {
      if (color === "w") { next.castling.wK = false; next.castling.wQ = false; }
      else { next.castling.bK = false; next.castling.bQ = false; }
    }
    if (move.from === 63 || move.to === 63) next.castling.wK = false; // h1
    if (move.from === 56 || move.to === 56) next.castling.wQ = false; // a1
    if (move.from === 7 || move.to === 7) next.castling.bK = false;   // h8
    if (move.from === 0 || move.to === 0) next.castling.bQ = false;   // a8

    // En passant target.
    next.ep = null;
    if (typeOf(p) === "P" && Math.abs(rankOf(move.to) - rankOf(move.from)) === 2) {
      next.ep = (rankOf(move.from) + rankOf(move.to)) / 2 * 8 + fileOf(move.from);
    }

    // Clocks.
    if (typeOf(p) === "P" || move.capture || move.flags === "ep") next.halfmove = 0;
    else next.halfmove = pos.halfmove + 1;
    if (color === "b") next.fullmove = pos.fullmove + 1;
    next.turn = color === "w" ? "b" : "w";

    return next;
  }

  function legalMoves(pos) {
    const out = [];
    for (const m of pseudoMoves(pos, pos.turn)) {
      const after = applyMove(pos, m);
      if (!inCheck(after, pos.turn)) out.push(m);
    }
    return out;
  }

  // ---------- Game-end detection ----------
  function insufficientMaterial(board) {
    const pieces = board.filter(Boolean);
    if (pieces.length === 2) return true; // K vs K
    if (pieces.length === 3) {
      const nonKings = pieces.filter(p => typeOf(p) !== "K");
      if (nonKings.every(p => typeOf(p) === "N" || typeOf(p) === "B")) return true;
    }
    if (pieces.length === 4) {
      const nonKings = pieces.filter(p => typeOf(p) !== "K");
      const sameColorBishops = nonKings.length === 2 &&
        nonKings.every(p => typeOf(p) === "B") &&
        colorOf(nonKings[0]) !== colorOf(nonKings[1]) &&
        (fileOf(board.indexOf(nonKings[0])) + rankOf(board.indexOf(nonKings[0]))) % 2 ===
        (fileOf(board.indexOf(nonKings[1])) + rankOf(board.indexOf(nonKings[1]))) % 2;
      if (sameColorBishops) return true;
    }
    return false;
  }

  function positionKey(pos) {
    return pos.board.map(p => p || ".").join("") + "|" + pos.turn + "|" +
      (pos.castling.wK ? "K" : "") + (pos.castling.wQ ? "Q" : "") +
      (pos.castling.bK ? "k" : "") + (pos.castling.bQ ? "q" : "") + "|" + (pos.ep ?? "-");
  }

  // ---------- SAN notation ----------
  function moveToSan(pos, move, allLegal) {
    const p = pos.board[move.from];
    const t = typeOf(p);
    if (move.flags === "castleK") return "O-O";
    if (move.flags === "castleQ") return "O-O-O";
    let san = "";
    if (t === "P") {
      if (move.capture || move.flags === "ep") san += FILES[fileOf(move.from)] + "x";
      san += sqName(move.to);
      if (move.promo) san += "=" + move.promo;
    } else {
      san += t;
      // Disambiguation.
      const same = allLegal.filter(m => m !== move && m.to === move.to &&
        typeOf(pos.board[m.from]) === t && m.from !== move.from);
      if (same.length) {
        const sameFile = same.some(m => fileOf(m.from) === fileOf(move.from));
        const sameRank = same.some(m => rankOf(m.from) === rankOf(move.from));
        if (!sameFile) san += FILES[fileOf(move.from)];
        else if (!sameRank) san += String(8 - rankOf(move.from));
        else san += sqName(move.from);
      }
      if (move.capture) san += "x";
      san += sqName(move.to);
    }
    const after = applyMove(pos, move);
    const oppMoves = legalMoves(after);
    if (inCheck(after, after.turn)) {
      san += oppMoves.length ? "+" : "#";
    }
    return san;
  }

  // ---------- AI: minimax + alpha-beta ----------
  // Piece-square tables (white perspective, index 0 = a8).
  const PST = {
    P: [ 0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10,
         5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5,
         5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0 ],
    N: [ -50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40,
         -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30,
         -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30,
         -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50 ],
    B: [ -20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10,
         -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10,
         -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10,
         -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20 ],
    R: [ 0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5,
         -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
         -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0 ],
    Q: [ -20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10,
         -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5,
         0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10,
         -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20 ],
    K: [ -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
         -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
         -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10,
         20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20 ],
  };

  function evaluate(pos) {
    let score = 0;
    for (let i = 0; i < 64; i++) {
      const p = pos.board[i];
      if (!p) continue;
      const t = typeOf(p);
      const pstIdx = colorOf(p) === "w" ? i : 63 - i;
      const v = VAL[t] + (PST[t] ? PST[t][pstIdx] : 0);
      score += colorOf(p) === "w" ? v : -v;
    }
    return score; // + = white ahead
  }

  const SEARCH = {
    1: { depth: 2, rand: 60 },
    2: { depth: 3, rand: 14 },
    3: { depth: 4, rand: 0 },
  };

  function orderMoves(moves) {
    // Captures and promotions first (MVV-LVA-ish).
    return moves.slice().sort((a, b) => scoreMove(b) - scoreMove(a));
    function scoreMove(m) {
      let s = 0;
      if (m.capture) s += 10 * VAL[typeOf(m.capture)] - VAL[typeOf(m.piece)];
      if (m.promo) s += VAL[m.promo];
      return s;
    }
  }

  function minimax(pos, depth, alpha, beta, aiColor) {
    const moves = legalMoves(pos);
    if (!moves.length) {
      if (inCheck(pos, pos.turn)) {
        // Checkmate: score from the loser's perspective.
        return pos.turn === aiColor ? -100000 - depth : 100000 + depth;
      }
      return 0; // stalemate
    }
    if (depth === 0) {
      const e = evaluate(pos);
      return aiColor === "w" ? e : -e;
    }
    let best = -Infinity;
    for (const m of orderMoves(moves)) {
      const val = -minimax(applyMove(pos, m), depth - 1, -beta, -alpha, aiColor);
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  function chooseAiMove(pos, level) {
    const cfg = SEARCH[level] || SEARCH[2];
    const moves = legalMoves(pos);
    if (!moves.length) return null;
    let bestScore = -Infinity;
    let best = [];
    for (const m of orderMoves(moves)) {
      const val = -minimax(applyMove(pos, m), cfg.depth - 1, -Infinity, Infinity, pos.turn);
      const jitter = cfg.rand ? Math.random() * cfg.rand : 0;
      const score = val + jitter;
      if (score > bestScore + 0.0001) { bestScore = score; best = [m]; }
      else if (Math.abs(score - bestScore) <= cfg.rand) best.push(m);
    }
    if (best.length > 1 && cfg.rand) return best[Math.floor(Math.random() * best.length)];
    return best[0];
  }

  // ---------- App state ----------
  const state = {
    pos: newPosition(),
    history: [],        // [{ move, san, posBefore }]
    positions: new Map(), // repetition key -> count
    selected: null,     // index of selected square
    legalForSelected: [],
    flipped: false,
    playerColor: "w",
    aiLevel: 2,
    pendingSide: "w",
    pendingLevel: 2,
    aiToken: 0,
    gameOver: null,     // { title, sub }
    thinking: false,
    pendingPromo: null, // { from, to }
    undoArmed: false,
    lastMove: null,
    dragged: null,
    focusSq: 52,        // roving tabindex for keyboard play
  };

  // ---------- DOM ----------
  const els = {};
  function cacheElements() {
    const ids = ["board", "promo-overlay", "promo-row", "game-over", "over-title", "over-sub",
      "over-new", "over-close", "top-captured", "bottom-captured", "top-score", "bottom-score",
      "top-strip", "bottom-strip", "top-name", "bottom-name",
      "status-dot", "status-turn", "status-detail", "new-game", "flip", "undo",
      "move-list", "moves-count", "toast", "live", "side-select", "lvl-select", "ctl-hint"];
    for (const id of ids) els[id] = document.getElementById(id);
  }

  // ---------- Toast / announce ----------
  let toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
  }
  function announce(msg) { els.live.textContent = msg; }

  // ---------- Rendering ----------
  function displayOrder() {
    const order = [];
    for (let i = 0; i < 64; i++) order.push(i);
    return state.flipped ? order.reverse() : order;
  }

  function renderBoard() {
    const frag = document.createDocumentFragment();
    const hadFocus = els.board.contains(document.activeElement);
    const checkSq = inCheck(state.pos, state.pos.turn) ? state.pos.kings[state.pos.turn] : null;

    for (const idx of displayOrder()) {
      const f = fileOf(idx), r = rankOf(idx);
      const light = (f + r) % 2 === 0;
      const sq = document.createElement("div");
      sq.className = "sq " + (light ? "light" : "dark");
      sq.dataset.sq = idx;
      sq.setAttribute("role", "gridcell");
      sq.setAttribute("aria-label", sqName(idx) + (state.pos.board[idx] ? " " + pieceName(state.pos.board[idx]) : " empty"));
      sq.setAttribute("tabindex", idx === state.focusSq ? "0" : "-1");

      // Coordinates on edges (respect flip).
      const showFile = state.flipped ? r === 0 : r === 7;
      const showRank = state.flipped ? f === 7 : f === 0;
      if (showFile) {
        const c = document.createElement("span");
        c.className = "coord file"; c.textContent = FILES[f];
        sq.appendChild(c);
      }
      if (showRank) {
        const c = document.createElement("span");
        c.className = "coord rank"; c.textContent = 8 - r;
        sq.appendChild(c);
      }

      if (state.lastMove && (idx === state.lastMove.from || idx === state.lastMove.to)) {
        sq.classList.add("lastmove");
      }
      if (idx === state.selected) sq.classList.add("sel");
      if (idx === checkSq) sq.classList.add("check");

      const legal = state.legalForSelected.find(m => m.to === idx);
      if (legal) {
        sq.classList.add("hint");
        if (state.pos.board[idx] || legal.flags === "ep") sq.classList.add("cap");
        sq.classList.add("hoverable");
      }

      const piece = state.pos.board[idx];
      if (piece) {
        const el = document.createElement("span");
        el.className = "piece " + colorOf(piece);
        el.textContent = GLYPH[piece];
        el.dataset.sq = idx;
        sq.appendChild(el);
      }
      frag.appendChild(sq);
    }
    els.board.innerHTML = "";
    els.board.appendChild(frag);
    if (hadFocus) {
      const el = els.board.querySelector(`.sq[data-sq="${state.focusSq}"]`);
      if (el) el.focus({ preventScroll: true });
    }
  }

  function pieceName(p) {
    const names = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight", P: "pawn" };
    return (colorOf(p) === "w" ? "white " : "black ") + names[typeOf(p)];
  }

  function renderStrips() {
    // Captured pieces: pieces of color X captured by the other side.
    const startCounts = { P: 8, N: 2, B: 2, R: 2, Q: 1, K: 1 };
    const current = { w: {}, b: {} };
    for (const p of state.pos.board) if (p) current[colorOf(p)][typeOf(p)] = (current[colorOf(p)][typeOf(p)] || 0) + 1;
    const missing = (color) => {
      const out = [];
      for (const t of ["Q", "R", "B", "N", "P"]) {
        const miss = startCounts[t] - (current[color][t] || 0);
        for (let i = 0; i < miss; i++) out.push(GLYPH[color + t]);
      }
      return out;
    };
    // Pieces each side has captured.
    const whiteTook = missing("b");
    const blackTook = missing("w");
    // If promotion happened, counts can go negative; clamp visuals.
    const clamp = (arr, max) => arr.slice(0, 16);

    const topColor = state.flipped ? "w" : "b";
    const bottomColor = topColor === "w" ? "b" : "w";
    const colorName = (c) => (c === "w" ? "white" : "black");

    els["top-captured"].textContent = clamp(topColor === "w" ? whiteTook : blackTook).join("");
    els["bottom-captured"].textContent = clamp(bottomColor === "w" ? whiteTook : blackTook).join("");
    els["top-captured"].setAttribute("aria-label", "Pieces captured by " + colorName(topColor));
    els["bottom-captured"].setAttribute("aria-label", "Pieces captured by " + colorName(bottomColor));

    // Material score (in pawns) — positive for white.
    let score = 0;
    for (const p of state.pos.board) {
      if (!p || typeOf(p) === "K") continue;
      score += colorOf(p) === "w" ? VAL[typeOf(p)] : -VAL[typeOf(p)];
    }
    const advantage = (c) => Math.round((c === "w" ? Math.max(score, 0) : Math.max(-score, 0)) / 100);
    els["top-score"].textContent = advantage(topColor) ? "+" + advantage(topColor) : "—";
    els["bottom-score"].textContent = advantage(bottomColor) ? "+" + advantage(bottomColor) : "—";

    // Turn highlight.
    const turnIsTop = (state.pos.turn === "b") !== state.flipped;
    els["top-strip"].classList.toggle("strip-turn", turnIsTop && !state.gameOver);
    els["bottom-strip"].classList.toggle("strip-turn", !turnIsTop && !state.gameOver);

    // Names and king icons follow the strip's color.
    const you = "You (" + colorName(state.playerColor) + ")";
    const cpu = "Computer (" + colorName(state.playerColor === "w" ? "b" : "w") + ")";
    els["top-name"].textContent = topColor === state.playerColor ? you : cpu;
    els["bottom-name"].textContent = bottomColor === state.playerColor ? you : cpu;
    els["top-strip"].querySelector(".strip-piece").textContent = GLYPH[topColor + "K"];
    els["bottom-strip"].querySelector(".strip-piece").textContent = GLYPH[bottomColor + "K"];
  }

  function renderMoves() {
    const rows = [];
    for (let i = 0; i < state.history.length; i += 2) {
      const num = i / 2 + 1;
      const w = state.history[i];
      const b = state.history[i + 1];
      rows.push(`<li class="move-row"><span class="move-no">${num}.</span>` +
        `<span class="move-san${i === state.history.length - 1 ? " latest" : ""}">${w ? w.san : ""}</span>` +
        `<span class="move-san${i + 1 === state.history.length - 1 ? " latest" : ""}">${b ? b.san : ""}</span></li>`);
    }
    els["move-list"].innerHTML = rows.join("");
    els["move-list"].scrollTop = els["move-list"].scrollHeight;
    const n = state.history.length;
    els["moves-count"].textContent = n + (n === 1 ? " move" : " moves");
  }

  function renderStatus() {
    els.undo.disabled = !state.history.length || state.thinking;
    const dot = els["status-dot"];
    dot.className = "status-dot";
    if (state.gameOver) {
      dot.classList.add("alert");
      els["status-turn"].textContent = state.gameOver.title;
      els["status-detail"].textContent = state.gameOver.sub;
      return;
    }
    if (state.thinking) {
      dot.classList.add("think");
      els["status-turn"].textContent = "Computer thinking…";
      els["status-detail"].textContent = "Searching for the best reply";
      return;
    }
    const yourTurn = state.pos.turn === state.playerColor;
    els["status-turn"].textContent = yourTurn ? "Your move" : "Computer's move";
    if (inCheck(state.pos, state.pos.turn)) {
      dot.classList.add("alert");
      els["status-detail"].textContent = (yourTurn ? "You are" : "The computer is") + " in check";
    } else {
      els["status-detail"].textContent = yourTurn
        ? "Move " + state.pos.fullmove + " · playing " + (state.playerColor === "w" ? "white" : "black")
        : "Move " + state.pos.fullmove + " · level " + ["", "casual", "sharp", "ruthless"][state.aiLevel];
    }
  }

  function renderAll() {
    renderBoard();
    renderStrips();
    renderMoves();
    renderStatus();
  }

  // ---------- Game flow ----------
  function recordPosition(pos) {
    const key = positionKey(pos);
    state.positions.set(key, (state.positions.get(key) || 0) + 1);
    return state.positions.get(key);
  }

  function checkGameOver() {
    const moves = legalMoves(state.pos);
    if (!moves.length) {
      if (inCheck(state.pos, state.pos.turn)) {
        const winner = state.pos.turn === "w" ? "Black" : "White";
        endGame("Checkmate", winner + " wins", "checkmate");
      } else {
        endGame("Stalemate", "Draw — no legal moves", "stalemate");
      }
      return true;
    }
    if (state.pos.halfmove >= 100) {
      endGame("Draw", "50-move rule", "fifty");
      return true;
    }
    if (insufficientMaterial(state.pos.board)) {
      endGame("Draw", "Insufficient material", "material");
      return true;
    }
    if (state.positions.get(positionKey(state.pos)) >= 3) {
      endGame("Draw", "Threefold repetition", "repetition");
      return true;
    }
    return false;
  }

  function endGame(title, sub, reason) {
    state.gameOver = { title, sub };
    els["over-title"].textContent = title;
    els["over-sub"].textContent = sub;
    els["game-over"].hidden = false;
    renderStatus();
    announce(title + ". " + sub);
  }

  function commitMove(move, san) {
    state.history.push({ move, san, posBefore: state.pos });
    state.pos = applyMove(state.pos, move);
    state.lastMove = move;
    state.selected = null;
    state.legalForSelected = [];
    const reps = recordPosition(state.pos);
    renderAll();
    if (!checkGameOver()) {
      maybeAiMove();
    }
  }

  function playerMove(from, to) {
    if (state.gameOver || state.thinking) return false;
    if (state.pos.turn !== state.playerColor) return false;
    const all = legalMoves(state.pos);
    const candidates = all.filter(m => m.from === from && m.to === to);
    if (!candidates.length) return false;

    if (candidates.length > 1) { // promotion choice
      state.pendingPromo = { from, to };
      showPromo(candidates);
      return true;
    }
    const move = candidates[0];
    const san = moveToSan(state.pos, move, all);
    commitMove(move, san);
    announce("You played " + san);
    return true;
  }

  function showPromo(candidates) {
    const color = state.playerColor;
    els["promo-row"].innerHTML = "";
    for (const t of ["Q", "R", "B", "N"]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "promo-btn " + color;
      btn.textContent = GLYPH[color + t];
      btn.setAttribute("aria-label", "Promote to " + t);
      btn.addEventListener("click", () => {
        const move = candidates.find(m => m.promo === t);
        els["promo-overlay"].hidden = true;
        state.pendingPromo = null;
        if (move) {
          const all = legalMoves(state.pos);
          const san = moveToSan(state.pos, move, all);
          commitMove(move, san);
          announce("You played " + san);
        }
      });
      els["promo-row"].appendChild(btn);
    }
    els["promo-overlay"].hidden = false;
  }

  function maybeAiMove() {
    if (state.gameOver || state.pos.turn === state.playerColor) return;
    const token = ++state.aiToken;
    state.thinking = true;
    renderStatus();
    // Let the UI paint before the search blocks.
    setTimeout(() => {
      if (token !== state.aiToken) return; // a new game superseded this search
      const move = chooseAiMove(state.pos, state.aiLevel);
      state.thinking = false;
      if (!move) { checkGameOver(); return; }
      const san = moveToSan(state.pos, move, legalMoves(state.pos));
      commitMove(move, san);
      announce("Computer played " + san);
    }, 260);
  }

  function newGame() {
    state.aiToken++;
    state.playerColor = state.pendingSide;
    state.aiLevel = state.pendingLevel;
    state.flipped = state.playerColor === "b";
    state.focusSq = state.playerColor === "w" ? 52 : 12;
    state.pos = newPosition();
    state.history = [];
    state.positions = new Map();
    recordPosition(state.pos);
    state.selected = null;
    state.legalForSelected = [];
    state.gameOver = null;
    state.thinking = false;
    state.pendingPromo = null;
    state.lastMove = null;
    els["game-over"].hidden = true;
    els["promo-overlay"].hidden = true;
    els["ctl-hint"].textContent = "Playing " + (state.playerColor === "w" ? "white" : "black") + ".";
    renderAll();
    maybeAiMove();
  }

  function undo() {
    if (state.thinking || !state.history.length) return;
    // Undo back to the player's previous turn (usually 2 plies).
    let steps = 1;
    if (state.history.length >= 2 &&
        colorOf(state.history[state.history.length - 1].move.piece) !== state.playerColor) {
      steps = 2;
    }
    // If game over on player's own last move, just one.
    steps = Math.min(steps, state.history.length);
    for (let i = 0; i < steps; i++) {
      const h = state.history.pop();
      // Repetition count rollback.
      const key = positionKey(state.pos);
      const c = state.positions.get(key);
      if (c <= 1) state.positions.delete(key); else state.positions.set(key, c - 1);
      state.pos = h.posBefore;
    }
    state.gameOver = null;
    els["game-over"].hidden = true;
    state.lastMove = state.history.length ? state.history[state.history.length - 1].move : null;
    state.selected = null;
    state.legalForSelected = [];
    renderAll();
    toast("Move taken back");
    announce("Move taken back");
  }

  // ---------- Interaction ----------
  function squareFromEvent(ev) {
    const el = ev.target.closest(".sq");
    return el ? Number(el.dataset.sq) : null;
  }

  function selectSquare(idx) {
    const piece = state.pos.board[idx];
    if (piece && colorOf(piece) === state.playerColor && !state.gameOver && !state.thinking) {
      state.selected = idx;
      state.legalForSelected = legalMoves(state.pos).filter(m => m.from === idx);
      renderBoard();
      return true;
    }
    return false;
  }

  function clearSelection() {
    state.selected = null;
    state.legalForSelected = [];
    renderBoard();
  }

  function bindEvents() {
    // Click-to-move.
    els.board.addEventListener("click", (ev) => {
      const idx = squareFromEvent(ev);
      if (idx === null) return;
      if (state.selected !== null) {
        const legal = state.legalForSelected.find(m => m.to === idx);
        if (legal) {
          playerMove(state.selected, idx);
          return;
        }
      }
      if (!selectSquare(idx)) {
        clearSelection();
      }
    });

    // Keyboard: arrows + enter (roving tabindex).
    els.board.addEventListener("focusin", (ev) => {
      const sq = ev.target.closest(".sq");
      if (!sq) return;
      const prev = els.board.querySelector('.sq[tabindex="0"]');
      if (prev && prev !== sq) prev.setAttribute("tabindex", "-1");
      sq.setAttribute("tabindex", "0");
      state.focusSq = Number(sq.dataset.sq);
    });
    els.board.addEventListener("keydown", (ev) => {
      const map = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 };
      if (map[ev.key] !== undefined) {
        ev.preventDefault();
        const next = state.focusSq + (state.flipped ? -map[ev.key] : map[ev.key]);
        if (next >= 0 && next < 64 && Math.abs(fileOf(next) - fileOf(state.focusSq)) <= 1) {
          state.focusSq = next;
          focusSquare(next);
        }
        return;
      }
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        const sqEl = squareEl(state.focusSq);
        if (sqEl) sqEl.click();
      }
    });
    function squareEl(i) { return els.board.querySelector(`.sq[data-sq="${i}"]`); }
    function focusSquare(i) { const el = squareEl(i); if (el) el.focus(); }

    // Drag & drop (pointer events). Selection is painted in place here so the
    // node being dragged is not replaced by a re-render mid-gesture.
    els.board.addEventListener("pointerdown", (ev) => {
      const idx = squareFromEvent(ev);
      if (idx === null) return;
      const piece = state.pos.board[idx];
      if (!piece || colorOf(piece) !== state.playerColor || state.gameOver || state.thinking) return;
      state.selected = idx;
      state.legalForSelected = legalMoves(state.pos).filter(m => m.from === idx);
      const sqEl = ev.target.closest(".sq");
      if (sqEl) sqEl.classList.add("sel");
      const pieceEl = ev.target.closest(".piece");
      if (!pieceEl) return;
      state.dragged = { from: idx, el: pieceEl };
      pieceEl.classList.add("dragging");
      try { pieceEl.setPointerCapture?.(ev.pointerId); } catch { /* pointer already released */ }
    });
    els.board.addEventListener("pointerup", (ev) => {
      if (!state.dragged) return;
      const { from, el } = state.dragged;
      el.classList.remove("dragging");
      state.dragged = null;
      const idx = squareFromEvent(ev);
      if (idx !== null && idx !== from) {
        if (!playerMove(from, idx)) renderBoard();
      } else {
        renderBoard();
      }
    });
    els.board.addEventListener("pointercancel", () => {
      if (state.dragged) {
        state.dragged.el.classList.remove("dragging");
        state.dragged = null;
        renderBoard();
      }
    });

    // Controls.
    els["new-game"].addEventListener("click", () => { newGame(); toast("New game"); });
    els["over-new"].addEventListener("click", () => newGame());
    els["over-close"].addEventListener("click", () => { els["game-over"].hidden = true; });
    els.flip.addEventListener("click", () => {
      state.flipped = !state.flipped;
      renderBoard();
      renderStrips();
    });
    els.undo.addEventListener("click", undo);

    // Setup controls.
    els["side-select"].addEventListener("click", (ev) => {
      const btn = ev.target.closest(".seg-btn");
      if (!btn) return;
      for (const b of els["side-select"].querySelectorAll(".seg-btn")) {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
      }
      state.pendingSide = btn.dataset.side;
      els["ctl-hint"].textContent = "Playing " + (state.pendingSide === "w" ? "white" : "black") + " — applies on the next new game.";
    });
    els["lvl-select"].addEventListener("click", (ev) => {
      const btn = ev.target.closest(".seg-btn");
      if (!btn) return;
      for (const b of els["lvl-select"].querySelectorAll(".seg-btn")) {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
      }
      state.pendingLevel = Number(btn.dataset.level);
      renderStatus();
    });
  }

  // ---------- Init ----------
  function init() {
    cacheElements();
    recordPosition(state.pos);
    bindEvents();
    renderAll();
  }

  document.addEventListener("DOMContentLoaded", init);

  // Expose a tiny API for QA (read-only).
  window.__gambit = {
    state,
    legalMoves,
    playerMove,
    newGame,
    applyMove,
    positionKey,
  };
})();

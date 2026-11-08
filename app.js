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

  const PIECE_SHAPE = {
    P: '<path d="M22 48c5-7 6-12 6-18h8c0 6 1 11 6 18Z"/><circle cx="32" cy="21" r="8"/><path d="M25 31h14v5H25Z"/>',
    N: '<path d="M20 48c1-8 5-13 11-19l-8 4-9-5 9-15 7-3 8 2 4 5c7 5 8 17 5 31Z"/><path d="m24 14 1-8 8 6M31 29l8-7M18 26l6 1" fill="none"/><path d="M36 33c-4 5-6 9-6 15" fill="none" stroke="var(--piece-detail)"/><circle cx="29" cy="20" r="1.7" fill="var(--piece-stroke)" stroke="none"/>',
    B: '<path d="M22 48c6-7 6-11 6-15-9-5-7-11 4-23 11 12 13 18 4 23 0 4 0 8 6 15Z"/><circle cx="32" cy="8" r="3"/><path d="m34 17-6 9" fill="none" stroke="var(--piece-detail)"/><path d="M24 35h16v5H24Z"/>',
    R: '<path d="M18 12h7v8h4v-8h6v8h4v-8h7v17l-7 6 3 13H22l3-13-7-6Z"/><path d="M19 29h26M25 35h14" fill="none" stroke="var(--piece-detail)"/>',
    Q: '<path d="m18 19 8 7 6-14 6 14 8-7-5 18H23Z"/><circle cx="17" cy="16" r="3"/><circle cx="32" cy="9" r="3"/><circle cx="47" cy="16" r="3"/><path d="M24 36h16l-2 6 5 6H21l5-6Z"/><path d="M25 41h14" fill="none" stroke="var(--piece-detail)"/>',
    K: '<path d="M29 5h6v6h6v6h-6v7h-6v-7h-6v-6h6Z"/><path d="M24 38c-1-7-9-9-7-16 1-6 10-5 15 2 5-7 14-8 15-2 2 7-6 9-7 16l3 10H21Z"/><path d="M24 38h16M32 25v12" fill="none" stroke="var(--piece-detail)"/>',
  };
  function pieceArtwork(piece) {
    return '<svg class="piece-art" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
      '<g fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">' +
      PIECE_SHAPE[typeOf(piece)] + '<path d="M19 48h26l5 9H14Z"/><path d="M20 53h24" fill="none" stroke="var(--piece-detail)"/></g></svg>';
  }
  const PIECE_NAME = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight", P: "pawn" };
  const LEVEL_NAME = ["", "Casual", "Sharp", "Ruthless"];
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
    lastMove: null,
    dragged: null,
    dragStart: null,
    dragGhost: null,
    focusSq: 52,        // roving tabindex for keyboard play
  };

  // ---------- DOM ----------
  const els = {};
  function cacheElements() {
    const ids = ["board", "promo-overlay", "promo-row", "game-over", "over-title", "over-sub",
      "over-new", "over-close", "top-captured", "bottom-captured", "top-score", "bottom-score",
      "top-strip", "bottom-strip", "top-name", "bottom-name",
      "status-card", "status-turn", "status-detail", "new-game", "flip", "undo",
      "move-list", "moves-count", "toast", "live", "ctl-hint", "apply-setup", "promo-cancel"];
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
  // Clear first so repeated identical messages are announced again.
  let announceTimer = null;
  function announce(msg) {
    els.live.textContent = "";
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => { els.live.textContent = msg; }, 50);
  }

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
    const order = displayOrder();

    for (let row = 0; row < 8; row++) {
      const rowEl = document.createElement("div");
      rowEl.className = "board-row";
      rowEl.setAttribute("role", "row");
      rowEl.setAttribute("aria-rowindex", String(row + 1));

      for (let col = 0; col < 8; col++) {
        const idx = order[row * 8 + col];
        const f = fileOf(idx), r = rankOf(idx);
        const light = (f + r) % 2 === 0;
        const piece = state.pos.board[idx];
        const legal = state.legalForSelected.find(m => m.to === idx);
        const isCapture = legal && (piece || legal.flags === "ep");

        const sq = document.createElement("div");
        sq.className = "sq " + (light ? "light" : "dark");
        sq.dataset.sq = idx;
        sq.setAttribute("role", "gridcell");
        sq.setAttribute("aria-colindex", String(col + 1));
        sq.setAttribute("aria-selected", idx === state.selected ? "true" : "false");
        sq.setAttribute("tabindex", idx === state.focusSq ? "0" : "-1");

        let label = sqName(idx) + ", " + (piece ? pieceName(piece) : "empty");
        if (idx === checkSq) label += ", king in check";
        if (idx === state.selected) label += ", selected";
        if (legal) label += isCapture ? ", legal capture" : ", legal move";
        sq.setAttribute("aria-label", label);

        // Coordinates on edges (respect flip).
        const showFile = state.flipped ? r === 0 : r === 7;
        const showRank = state.flipped ? f === 7 : f === 0;
        if (showFile) {
          const c = document.createElement("span");
          c.className = "coord file"; c.textContent = FILES[f];
          c.setAttribute("aria-hidden", "true");
          sq.appendChild(c);
        }
        if (showRank) {
          const c = document.createElement("span");
          c.className = "coord rank"; c.textContent = 8 - r;
          c.setAttribute("aria-hidden", "true");
          sq.appendChild(c);
        }

        if (state.lastMove && (idx === state.lastMove.from || idx === state.lastMove.to)) {
          sq.classList.add("lastmove");
        }
        if (idx === state.selected) sq.classList.add("sel");
        if (idx === checkSq) sq.classList.add("check");

        if (legal) {
          sq.classList.add("hint");
          if (isCapture) sq.classList.add("cap");
          sq.classList.add("hoverable");
        }

        if (piece) {
          const el = document.createElement("span");
          el.className = "piece " + colorOf(piece);
          el.innerHTML = pieceArtwork(piece);
          el.dataset.sq = idx;
          el.setAttribute("aria-hidden", "true");
          sq.appendChild(el);
        }
        rowEl.appendChild(sq);
      }
      frag.appendChild(rowEl);
    }
    els.board.innerHTML = "";
    els.board.appendChild(frag);
    if (hadFocus) {
      const el = els.board.querySelector(`.sq[data-sq="${state.focusSq}"]`);
      if (el) el.focus({ preventScroll: true });
    }
  }

  function pieceName(p) {
    return (colorOf(p) === "w" ? "white " : "black ") + PIECE_NAME[typeOf(p)];
  }

  function renderStrips() {
    // Captures come from moves actually made, so promotion cannot fabricate a
    // missing pawn and undo rolls the list back automatically.
    const capturesBy = (c) => state.history
      .filter(h => colorOf(h.move.piece) === c && h.move.capture)
      .map(h => h.move.capture);
    const group = (pieces) => {
      const counts = {};
      for (const p of pieces) counts[typeOf(p)] = (counts[typeOf(p)] || 0) + 1;
      return ["Q", "R", "B", "N", "P"].filter(t => counts[t]).map(t => ({ type: t, count: counts[t] }));
    };
    const whiteTook = group(capturesBy("w"));
    const blackTook = group(capturesBy("b"));

    const topColor = state.flipped ? "w" : "b";
    const bottomColor = topColor === "w" ? "b" : "w";
    const colorName = (c) => (c === "w" ? "white" : "black");
    const describe = (groups) => groups.length
      ? groups.map(g => g.count + " " + PIECE_NAME[g.type] + (g.count > 1 ? "s" : "")).join(", ")
      : "nothing";
    const capturedArt = (groups, color) => groups.flatMap(g => Array.from({ length: g.count }, () =>
      '<span class="captured-piece ' + color + '" aria-hidden="true">' + pieceArtwork(color + g.type) + '</span>'
    )).join("");

    const topGroups = topColor === "w" ? whiteTook : blackTook;
    const bottomGroups = bottomColor === "w" ? whiteTook : blackTook;
    els["top-captured"].innerHTML = capturedArt(topGroups, topColor === "w" ? "b" : "w");
    els["bottom-captured"].innerHTML = capturedArt(bottomGroups, bottomColor === "w" ? "b" : "w");
    els["top-captured"].setAttribute("aria-label",
      colorName(topColor) + " has captured " + describe(topGroups));
    els["bottom-captured"].setAttribute("aria-label",
      colorName(bottomColor) + " has captured " + describe(bottomGroups));

    // Material score (in pawns) — positive for white.
    let score = 0;
    for (const p of state.pos.board) {
      if (!p || typeOf(p) === "K") continue;
      score += colorOf(p) === "w" ? VAL[typeOf(p)] : -VAL[typeOf(p)];
    }
    const advantage = (c) => Math.round((c === "w" ? Math.max(score, 0) : Math.max(-score, 0)) / 100);
    const scoreLabel = (() => {
      const n = Math.round(Math.abs(score) / 100);
      if (!n) return "Material even";
      return colorName(score > 0 ? "w" : "b") + " ahead by " + n + " pawn" + (n === 1 ? "" : "s");
    })();
    els["top-score"].textContent = advantage(topColor) ? "+" + advantage(topColor) : "even";
    els["bottom-score"].textContent = advantage(bottomColor) ? "+" + advantage(bottomColor) : "even";
    els["top-score"].setAttribute("aria-label", scoreLabel);
    els["bottom-score"].setAttribute("aria-label", scoreLabel);

    // Turn highlight.
    const turnIsTop = (state.pos.turn === "b") !== state.flipped;
    els["top-strip"].classList.toggle("strip-turn", turnIsTop && !state.gameOver);
    els["bottom-strip"].classList.toggle("strip-turn", !turnIsTop && !state.gameOver);

    // Names and king icons follow the strip's color.
    const sideLabel = (c) => (c === "w" ? "White" : "Black");
    const you = "You · " + sideLabel(state.playerColor);
    const cpu = "Computer · " + sideLabel(state.playerColor === "w" ? "b" : "w");
    els["top-name"].textContent = topColor === state.playerColor ? you : cpu;
    els["bottom-name"].textContent = bottomColor === state.playerColor ? you : cpu;
    const topKing = els["top-strip"].querySelector(".strip-piece");
    const bottomKing = els["bottom-strip"].querySelector(".strip-piece");
    topKing.innerHTML = pieceArtwork(topColor + "K");
    topKing.className = "strip-piece " + topColor;
    bottomKing.innerHTML = pieceArtwork(bottomColor + "K");
    bottomKing.className = "strip-piece " + bottomColor;
  }

  function renderMoves() {
    const rows = [];
    for (let i = 0; i < state.history.length; i += 2) {
      const num = i / 2 + 1;
      const w = state.history[i];
      const b = state.history[i + 1];
      const row = document.createElement("li");
      row.className = "move-row";
      const no = document.createElement("span");
      no.className = "move-no";
      no.textContent = num + ".";
      const sanW = document.createElement("span");
      sanW.className = "move-san" + (i === state.history.length - 1 ? " latest" : "");
      sanW.textContent = w ? w.san : "";
      const sanB = document.createElement("span");
      sanB.className = "move-san" + (i + 1 === state.history.length - 1 ? " latest" : "");
      sanB.textContent = b ? b.san : "";
      row.append(no, sanW, sanB);
      rows.push(row);
    }
    const list = els["move-list"];
    list.textContent = "";
    rows.forEach(row => list.appendChild(row));
    list.scrollTop = list.scrollHeight;
    const n = state.history.length;
    const fullMoves = Math.ceil(n / 2);
    els["moves-count"].textContent = fullMoves + (fullMoves === 1 ? " move" : " moves");
  }

  function renderStatus() {
    els["status-card"].setAttribute("aria-busy", state.thinking ? "true" : "false");
    els.undo.disabled = !state.history.length || state.thinking;
    if (state.gameOver) {
      els["status-turn"].textContent = state.gameOver.title;
      els["status-detail"].textContent = state.gameOver.sub;
      return;
    }
    if (state.thinking) {
      els["status-turn"].textContent = "Computer thinking…";
      els["status-detail"].textContent = "Searching for the best reply";
      return;
    }
    const yourTurn = state.pos.turn === state.playerColor;
    els["status-turn"].textContent = yourTurn ? "Your move" : "Computer's move";
    if (inCheck(state.pos, state.pos.turn)) {
      els["status-detail"].textContent = (yourTurn ? "You are" : "The computer is") + " in check";
    } else {
      els["status-detail"].textContent = yourTurn
        ? "Move " + state.pos.fullmove + " · You play " + (state.playerColor === "w" ? "White" : "Black")
        : "Move " + state.pos.fullmove + " · " + LEVEL_NAME[state.aiLevel];
    }
  }

  function renderSetupHint() {
    const side = state.pendingSide === "w" ? "White" : "Black";
    const level = LEVEL_NAME[state.pendingLevel];
    const changed = state.pendingSide !== state.playerColor || state.pendingLevel !== state.aiLevel;
    els["ctl-hint"].textContent = changed
      ? "Next game: You play " + side + " · " + level + "."
      : "You play " + side + " · " + level + ".";
    els["apply-setup"].hidden = !changed;
  }

  function renderAll() {
    renderBoard();
    renderStrips();
    renderMoves();
    renderStatus();
    renderSetupHint();
  }

  // ---------- Modal dialogs ----------
  const modalState = { overlay: null, returnTo: null, inerted: [] };

  function focusables(root) {
    return [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(el => !el.disabled && el.offsetParent !== null);
  }

  function outsideNodes(overlay) {
    const out = new Set();
    let node = overlay.parentElement;
    while (node && node !== document.documentElement) {
      for (const sib of node.children) {
        if (sib === overlay || sib.contains(overlay)) continue;
        if (sib.tagName === "SCRIPT" || sib.tagName === "STYLE") continue;
        out.add(sib);
      }
      if (node === document.body) break;
      node = node.parentElement;
    }
    return out;
  }

  function openModal(overlay, preferred) {
    if (!overlay) return;
    if (modalState.overlay && modalState.overlay !== overlay) closeModal(modalState.overlay, false);
    modalState.overlay = overlay;
    const active = document.activeElement;
    modalState.returnTo = active && active !== document.body && active !== document.documentElement ? active : null;
    for (const el of outsideNodes(overlay)) {
      if (!("inert" in el)) continue;
      if (!el.inert) modalState.inerted.push(el);
      el.inert = true;
    }
    overlay.hidden = false;
    document.body.classList.add("modal-open");
    const target = preferred || focusables(overlay)[0] || overlay.querySelector("[role]") || overlay;
    if (target && target.focus) target.focus({ preventScroll: true });
  }

  function closeModal(overlay, restoreFocus = true) {
    if (!overlay) return;
    if (overlay.hidden && modalState.overlay !== overlay) return;
    overlay.hidden = true;
    for (const el of modalState.inerted) el.inert = false;
    modalState.inerted = [];
    if (modalState.overlay === overlay) modalState.overlay = null;
    document.body.classList.remove("modal-open");
    if (!restoreFocus) return;
    const target = modalState.returnTo && document.contains(modalState.returnTo)
      ? modalState.returnTo
      : els.board.querySelector('.sq[tabindex="0"]');
    modalState.returnTo = null;
    if (target && target.focus) target.focus({ preventScroll: true });
  }

  function onModalKeydown(ev) {
    const overlay = modalState.overlay;
    if (!overlay) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      if (overlay === els["promo-overlay"]) cancelPromo();
      else {
        closeModal(overlay);
        announce("Reviewing the final position. The game is over.");
      }
      return;
    }
    if (ev.key !== "Tab") return;
    const list = focusables(overlay);
    if (!list.length) { ev.preventDefault(); return; }
    const first = list[0], last = list[list.length - 1];
    const inside = overlay.contains(document.activeElement);
    if (ev.shiftKey && (!inside || document.activeElement === first)) {
      ev.preventDefault(); last.focus();
    } else if (!ev.shiftKey && (!inside || document.activeElement === last)) {
      ev.preventDefault(); first.focus();
    }
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
        const playerWon = state.pos.turn !== state.playerColor;
        endGame(playerWon ? "You win" : "Computer wins", "Checkmate", "checkmate");
      } else {
        endGame("Draw", "Stalemate — no legal moves", "stalemate");
      }
      return true;
    }
    if (state.pos.halfmove >= 100) {
      endGame("Draw", "Draw by the 50-move rule", "fifty");
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
    renderStrips();
    renderStatus();
    openModal(els["game-over"], els["over-new"]);
    announce(title + ". " + sub + ".");
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
    if (!state.gameOver) announce("You played " + san);
    return true;
  }

  function showPromo(candidates) {
    const color = state.playerColor;
    els["promo-row"].innerHTML = "";
    let firstBtn = null;
    for (const t of ["Q", "R", "B", "N"]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "promo-btn " + color;
      btn.innerHTML = pieceArtwork(color + t);
      btn.setAttribute("aria-label", "Promote to " + PIECE_NAME[t]);
      btn.addEventListener("click", () => {
        const move = candidates.find(m => m.promo === t);
        closeModal(els["promo-overlay"], false);
        state.pendingPromo = null;
        if (move) {
          const all = legalMoves(state.pos);
          const san = moveToSan(state.pos, move, all);
          commitMove(move, san);
          if (!state.gameOver) announce("You played " + san);
        }
        const cell = els.board.querySelector(`.sq[data-sq="${state.focusSq}"]`);
        if (cell) cell.focus({ preventScroll: true });
      });
      els["promo-row"].appendChild(btn);
      if (!firstBtn) firstBtn = btn;
    }
    openModal(els["promo-overlay"], firstBtn);
  }

  function cancelPromo() {
    state.pendingPromo = null;
    state.selected = null;
    state.legalForSelected = [];
    closeModal(els["promo-overlay"]);
    renderBoard();
    announce("Promotion cancelled");
  }

  function maybeAiMove() {
    if (state.gameOver || state.pos.turn === state.playerColor) return;
    const token = ++state.aiToken;
    state.thinking = true;
    renderStatus();
    // Announce after the player's own move, before the search blocks.
    setTimeout(() => {
      if (state.thinking && token === state.aiToken) announce("Computer thinking…");
    }, 120);
    // Let the UI paint before the search blocks.
    setTimeout(() => {
      if (token !== state.aiToken) return; // a new game superseded this search
      const move = chooseAiMove(state.pos, state.aiLevel);
      state.thinking = false;
      if (!move) { checkGameOver(); return; }
      const san = moveToSan(state.pos, move, legalMoves(state.pos));
      commitMove(move, san);
      if (!state.gameOver) announce("Computer played " + san);
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
    state.dragStart = null;
    state.dragged = null;
    clearDragGhost();
    closeModal(els["game-over"], false);
    closeModal(els["promo-overlay"], false);
    renderAll();
    maybeAiMove();
    announce("New game. You play " + (state.playerColor === "w" ? "White" : "Black") + " · " + LEVEL_NAME[state.aiLevel] + ".");
  }

  function requestNewGame() {
    const inProgress = state.history.length > 0 && !state.gameOver;
    if (inProgress && !window.confirm("Start a new game? Your current game and scoresheet will be lost.")) return false;
    newGame();
    toast("New game. You play " + (state.playerColor === "w" ? "White" : "Black") + " · " + LEVEL_NAME[state.aiLevel]);
    return true;
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
    const undone = state.history.slice(state.history.length - steps).map(h => colorOf(h.move.piece));
    for (let i = 0; i < steps; i++) {
      const h = state.history.pop();
      // Repetition count rollback.
      const key = positionKey(state.pos);
      const c = state.positions.get(key);
      if (c <= 1) state.positions.delete(key); else state.positions.set(key, c - 1);
      state.pos = h.posBefore;
    }
    state.gameOver = null;
    closeModal(els["game-over"]);
    state.lastMove = state.history.length ? state.history[state.history.length - 1].move : null;
    state.selected = null;
    state.legalForSelected = [];
    renderAll();
    const cpuColor = state.playerColor === "w" ? "b" : "w";
    const tookOwn = undone.includes(state.playerColor);
    const tookReply = undone.includes(cpuColor);
    if (tookOwn && tookReply) {
      toast("Move and reply taken back");
      announce("Your move and the computer's reply were taken back.");
    } else if (tookReply) {
      toast("Computer's move taken back");
      announce("The computer's move was taken back.");
    } else {
      toast("Move taken back");
      announce("Your move was taken back.");
    }
  }

  // ---------- Interaction ----------
  function squareFromEvent(ev) {
    const el = ev.target.closest(".sq");
    return el ? Number(el.dataset.sq) : null;
  }

  function squareFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const sq = el && el.closest(".sq");
    return sq ? Number(sq.dataset.sq) : null;
  }

  function clearDragGhost() {
    if (state.dragGhost) {
      state.dragGhost.remove();
      state.dragGhost = null;
    }
  }

  function placeDragGhost(x, y) {
    if (!state.dragGhost) return;
    state.dragGhost.style.left = x + "px";
    state.dragGhost.style.top = y + "px";
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
    function feedbackIllegal() {
      toast("That move isn't legal.");
      announce("That move isn't legal. Your selection is still active.");
    }

    // Click-to-move.
    els.board.addEventListener("click", (ev) => {
      const idx = squareFromEvent(ev);
      if (idx === null) return;
      if (state.selected !== null) {
        if (idx === state.selected) {
          clearSelection();
          announce("Selection cleared");
          return;
        }
        const legal = state.legalForSelected.find(m => m.to === idx);
        if (legal) {
          playerMove(state.selected, idx);
          return;
        }
        const target = state.pos.board[idx];
        if (!target || colorOf(target) !== state.playerColor) {
          feedbackIllegal();
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
      if (ev.key === "Escape") {
        if (state.selected !== null) {
          ev.preventDefault();
          clearSelection();
          announce("Selection cleared");
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

    // Drag & drop (pointer events). A small movement threshold keeps touch
    // swipes scrolling the page instead of grabbing a piece.
    els.board.addEventListener("pointerdown", (ev) => {
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      const idx = squareFromEvent(ev);
      if (idx === null) return;
      const piece = state.pos.board[idx];
      if (!piece || colorOf(piece) !== state.playerColor || state.gameOver || state.thinking) return;
      const pieceEl = ev.target.closest(".piece");
      if (!pieceEl) return;
      state.dragStart = { from: idx, el: pieceEl, x: ev.clientX, y: ev.clientY, id: ev.pointerId, active: false };
    });
    els.board.addEventListener("pointermove", (ev) => {
      const d = state.dragStart;
      if (!d || d.id !== ev.pointerId) return;
      if (!d.active) {
        if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 8) return;
        d.active = true;
        state.selected = d.from;
        state.legalForSelected = legalMoves(state.pos).filter(m => m.from === d.from);
        const sqEl = squareEl(d.from);
        if (sqEl) sqEl.classList.add("sel");
        state.dragged = { from: d.from, el: d.el };
        d.el.classList.add("dragging");
        const rect = d.el.getBoundingClientRect();
        const ghost = d.el.cloneNode(true);
        ghost.classList.remove("dragging");
        ghost.classList.add("drag-ghost");
        ghost.setAttribute("aria-hidden", "true");
        ghost.style.width = rect.width + "px";
        ghost.style.height = rect.height + "px";
        document.body.appendChild(ghost);
        state.dragGhost = ghost;
        placeDragGhost(ev.clientX, ev.clientY);
        for (const m of state.legalForSelected) {
          const cell = squareEl(m.to);
          if (!cell) continue;
          cell.classList.add("hint", "hoverable");
          if (state.pos.board[m.to] || m.flags === "ep") cell.classList.add("cap");
        }
        try { d.el.setPointerCapture?.(ev.pointerId); } catch { /* pointer already released */ }
      }
      placeDragGhost(ev.clientX, ev.clientY);
      const drop = squareFromPoint(ev.clientX, ev.clientY);
      for (const cell of els.board.querySelectorAll(".sq.drop")) cell.classList.remove("drop");
      if (drop !== null && drop !== d.from && state.legalForSelected.some(m => m.to === drop)) {
        const cell = squareEl(drop);
        if (cell) cell.classList.add("drop");
      }
      if (ev.cancelable) ev.preventDefault();
    });
    els.board.addEventListener("pointerup", (ev) => {
      const d = state.dragStart;
      state.dragStart = null;
      if (!d || !d.active) return; // a tap: the click handler owns it
      if (state.dragged) {
        state.dragged.el.classList.remove("dragging");
        state.dragged = null;
      }
      clearDragGhost();
      const idx = squareFromPoint(ev.clientX, ev.clientY);
      if (idx !== null && idx !== d.from) {
        if (!playerMove(d.from, idx)) {
          renderBoard();
          feedbackIllegal();
        }
      } else {
        renderBoard();
      }
    });
    els.board.addEventListener("pointercancel", () => {
      state.dragStart = null;
      if (state.dragged) {
        state.dragged.el.classList.remove("dragging");
        state.dragged = null;
      }
      clearDragGhost();
      renderBoard();
    });

    // Controls.
    els["new-game"].addEventListener("click", requestNewGame);
    els["apply-setup"].addEventListener("click", () => {
      if (!requestNewGame()) return;
      const cell = els.board.querySelector(`.sq[data-sq="${state.focusSq}"]`);
      if (cell) cell.focus({ preventScroll: true });
    });
    els["over-new"].addEventListener("click", () => {
      closeModal(els["game-over"], false);
      newGame();
    });
    els["over-close"].addEventListener("click", () => {
      closeModal(els["game-over"]);
      announce("Reviewing the final position. The game is over.");
    });
    els.flip.addEventListener("click", () => {
      state.flipped = !state.flipped;
      renderBoard();
      renderStrips();
      toast("Viewing from " + (state.flipped ? "Black" : "White") + " · You play " + (state.playerColor === "w" ? "White" : "Black"));
      announce("Board flipped. " + (state.flipped ? "You are viewing from black's side." : "You are viewing from white's side."));
    });
    els.undo.addEventListener("click", undo);
    els["promo-cancel"].addEventListener("click", cancelPromo);
    els["promo-overlay"].addEventListener("click", (ev) => {
      if (ev.target === els["promo-overlay"]) cancelPromo();
    });
    document.addEventListener("keydown", onModalKeydown);

    // Setup controls (native radios inside fieldsets).
    for (const input of document.querySelectorAll('input[name="side"]')) {
      input.addEventListener("change", () => {
        if (!input.checked) return;
        state.pendingSide = input.value;
        renderSetupHint();
        announce(els["ctl-hint"].textContent);
      });
    }
    for (const input of document.querySelectorAll('input[name="level"]')) {
      input.addEventListener("change", () => {
        if (!input.checked) return;
        state.pendingLevel = Number(input.value);
        renderSetupHint();
        announce(els["ctl-hint"].textContent);
      });
    }
  }

  // ---------- Init ----------
  function init() {
    cacheElements();
    recordPosition(state.pos);
    bindEvents();
    renderAll();
  }

  document.addEventListener("DOMContentLoaded", init);

  // Expose a tiny API for QA (read-only). Only enabled with ?qa=1 so the
  // published game does not hand out mutable game state.
  if (new URLSearchParams(window.location.search).get("qa") === "1") {
    window.__gambit = {
      state,
      legalMoves,
      playerMove,
      newGame,
      applyMove,
      positionKey,
    };
  }
})();

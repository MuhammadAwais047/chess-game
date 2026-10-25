# Gambit — Chess

A complete chess game in vanilla JavaScript: full FIDE rules, legal-move hints, three AI levels, and a responsive board with drag, click, and keyboard play.

**Live demo:** https://muhammadawais047.github.io/chess-game/

## Features

- Full FIDE rule set: castling, en passant, promotion (Q/R/B/N), check, checkmate, stalemate, threefold repetition, the 50-move rule, and insufficient-material draws.
- Alpha-beta minimax computer opponent with piece-square-table evaluation and three levels: Casual, Sharp, and Ruthless.
- Click, drag (mouse or touch), or keyboard input with a roving tabindex over the board.
- Legal-move dots and capture rings, last-move and check highlights, SAN move list, captured pieces, and live material score.
- Promotion picker, takeback, board flip, side selection, and a game-over summary.
- Responsive layout, reduced-motion support, and no dependencies or build step.

## Controls

- **Mouse / touch:** click or tap a piece, then a highlighted square. Or drag the piece onto its destination.
- **Keyboard:** Tab into the board, use the arrow keys to move the cursor, and Enter or Space to select and move.
- **Take back** rewinds to your previous turn (both your move and the computer's reply).

## How it works

The position is a 64-entry array in which index 0 is a8 and index 63 is h1. Move generation produces pseudo-legal moves, then filters out any that leave the mover's king attacked. The computer searches with alpha-beta pruning and piece-square-table evaluation; each level sets the search depth and amount of randomness. Rule correctness is verified with perft counts from the starting position and the Kiwipete position.

## Run locally

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## License

MIT — see [LICENSE](LICENSE).

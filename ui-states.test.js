(async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const revalidate = route => route.continue();
  await page.route('http://127.0.0.1:8765/**', revalidate);
  try {
    await page.goto('http://127.0.0.1:8765/');
    await page.waitForFunction(() => window.__gambit);
    const capture = await page.evaluate(() => {
      const g = window.__gambit;
      g.newGame();
      g.state.pos.board[52] = null;
      g.state.pos.board[36] = 'wP';
      g.state.pos.board[11] = null;
      g.state.pos.board[27] = 'bP';
      const ok = g.playerMove(36, 27);
      g.state.aiToken++;
      return { ok, capturedArt: document.querySelectorAll('#bottom-captured .captured-piece.b svg').length, label: document.getElementById('bottom-captured').getAttribute('aria-label'), score: document.getElementById('top-score').getAttribute('aria-label') };
    });
    check(capture.ok && capture.capturedArt === 1, 'Capturing a black pawn must show one black captured-piece illustration');
    check(capture.label === 'white has captured 1 pawn', 'Capture label must name the actual captured pawn');
    check(capture.score === 'white ahead by 1 pawn', 'Material label must describe the actual advantage');
    await page.evaluate(() => {
      const g = window.__gambit;
      g.newGame();
      const p = g.state.pos;
      p.board = Array(64).fill(null);
      p.board[60] = 'wK'; p.board[7] = 'bK'; p.board[8] = 'wP';
      p.kings = { w: 60, b: 7 };
      p.castling = { wK: false, wQ: false, bK: false, bQ: false };
      g.playerMove(8, 0);
    });
    check(await page.locator('#promo-row svg').count() === 4, 'Promotion must offer four illustrated pieces');
    const names = await page.locator('#promo-row button').evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label')));
    check(JSON.stringify(names) === JSON.stringify(['Promote to queen', 'Promote to rook', 'Promote to bishop', 'Promote to knight']), 'All four promotion options must announce full piece names');
    check(await page.locator('#promo-row svg').evaluateAll(nodes => new Set(nodes.map(n => n.innerHTML)).size) === 4, 'Promotion options must have four distinct illustrations');
    check(await page.locator('#promo-overlay').evaluate(el => el.contains(document.activeElement)), 'Promotion must receive focus');
    check(await page.locator('header').evaluate(el => el.inert), 'Background must be inert during promotion');
    await page.keyboard.press('Shift+Tab');
    check(await page.locator('#promo-cancel').evaluate(el => el === document.activeElement), 'Shift+Tab must wrap to the visible Cancel control');
    await page.keyboard.press('Tab');
    check(await page.locator('#promo-row button').first().evaluate(el => el === document.activeElement), 'Tab must wrap inside promotion');
    await page.keyboard.press('Escape');
    check(await page.locator('#promo-overlay').isHidden(), 'Escape must cancel promotion');
    check(await page.locator('#board').evaluate(el => el.contains(document.activeElement)), 'Cancelling promotion must restore board focus');
    await page.evaluate(() => window.__gambit.playerMove(8, 0));
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    check(await page.locator('#promo-overlay').isHidden(), 'Cancel must close promotion');
    await page.evaluate(() => window.__gambit.playerMove(8, 0));
    await page.getByRole('button', { name: 'Promote to queen', exact: true }).click();
    check(await page.evaluate(() => window.__gambit.state.pos.board[0]) === 'wQ', 'Promotion must place a white queen');
    check(await page.locator('.sq[data-sq="0"] .piece.w svg').count() === 1, 'Promoted queen must render a white illustration');
    await page.evaluate(() => {
      const g = window.__gambit;
      g.newGame();
      const p = g.state.pos;
      p.board = Array(64).fill(null);
      p.board[7] = 'wK'; p.board[4] = 'bK'; p.board[48] = 'bP'; p.board[0] = 'bR';
      p.kings = { w: 7, b: 4 };
      p.castling = { wK: false, wQ: false, bK: false, bQ: false };
      p.turn = 'b';
      g.state.playerColor = 'b';
      g.playerMove(48, 56);
    });
    check(await page.locator('#promo-row .promo-btn.b svg').count() === 4, 'Black promotion must offer black illustrations');
    await page.getByRole('button', { name: 'Promote to knight', exact: true }).click();
    check(await page.evaluate(() => window.__gambit.state.pos.board[56]) === 'bN', 'Black underpromotion must place a black knight');
    check(await page.locator('.sq[data-sq="56"] .piece.b svg').count() === 1, 'Underpromoted knight must render a black illustration');
    await page.evaluate(() => {
      const g = window.__gambit;
      g.newGame();
      const p = g.state.pos;
      p.board = Array(64).fill(null);
      p.board[21] = 'wK'; p.board[7] = 'bK'; p.board[22] = 'wQ';
      p.kings = { w: 21, b: 7 };
      p.castling = { wK: false, wQ: false, bK: false, bQ: false };
      g.playerMove(22, 14);
    });
    check(await page.getByRole('alertdialog').isVisible(), 'Qg7 checkmate must open the result dialog');
    check(await page.locator('#over-title').textContent() === 'You win', 'Result must use player-relative wording');
    check(await page.locator('#game-over').evaluate(el => el.contains(document.activeElement)), 'Result must contain focus');
    await page.getByRole('button', { name: 'Review board', exact: true }).click();
    check(await page.locator('#game-over').isHidden(), 'Review must close the result dialog');
    check(await page.locator('header').evaluate(el => !el.inert), 'Closing result must restore the background');
    return { status: 'passed', checks: ['captured illustration and material labels', 'four named distinct promotion choices', 'promotion focus trap and Escape', 'white queen promotion', 'black knight underpromotion', 'checkmate dialog and review'] };
  } finally {
    await page.unroute('http://127.0.0.1:8765/**', revalidate);
  }
})

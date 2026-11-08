(async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  const revalidate = route => route.continue();
  await page.route('http://127.0.0.1:8765/**', revalidate);
  try {
    await page.goto('http://127.0.0.1:8765/?qa=1');
    await page.waitForFunction(() => window.__gambit);

    // Setup: one persistent line, an explicit apply action, plain label.
    const initial = await page.evaluate(() => ({
      legend: document.querySelector('.controls-card legend')?.textContent,
      hint: document.getElementById('ctl-hint')?.textContent,
      applyHidden: document.getElementById('apply-setup')?.hidden,
      bottomName: document.getElementById('bottom-name')?.textContent,
      topName: document.getElementById('top-name')?.textContent,
      scoresheetHeaderHidden: document.querySelector('.moves-heading')?.getAttribute('aria-hidden'),
      statusDot: !!document.getElementById('status-dot'),
      tip: document.querySelector('.board-tip')?.textContent || '',
      material: document.getElementById('top-score')?.textContent,
      stroke: document.querySelector('#board .piece svg g')?.getAttribute('stroke-width'),
    }));
    check(initial.legend === 'Your side', 'Setup must label the colour choice as Your side');
    check(initial.hint === 'You play White · Sharp.', 'The setup hint must state the active side and level');
    check(initial.applyHidden === true, 'The apply action must stay hidden while nothing is pending');
    check(initial.bottomName === 'You · White' && initial.topName === 'Computer · Black', 'Player strips must use one consistent side phrasing');
    check(initial.scoresheetHeaderHidden === null, 'Scoresheet column labels must be exposed to assistive technology');
    check(initial.statusDot === false, 'The decorative status dot must be removed');
    check(/rings show captures/i.test(initial.tip), 'A visible one-line play instruction must sit under the board');
    check(initial.material === 'even', 'Level material must read even, not a bare dash');
    check(Number(initial.stroke) >= 2.6, 'Piece strokes must be thick enough for small boards');

    await page.locator('label[for="level-1"]').click();
    await page.waitForFunction(() => /Next game/i.test(document.getElementById('live').textContent));
    const pending = await page.evaluate(() => ({
      hint: document.getElementById('ctl-hint').textContent,
      applyHidden: document.getElementById('apply-setup').hidden,
      pendingLevel: window.__gambit.state.pendingLevel,
      activeLevel: window.__gambit.state.aiLevel,
      live: document.getElementById('live').textContent,
    }));
    check(pending.hint === 'Next game: You play White · Casual.', 'A pending level must be named as the next game, not the active one');
    check(pending.applyHidden === false, 'A pending change must reveal the apply action');
    check(pending.pendingLevel === 1 && pending.activeLevel === 2, 'Pending settings must not silently change the active game');
    check(/Next game/i.test(pending.live), 'Pending settings must be announced');
    await page.getByRole('button', { name: 'Start new game with these settings', exact: true }).click();
    check(await page.evaluate(() => window.__gambit.state.aiLevel === 1 && document.getElementById('apply-setup').hidden), 'Applying settings must start a new game and clear the pending state');

    // Board size, coordinate floor, and contrast at the short-landscape case.
    await page.setViewportSize({ width: 812, height: 375 });
    const landscape = await page.evaluate(() => {
      const parse = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
      const lum = rgb => rgb.map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      const ratio = (a, b) => {
        const x = lum(parse(a)), y = lum(parse(b));
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      const dark = document.querySelector('.sq.dark');
      const darkCoord = [...document.querySelectorAll('.sq.dark')].find(sq => sq.querySelector('.coord'));
      const light = document.querySelector('.sq.light');
      return {
        board: document.getElementById('board').getBoundingClientRect().width,
        coord: parseFloat(getComputedStyle(darkCoord.querySelector('.coord')).fontSize),
        square: ratio(getComputedStyle(dark).backgroundColor, getComputedStyle(light).backgroundColor),
        coordContrast: ratio(getComputedStyle(darkCoord.querySelector('.coord')).color, getComputedStyle(darkCoord).backgroundColor),
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });
    check(landscape.board >= 270, 'The short-landscape board must stay at least 270px wide');
    check(landscape.coord >= 10, 'Board coordinates must render at 10px or larger');
    check(landscape.square >= 3, 'Light and dark squares must meet the 3:1 non-text contrast floor');
    check(landscape.coordContrast >= 4.5, 'Coordinates must meet 4.5:1 against their square');
    check(!landscape.overflow, 'The short-landscape layout must not overflow horizontally');

    // Tablet composition and score count.
    await page.setViewportSize({ width: 768, height: 1024 });
    const tablet = await page.evaluate(() => ({
      board: document.getElementById('board').getBoundingClientRect().width,
      columns: getComputedStyle(document.querySelector('.side')).gridTemplateColumns.split(' ').length,
    }));
    check(tablet.board === 640 && tablet.columns === 2, 'Tablet must keep the board whole and split the side panel two-up');

    // Drag feedback: legal destinations, a drop target, and a pointer ghost.
    await page.setViewportSize({ width: 1440, height: 900 });
    const knight = await page.locator('.sq[data-sq="62"] .piece').boundingBox();
    const target = await page.locator('.sq[data-sq="45"]').boundingBox();
    await page.mouse.move(knight.x + knight.width / 2, knight.y + knight.height / 2);
    await page.mouse.down();
    await page.mouse.move(knight.x + knight.width / 2 + 12, knight.y + knight.height / 2 - 12, { steps: 3 });
    const ghostStart = await page.evaluate(() => {
      const ghost = document.querySelector('.drag-ghost');
      const r = ghost?.getBoundingClientRect();
      return { exists: !!ghost, left: r?.left, hints: document.querySelectorAll('.sq.hint').length };
    });
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 });
    const ghostMoved = await page.evaluate(() => {
      const ghost = document.querySelector('.drag-ghost');
      return { left: ghost?.getBoundingClientRect().left, drop: document.querySelectorAll('.sq.drop').length };
    });
    check(ghostStart.exists && ghostStart.hints >= 2, 'Dragging must show legal destinations and a piece that follows the pointer');
    check(Math.abs(ghostMoved.left - ghostStart.left) > 10, 'The drag ghost must follow the pointer');
    check(ghostMoved.drop === 1, 'A valid destination must receive a distinct drop highlight');
    await page.mouse.up();
    await page.waitForFunction(() => window.__gambit.state.history.length === 2 && !window.__gambit.state.thinking);
    check(await page.evaluate(() => window.__gambit.state.history[0].san === 'Nf3' && !document.querySelector('.drag-ghost')), 'A completed drag must play the move and clean up its ghost');
    check(await page.evaluate(() => document.getElementById('moves-count').textContent === '1 move'), 'Move count must count pairs, not plies');

    // Undo copy for a player move plus the engine reply.
    await page.getByRole('button', { name: 'Take back', exact: true }).click();
    const undoLive = await page.evaluate(() => document.getElementById('live').textContent);
    const undoTimer = Date.now();
    while (!/computer/i.test(undoLive) && Date.now() - undoTimer < 500) { await page.waitForTimeout(50); }
    check(await page.evaluate(() => document.getElementById('live').textContent) === 'Your move and the computer\'s reply were taken back.', 'Undo must say it removed both plies');

    // Thinking feedback.
    await page.evaluate(() => {
      const g = window.__gambit;
      window.__liveLog = [];
      const region = document.getElementById('live');
      new MutationObserver(() => window.__liveLog.push(region.textContent))
        .observe(region, { childList: true, subtree: true, characterData: true });
      g.state.pendingLevel = 3;
      g.newGame();
      g.playerMove(52, 36);
    });
    check(await page.evaluate(() => document.querySelector('.status-card').getAttribute('aria-busy')) === 'true', 'The status card must report aria-busy while the engine searches');
    await page.waitForFunction(() => window.__gambit.state.history.length === 2 && !window.__gambit.state.thinking);
    check(await page.evaluate(() => window.__liveLog.some(text => /thinking/i.test(text))), 'The engine turn must be announced');
    check(await page.evaluate(() => document.querySelector('.status-card').getAttribute('aria-busy')) === 'false', 'The busy state must clear after the engine replies');

    // Undo copy when only the engine move exists.
    await page.evaluate(() => {
      const g = window.__gambit;
      g.state.pendingSide = 'b';
      g.newGame();
    });
    await page.waitForFunction(() => window.__gambit.state.history.length === 1 && !window.__gambit.state.thinking);
    await page.getByRole('button', { name: 'Take back', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('live').textContent.includes('computer'));
    check(await page.evaluate(() => document.getElementById('live').textContent) === 'The computer\'s move was taken back.', 'Undo must name an engine-only takeback');

    // Promotion must not invent captures; Cancel must restore board focus.
    await page.evaluate(() => {
      const g = window.__gambit;
      g.state.pendingSide = 'w';
      g.newGame();
      const p = g.state.pos;
      p.board = Array(64).fill(null);
      p.board[60] = 'wK'; p.board[7] = 'bK'; p.board[8] = 'wP';
      p.kings = { w: 60, b: 7 };
      p.castling = { wK: false, wQ: false, bK: false, bQ: false };
      g.playerMove(8, 0);
    });
    const promoCapture = await page.evaluate(() => ({
      black: document.getElementById('top-captured').getAttribute('aria-label'),
      white: document.getElementById('bottom-captured').getAttribute('aria-label'),
      blackArt: document.querySelectorAll('#top-captured .captured-piece').length,
    }));
    check(promoCapture.black === 'black has captured nothing' && promoCapture.white === 'white has captured nothing' && promoCapture.blackArt === 0, 'Promotion must not fabricate a captured pawn');
    await page.locator('#promo-overlay').click({ position: { x: 4, y: 4 } });
    check(await page.locator('#promo-overlay').isHidden(), 'The promotion scrim must dismiss the dialog');
    check(await page.locator('#board').evaluate(el => el.contains(document.activeElement)), 'Dismissing promotion must restore board focus');

    // Player-relative result and its announcement.
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
    await page.waitForFunction(() => document.getElementById('live').textContent.includes('You win'));
    check(await page.locator('#over-sub').textContent() === 'Checkmate', 'The result subline must name checkmate, not repeat the winner');
    check(await page.evaluate(() => document.getElementById('live').textContent === 'You win. Checkmate.'), 'The result must be announced in player-relative terms');

    check(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
    return { status: 'passed', checks: ['setup pending state and apply', 'short-landscape size and contrast', 'tablet two-up', 'drag feedback and ghost', 'move pairs and undo copy', 'thinking announcement and busy state', 'promotion capture and scrim', 'player-relative result'] };
  } finally {
    page.off('pageerror', onError);
    await page.unroute('http://127.0.0.1:8765/**', revalidate);
  }
})

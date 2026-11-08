(async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const results = [];
  const errors = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  const revalidate = route => route.continue();
  await page.route('http://127.0.0.1:8765/**', revalidate);
  try {
    await page.goto('http://127.0.0.1:8765/?qa=1');
    await page.waitForFunction(() => window.__gambit);
    check(await page.locator('#board .piece svg').count() === 32, 'All 32 starting pieces must render as scalable illustrations');
    check(await page.locator('#board [role="row"]').count() === 8, 'Board must contain eight accessible rows');
    check(await page.locator('#board [role="gridcell"]').count() === 64, 'Board must contain 64 accessible squares');
    check(await page.locator('#board [tabindex="0"]').count() === 1, 'Board must have one keyboard entry point');
    const shapes = await page.locator('#board .piece.w svg').evaluateAll(nodes => new Set(nodes.map(n => n.innerHTML)).size);
    check(shapes === 6, 'The six piece types must have distinct illustrations');
    for (const [width, height] of [[320,568],[375,812],[390,844],[768,1024],[1024,768],[1440,900],[1920,1080],[812,375],[568,320],[320,256]]) {
      await page.setViewportSize({ width, height });
      const layout = await page.evaluate(() => {
        const board = document.getElementById('board').getBoundingClientRect();
        const cell = document.querySelector('.sq').getBoundingClientRect();
        const illustrationsFit = [...document.querySelectorAll('#board .piece svg')].every(svg => {
          const image = svg.getBoundingClientRect();
          const square = svg.closest('.sq').getBoundingClientRect();
          return image.width > 12 && image.height > 12 && image.left >= square.left - 1 && image.right <= square.right + 1 && image.top >= square.top - 1 && image.bottom <= square.bottom + 1;
        });
        return { width: board.width, height: board.height, cellWidth: cell.width, cellHeight: cell.height, overflow: document.documentElement.scrollWidth > innerWidth + 1, illustrationsFit };
      });
      check(!layout.overflow, `Horizontal overflow at ${width}x${height}`);
      check(Math.abs(layout.width - layout.height) < 1, `Board is not square at ${width}x${height}`);
      check(Math.abs(layout.cellWidth - layout.cellHeight) < 1, `Cells are not square at ${width}x${height}`);
      check(layout.cellWidth >= 24, `Board squares are too small at ${width}x${height}`);
      check(layout.illustrationsFit, `Piece illustrations overflow their squares at ${width}x${height}`);
      results.push({ viewport: `${width}x${height}`, board: Math.round(layout.width), square: Math.round(layout.cellWidth * 10) / 10 });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('.sq[data-sq="52"]').focus();
    await page.keyboard.press('Enter');
    check(await page.locator('.sq[aria-selected="true"]').count() === 1, 'Keyboard selection must mark one square');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__gambit.state.history.length === 2 && !window.__gambit.state.thinking);
    check(await page.evaluate(() => window.__gambit.state.history[0].san) === 'e4', 'Keyboard move must play e4');
    check(await page.locator('#board .piece svg').count() === 32, 'Illustrations must survive the computer reply');
    const scoresheet = page.locator('#move-list');
    check(await scoresheet.evaluate(el => el.tabIndex === 0), 'Scoresheet must have an explicit keyboard entry point across browsers');
    await scoresheet.evaluate(el => {
      const row = el.firstElementChild;
      for (let i = 0; i < 30; i++) el.append(row.cloneNode(true));
      el.scrollTop = el.scrollHeight;
    });
    await page.getByRole('button', { name: 'Take back', exact: true }).focus();
    await page.keyboard.press('Shift+Tab');
    check(await scoresheet.evaluate(el => el === document.activeElement), 'Tab navigation must reach the scoresheet');
    await page.keyboard.press('Home');
    await page.waitForFunction(() => document.getElementById('move-list').scrollTop === 0);
    await page.keyboard.press('End');
    await page.waitForFunction(() => {
      const el = document.getElementById('move-list');
      return el.scrollTop >= el.scrollHeight - el.clientHeight - 1;
    });
    await page.getByRole('button', { name: 'Take back', exact: true }).click();
    check(await page.evaluate(() => window.__gambit.state.history.length) === 0, 'Take back must undo both moves');
    check(await page.locator('#top-strip .strip-piece.b svg').count() === 1 && await page.locator('#bottom-strip .strip-piece.w svg').count() === 1, 'Player strip illustrations must match their sides');
    await page.getByRole('button', { name: 'Flip board', exact: true }).click();
    check(await page.locator('#top-strip .strip-piece.w svg').count() === 1 && await page.locator('#bottom-strip .strip-piece.b svg').count() === 1, 'Flipping must swap player strip illustrations');
    check((await page.locator('.sq').first().getAttribute('aria-label')).startsWith('h1, white rook'), 'Flip must preserve labels and orientation');
    await page.getByRole('button', { name: 'Flip board', exact: true }).click();
    const rook = page.locator('.sq[data-sq="63"] .piece');
    check(await rook.locator('svg').count() === 1, 'Rook illustration must survive flipping');
    const knight = await page.locator('.sq[data-sq="62"] .piece').boundingBox();
    const destination = await page.locator('.sq[data-sq="45"]').boundingBox();
    await page.mouse.move(knight.x + knight.width / 2, knight.y + knight.height / 2);
    await page.mouse.down();
    await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(() => window.__gambit.state.history.length === 2 && !window.__gambit.state.thinking);
    check(await page.evaluate(() => window.__gambit.state.history[0].san) === 'Nf3', 'Dragging an illustrated knight must play Nf3');
    await page.getByRole('button', { name: 'Take back', exact: true }).click();
    await page.locator('label[for="side-b"]').click();
    await page.locator('label[for="level-1"]').click();
    await page.getByRole('button', { name: 'New game', exact: true }).click();
    await page.waitForFunction(() => window.__gambit.state.history.length === 1 && !window.__gambit.state.thinking);
    check(await page.evaluate(() => window.__gambit.state.playerColor === 'b' && window.__gambit.state.aiLevel === 1 && window.__gambit.state.flipped), 'Starting as black must apply chosen settings and let the computer open');
    const touchContext = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    try {
      const touchPage = await touchContext.newPage();
      touchPage.on('pageerror', onError);
      await touchPage.goto('http://127.0.0.1:8765/?qa=1');
      await touchPage.locator('.sq[data-sq="52"]').tap();
      check(await touchPage.locator('.sq[aria-selected="true"]').count() === 1, 'Touch tap must select a pawn');
      await touchPage.locator('.sq[data-sq="36"]').tap();
      await touchPage.waitForFunction(() => window.__gambit.state.history.length === 2 && !window.__gambit.state.thinking);
      check(await touchPage.evaluate(() => window.__gambit.state.history[0].san) === 'e4', 'Two touch taps must play e4');
    } finally {
      await touchContext.close();
    }
    check(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
    return { status: 'passed', layouts: results, gameplay: ['keyboard e4', 'computer reply', 'take back', 'flip with player icons', 'mouse drag Nf3', 'new game as black', 'mobile touch e4'], browserErrors: errors };
  } finally {
    page.off('pageerror', onError);
    await page.unroute('http://127.0.0.1:8765/**', revalidate);
  }
})

/* Not Tetris 2 — web port. Game modes: A "normal" (line clears) and B "stack".
 * Faithful port of gameA.lua / gameB.lua update & draw logic.
 */
window.NT = window.NT || {};

NT.GAME = (function () {
  var PHYS = NT.PHYS, GFX = NT.GFX, SFX = NT.SFX, INPUT = NT.INPUT, D = NT.DATA;

  // movement (original px values / 32, with full-piece mass = 0.2)
  var SIDE_FORCE = 2.1875;        // applyForce(70) -> accel ~10.9 blocks/s²
  var DOWN_FORCE = 0.625;         // applyForce(20) -> accel ~3.1 blocks/s²
  var TORQUE = 2.8;               // spin-up to 3 rad/s; I piece turns slower than O
  var MAX_ANGVEL = 3;
  var SOFT_DROP_MAX = 12;         // blocks/s
  var RELEASE_DECEL = 62.5;       // 2000 px/s²
  var LOSING_Y = 0;
  var CLEARED_Y = 20.25;          // 648 px: everything fell out after game over

  var CUT_DURATION = 1.2;
  var CUT_BLINKS = 7;
  var LINE_THRESHOLD = 8.1;       // block² per row
  var DENSITY_INTERVAL = 1 / 30;
  var SCORE_ADD_TIME = 0.5;
  var PREVIEW_ROT_SPEED = 1;      // rad/s

  var mode = "A";                 // 'A' | 'B'
  var phase = "playing";          // 'playing' | 'failing'
  var paused = false;
  var quitConfirm = false;        // "quit game?" overlay (select pressed in game)

  var g = null;                   // physics game
  var score = 0, level = 0, lines = 0, linesCleared = 0;
  var targetSpeed = 3.125;
  var cutTimer = CUT_DURATION;
  var scoreAddTimer = SCORE_ADD_TIME, lastScoreAdd = 0;
  var densityTimer = 0;
  var previewRot = 0;
  var newLevelBeep = false;
  var nextPiece = 1;
  var areas = [];
  var removedRows = [];
  var snapshot = null;

  function rand7() { return 1 + Math.floor(Math.random() * 7); }
  function speedForLevel(lv) { return (100 + lv * 7) / 32; }

  function reset(m) {
    mode = m;
    phase = "playing";
    paused = false;
    quitConfirm = false;
    score = 0; level = 0; linesCleared = 0;
    lines = 0;                       // mode B: pieces stacked counter ("tiles")
    targetSpeed = speedForLevel(0);
    cutTimer = CUT_DURATION;
    scoreAddTimer = SCORE_ADD_TIME; lastScoreAdd = 0;
    densityTimer = 0; previewRot = 0; newLevelBeep = false;
    areas = new Array(PHYS.ROWS); for (var i = 0; i < PHYS.ROWS; i++) areas[i] = 0;
    removedRows = []; snapshot = null;

    g = PHYS.newGame();
    PHYS.spawnPiece(g, rand7(), targetSpeed);
    nextPiece = rand7();
  }

  function loadA() { reset("A"); NT.setState("game"); }
  function loadB() { reset("B"); NT.setState("game"); }

  // ---------- update ----------

  function update(dt) {
    if (paused || quitConfirm) return;

    // line-clear freeze (physics halted, rows blink)
    if (cutTimer < CUT_DURATION) {
      cutTimer += dt;
      if (cutTimer >= CUT_DURATION) {
        cutTimer = CUT_DURATION;
        nextPiece = rand7();
        scoreAddTimer = 0;
        snapshot = null;
        if (newLevelBeep) { SFX.play("newlevel"); newLevelBeep = false; }
      }
      return;
    }

    if (scoreAddTimer < SCORE_ADD_TIME) scoreAddTimer = Math.min(SCORE_ADD_TIME, scoreAddTimer + dt);
    previewRot = (previewRot + PREVIEW_ROT_SPEED * dt) % (Math.PI * 2);

    if (phase === "playing" && g.active) {
      var body = g.active;
      if (INPUT.held("rotr") && body.getAngularVelocity() < MAX_ANGVEL) body.applyTorque(TORQUE, true);
      if (INPUT.held("rotl") && body.getAngularVelocity() > -MAX_ANGVEL) body.applyTorque(-TORQUE, true);
      if (INPUT.held("left")) body.applyForceToCenter(new planck.Vec2(-SIDE_FORCE, 0), true);
      if (INPUT.held("right")) body.applyForceToCenter(new planck.Vec2(SIDE_FORCE, 0), true);

      var v = body.getLinearVelocity();
      if (INPUT.held("down")) {
        if (v.y > SOFT_DROP_MAX) body.setLinearVelocity(new planck.Vec2(v.x, SOFT_DROP_MAX));
        else body.applyForceToCenter(new planck.Vec2(0, DOWN_FORCE), true);
      } else if (v.y > targetSpeed) {
        body.setLinearVelocity(new planck.Vec2(v.x, Math.max(targetSpeed, v.y - RELEASE_DECEL * dt)));
      }
    }

    g.world.step(dt, 8, 3);
    PHYS.clampVelocities(g);

    if (phase === "playing" && !g.pendingLand && PHYS.activeTouchesGround(g)) g.pendingLand = true;
    if (g.pendingLand && phase === "playing") handleLand();

    if (mode === "A" && phase === "playing") {
      densityTimer += dt;
      if (densityTimer >= DENSITY_INTERVAL) {
        densityTimer %= DENSITY_INTERVAL;
        areas = PHYS.rowAreas(g);
      }
    }

    if (phase === "failing" && PHYS.allBelow(g, CLEARED_Y)) {
      phase = "failed";
      g.settled = [];
      g.active = null;
      SFX.play("gameover2");
      NT.setState("failed");
    }
  }

  function handleLand() {
    g.pendingLand = false;
    var body = g.active;
    if (body.getPosition().y < LOSING_Y) {
      phase = "failing";
      SFX.setMusic(null);
      SFX.play("gameover1");
      PHYS.destroyGround(g);
      return;
    }
    PHYS.settleActive(g);
    if (mode === "A") afterLandA();
    else afterLandB();
  }

  function afterLandA() {
    areas = PHYS.rowAreas(g);
    var rows = [];
    for (var i = 0; i < PHYS.ROWS; i++) if (areas[i] > LINE_THRESHOLD) rows.push(i + 1);

    if (rows.length > 0) {
      // snapshot current bodies for the freeze rendering
      snapshot = g.settled.map(function (b) {
        var ud = b.getUserData();
        var p = b.getPosition();
        return { x: p.x, y: p.y, angle: b.getAngle(), kind: ud.kind, cut: ud.cut, polys: ud.polys };
      });
      removedRows = rows.slice();

      var n = rows.length;
      lines += n;
      SFX.play(n >= 4 ? "fourlineclear" : "lineclear");

      var avg = 0;
      for (var j = 0; j < rows.length; j++) avg += areas[rows[j] - 1];
      avg = avg / n / 10;
      var add = Math.ceil(Math.pow(n * 3, Math.pow(avg, 10)) * 20 + n * n * 40);
      score += add;
      lastScoreAdd = add;
      scoreAddTimer = 0;

      linesCleared += n;
      if (Math.floor(linesCleared / 10) > level) {
        level++;
        targetSpeed = speedForLevel(level);
        newLevelBeep = true;
      }

      for (var k = 0; k < rows.length; k++) PHYS.removeRow(g, rows[k]);
      cutTimer = 0;
      PHYS.spawnPiece(g, nextPiece, targetSpeed);   // preview rerolls when the freeze ends
    } else {
      SFX.play("blockfall");
      PHYS.spawnPiece(g, nextPiece, targetSpeed);
      nextPiece = rand7();
    }
  }

  function afterLandB() {
    lines++;                    // "tiles" stacked
    score = lines * 100;
    SFX.play("blockfall");
    PHYS.spawnPiece(g, nextPiece, targetSpeed);
    nextPiece = rand7();
  }

  function togglePause() {
    paused = !paused;
    if (paused) { SFX.setMusicPaused(true); SFX.play("pause"); }
    else SFX.setMusicPaused(false);
  }

  function setPause(p) { if (paused !== p && phase !== "failed") togglePause(); }

  // ---------- draw ----------

  function drawBody(ctx, x, y, angle, kind, cut, polys) {
    ctx.save();
    ctx.translate(x * 8, y * 8);
    ctx.rotate(angle);
    if (cut && polys) {
      ctx.beginPath();
      for (var i = 0; i < polys.length; i++) {
        var poly = polys[i];
        ctx.moveTo(poly[0].x * 8, poly[0].y * 8);
        for (var j = 1; j < poly.length; j++) ctx.lineTo(poly[j].x * 8, poly[j].y * 8);
        ctx.closePath();
      }
      ctx.clip();
    }
    var c = D.pieceCenter[kind];
    ctx.drawImage(GFX.img("piece" + kind), -c[0], -c[1]);
    ctx.restore();
  }

  function drawPieces(ctx) {
    var list = g.settled.slice();
    if (g.active) list.push(g.active);
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      var ud = b.getUserData();
      var p = b.getPosition();
      drawBody(ctx, p.x, p.y, b.getAngle(), ud.kind, ud.cut, ud.polys);
    }
  }

  function draw(ctx) {
    GFX.draw(mode === "A" ? "gamebackgroundgamea" : "gamebackground", 0, 0);

    if (mode === "A" && cutTimer < CUT_DURATION) {
      // freeze: draw pre-cut snapshot + blinking rows
      if (!paused && snapshot) {
        for (var i = 0; i < snapshot.length; i++) {
          var s = snapshot[i];
          drawBody(ctx, s.x, s.y, s.angle, s.kind, s.cut, s.polys);
        }
      }
      var section = Math.ceil(cutTimer / (CUT_DURATION / CUT_BLINKS));
      if (section % 2 === 1 || cutTimer === 0) {
        var lc = GFX.lightColor(NT.options.hue);
        ctx.fillStyle = "rgb(" + lc[0] + "," + lc[1] + "," + lc[2] + ")";
        for (var r = 0; r < removedRows.length; r++) {
          ctx.fillRect(14, (removedRows[r] - 1) * 8, 82, 8);
        }
      }
    } else if (!paused) {
      drawPieces(ctx);
    }

    // next piece preview
    if (!paused) {
      var pc = D.pieceCenterPreview[nextPiece];
      GFX.drawRot("piece" + nextPiece, 136, 120, previewRot, pc[0], pc[1]);
    }

    // floating "+score"
    if (mode === "A" && scoreAddTimer < SCORE_ADD_TIME && lastScoreAdd > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(105, 35, 55, 9);
      ctx.clip();
      var txt = "+" + lastScoreAdd;
      GFX.print(txt, 136 - 8 * (String(lastScoreAdd).length - 1), 36 - (scoreAddTimer / SCORE_ADD_TIME) * 8, "fontwhite");
      ctx.restore();
    }

    // line density meter
    if (mode === "A") {
      for (var row = 0; row < PHYS.ROWS; row++) {
        var fullness = Math.min(1, (areas[row] || 0) / LINE_THRESHOLD);
        var col = fullness === 1 ? 0 : Math.floor(235 - fullness * 180);
        ctx.fillStyle = "rgb(" + col + "," + col + "," + col + ")";
        ctx.fillRect(0, row * 8, Math.floor(6 * fullness), 8);
      }
    }

    if (paused) {
      if (mode === "A") GFX.draw("pausecutoff", 14, 0);
      else GFX.draw("pause", 16, 0);
    }

    drawScores(ctx);

    if (quitConfirm) drawQuitConfirm(ctx);
  }

  function drawQuitConfirm(ctx) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, 160, 144);
    var lc = GFX.lightColor(NT.options.hue);
    ctx.fillStyle = "rgb(" + lc[0] + "," + lc[1] + "," + lc[2] + ")";
    ctx.fillRect(27, 51, 106, 42);
    ctx.fillStyle = "#000";
    ctx.fillRect(29, 53, 102, 38);
    GFX.print("quit game!", 40, 58, "fontwhite");
    GFX.print("select: yes", 36, 71, "fontwhite");
    GFX.print("start:  no", 36, 81, "fontwhite");
  }

  function drawScores(ctx) {
    GFX.printRight(score, 144, 24);
    GFX.printRight(level, 136, 56);
    GFX.printRight(lines, 136, 80);
  }

  function drawFailed(ctx) {
    if (mode === "A") {
      GFX.draw("gamebackgroundgamea", 0, 0);
      GFX.draw("gameovercutoff", 14, 0);
    } else {
      GFX.draw("gamebackground", 0, 0);
      GFX.draw("gameover", 16, 0);
    }
    drawScores(ctx);
  }

  // ---------- input ----------

  function press(name) {
    if (quitConfirm) {
      if (name === "escape") {
        // confirmed: back to menu, making sure the music comes back with us
        quitConfirm = false;
        SFX.setMusicPaused(false);
        SFX.setMusic(NT.MENU.musicKey());
        NT.setState("menu");
      } else if (name === "enter" || name === "rotl" || name === "rotr") {
        quitConfirm = false;
        if (!paused) SFX.setMusicPaused(false);
        SFX.play("pause");
      }
      return;
    }
    if (name === "enter") {
      togglePause();
      return;
    }
    if (name === "escape" && phase !== "failed") {
      quitConfirm = true;
      SFX.setMusicPaused(true);
      SFX.play("pause");
      return;
    }
    if (phase === "playing") {
      if (!paused && (cutTimer === CUT_DURATION || mode === "B")) {
        if (name === "left" || name === "right") SFX.play("move");
        else if (name === "rotl" || name === "rotr") SFX.play("turn");
      }
    }
  }

  function pressFailed(name) {
    if (name === "enter" || name === "escape") {
      SFX.stop("gameover2");
      NT.ROCKET.start(mode, score);
    }
  }

  NT.STATES = NT.STATES || {};
  NT.STATES.game = { update: update, draw: draw, press: press };
  NT.STATES.failed = { update: function () {}, draw: drawFailed, press: pressFailed };

  return {
    loadA: loadA,
    loadB: loadB,
    setPause: setPause,
    get info() { return { mode: mode, phase: phase, paused: paused, quitConfirm: quitConfirm, score: score, level: level, lines: lines, bodies: g ? g.settled.length : 0, cutting: cutTimer < CUT_DURATION }; },
    get finalScore() { return score; },
    // automated-test hooks: physics world access + replace the falling piece
    _testWorld: function () { return g; },
    _testDrop: function (kind, x, y) {
      if (!g || !g.active) return false;
      g.world.destroyBody(g.active);
      g.active = null;
      var b = PHYS.spawnPiece(g, kind, 10);
      b.setPosition(new planck.Vec2(x, y === undefined ? 2 : y));
      return true;
    }
  };
})();

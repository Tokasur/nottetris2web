/* Not Tetris 2 — web port. Rocket ending cutscene (rocket.lua port).
 * Reached from the game over screen; the rocket size depends on the score.
 */
window.NT = window.NT || {};

NT.ROCKET = (function () {
  var GFX = NT.GFX, SFX = NT.SFX;

  var stage = 1;       // 1..4
  var t = 0;
  var endScore = 0;

  function start(mode, score) {
    var thresholds = mode === "A" ? [3000, 7000, 11000, 15000] : [3200, 3400, 3600, 3700];
    endScore = score;
    stage = 0;
    for (var i = 3; i >= 0; i--) {
      if (score >= thresholds[i]) { stage = i + 1; break; }
    }
    if (stage === 0) {
      NT.MENU.checkHighscores(score);
      return;
    }
    t = 0;
    SFX.setMusic(stage === 4 ? "rocket4" : "rocket1to3");
    NT.setState("rocket");
  }

  function finish() {
    SFX.setMusic(null);
    NT.MENU.checkHighscores(endScore);
  }

  var st = {
    enter: function () { NT.bgColor = "#000"; },
    update: function (dt) {
      t += dt;
      if (stage === 4 ? t > 41.1 : t > 31.5) finish();
    },
    draw: function (ctx) {
      GFX.draw("rocketbackground", 0, 0);
      if (stage === 4) GFX.draw("bigrockettakeoffbackground", 54, 60);

      var rocketpos = stage === 4
        ? 112 - 112 * ((t - 12) / 18)
        : 112 - 112 * ((t - 8) / 18);

      // fire
      if (stage === 4) {
        if (t > 13) {
          if (Math.floor(t * 8) % 2 === 0) GFX.draw("firebig1", 68, Math.round(rocketpos));
          else GFX.draw("firebig2", 68, Math.round(rocketpos));
        }
      } else if (t > 8.5) {
        if (Math.floor(t * 8) % 2 === 0) GFX.draw("fire1", 77, Math.round(rocketpos));
        else GFX.draw("fire2", 76, Math.round(rocketpos));
      }

      // rocket
      if (stage === 4) {
        if (t < 12) GFX.draw("bigrocketbackground", 64, 48);
        else GFX.draw("spaceshuttle", 64, Math.round(rocketpos) - 64);
      } else if (t < 8) {
        if (stage === 1) GFX.draw("rocket1", 75, 84);
        else if (stage === 2) GFX.draw("rocket2", 76, 74);
        else GFX.draw("rocket3", 72, 56);
      } else {
        if (stage === 1) GFX.draw("rocket1", 75, Math.round(rocketpos) - 28);
        else if (stage === 2) GFX.draw("rocket2", 76, Math.round(rocketpos) - 38);
        else GFX.draw("rocket3", 72, Math.round(rocketpos) - 56);
      }

      // smoke
      if (stage === 4) {
        if (t > 3 && t < 8 && Math.floor(t * 6) % 2 === 0) {
          GFX.draw("smoke1left", 50, 106);
          GFX.draw("smoke1right", 92, 106);
        } else if (t > 8 && t < 13 && Math.floor(t * 6) % 2 === 0) {
          GFX.draw("smoke2left", 44, 98);
          GFX.draw("smoke2right", 92, 98);
        }
      } else if (t > 3 && t < 8.5 && Math.floor(t * 6) % 2 === 0) {
        GFX.draw("smoke1left", 56, 106);
        GFX.draw("smoke1right", 86, 106);
      }

      // congratulations!
      if (stage === 4) {
        var symbols = 0;
        for (var i = 16; i >= 1; i--) {
          if (t > 35.2 + 1.6 * (i / 16)) { symbols = i; break; }
        }
        if (symbols > 0) {
          GFX.print("congratulations!".substring(0, symbols), 16, 32);
          for (var j = 1; j <= symbols; j++) GFX.draw("congratsline", 8 + 8 * j, 40);
        }
      }
    },
    press: function (name) {
      if (name === "enter" || name === "escape") finish();
    }
  };

  NT.STATES = NT.STATES || {};
  NT.STATES.rocket = st;

  return { start: start };
})();

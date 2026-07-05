/* Not Tetris 2 — web port. Menus: logo, credits, title, game select, options,
 * high score entry. Port of menu.lua + the menu parts of main.lua.
 */
window.NT = window.NT || {};

NT.MENU = (function () {
  var GFX = NT.GFX, SFX = NT.SFX, D = NT.DATA;

  var LOGO_DURATION = 1.5, LOGO_DELAY = 1, CREDITS_DELAY = 2;
  var SELECT_BLINK = 0.29, CURSOR_BLINK = 0.14;

  var logoTime = 0, bootPlayed = false, creditsTime = 0;
  var playerSelection = 1;       // title: 1=1player 2=2player 3=options
  var selection = 1;             // menu grid: 1-2 game type, 3-6 music
  var gameno = 1, musicno = 1;   // persisted
  var blinkTimer = 0, selectBlink = true;
  var noticeTimer = 0;           // "no 2p on web" message

  var optionsChoices = ["volume", "color", "scale", "fullscrn"];
  var optionsSelection = 0;
  var hueLast = -1, hueRecolorTimer = 0;

  var highscores = { 1: null, 2: null };   // [{name, score} x3] per gameno
  var hsRank = 0, hsName = "", hsPending = 0, hsTimer = 0, hsMusicChanged = false;
  var cursorTimer = 0, cursorBlink = true;
  var CHARSET = "abcdefghijklmnopqrstuvwxyz0123456789.,-_ ";

  function musicKey() { return musicno < 4 ? ["themeA", "themeB", "themeC"][musicno - 1] : null; }

  function loadScores(no) {
    if (!highscores[no]) {
      highscores[no] = NT.store.get("nt2.hs." + (no === 1 ? "A" : "B"),
        [{ name: "", score: 0 }, { name: "", score: 0 }, { name: "", score: 0 }]);
    }
    return highscores[no];
  }
  function saveScores() {
    NT.store.set("nt2.hs." + (gameno === 1 ? "A" : "B"), highscores[gameno]);
  }

  // ---------- logo / credits ----------

  var stLogo = {
    enter: function () { logoTime = 0; bootPlayed = false; NT.bgColor = "#fff"; },
    update: function (dt) {
      logoTime += dt;
      if (logoTime >= LOGO_DURATION && !bootPlayed) { SFX.play("boot"); bootPlayed = true; }
      if (logoTime >= LOGO_DURATION + LOGO_DELAY) NT.setState("credits");
    },
    draw: function () {
      var y = logoTime <= LOGO_DURATION
        ? Math.floor(-22 + 80 * (logoTime / LOGO_DURATION))
        : 58;
      GFX.draw("stabyourselflogo", 7, y);
    },
    press: function (name) { if (name === "enter") gotoTitle(); }
  };

  var stCredits = {
    enter: function () { creditsTime = 0; NT.bgColor = "#fff"; },
    update: function (dt) {
      creditsTime += dt;
      if (creditsTime > CREDITS_DELAY) gotoTitle();
    },
    draw: function () {
      for (var i = 0; i < D.credits.length; i++) GFX.print(D.credits[i], 0, (i + 1) * 8);
      GFX.draw("logo", 32, 80);
    },
    press: function (name) { if (name === "enter") gotoTitle(); }
  };

  function gotoTitle() {
    NT.bgColor = "#000";
    SFX.setMusic("title");
    NT.setState("title");
  }

  // ---------- title ----------

  var stTitle = {
    enter: function () { NT.bgColor = "#000"; noticeTimer = 0; },
    update: function (dt) { if (noticeTimer > 0) noticeTimer -= dt; },
    draw: function (ctx) {
      GFX.draw("title", 0, 0);
      var xs = { 1: 1, 2: 47, 3: 93 };
      GFX.print(">", xs[playerSelection], 124);
      if (noticeTimer > 0) GFX.print("sorry, 1p only here", 4, 108);
    },
    press: function (name) {
      if (name === "left" && playerSelection > 1) playerSelection--;
      else if (name === "right" && playerSelection < 3) playerSelection++;
      else if (name === "enter" || name === "rotr") {
        if (playerSelection === 1) {
          SFX.setMusic(musicKey());
          selectBlink = true; blinkTimer = 0;
          NT.setState("menu");
        } else if (playerSelection === 2) {
          noticeTimer = 2.5;    // 2-player mode is not in the web port
        } else {
          SFX.setMusic("options");
          optionsSelection = 0;
          NT.setState("options");
        }
      }
    }
  };

  // ---------- game type / music menu ----------

  function drawMenuBase(editRank) {
    GFX.draw("gametype", 0, 0);
    // current values (steady label of the row group NOT being browsed)
    if (selection > 2) {
      if (gameno === 1) GFX.print("normal", 24, 26); else GFX.print("stack ", 88, 26);
    } else {
      if (musicno === 1) GFX.print("a-type", 24, 60);
      else if (musicno === 2) GFX.print("b-type", 88, 60);
      else if (musicno === 3) GFX.print("c-type", 24, 76);
      else GFX.print(" off  ", 88, 76);
    }
    if (selectBlink) {
      if (selection === 1) GFX.print("normal", 24, 26);
      else if (selection === 2) GFX.print("stack ", 88, 26);
      else if (selection === 3) GFX.print("a-type", 24, 60);
      else if (selection === 4) GFX.print("b-type", 88, 60);
      else if (selection === 5) GFX.print("c-type", 24, 76);
      else if (selection === 6) GFX.print(" off  ", 88, 76);
    }
    // high scores
    var hs = loadScores(gameno);
    for (var i = 0; i < 3; i++) {
      if (hs[i].score > 0 || (editRank && editRank - 1 === i)) {
        GFX.print(String(hs[i].name).toLowerCase().substring(0, 6), 33, 110 + 8 * i);
        GFX.printRight(String(hs[i].score).substring(0, 6), 137, 110 + 8 * i);
      }
    }
  }

  var stMenu = {
    // setMusic here (idempotent) revives the music on every path back to the
    // menu: quitting a paused game, quitting during the game-over collapse...
    enter: function () { NT.bgColor = "#000"; SFX.setMusicPaused(false); SFX.setMusic(musicKey()); },
    update: function (dt) {
      blinkTimer += dt;
      if (blinkTimer > SELECT_BLINK) { selectBlink = !selectBlink; blinkTimer = 0; }
    },
    draw: function () { drawMenuBase(0); },
    press: function (name) {
      var oldMusicno = musicno;
      if (name === "escape") {
        SFX.setMusic("title");
        NT.setState("title");
        return;
      }
      if (name === "backspace") {
        highscores[gameno] = [{ name: "", score: 0 }, { name: "", score: 0 }, { name: "", score: 0 }];
        saveScores();
        return;
      }
      if (name === "enter" || name === "rotr") {
        if (gameno === 1) NT.GAME.loadA(); else NT.GAME.loadB();
        return;
      }
      if (name === "left") {
        if (selection === 2 || selection === 4 || selection === 6) { selection--; selectBlink = true; blinkTimer = 0; }
      } else if (name === "right") {
        if (selection === 1 || selection === 3 || selection === 5) { selection++; selectBlink = true; blinkTimer = 0; }
      } else if (name === "up") {
        if (selection >= 3 && selection <= 6) {
          selection -= 2;
          selectBlink = true; blinkTimer = 0;
          if (selection < 3) { selection = gameno; selectBlink = false; blinkTimer = 0; }
        } else {
          selection = musicno + 2; selectBlink = false; blinkTimer = 0;
        }
      } else if (name === "down") {
        if (selection <= 4) {
          selection += 2;
          selectBlink = true; blinkTimer = 0;
          if (selection > 2 && selection < 5) { selection = musicno + 2; selectBlink = false; blinkTimer = 0; }
        } else {
          selection = gameno; selectBlink = false; blinkTimer = 0;
        }
      } else {
        return; // unhandled key: don't run the sync tail
      }
      // sync tail (original menu keypressed)
      if (selection > 2) {
        musicno = selection - 2;
        if (oldMusicno !== musicno) SFX.setMusic(musicKey());
        NT.store.set("nt2.musicno", musicno);
      } else {
        gameno = selection;
        loadScores(gameno);
        NT.store.set("nt2.gameno", gameno);
      }
    }
  };

  // ---------- options ----------

  var stOptions = {
    enter: function () { NT.bgColor = "#000"; hueLast = NT.options.hue; },
    update: function (dt) {
      blinkTimer += dt;
      if (blinkTimer > SELECT_BLINK) { selectBlink = !selectBlink; blinkTimer = 0; }
      // hue slider: hold left/right (like the original)
      if (optionsChoices[optionsSelection] === "color") {
        var h = NT.options.hue;
        if (NT.INPUT.held("left")) h = Math.max(0, h - 0.5 * dt);
        if (NT.INPUT.held("right")) h = Math.min(1, h + 0.5 * dt);
        NT.options.hue = h;
      }
      hueRecolorTimer += dt;
      if (NT.options.hue !== hueLast && hueRecolorTimer > 0.1) {
        GFX.applyHue(NT.options.hue);
        hueLast = NT.options.hue;
        hueRecolorTimer = 0;
      }
    },
    draw: function (ctx) {
      GFX.draw("options", 0, 0);
      GFX.draw("rainbow", 73, 33);
      GFX.draw("volumeslider", 71 + Math.round(76 * NT.options.volume), 15);
      GFX.draw("volumeslider", 71 + Math.round(76 * NT.options.hue), 31);
      for (var i = 1; i <= 7; i++) GFX.print(" ", 75 + (i - 1) * 11, 50); // blank scale digits
      GFX.print("auto", 75, 50);
      var fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (fs) GFX.print("yes", 96, 66); else GFX.print("no", 133, 66);
      if (selectBlink) GFX.print(optionsChoices[optionsSelection], 19, 18 + optionsSelection * 16);
    },
    press: function (name) {
      var row = optionsChoices[optionsSelection];
      if (name === "escape") {
        NT.saveOptions();
        if (NT.options.hue !== hueLast) { GFX.applyHue(NT.options.hue); hueLast = NT.options.hue; }
        SFX.setMusic("title");
        NT.setState("title");
      } else if (name === "down") {
        optionsSelection = (optionsSelection + 1) % optionsChoices.length;
        selectBlink = true; blinkTimer = 0;
      } else if (name === "up") {
        optionsSelection = (optionsSelection + optionsChoices.length - 1) % optionsChoices.length;
        selectBlink = true; blinkTimer = 0;
      } else if (name === "left" || name === "right") {
        if (row === "volume") {
          var dv = name === "left" ? -0.1 : 0.1;
          NT.options.volume = Math.round(Math.max(0, Math.min(1, NT.options.volume + dv)) * 10) / 10;
          SFX.setVolume(NT.options.volume);
        } else if (row === "fullscrn") {
          NT.toggleFullscreen(name === "left");
        }
      } else if (name === "enter" || name === "rotr") {
        if (row === "volume") { NT.options.volume = 1; SFX.setVolume(1); }
        else if (row === "color") { NT.options.hue = 0.08; }
        else if (row === "fullscrn") { NT.toggleFullscreen(!(document.fullscreenElement || document.webkitFullscreenElement)); }
      }
    }
  };

  // ---------- high score entry ----------

  function checkHighscores(score) {
    var hs = loadScores(gameno);
    hsRank = 0;
    for (var i = 0; i < 3; i++) {
      if (score > hs[i].score) {
        if (i === 0) { hs[2] = hs[1]; hs[1] = hs[0]; }
        else if (i === 1) { hs[2] = hs[1]; }
        hs[i] = { name: "", score: score };
        hsRank = i + 1;
        break;
      }
    }
    if (hsRank === 0) {
      SFX.setMusic(musicKey());
      NT.setState("menu");
      return;
    }
    hsName = "";
    hsPending = 0;
    hsTimer = 0;
    hsMusicChanged = false;
    cursorTimer = 0; cursorBlink = true;
    SFX.setMusic("highscoreintro");
    NT.setState("highscoreentry");
  }

  var stHsEntry = {
    enter: function () { NT.bgColor = "#000"; },
    update: function (dt) {
      hsTimer += dt;
      cursorTimer += dt;
      if (cursorTimer > CURSOR_BLINK) { cursorBlink = !cursorBlink; cursorTimer = 0; }
      if (hsTimer > 1.2 && !hsMusicChanged) {
        hsMusicChanged = true;
        SFX.setMusic("highscoremusic");
      }
      // typed characters
      var chars = NT.INPUT.popChars();
      for (var i = 0; i < chars.length; i++) {
        if (hsName.length < 6) {
          hsName += chars[i];
          SFX.play("highscorebeep");
        }
      }
      highscores[gameno][hsRank - 1].name = hsName;
    },
    draw: function () {
      drawMenuBase(hsRank);
      var y = 110 + 8 * (hsRank - 1);
      if (hsName.length < 6) {
        var cx = 33 + 8 * hsName.length;
        if (cursorBlink) GFX.print(CHARSET[hsPending], cx, y);
        else GFX.print("_", cx, y);
      } else if (cursorBlink) {
        GFX.print("_", 33 + 8 * 5, y);
      }
    },
    press: function (name) {
      if (name === "enter") {
        saveScores();
        SFX.setMusic(musicKey());
        NT.setState("menu");
        return;
      }
      if (name === "backspace" || name === "left") {
        if (hsName.length > 0) { hsName = hsName.substring(0, hsName.length - 1); cursorBlink = true; cursorTimer = 0; }
      } else if (name === "up" || name === "down") {
        var d2 = name === "down" ? 1 : -1;
        hsPending = (hsPending + d2 + CHARSET.length) % CHARSET.length;
        SFX.play("highscorebeep");
        cursorBlink = true; cursorTimer = 0;
      } else if (name === "right" || name === "rotr") {
        if (hsName.length < 6) {
          hsName += CHARSET[hsPending];
          SFX.play("highscorebeep");
        }
      }
      highscores[gameno][hsRank - 1].name = hsName;
    }
  };

  NT.STATES = NT.STATES || {};
  NT.STATES.logo = stLogo;
  NT.STATES.credits = stCredits;
  NT.STATES.title = stTitle;
  NT.STATES.menu = stMenu;
  NT.STATES.options = stOptions;
  NT.STATES.highscoreentry = stHsEntry;

  // restore persisted selections
  gameno = NT.store ? 1 : 1; // NT.store not ready at parse time; fixed in init()

  function init() {
    gameno = NT.store.get("nt2.gameno", 1);
    musicno = NT.store.get("nt2.musicno", 1);
    selection = gameno;
  }

  return {
    init: init,
    checkHighscores: checkHighscores,
    get gameno() { return gameno; },
    get musicno() { return musicno; },
    musicKey: musicKey
  };
})();

/* Not Tetris 2 — web port. Bootstrap, game loop, canvas scaling, touch UI. */
window.NT = window.NT || {};

(function () {
  var SCREEN_W = 160, SCREEN_H = 144;

  NT.state = "boot";
  NT.bgColor = "#fff";

  // ---------- persistence ----------
  NT.store = {
    get: function (key, def) {
      try {
        var v = localStorage.getItem(key);
        return v === null ? def : JSON.parse(v);
      } catch (e) { return def; }
    },
    set: function (key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
    }
  };

  NT.options = {
    volume: NT.store.get("nt2.volume", 1),
    hue: NT.store.get("nt2.hue", 0.08)
  };
  NT.saveOptions = function () {
    NT.store.set("nt2.volume", NT.options.volume);
    NT.store.set("nt2.hue", NT.options.hue);
  };

  // ---------- state machine ----------
  NT.setState = function (name, arg) {
    NT.state = name;
    document.body.classList.toggle("ingame", name === "game"); // hides the ▲ touch button
    var st = NT.STATES[name];
    if (st && st.enter) st.enter(arg);
  };

  // ---------- canvas ----------
  var canvas, ctx, scale = 3;

  function layout() {
    var stage = document.getElementById("stage");
    var box = stage.getBoundingClientRect();
    var cssW = Math.min(box.width, box.height * SCREEN_W / SCREEN_H);
    var cssH = cssW * SCREEN_H / SCREEN_W;
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    var dpr = window.devicePixelRatio || 1;
    scale = Math.max(1, Math.min(10, Math.round(cssW * dpr / SCREEN_W)));
    canvas.width = SCREEN_W * scale;
    canvas.height = SCREEN_H * scale;
    ctx.imageSmoothingEnabled = false; // reset by canvas resize
  }

  // ---------- fullscreen ----------
  NT.toggleFullscreen = function (on) {
    var el = document.documentElement;
    try {
      if (on && !document.fullscreenElement) {
        (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
      } else if (!on && document.fullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
      }
    } catch (e) {}
  };

  // ---------- touch UI ----------
  function setupTouch() {
    var touchDiv = document.getElementById("touch");
    var fsBtn = document.getElementById("fsbtn");

    function showTouchUI() {
      document.body.classList.add("touchmode");
      layout();
    }
    if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) showTouchUI();
    window.addEventListener("pointerdown", function once(e) {
      if (e.pointerType === "touch") { showTouchUI(); window.removeEventListener("pointerdown", once); }
    });

    // multi-touch button tracking (slide between buttons supported)
    var owner = {}; // pointerId -> button name
    function buttonAt(x, y) {
      var el = document.elementFromPoint(x, y);
      while (el && el !== touchDiv && !el.dataset.btn) el = el.parentElement;
      return el && el.dataset && el.dataset.btn ? el : null;
    }
    function pDown(e) {
      var el = buttonAt(e.clientX, e.clientY);
      if (!el) return;
      e.preventDefault();
      var name = el.dataset.btn;
      if (owner[e.pointerId] !== name) {
        if (owner[e.pointerId]) NT.INPUT.injectUp(owner[e.pointerId]);
        owner[e.pointerId] = name;
        NT.INPUT.injectDown(name);
        el.classList.add("held");
        if (navigator.vibrate) navigator.vibrate(8);
      }
    }
    function pMove(e) {
      if (owner[e.pointerId] === undefined) return;
      var el = buttonAt(e.clientX, e.clientY);
      var name = el ? el.dataset.btn : null;
      if (name !== owner[e.pointerId]) {
        release(e.pointerId);
        if (name) {
          owner[e.pointerId] = name;
          NT.INPUT.injectDown(name);
          el.classList.add("held");
        }
      }
    }
    function release(pid) {
      var name = owner[pid];
      if (name) {
        NT.INPUT.injectUp(name);
        var el = touchDiv.querySelector('[data-btn="' + name + '"]');
        if (el) el.classList.remove("held");
      }
      delete owner[pid];
    }
    touchDiv.addEventListener("pointerdown", pDown);
    touchDiv.addEventListener("pointermove", pMove);
    touchDiv.addEventListener("pointerup", function (e) { release(e.pointerId); });
    touchDiv.addEventListener("pointercancel", function (e) { release(e.pointerId); });
    touchDiv.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    // tapping the screen acts as "enter" outside of gameplay
    canvas.addEventListener("pointerdown", function (e) {
      NT.SFX.unlock();
      if (e.pointerType !== "touch") return;
      if (["logo", "credits", "title", "failed", "rocket"].indexOf(NT.state) >= 0) {
        NT.INPUT.injectDown("enter");
        setTimeout(function () { NT.INPUT.injectUp("enter"); }, 80);
      }
    });

    fsBtn.addEventListener("click", function () {
      NT.toggleFullscreen(!document.fullscreenElement);
    });
  }

  // ---------- loop ----------
  var lastT = 0;

  function frame(tms) {
    requestAnimationFrame(frame);
    var dt = Math.min((tms - lastT) / 1000, 1 / 50); // original minfps clamp
    if (dt < 0) dt = 0;
    lastT = tms;

    NT.INPUT.pollGamepads();
    var st = NT.STATES[NT.state];
    if (!st) return;

    var presses = NT.INPUT.popPresses();
    for (var i = 0; i < presses.length; i++) {
      if (st.press) st.press(presses[i]);
      st = NT.STATES[NT.state]; // state may have changed
    }

    if (st.update) st.update(dt);
    st = NT.STATES[NT.state];

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = NT.bgColor;
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    GFXdraw(st);
  }

  function GFXdraw(st) {
    NT.GFX.setContext(ctx);
    if (st.draw) st.draw(ctx);
  }

  // ---------- boot ----------
  function boot() {
    canvas = document.getElementById("game");
    ctx = canvas.getContext("2d");
    NT.INPUT.attach();
    NT.SFX.init();
    NT.SFX.setVolume(NT.options.volume);
    NT.MENU.init();
    setupTouch();
    layout();

    window.addEventListener("resize", layout);
    window.addEventListener("orientationchange", layout);
    document.addEventListener("fullscreenchange", layout);

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        if (NT.state === "game") NT.GAME.setPause(true);
        else NT.SFX.setMusicPaused(true);
      } else {
        if (NT.SFX.unlocked) NT.SFX.unlock(); // revive the context if the tab switch suspended it
        if (NT.state !== "game") NT.SFX.setMusicPaused(false);
      }
    });

    // audio unlock on any first gesture
    ["pointerdown", "touchend", "keydown"].forEach(function (ev) {
      window.addEventListener(ev, function () { NT.SFX.unlock(); }, { passive: true });
    });

    // loading text
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx.fillStyle = "#444";
    ctx.font = "8px monospace";
    ctx.fillText("loading...", 60, 72);

    NT.GFX.loadAll(NT.options.hue).then(function () {
      NT.setState("logo");
      requestAnimationFrame(function (t) { lastT = t; requestAnimationFrame(frame); });
    }).catch(function (err) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
      ctx.fillStyle = "#a00";
      ctx.fillText("asset load error:", 30, 64);
      ctx.fillText(String(err.message || err).substring(0, 30), 10, 80);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

/* Not Tetris 2 — web port. Unified input: keyboard + gamepad + touch injection.
 * Virtual buttons: left right up down rotl rotr enter escape backspace
 * - held(name): current state (any source)
 * - popPresses(): edge events since last frame, in order
 * - popChars(): typed characters (high score name entry)
 */
window.NT = window.NT || {};

NT.INPUT = (function () {
  var BUTTONS = ["left", "right", "up", "down", "rotl", "rotr", "enter", "escape", "backspace"];

  var kbd = {}, pad = {}, touch = {};       // held state per source
  var presses = [], chars = [];
  var gamepadSeen = false, touchSeen = false;

  // physical key positions -> buttons (covers QWERTY/AZERTY/QWERTZ like the
  // original's y/z/w bindings)
  var KEYMAP = {
    ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
    KeyX: "rotr", KeyZ: "rotl", KeyY: "rotl", KeyW: "rotl",
    Enter: "enter", NumpadEnter: "enter", Escape: "escape", Backspace: "backspace"
  };

  var WHITELIST = /^[0-9a-zA-Z ,\-._]$/;

  function held(name) { return !!(kbd[name] || pad[name] || touch[name]); }

  function press(name) { presses.push(name); }

  function down(map, name) {
    if (!map[name]) { map[name] = true; if (!held2Others(map, name)) press(name); }
  }
  function held2Others(exceptMap, name) {
    // was it already held via another source? (avoid double press events)
    var maps = [kbd, pad, touch];
    for (var i = 0; i < maps.length; i++) if (maps[i] !== exceptMap && maps[i][name]) return true;
    return false;
  }
  function up(map, name) { map[name] = false; }

  // ---- keyboard ----
  function onKeyDown(e) {
    var name = KEYMAP[e.code];
    NT.SFX.unlock();
    if (name) {
      if (!e.repeat) down(kbd, name);
      e.preventDefault();
      return;
    }
    if (e.key && e.key.length === 1 && WHITELIST.test(e.key)) chars.push(e.key.toLowerCase());
  }
  function onKeyUp(e) {
    var name = KEYMAP[e.code];
    if (name) { up(kbd, name); e.preventDefault(); }
  }

  // ---- gamepad ----
  // standard mapping: 0=A(bottom) 1=B(right) 2=X 3=Y 4=LB 5=RB 8=select 9=start 12-15=dpad
  var PADMAP = { 0: "rotr", 1: "rotl", 2: "rotl", 3: "rotr", 4: "rotl", 5: "rotr", 8: "escape", 9: "enter", 12: "up", 13: "down", 14: "left", 15: "right" };
  var DEADZONE = 0.4;
  var prevPadState = {};

  function pollGamepads() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    var state = {};
    for (var i = 0; i < pads.length; i++) {
      var gp = pads[i];
      if (!gp || !gp.connected) continue;
      gamepadSeen = true;
      for (var b in PADMAP) {
        if (gp.buttons[b] && gp.buttons[b].pressed) state[PADMAP[b]] = true;
      }
      if (gp.axes.length >= 2) {
        if (gp.axes[0] < -DEADZONE) state.left = true;
        if (gp.axes[0] > DEADZONE) state.right = true;
        if (gp.axes[1] < -DEADZONE) state.up = true;
        if (gp.axes[1] > DEADZONE) state.down = true;
      }
    }
    for (var j = 0; j < BUTTONS.length; j++) {
      var n = BUTTONS[j];
      if (state[n] && !prevPadState[n]) { down(pad, n); NT.SFX.unlock(); }
      else if (!state[n] && prevPadState[n]) up(pad, n);
    }
    prevPadState = state;
  }

  // ---- touch (called by touch UI) ----
  function injectDown(name) { touchSeen = true; NT.SFX.unlock(); down(touch, name); }
  function injectUp(name) { up(touch, name); }

  function popPresses() { var p = presses; presses = []; return p; }
  function popChars() { var c = chars; chars = []; return c; }
  function clear() { presses = []; chars = []; }

  function attach() {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", function () { kbd = {}; touch = {}; });
    window.addEventListener("gamepadconnected", function () { gamepadSeen = true; });
  }

  return {
    attach: attach,
    held: held,
    pollGamepads: pollGamepads,
    popPresses: popPresses,
    popChars: popChars,
    clear: clear,
    injectDown: injectDown,
    injectUp: injectUp,
    get gamepadSeen() { return gamepadSeen; },
    get touchSeen() { return touchSeen; }
  };
})();

/* Not Tetris 2 — web port. Audio: WebAudio with HTMLAudio fallback.
 * Files exist as .ogg and .m4a; the best supported format is picked at runtime.
 * Music is declarative: states call setMusic(name); playback starts as soon as
 * the context is unlocked (first user gesture) and the buffer is decoded.
 */
window.NT = window.NT || {};

NT.SFX = (function () {
  // name -> [file base, base volume, loop]
  var SOUNDS = {
    themeA: ["themeA", 0.6, true],
    themeB: ["themeB", 0.6, true],
    themeC: ["themeC", 0.6, true],
    title: ["titlemusic", 0.6, true],
    highscoremusic: ["highscoremusic", 0.6, true],
    options: ["musicoptions", 1.0, true],
    rocket1to3: ["rocket1to3", 0.6, false],
    rocket4: ["rocket4", 0.6, false],
    highscoreintro: ["highscoreintro", 0.6, false],
    boot: ["boot", 1, false],
    blockfall: ["blockfall", 1, false],
    turn: ["turn", 1, false],
    move: ["move", 1, false],
    lineclear: ["lineclear", 1, false],
    fourlineclear: ["4lineclear", 1, false],
    gameover1: ["gameover1", 1, false],
    gameover2: ["gameover2", 1, false],
    pause: ["pause", 1, false],
    highscorebeep: ["highscorebeep", 1, false],
    newlevel: ["newlevel", 0.6, false]
  };
  var MUSICS = { themeA: 1, themeB: 1, themeC: 1, title: 1, highscoremusic: 1, options: 1, rocket1to3: 1, rocket4: 1, highscoreintro: 1 };

  var mode = null;            // 'webaudio' | 'tag' | 'off'
  var actx = null, masterGain = null;
  var buffers = {};           // webaudio decoded buffers
  var tags = {};              // fallback <audio> elements
  var unlocked = false;
  var masterVolume = 1;

  var ext = (function () {
    var a = document.createElement("audio");
    if (a.canPlayType && a.canPlayType('audio/ogg; codecs="vorbis"')) return ".ogg";
    return ".m4a";
  })();

  // current music state (declarative)
  var wantMusic = null;       // name or null
  var wantPaused = false;
  var cur = null;             // {name, src(node|tag), startedAt, offset}

  var sfxNodes = {};          // last playing source per sfx name (stop-then-play)

  function url(name) { return "assets/sounds/" + SOUNDS[name][0] + ext; }

  function init() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error("no webaudio");
      actx = new AC();
      masterGain = actx.createGain();
      masterGain.connect(actx.destination);
      mode = "webaudio";
      // start fetching immediately (playback still needs a gesture)
      Object.keys(SOUNDS).forEach(function (name) {
        fetch(url(name)).then(function (r) {
          if (!r.ok) throw new Error("http " + r.status);
          return r.arrayBuffer();
        }).then(function (ab) {
          return new Promise(function (res, rej) { actx.decodeAudioData(ab, res, rej); });
        }).then(function (buf) {
          buffers[name] = buf;
          syncMusic();
        }).catch(function () {
          if (mode === "webaudio" && !buffers[name]) tagFallback(name);
        });
      });
    } catch (e) {
      mode = "tag";
      Object.keys(SOUNDS).forEach(tagFallback);
    }
  }

  function tagFallback(name) {
    if (tags[name]) return;
    try {
      var el = new Audio(url(name));
      el.preload = "auto";
      el.loop = !!SOUNDS[name][2];
      tags[name] = el;
    } catch (e) { /* audio unavailable */ }
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    if (actx && actx.state === "suspended") actx.resume();
    syncMusic();
  }

  function gainFor(name) { return SOUNDS[name][1] * masterVolume; }

  function setVolume(v) {
    masterVolume = v;
    if (masterGain) masterGain.gain.value = 1; // per-source gains carry base*master
    if (cur && cur.gain) cur.gain.gain.value = gainFor(cur.name);
    if (cur && cur.tag) cur.tag.volume = Math.min(1, gainFor(cur.name));
  }

  // ---- sound effects ----
  function play(name) {
    if (!unlocked) return;
    if (buffers[name] && actx) {
      if (sfxNodes[name]) { try { sfxNodes[name].stop(); } catch (e) {} }
      var src = actx.createBufferSource();
      src.buffer = buffers[name];
      var g = actx.createGain();
      g.gain.value = gainFor(name);
      src.connect(g); g.connect(masterGain);
      src.start(0);
      sfxNodes[name] = src;
    } else if (tags[name]) {
      var el = tags[name];
      el.volume = Math.min(1, gainFor(name));
      try { el.currentTime = 0; } catch (e) {}
      el.play().catch(function () {});
    }
  }

  function stop(name) {
    if (sfxNodes[name]) { try { sfxNodes[name].stop(); } catch (e) {} sfxNodes[name] = null; }
    if (tags[name] && !MUSICS[name]) { tags[name].pause(); }
  }

  // ---- music (declarative) ----
  function setMusic(name) {           // name or null
    if (wantMusic === name && !wantPaused) return;
    wantMusic = name;
    wantPaused = false;
    syncMusic();
  }

  function setMusicPaused(p) {
    wantPaused = p;
    syncMusic();
  }

  function stopMusicNow() {
    if (!cur) return;
    if (cur.src) { try { cur.src.stop(); } catch (e) {} }
    if (cur.tag) { cur.tag.pause(); try { cur.tag.currentTime = 0; } catch (e) {} }
    cur = null;
  }

  function syncMusic() {
    // stop current if it no longer matches
    if (cur && (cur.name !== wantMusic || wantPaused)) {
      if (cur.src) {
        // remember position for resume
        cur.offset = (cur.offset + (actx.currentTime - cur.startedAt)) % (buffers[cur.name] ? buffers[cur.name].duration : 1e9);
        try { cur.src.onended = null; cur.src.stop(); } catch (e) {}
        if (cur.name !== wantMusic) cur = null;
        else { cur.src = null; }        // paused: keep offset
      } else if (cur.tag) {
        cur.tag.pause();
        if (cur.name !== wantMusic) { try { cur.tag.currentTime = 0; } catch (e) {} cur = null; }
      }
    }
    if (!wantMusic || wantPaused || !unlocked) return;
    if (cur && (cur.src || (cur.tag && !cur.tag.paused))) return; // already playing

    var name = wantMusic;
    if (buffers[name] && actx) {
      var src = actx.createBufferSource();
      src.buffer = buffers[name];
      src.loop = !!SOUNDS[name][2];
      var g = actx.createGain();
      g.gain.value = gainFor(name);
      src.connect(g); g.connect(masterGain);
      var offset = cur && cur.name === name ? (cur.offset || 0) : 0;
      src.start(0, offset % src.buffer.duration);
      cur = { name: name, src: src, gain: g, startedAt: actx.currentTime, offset: offset };
      if (!SOUNDS[name][2]) src.onended = function () { if (cur && cur.src === src) cur = null; };
    } else if (tags[name]) {
      var el = tags[name];
      el.volume = Math.min(1, gainFor(name));
      el.play().catch(function () {});
      cur = { name: name, tag: el, offset: 0 };
    }
    // else: not decoded yet; syncMusic() re-runs when the buffer arrives
  }

  // elapsed seconds of current (non-looping) music — used by rocket cutscene sync
  function musicElapsed() {
    if (!cur) return null;
    if (cur.src && actx) return cur.offset + (actx.currentTime - cur.startedAt);
    if (cur.tag) return cur.tag.currentTime;
    return null;
  }

  return {
    init: init,
    unlock: unlock,
    play: play,
    stop: stop,
    setMusic: setMusic,
    setMusicPaused: setMusicPaused,
    stopMusicNow: stopMusicNow,
    setVolume: setVolume,
    musicElapsed: musicElapsed,
    get unlocked() { return unlocked; }
  };
})();

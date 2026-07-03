/* Not Tetris 2 — web port. Graphics: asset loading, hue recoloring, bitmap fonts. */
window.NT = window.NT || {};

NT.GFX = (function () {
  var D = NT.DATA;

  // name -> file (relative to page)
  var MANIFEST = {
    stabyourselflogo: "stabyourselflogo.png",
    logo: "logo.png",
    title: "title.png",
    gametype: "gametype.png",
    options: "options.png",
    volumeslider: "volumeslider.png",
    rainbow: "rainbow.png",
    gamebackground: "gamebackground.png",
    gamebackgroundgamea: "gamebackgroundgamea.png",
    gameover: "gameover.png",
    gameovercutoff: "gameovercutoff.png",
    pause: "pause.png",
    pausecutoff: "pausecutoff.png",
    rocket1: "rocket1.png",
    rocket2: "rocket2.png",
    rocket3: "rocket3.png",
    spaceshuttle: "spaceshuttle.png",
    rocketbackground: "rocketbackground.png",
    bigrocketbackground: "bigrocketbackground.png",
    bigrockettakeoffbackground: "bigrockettakeoffbackground.png",
    smoke1left: "smoke1left.png",
    smoke1right: "smoke1right.png",
    smoke2left: "smoke2left.png",
    smoke2right: "smoke2right.png",
    fire1: "fire1.png",
    fire2: "fire2.png",
    firebig1: "firebig1.png",
    firebig2: "firebig2.png",
    congratsline: "congratsline.png",
    font: "font.png",
    fontwhite: "fontwhite.png",
    piece1: "pieces/1.png",
    piece2: "pieces/2.png",
    piece3: "pieces/3.png",
    piece4: "pieces/4.png",
    piece5: "pieces/5.png",
    piece6: "pieces/6.png",
    piece7: "pieces/7.png"
  };
  // rainbow.png is never hue-shifted (same as original)
  var NO_RECOLOR = { rainbow: true };

  var raw = {};      // name -> HTMLImageElement
  var images = {};   // name -> canvas (hue applied) or Image (fallback)
  var canRecolor = true;
  var currentHue = -1;
  var fonts = {};    // 'font' / 'fontwhite' -> {img, spans, map}

  // --- original getrainbowcolor(i): returns [r,g,b] in 0..1 ---
  function rainbow(i) {
    var r, g, b;
    if (i < 1 / 6) { r = 1; g = i * 6; b = 0; }
    else if (i < 2 / 6) { r = (1 / 6 - (i - 1 / 6)) * 6; g = 1; b = 0; }
    else if (i < 3 / 6) { r = 0; g = 1; b = (i - 2 / 6) * 6; }
    else if (i < 4 / 6) { r = 0; g = (1 / 6 - (i - 3 / 6)) * 6; b = 1; }
    else if (i < 5 / 6) { r = (i - 4 / 6) * 6; g = 0; b = 1; }
    else { r = 1; g = 0; b = (1 / 6 - (i - 5 / 6)) * 6; }
    return [r, g, b];
  }

  function lightColor(hue) {
    var c = rainbow(hue);
    return [Math.floor(145 + c[0] * 64), Math.floor(145 + c[1] * 64), Math.floor(145 + c[2] * 64)];
  }
  function darkColor(hue) {
    var c = rainbow(hue);
    return [Math.floor(73 + c[0] * 43), Math.floor(73 + c[1] * 43), Math.floor(73 + c[2] * 43)];
  }

  // recolor one image to a canvas (grey bands -> hue), like newImageData() in main.lua
  function recolorImage(img, hue) {
    var cv = document.createElement("canvas");
    cv.width = img.naturalWidth || img.width;
    cv.height = img.naturalHeight || img.height;
    var cx = cv.getContext("2d", { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    var id = cx.getImageData(0, 0, cv.width, cv.height); // throws if tainted (file://)
    var d = id.data;
    var li = lightColor(hue), da = darkColor(hue);
    for (var p = 0; p < d.length; p += 4) {
      if (d[p + 3] === 0) continue;
      var r = d[p];
      if (r > 203 && r < 213) { d[p] = li[0]; d[p + 1] = li[1]; d[p + 2] = li[2]; }
      else if (r > 107 && r < 117) { d[p] = da[0]; d[p + 1] = da[1]; d[p + 2] = da[2]; }
    }
    cx.putImageData(id, 0, 0);
    return cv;
  }

  function applyHue(hue) {
    currentHue = hue;
    for (var name in raw) {
      if (NO_RECOLOR[name] || !canRecolor) { images[name] = raw[name]; continue; }
      try {
        images[name] = recolorImage(raw[name], hue);
      } catch (e) {
        // canvas tainted (opened via file://): keep original greys
        canRecolor = false;
        for (var n2 in raw) images[n2] = raw[n2];
        break;
      }
    }
    buildFonts();
  }

  function buildFonts() {
    fonts.font = makeFont(images.font, D.fontSpans, D.fontGlyphs);
    fonts.fontwhite = makeFont(images.fontwhite, D.fontWhiteSpans, D.fontWhiteGlyphs);
  }

  function makeFont(img, spans, glyphs) {
    var map = {};
    for (var i = 0; i < glyphs.length; i++) map[glyphs[i]] = spans[i];
    return { img: img, map: map };
  }

  function loadAll(hue) {
    var names = Object.keys(MANIFEST);
    var done = 0;
    return new Promise(function (resolve, reject) {
      names.forEach(function (name) {
        var img = new Image();
        img.onload = function () {
          raw[name] = img;
          if (++done === names.length) { applyHue(hue); resolve(); }
        };
        img.onerror = function () { reject(new Error("failed to load " + MANIFEST[name])); };
        img.src = "assets/graphics/" + MANIFEST[name];
      });
    });
  }

  // --- drawing helpers (all coordinates in 160x144 screen space) ---
  var ctx = null;
  function setContext(c) { ctx = c; }

  function img(name) { return images[name]; }

  function draw(name, x, y) {
    ctx.drawImage(images[name], x, y);
  }

  // draw rotated around origin (ox,oy) in image px, at position (x,y)
  function drawRot(name, x, y, angle, ox, oy) {
    var im = images[name];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(im, -ox, -oy);
    ctx.restore();
  }

  // print with bitmap font; fixed 8px advance (matches original layout math)
  function print(text, x, y, fontName) {
    var f = fonts[fontName || "font"];
    text = String(text);
    var pen = x;
    for (var i = 0; i < text.length; i++) {
      var g = f.map[text[i]];
      if (g) ctx.drawImage(f.img, g[0], 0, g[1], 8, pen, y, g[1], 8);
      pen += 8;
    }
  }

  // right-aligned: last char cell ends at (xEnd+8) — mirrors original offsetX logic
  function printRight(text, xRightCell, y, fontName) {
    text = String(text);
    print(text, xRightCell - 8 * (text.length - 1), y, fontName);
  }

  return {
    loadAll: loadAll,
    applyHue: applyHue,
    setContext: setContext,
    draw: draw,
    drawRot: drawRot,
    img: img,
    print: print,
    printRight: printRight,
    rainbow: rainbow,
    lightColor: lightColor,
    get canRecolor() { return canRecolor; }
  };
})();

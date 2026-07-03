/* Not Tetris 2 — web port. Static data tables.
 * Original game by Maurice (stabyourself.net), licensed WTFPL.
 * Geometry uses "block units": 1 block = 32 original physics px = 8 screen px.
 */
window.NT = window.NT || {};

NT.DATA = (function () {
  // Block-center offsets of the 4 blocks of each piece, in block units,
  // relative to the physics body origin. Matches createtetriA in gameA.lua
  // (original values are in physics px, /32 here).
  var pieces = {
    1: [[-1.5, 0], [-0.5, 0], [0.5, 0], [1.5, 0]],              // I
    2: [[-1, -0.5], [0, -0.5], [1, -0.5], [1, 0.5]],            // J
    3: [[-1, -0.5], [0, -0.5], [1, -0.5], [-1, 0.5]],           // L
    4: [[-0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0.5, -0.5]],    // O
    5: [[-1, 0.5], [0, -0.5], [1, -0.5], [0, 0.5]],             // S
    6: [[-1, -0.5], [0, -0.5], [1, -0.5], [0, 0.5]],            // T
    7: [[0, 0.5], [0, -0.5], [1, 0.5], [-1, -0.5]]              // Z
  };

  // Sprite drawing origin (sprite px) for in-field pieces / preview.
  var pieceCenter = { 1: [17, 5], 2: [13, 9], 3: [13, 9], 4: [9, 9], 5: [13, 9], 6: [13, 9], 7: [13, 9] };
  var pieceCenterPreview = { 1: [17, 5], 2: [15, 7], 3: [11, 7], 4: [9, 9], 5: [13, 9], 6: [13, 7], 7: [13, 9] };

  // Bitmap fonts (LOVE ImageFont layout, parsed at build time).
  // spans: [x, width] per glyph, in image px. Fixed advance of 8 px.
  var fontGlyphs = "0123456789abcdefghijklmnopqrstTuvwxyz.,'C-#_>:<! ";
  var fontWhiteGlyphs = "0123456789abcdefghijklmnopqrstTuvwxyz.,'C-#_>:<!+ ";
  var fontSpans = [[1,7],[9,7],[17,7],[25,7],[33,7],[41,7],[49,7],[57,7],[65,7],[73,7],[81,7],[89,7],[97,7],[105,7],[113,7],[121,7],[129,7],[137,7],[145,7],[153,7],[161,7],[169,7],[177,7],[185,7],[193,7],[201,7],[209,7],[217,7],[225,7],[233,7],[241,6],[248,7],[256,7],[264,7],[272,7],[280,7],[288,7],[296,7],[304,7],[312,8],[321,7],[329,7],[337,8],[346,7],[354,7],[362,7],[370,7],[378,7],[386,8]];
  var fontWhiteSpans = [[1,7],[9,7],[17,7],[25,7],[33,7],[41,7],[49,7],[57,7],[65,7],[73,7],[81,7],[89,7],[97,7],[105,7],[113,7],[121,7],[129,7],[137,7],[145,7],[153,7],[161,7],[169,7],[177,7],[185,7],[193,7],[201,7],[209,7],[217,7],[225,7],[233,7],[241,6],[248,7],[256,7],[264,7],[272,7],[280,7],[288,7],[296,7],[304,7],[312,8],[321,7],[329,7],[337,8],[346,7],[354,7],[362,7],[370,7],[378,7],[386,7],[394,8]];

  var credits = [
    "'Tm and C2011 sy,not",
    "tetris 2 licensed to",
    "  stabyourself.net  ",
    "         and        ",
    "  sub-licensed to   ",
    "      maurice.      ",
    "                    ",
    " C2011 stabyourself ",
    "       dot net.     ",
    "                    ",
    "                    ",
    "all rights reserved.",
    "                    ",
    "  original concept, ",
    " design and program ",
    "by alexey pazhitnov#"
  ];

  return {
    pieces: pieces,
    pieceCenter: pieceCenter,
    pieceCenterPreview: pieceCenterPreview,
    fontGlyphs: fontGlyphs,
    fontWhiteGlyphs: fontWhiteGlyphs,
    fontSpans: fontSpans,
    fontWhiteSpans: fontWhiteSpans,
    credits: credits
  };
})();

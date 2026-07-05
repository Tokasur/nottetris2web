/* Not Tetris 2 — web port. Physics on Planck.js (Box2D).
 *
 * Units: 1 block = 1 meter (original: 1 block = 32 physics px, 1 block = 8 screen px).
 * The playfield matches gameA.lua exactly:
 *   field x in [1.75, 12], rows 1..18 span y in [0, 18], ground top at y=18,
 *   spawn at (7, -2), losing line at y=0.
 * Constants are original values / 32 (px -> blocks).
 */
window.NT = window.NT || {};

NT.PHYS = (function () {
  var pl = window.planck;
  var Vec2 = pl.Vec2;

  var GRAVITY = 15.625;         // 500 px/s²
  var DENSITY = 0.05;           // full piece mass = 4 * 1 * 0.05 = 0.2
  var FRICTION = 0.2;           // box2d default, matches the original's slidy feel
  var WALL_FRICTION = 0.00001;  // side walls (original)
  var DAMPING = 0.5;
  var MIN_AREA = 0.04;          // discard slivers below this (block²) — ~2.5 px² on screen
  var MIN_INRADIUS = 0.0375;    // original largeenough(): 0.04 * meter(30) px / 32
  var GROUP_TOL = 0.0625;       // original: 2 px vertex proximity
  var MIN_MASS = 0.01;          // mass floor: keeps piece/debris ratio ≤ 20:1 so the
                                // solver can't slingshot tiny fragments
  var LIGHT_MASS = 0.03;        // below this, extra damping calms debris quickly
  var MAX_SPEED = 22;           // settled bodies hard speed cap (blocks/s)
  var MAX_SPIN = 15;            // settled bodies spin cap (rad/s)
  var FLYING_SPEED = 6;         // a dynamic body faster than this can't count as landing
  var REST_SPEED = 2.5;         // relative speed below which piece+support "move together"

  var ROWS = 18;
  var FIELD_LEFT = 1.75, FIELD_RIGHT = 12;
  var SPAWN_X = 7, SPAWN_Y = -2;

  // ---------- polygon helpers (points: plain {x,y}, convex) ----------

  function polyArea(pts) {
    var a = 0;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length];
      a += p.x * q.y - q.x * p.y;
    }
    return Math.abs(a) / 2;
  }

  function dedupe(pts) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length];
      var dx = p.x - q.x, dy = p.y - q.y;
      if (dx * dx + dy * dy > 1e-8) out.push(p);
    }
    return out;
  }

  // keep the part of a convex polygon with y <= y0 (keepLess) or y >= y0
  function clipHalf(pts, y0, keepLess) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length];
      var pin = keepLess ? p.y <= y0 : p.y >= y0;
      var qin = keepLess ? q.y <= y0 : q.y >= y0;
      if (pin) out.push(p);
      if (pin !== qin) {
        var t = (y0 - p.y) / (q.y - p.y);
        out.push({ x: p.x + (q.x - p.x) * t, y: y0 });
      }
    }
    return dedupe(out);
  }

  function clipBand(pts, yTop, yBot) {
    return clipHalf(clipHalf(pts, yTop, false), yBot, true);
  }

  function centroid(pts) {
    var cx = 0, cy = 0, aa = 0;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length];
      var cr = p.x * q.y - q.x * p.y;
      cx += (p.x + q.x) * cr; cy += (p.y + q.y) * cr; aa += cr;
    }
    if (Math.abs(aa) < 1e-12) return null;
    return { x: cx / (3 * aa), y: cy / (3 * aa) };
  }

  // port of largeenough(): every edge must be at least MIN_INRADIUS away
  // from the centroid, else box2d chokes on the shape
  function largeEnough(pts) {
    var c = centroid(pts);
    if (!c) return false;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length];
      var tx = q.x - p.x, ty = q.y - p.y;
      var len = Math.sqrt(tx * tx + ty * ty);
      if (len < 1e-9) return false;
      // outward normal projection of (p - c)
      var proj = Math.abs((p.x - c.x) * (ty / len) - (p.y - c.y) * (tx / len));
      if (proj < MIN_INRADIUS) return false;
    }
    return true;
  }

  function validPoly(pts) {
    return pts.length >= 3 && pts.length <= 8 && polyArea(pts) >= MIN_AREA && largeEnough(pts);
  }

  // fixture polygons of a body, in world coordinates (plain points)
  function worldPolys(body) {
    var polys = [];
    for (var f = body.getFixtureList(); f; f = f.getNext()) {
      var s = f.getShape();
      if (s.getType() !== "polygon") continue;
      var pts = [];
      for (var i = 0; i < s.m_count; i++) {
        var w = body.getWorldPoint(s.m_vertices[i]);
        pts.push({ x: w.x, y: w.y });
      }
      polys.push(pts);
    }
    return polys;
  }

  // ---------- world / game ----------

  function newGame() {
    var world = new pl.World({ gravity: new Vec2(0, GRAVITY) });

    var walls = world.createBody({ position: new Vec2(0, 0) });
    function wallFix(x1, y1, x2, y2, side, friction) {
      var f = walls.createFixture({
        shape: new pl.Polygon([new Vec2(x1, y1), new Vec2(x2, y1), new Vec2(x2, y2), new Vec2(x1, y2)]),
        friction: friction
      });
      f.setUserData({ side: side });
      return f;
    }
    wallFix(0.75, -4, 1.75, 19, "left", WALL_FRICTION);
    wallFix(12, -4, 13, 19, "right", WALL_FRICTION);
    var ground = wallFix(1.75, 18, 12, 19, "ground", FRICTION);
    wallFix(-0.25, -5, 13, -4, "ceiling", FRICTION);

    var g = {
      world: world,
      walls: walls,
      groundFix: ground,
      active: null,       // current falling piece body
      settled: [],        // landed bodies
      pendingLand: false
    };

    world.on("begin-contact", function (contact) {
      if (g.pendingLand || !g.active) return;
      var fa = contact.getFixtureA(), fb = contact.getFixtureB();
      var ba = fa.getBody(), bb = fb.getBody();
      if (ba !== g.active && bb !== g.active) return;
      var other = ba === g.active ? fb : fa;
      if (!isLandingFixture(g, other)) return;
      g.pendingLand = true;
    });

    return g;
  }

  // walls/ceiling and flying debris don't count as ground: a fragment that
  // bumps the falling piece mid-air must not steal control of it. A dynamic
  // body only counts when it is slow AND itself resting on something (a body
  // touching nothing but the piece is airborne, whatever its speed).
  function isLandingFixture(g, fixture) {
    var ud = fixture.getUserData();
    if (ud && (ud.side === "left" || ud.side === "right" || ud.side === "ceiling")) return false;
    var body = fixture.getBody();
    if (body.isDynamic()) {
      var v = body.getLinearVelocity();
      if (v.x * v.x + v.y * v.y > FLYING_SPEED * FLYING_SPEED) return false;
      if (!isSupported(g, body)) return false;
    }
    return true;
  }

  // does this body rest on anything besides the active piece and the walls?
  function isSupported(g, body) {
    for (var ce = body.getContactList(); ce; ce = ce.next) {
      if (!ce.contact.isTouching()) continue;
      var fa = ce.contact.getFixtureA();
      var otherF = fa.getBody() === body ? ce.contact.getFixtureB() : fa;
      if (otherF.getBody() === g.active) continue;
      var ud = otherF.getUserData();
      if (ud && (ud.side === "left" || ud.side === "right" || ud.side === "ceiling")) continue;
      return true;
    }
    return false;
  }

  // catches the case begin-contact can't see: the piece riding a body that
  // was moving too fast at first touch and has since slowed down. Requires a
  // small relative velocity ("moving together"), so the aftermath of a debris
  // strike — bodies bouncing apart — doesn't read as a landing.
  function activeTouchesGround(g) {
    var a = g.active;
    if (!a) return false;
    var av = a.getLinearVelocity();
    for (var ce = a.getContactList(); ce; ce = ce.next) {
      var c = ce.contact;
      if (!c.isTouching()) continue;
      var fa = c.getFixtureA();
      var other = fa.getBody() === a ? c.getFixtureB() : fa;
      if (!isLandingFixture(g, other)) continue;
      var ov = other.getBody().getLinearVelocity();
      var dx = av.x - ov.x, dy = av.y - ov.y;
      if (dx * dx + dy * dy < REST_SPEED * REST_SPEED) return true;
    }
    return false;
  }

  // hard cap for settled bodies: debris can push around but never rocket off
  function clampVelocities(g) {
    for (var i = 0; i < g.settled.length; i++) {
      var b = g.settled[i];
      if (!b.isAwake()) continue;
      var v = b.getLinearVelocity();
      var s2 = v.x * v.x + v.y * v.y;
      if (s2 > MAX_SPEED * MAX_SPEED) {
        var k = MAX_SPEED / Math.sqrt(s2);
        b.setLinearVelocity(new Vec2(v.x * k, v.y * k));
      }
      var w = b.getAngularVelocity();
      if (w > MAX_SPIN) b.setAngularVelocity(MAX_SPIN);
      else if (w < -MAX_SPIN) b.setAngularVelocity(-MAX_SPIN);
    }
  }

  function spawnPiece(g, kind, speed) {
    var body = g.world.createBody({
      type: "dynamic",
      position: new Vec2(SPAWN_X, SPAWN_Y),
      bullet: true,
      linearDamping: DAMPING
    });
    var blocks = NT.DATA.pieces[kind];
    for (var i = 0; i < blocks.length; i++) {
      body.createFixture({
        shape: new pl.Box(0.5, 0.5, new Vec2(blocks[i][0], blocks[i][1]), 0),
        density: DENSITY,
        friction: FRICTION
      });
    }
    body.setUserData({ kind: kind, cut: false, polys: null });
    body.setLinearVelocity(new Vec2(0, speed));
    g.active = body;
    g.pendingLand = false;
    return body;
  }

  function settleActive(g) {
    var b = g.active;
    g.active = null;
    g.pendingLand = false;
    if (b) g.settled.push(b);
    return b;
  }

  // area of settled blocks in each row, in block² (threshold is 8.1)
  function rowAreas(g) {
    var areas = new Array(ROWS);
    for (var r = 0; r < ROWS; r++) areas[r] = 0;
    for (var i = 0; i < g.settled.length; i++) {
      var polys = worldPolys(g.settled[i]);
      for (var j = 0; j < polys.length; j++) {
        var pts = polys[j];
        var minY = Infinity, maxY = -Infinity;
        for (var k = 0; k < pts.length; k++) {
          if (pts[k].y < minY) minY = pts[k].y;
          if (pts[k].y > maxY) maxY = pts[k].y;
        }
        var r0 = Math.max(1, Math.floor(minY) + 1);
        var r1 = Math.min(ROWS, Math.ceil(maxY));
        for (var row = r0; row <= r1; row++) {
          var part = clipBand(pts, row - 1, row);
          if (part.length >= 3) areas[row - 1] += polyArea(part);
        }
      }
    }
    return areas;
  }

  // cut one row band [row-1, row] out of every settled body (removeline port)
  function removeRow(g, row) {
    var yT = row - 1, yB = row;
    var EPS = 1e-6;
    var newSettled = [];

    for (var i = 0; i < g.settled.length; i++) {
      var body = g.settled[i];
      var polys = worldPolys(body);
      var parts = [];
      var anyCut = false;

      for (var j = 0; j < polys.length; j++) {
        var pts = polys[j];
        var minY = Infinity, maxY = -Infinity;
        for (var k = 0; k < pts.length; k++) {
          if (pts[k].y < minY) minY = pts[k].y;
          if (pts[k].y > maxY) maxY = pts[k].y;
        }
        if (maxY <= yT + EPS || minY >= yB - EPS) {
          parts.push(pts); // fully outside the band, untouched
        } else {
          anyCut = true;
          var above = clipHalf(pts, yT, true);
          if (validPoly(above)) parts.push(above);
          var below = clipHalf(pts, yB, false);
          if (validPoly(below)) parts.push(below);
        }
      }

      if (!anyCut) { newSettled.push(body); continue; }

      var pos = body.getPosition().clone();
      var angle = body.getAngle();
      var vel = body.getLinearVelocity().clone();
      var angVel = body.getAngularVelocity();
      var ud = body.getUserData() || {};
      g.world.destroyBody(body);

      if (parts.length === 0) continue; // body entirely inside the cleared row

      // group disconnected parts (union-find on vertex proximity, like the original)
      var group = [];
      for (var a = 0; a < parts.length; a++) group[a] = a;
      function find(x) { while (group[x] !== x) { group[x] = group[group[x]]; x = group[x]; } return x; }
      for (var a1 = 0; a1 < parts.length; a1++) {
        for (var a2 = a1 + 1; a2 < parts.length; a2++) {
          var touching = false;
          for (var v1 = 0; v1 < parts[a1].length && !touching; v1++) {
            for (var v2 = 0; v2 < parts[a2].length && !touching; v2++) {
              if (Math.abs(parts[a1][v1].x - parts[a2][v2].x) < GROUP_TOL &&
                  Math.abs(parts[a1][v1].y - parts[a2][v2].y) < GROUP_TOL) touching = true;
            }
          }
          if (touching) group[find(a1)] = find(a2);
        }
      }
      var byGroup = {};
      for (var a3 = 0; a3 < parts.length; a3++) {
        var root = find(a3);
        (byGroup[root] = byGroup[root] || []).push(parts[a3]);
      }

      for (var key in byGroup) {
        var nb = g.world.createBody({
          type: "dynamic",
          position: pos,
          angle: angle,
          linearDamping: DAMPING
        });
        var localPolys = [];
        var groupParts = byGroup[key];
        for (var p2 = 0; p2 < groupParts.length; p2++) {
          var local = [];
          for (var v3 = 0; v3 < groupParts[p2].length; v3++) {
            var lp = nb.getLocalPoint(new Vec2(groupParts[p2][v3].x, groupParts[p2][v3].y));
            local.push({ x: lp.x, y: lp.y });
          }
          try {
            nb.createFixture({
              shape: new pl.Polygon(local.map(function (q) { return new Vec2(q.x, q.y); })),
              density: DENSITY,
              friction: FRICTION
            });
            localPolys.push(local);
          } catch (e) { /* degenerate sliver: skip */ }
        }
        if (!nb.getFixtureList()) { g.world.destroyBody(nb); continue; }
        if (nb.getMass() < MIN_MASS) {
          nb.setMassData({ mass: MIN_MASS, center: nb.getLocalCenter(), I: Math.max(nb.getInertia(), 1e-3) });
        }
        if (nb.getMass() < LIGHT_MASS) {
          nb.setLinearDamping(1.5);
          nb.setAngularDamping(1);
        }
        nb.setLinearVelocity(vel);
        nb.setAngularVelocity(angVel);
        nb.setUserData({ kind: ud.kind, cut: true, polys: localPolys });
        newSettled.push(nb);
      }
    }

    g.settled = newSettled;
  }

  function destroyGround(g) {
    if (g.groundFix) {
      g.walls.destroyFixture(g.groundFix);
      g.groundFix = null;
    }
  }

  function allBelow(g, y) {
    var bodies = g.settled.slice();
    if (g.active) bodies.push(g.active);
    for (var i = 0; i < bodies.length; i++) {
      if (bodies[i].getPosition().y < y) return false;
    }
    return true;
  }

  return {
    GRAVITY: GRAVITY,
    ROWS: ROWS,
    FIELD_LEFT: FIELD_LEFT,
    FIELD_RIGHT: FIELD_RIGHT,
    newGame: newGame,
    spawnPiece: spawnPiece,
    settleActive: settleActive,
    rowAreas: rowAreas,
    removeRow: removeRow,
    destroyGround: destroyGround,
    allBelow: allBelow,
    worldPolys: worldPolys,
    clampVelocities: clampVelocities,
    activeTouchesGround: activeTouchesGround
  };
})();

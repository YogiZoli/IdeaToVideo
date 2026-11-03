// clay.js: everything Soft Clay Chronicle's blocks draw (docs/BUILD_PLAN.md phase 8, DECISIONS 161).
// Own code. Figures and things are three.js primitives pushed around by a little noise so they look
// made by hand; no model files, no image files, no real person, no brand. Faces are never drawn.
//
// The one renderer, the seek-safe `p` value and the release of old scenes are world3d.js's (the 3D
// Explainer's), loaded before this file. The maps are Natural Earth, Archive Collage's map-data.js.

(function (w, d) {
  "use strict";
  var T = w.THREE;
  var K = w.ITV3D.kit;
  var clamp = K.clamp;
  var mix = K.mix;
  var smooth = K.smooth;
  var pop = K.pop;
  var seeded = K.seeded;
  var size = K.size;
  var WIDTH = K.WIDTH;

  var ROOM = 0x1a100a;
  var CLAY = { terra: 0xc4623a, ochre: 0xdfa544, olive: 0x7e8d4e, cream: 0xf0dfc0, walnut: 0x6c4326, stone: 0xb6a58e, skin: 0xd6a378, sea: 0x5e8c92, gold: 0xe2b04a, ink: 0x3b2a20, wine: 0x9c3d33, leaf: 0x6f9150 };
  var GLOW = 0xff9d4d;

  // ---- noise and clay: a position always moves the same way, so no piece ever cracks ----

  function lattice(x, y, z) {
    var h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return h - Math.floor(h);
  }
  function noise(x, y, z) {
    var X = Math.floor(x);
    var Y = Math.floor(y);
    var Z = Math.floor(z);
    var u = smooth(x - X);
    var v = smooth(y - Y);
    var k = smooth(z - Z);
    return mix(
      mix(mix(lattice(X, Y, Z), lattice(X + 1, Y, Z), u), mix(lattice(X, Y + 1, Z), lattice(X + 1, Y + 1, Z), u), v),
      mix(mix(lattice(X, Y, Z + 1), lattice(X + 1, Y, Z + 1), u), mix(lattice(X, Y + 1, Z + 1), lattice(X + 1, Y + 1, Z + 1), u), v),
      k
    );
  }

  var pieces = 0;
  // Pushes a shape around, smooths its normals across its seams, gives it even texture coordinates
  // and a slightly uneven color. `by`: how far, in units.
  function lump(geo, by) {
    var pos = geo.attributes.position;
    var seed = 3.1 * (++pieces % 97);
    var amount = by === undefined ? 0.025 : by;
    var i;
    var key = function (x, y, z) {
      return Math.round(x * 500) + "," + Math.round(y * 500) + "," + Math.round(z * 500);
    };
    var uv = new Float32Array(pos.count * 2);
    var tint = new Float32Array(pos.count * 3);
    for (i = 0; i < pos.count; i++) {
      var x = pos.getX(i);
      var y = pos.getY(i);
      var z = pos.getZ(i);
      var f = 1.7;
      pos.setXYZ(i, x + (noise(x * f + seed, y * f, z * f) - 0.5) * amount * 2, y + (noise(x * f, y * f + seed, z * f) - 0.5) * amount * 2, z + (noise(x * f, y * f, z * f + seed) - 0.5) * amount * 2);
      // around the shape and up it: the seam is at its back, a flat top gets rings
      uv[i * 2] = (Math.atan2(x, z) / 6.2832) * 1.4 + seed;
      uv[i * 2 + 1] = (y + Math.hypot(x, z) * 0.7) * 0.62 + seed;
      var m = 0.95 + noise(x * 2.4 + seed, y * 2.4, z * 2.4) * 0.1;
      tint[i * 3] = m;
      tint[i * 3 + 1] = m;
      tint[i * 3 + 2] = m;
    }
    geo.setAttribute("uv", new T.BufferAttribute(uv, 2));
    geo.setAttribute("color", new T.BufferAttribute(tint, 3));
    geo.computeVertexNormals();
    // the same place on a seam: one normal
    var nor = geo.attributes.normal;
    var sum = {};
    for (i = 0; i < pos.count; i++) {
      var n = key(pos.getX(i), pos.getY(i), pos.getZ(i));
      var s = sum[n] || (sum[n] = [0, 0, 0]);
      s[0] += nor.getX(i);
      s[1] += nor.getY(i);
      s[2] += nor.getZ(i);
    }
    for (i = 0; i < pos.count; i++) {
      var q = sum[key(pos.getX(i), pos.getY(i), pos.getZ(i))];
      var len = Math.hypot(q[0], q[1], q[2]) || 1;
      nor.setXYZ(i, q[0] / len, q[1] / len, q[2] / len);
    }
    return geo;
  }

  // A pressed surface: thumb dents and fingerprints, painted once for the whole page.
  var pressed = null;
  function pressedMap() {
    if (pressed) return pressed;
    var c = d.createElement("canvas");
    c.width = 1024;
    c.height = 1024;
    var g = c.getContext("2d");
    g.fillStyle = "#808080";
    g.fillRect(0, 0, 1024, 1024);
    var r = seeded(41);
    var both = function (x, y, draw) {
      [-1024, 0, 1024].forEach(function (a) {
        [-1024, 0, 1024].forEach(function (b) {
          g.save();
          g.translate(x + a, y + b);
          draw();
          g.restore();
        });
      });
    };
    var i;
    for (i = 0; i < 26; i++) {
      var dark = r() > 0.5;
      var rad = 50 + r() * 110;
      var dx = r() * 1024;
      var dy = r() * 1024;
      both(dx, dy, function () {
        var grad = g.createRadialGradient(0, 0, 0, 0, 0, rad);
        grad.addColorStop(0, dark ? "rgba(40,40,40,0.34)" : "rgba(220,220,220,0.28)");
        grad.addColorStop(1, "rgba(128,128,128,0)");
        g.fillStyle = grad;
        g.fillRect(-rad, -rad, rad * 2, rad * 2);
      });
    }
    for (i = 0; i < 9; i++) {
      var fx = r() * 1024;
      var fy = r() * 1024;
      var turn = r() * 3.14;
      var bend = 0.62 + r() * 0.2;
      both(fx, fy, function () {
        g.rotate(turn);
        g.strokeStyle = "rgba(30,30,30,0.5)";
        g.lineWidth = 2.4;
        for (var k = 1; k <= 13; k++) {
          g.beginPath();
          g.ellipse(0, k * 1.6, k * 8.5 * bend, k * 8.5, 0, 0.18, 6.1);
          g.stroke();
        }
      });
    }
    for (i = 0; i < 2600; i++) {
      g.fillStyle = r() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
      g.fillRect(r() * 1024, r() * 1024, 1 + r() * 3, 1 + r() * 3);
    }
    pressed = new T.CanvasTexture(c);
    pressed.wrapS = T.RepeatWrapping;
    pressed.wrapT = T.RepeatWrapping;
    return pressed;
  }

  function clayOf(stage, color) {
    stage.clays = stage.clays || {};
    if (!stage.clays[color]) stage.clays[color] = new T.MeshStandardMaterial({ color: color, roughness: 0.84, metalness: 0, vertexColors: true, bumpMap: pressedMap(), bumpScale: 1.7 });
    return stage.clays[color];
  }

  // ---- shapes ---------------------------------------------------------------------------

  var ball = function (r) {
    return new T.SphereGeometry(r, 36, 26);
  };
  var egg = function (a, b, c) {
    return new T.SphereGeometry(1, 36, 26).scale(a, b, c);
  };
  var can = function (a, b, h, n) {
    return new T.CylinderGeometry(a, b, h, n || 30, 7);
  };
  var bar = function (r, h) {
    return new T.CapsuleGeometry(r, h, 8, 18, 5);
  };
  var cone = function (r, h, n) {
    return new T.ConeGeometry(r, h, n || 28, 8);
  };
  var ring = function (r, t) {
    return new T.TorusGeometry(r, t, 14, 44);
  };
  // A box whose corners a thumb has rounded.
  function slab(a, b, c, r) {
    var round = Math.min(r === undefined ? 0.08 : r, a / 2.01, b / 2.01, c / 2.01);
    var g = new T.BoxGeometry(a, b, c, 9, 9, 9);
    var p = g.attributes.position;
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i);
      var y = p.getY(i);
      var z = p.getZ(i);
      var ix = clamp(x, -a / 2 + round, a / 2 - round);
      var iy = clamp(y, -b / 2 + round, b / 2 - round);
      var iz = clamp(z, -c / 2 + round, c / 2 - round);
      var dx = x - ix;
      var dy = y - iy;
      var dz = z - iz;
      var len = Math.hypot(dx, dy, dz);
      if (len > 0) p.setXYZ(i, ix + (dx / len) * round, iy + (dy / len) * round, iz + (dz / len) * round);
    }
    return g;
  }

  // ---- figures: rounded, faceless, told apart by what they wear ---------------------------

  function limb(p, x, color) {
    var g = new T.Group();
    g.position.set(x, 1.3, 0);
    p.into(g, function () {
      p(bar(0.1, 0.46), color, 0, -0.3, 0);
      p(ball(0.11), CLAY.skin, 0, -0.62, 0);
    });
    p.g.add(g);
    return g;
  }
  function person(p, o) {
    p(bar(0.14, 0.4), o.legs || CLAY.ink, 0.17, 0.33);
    p(bar(0.14, 0.4), o.legs || CLAY.ink, -0.17, 0.33);
    p(egg(0.17, 0.09, 0.25), CLAY.walnut, 0.17, 0.08, 0.06);
    p(egg(0.17, 0.09, 0.25), CLAY.walnut, -0.17, 0.08, 0.06);
    p(new T.LatheGeometry([[0.0001, 0.5], [0.5, 0.56], [0.44, 0.9], [0.36, 1.24], [0.2, 1.4], [0.0001, 1.42]].map(function (q) { return new T.Vector2(q[0], q[1]); }), 30), o.coat);
    p(ball(0.33), CLAY.skin, 0, 1.76);
    p.g.userData.arms = [limb(p, 0.42, o.coat), limb(p, -0.42, o.coat)];
    p.g.userData.arms[0].rotation.z = 0.14;
    p.g.userData.arms[1].rotation.z = -0.14;
    if (o.hat) o.hat(p);
  }

  // Every thing stands on y = 0 and is about 2 units tall. `p(shape, color, x, y, z, rx, ry, rz)`.
  var THINGS = {
    scroll: function (p) {
      // open, leaning back: a roller above, a roller below, a band of red around the upper one
      p(slab(1.5, 1.5, 0.07, 0.03), CLAY.cream, 0, 1.02, -0.12, -0.16);
      p(bar(0.17, 1.6), CLAY.cream, 0, 0.2, 0, 0, 0, 1.5708);
      p(bar(0.17, 1.6), CLAY.cream, 0, 1.82, -0.26, 0, 0, 1.5708);
      p(can(0.19, 0.19, 0.16), CLAY.terra, 0, 1.82, -0.26, 0, 0, 1.5708);
      for (var i = 0; i < 4; i++) p(slab(1 - (i % 2) * 0.24, 0.05, 0.04, 0.02), CLAY.walnut, 0, 0.62 + i * 0.27, -0.03 - i * 0.043, -0.16);
    },
    figure: function (p) {
      person(p, { coat: CLAY.terra });
    },
    king: function (p) {
      person(p, {
        coat: CLAY.wine,
        hat: function (q) {
          q(can(0.3, 0.27, 0.2), CLAY.gold, 0, 2.08);
          for (var i = 0; i < 6; i++) q(cone(0.07, 0.17, 10), CLAY.gold, Math.cos(i * 1.047) * 0.27, 2.25, Math.sin(i * 1.047) * 0.27);
        },
      });
    },
    queen: function (p) {
      person(p, {
        coat: CLAY.olive,
        hat: function (q) {
          q(ring(0.25, 0.05), CLAY.gold, 0, 2.06, 0, 1.5708);
          q(ball(0.08), CLAY.gold, 0, 2.2);
        },
      });
    },
    soldier: function (p) {
      person(p, {
        coat: CLAY.sea,
        hat: function (q) {
          q(new T.SphereGeometry(0.37, 30, 16, 0, 6.2832, 0, 1.6), CLAY.stone, 0, 1.8);
          q(can(0.46, 0.46, 0.04), CLAY.stone, 0, 1.82);
        },
      });
    },
    sailor: function (p) {
      person(p, {
        coat: CLAY.sea,
        legs: CLAY.cream,
        hat: function (q) {
          q(can(0.34, 0.36, 0.16), CLAY.cream, 0, 2.03);
        },
      });
    },
    farmer: function (p) {
      person(p, {
        coat: CLAY.leaf,
        hat: function (q) {
          q(can(0.56, 0.56, 0.05), CLAY.ochre, 0, 1.98);
          q(can(0.26, 0.31, 0.26), CLAY.ochre, 0, 2.1);
        },
      });
    },
    scholar: function (p) {
      person(p, {
        coat: CLAY.ink,
        hat: function (q) {
          q(slab(0.66, 0.05, 0.66, 0.02), CLAY.ink, 0, 2.08);
          q(can(0.26, 0.29, 0.16), CLAY.ink, 0, 2);
        },
      });
    },
    crowd: function (p, c, g, stage) {
      [[0, -0.5, 0.86, CLAY.terra], [-0.95, 0.1, 0.8, CLAY.olive], [0.95, 0.1, 0.8, CLAY.sea], [-0.4, 0.75, 0.72, CLAY.ochre], [0.5, 0.75, 0.72, CLAY.wine]].forEach(function (f) {
        var one = new T.Group();
        one.position.set(f[0], 0, f[1]);
        one.scale.setScalar(f[2]);
        g.add(one);
        var q = maker(stage, one);
        person(q, { coat: f[3] });
      });
    },
    castle: function (p) {
      p(slab(2.2, 1, 1.4, 0.06), CLAY.stone, 0, 0.5);
      [-1.08, 1.08].forEach(function (x) {
        p(can(0.36, 0.4, 1.6), CLAY.stone, x, 0.8);
        p(cone(0.44, 0.56), CLAY.terra, x, 1.88);
      });
      p(slab(0.5, 0.66, 0.08, 0.1), CLAY.ink, 0, 0.33, 0.7);
      for (var i = 0; i < 4; i++) p(slab(0.2, 0.2, 0.34, 0.04), CLAY.stone, -0.5 + i * 0.34, 1.1, 0.5);
    },
    tower: function (p) {
      p(can(0.5, 0.62, 2.1), CLAY.stone, 0, 1.05);
      p(can(0.62, 0.56, 0.22), CLAY.stone, 0, 2.15);
      p(slab(0.2, 0.34, 0.06, 0.05), CLAY.ink, 0, 1.4, 0.56);
    },
    house: function (p) {
      p(slab(1.7, 1, 1.3, 0.08), CLAY.cream, 0, 0.5);
      p(cone(1.38, 0.86, 4), CLAY.terra, 0, 1.42, 0, 0, 0.7854);
      p(slab(0.34, 0.6, 0.06, 0.05), CLAY.walnut, 0, 0.3, 0.66);
      p(slab(0.28, 0.28, 0.06, 0.04), CLAY.sea, 0.52, 0.56, 0.66);
    },
    temple: function (p) {
      p(slab(2.5, 0.2, 1.5, 0.04), CLAY.stone, 0, 0.1);
      for (var i = 0; i < 5; i++) p(can(0.13, 0.15, 1.2), CLAY.cream, -1 + i * 0.5, 0.8, 0.5);
      for (i = 0; i < 5; i++) p(can(0.13, 0.15, 1.2), CLAY.cream, -1 + i * 0.5, 0.8, -0.5);
      p(slab(2.5, 0.16, 1.5, 0.03), CLAY.stone, 0, 1.48);
      p(cone(1.56, 0.5, 4), CLAY.stone, 0, 1.76, 0, 0, 0.7854).scale.set(1, 1, 0.6);
    },
    pyramid: function (p) {
      p(cone(1.75, 2.1, 4), CLAY.ochre, 0, 1.05, 0, 0, 0.7854);
    },
    ship: function (p) {
      var hull = lump(new T.SphereGeometry(1, 34, 18, 0, 6.2832, 1.5708, 1.5708).scale(1.35, 0.6, 0.48));
      p(hull, CLAY.walnut, 0, 0.62, 0, 0, 0, 0, true);
      p(can(0.05, 0.06, 1.8), CLAY.walnut, 0, 1.36);
      p(slab(0.08, 0.95, 1, 0.03), CLAY.cream, 0.05, 1.5, 0);
      p(cone(0.1, 0.2, 10), CLAY.terra, 0, 2.32);
    },
    cart: function (p) {
      p(slab(1.6, 0.42, 0.9, 0.05), CLAY.walnut, 0, 0.74);
      [[-0.55, 0.5], [0.55, 0.5], [-0.55, -0.5], [0.55, -0.5]].forEach(function (q) {
        p(ring(0.3, 0.06), CLAY.ink, q[0], 0.34, q[1]);
        p(ball(0.08), CLAY.ink, q[0], 0.34, q[1]);
      });
      p(bar(0.04, 0.9), CLAY.walnut, 1.25, 0.66, 0, 0, 0, 1.3);
    },
    horse: function (p) {
      p(egg(0.86, 0.42, 0.36), CLAY.walnut, 0, 1.14);
      [[-0.56, 0.2], [0.56, 0.2], [-0.56, -0.2], [0.56, -0.2]].forEach(function (q) {
        p(bar(0.1, 0.72), CLAY.walnut, q[0], 0.46, q[1]);
      });
      p(bar(0.17, 0.5), CLAY.walnut, 0.82, 1.56, 0, 0, 0, -0.5);
      p(egg(0.34, 0.17, 0.16), CLAY.walnut, 1.14, 1.86, 0, 0, 0, -0.35);
      p(slab(0.16, 0.5, 0.06, 0.03), CLAY.ink, 0.72, 1.7, 0, 0, 0, -0.5);
      p(bar(0.06, 0.5), CLAY.ink, -0.94, 0.98, 0, 0, 0, -0.25);
    },
    wheel: function (p) {
      p(ring(0.86, 0.1), CLAY.walnut, 0, 1);
      p(can(0.18, 0.18, 0.24), CLAY.ink, 0, 1, 0, 1.5708);
      for (var i = 0; i < 4; i++) p(bar(0.05, 1.6), CLAY.walnut, 0, 1, 0, 0, 0, (i * 3.1416) / 4);
    },
    crown: function (p) {
      p(can(0.82, 0.74, 0.62), CLAY.gold, 0, 0.32);
      for (var i = 0; i < 7; i++) {
        var a = (i / 7) * 6.2832;
        p(cone(0.17, 0.5, 12), CLAY.gold, Math.cos(a) * 0.8, 0.85, Math.sin(a) * 0.8);
        p(ball(0.08), CLAY.wine, Math.cos(a) * 0.8, 1.12, Math.sin(a) * 0.8);
      }
    },
    coin: function (p) {
      p(can(0.92, 0.92, 0.2, 40), CLAY.gold, 0, 0.94, 0, 1.5708);
      p(ring(0.72, 0.05), CLAY.ochre, 0, 0.94, 0.1);
    },
    chest: function (p) {
      p(slab(1.8, 0.86, 1.1, 0.06), CLAY.walnut, 0, 0.43);
      p(new T.CylinderGeometry(0.55, 0.55, 1.8, 26, 7, false, 0, 3.1416), CLAY.walnut, 0, 0.86, 0, 0, 1.5708, 1.5708);
      p(slab(0.28, 0.34, 0.08, 0.04), CLAY.gold, 0, 0.8, 0.56);
      [-0.62, 0.62].forEach(function (x) {
        p(slab(0.14, 0.88, 1.14, 0.03), CLAY.ink, x, 0.44);
        p(new T.TorusGeometry(0.56, 0.06, 10, 26, 3.1416), CLAY.ink, x, 0.86, 0, 0, 1.5708);
      });
    },
    book: function (p) {
      p(slab(1.6, 0.14, 2.1, 0.05), CLAY.terra, 0, 0.07);
      p(slab(1.46, 0.36, 1.96, 0.04), CLAY.cream, 0.02, 0.3);
      p(slab(1.6, 0.14, 2.1, 0.05), CLAY.terra, 0, 0.54);
    },
    letter: function (p) {
      // stands leaning on a small block, its seal to the front
      p(slab(0.7, 0.34, 0.5, 0.06), CLAY.walnut, 0, 0.17, -0.34);
      p(slab(2, 1.4, 0.1, 0.03), CLAY.cream, 0, 0.74, 0, -0.24);
      p(can(0.25, 0.25, 0.08), CLAY.wine, 0, 0.78, 0.15, 1.33);
    },
    quill: function (p) {
      p(can(0.42, 0.5, 0.56), CLAY.ink, -0.3, 0.28);
      var plume = p(egg(0.26, 0.9, 0.05), CLAY.cream, 0.12, 1.3, 0, 0, 0, -0.42);
      plume.castShadow = true;
    },
    hourglass: function (p) {
      p(slab(1.2, 0.14, 1.2, 0.05), CLAY.walnut, 0, 0.07);
      p(slab(1.2, 0.14, 1.2, 0.05), CLAY.walnut, 0, 2.03);
      p(new T.LatheGeometry([[0.0001, 0.14], [0.46, 0.2], [0.42, 0.62], [0.08, 1.05], [0.42, 1.48], [0.46, 1.9], [0.0001, 1.96]].map(function (q) { return new T.Vector2(q[0], q[1]); }), 28), CLAY.ochre);
    },
    clock: function (p) {
      p(can(0.94, 0.94, 0.26, 40), CLAY.walnut, 0, 1, 0, 1.5708);
      p(can(0.8, 0.8, 0.04, 40), CLAY.cream, 0, 1, 0.14, 1.5708);
      p(slab(0.07, 0.58, 0.04, 0.02), CLAY.ink, 0.13, 1.22, 0.17, 0, 0, -0.5);
      p(slab(0.07, 0.42, 0.04, 0.02), CLAY.ink, -0.12, 1.12, 0.17, 0, 0, 0.8);
    },
    key: function (p) {
      p(ring(0.4, 0.12), CLAY.gold, 0, 1.6);
      p(can(0.09, 0.09, 1.25, 16), CLAY.gold, 0, 0.72);
      p(slab(0.34, 0.14, 0.1, 0.03), CLAY.gold, 0.2, 0.22);
      p(slab(0.26, 0.14, 0.1, 0.03), CLAY.gold, 0.16, 0.5);
    },
    lantern: function (p) {
      p(can(0.56, 0.62, 0.14), CLAY.ink, 0, 0.07);
      p(can(0.42, 0.42, 1, 24), CLAY.ochre, 0, 0.64);
      p(cone(0.62, 0.42), CLAY.ink, 0, 1.34);
      p(ring(0.2, 0.04), CLAY.ink, 0, 1.68);
    },
    candle: function (p) {
      p(can(0.72, 0.78, 0.12), CLAY.gold, 0, 0.06);
      p(can(0.24, 0.26, 1.3), CLAY.cream, 0, 0.76);
      p(egg(0.1, 0.22, 0.1), CLAY.ochre, 0, 1.58);
    },
    globe: function (p) {
      p(ball(0.82), CLAY.sea, 0, 1.2);
      p(egg(0.4, 0.34, 0.1), CLAY.olive, 0.18, 1.36, 0.72);
      p(egg(0.26, 0.42, 0.1), CLAY.olive, -0.42, 1, 0.64, 0, -0.5);
      p(can(0.5, 0.62, 0.14), CLAY.walnut, 0, 0.07);
      p(can(0.06, 0.06, 0.4, 12), CLAY.walnut, 0, 0.28);
    },
    telescope: function (p) {
      p(can(0.16, 0.26, 1.7), CLAY.gold, 0, 1.4, 0, 0, 0, 1.1);
      [-0.5, 0, 0.5].forEach(function (x, i) {
        p(can(0.04, 0.05, 1.5, 10), CLAY.walnut, x * 0.8, 0.62, i === 1 ? -0.4 : 0.2, i === 1 ? 0.45 : -0.2, 0, -x * 0.6);
      });
    },
    anchor: function (p) {
      p(can(0.09, 0.09, 1.7, 16), CLAY.ink, 0, 1);
      p(ring(0.2, 0.06), CLAY.ink, 0, 2);
      p(slab(0.8, 0.1, 0.1, 0.03), CLAY.ink, 0, 1.62);
      p(new T.TorusGeometry(0.74, 0.09, 12, 36, 3.1416), CLAY.ink, 0, 0.82, 0, 0, 0, 3.1416);
      p(cone(0.14, 0.26, 12), CLAY.ink, -0.74, 0.92);
      p(cone(0.14, 0.26, 12), CLAY.ink, 0.74, 0.92);
    },
    flag: function (p) {
      p(can(0.06, 0.07, 2.3, 14), CLAY.walnut, -0.6, 1.15);
      p(slab(1.3, 0.8, 0.06, 0.03), CLAY.terra, 0.08, 1.84);
      p(can(0.32, 0.38, 0.12), CLAY.walnut, -0.6, 0.06);
    },
    vase: function (p) {
      p(new T.LatheGeometry([[0.0001, 0], [0.34, 0.02], [0.62, 0.62], [0.68, 1.04], [0.4, 1.56], [0.24, 1.78], [0.36, 2], [0.26, 2.02], [0.0001, 1.9]].map(function (q) { return new T.Vector2(q[0], q[1]); }), 34), CLAY.terra);
      p(ring(0.24, 0.05), CLAY.terra, 0.42, 1.62, 0);
      p(ring(0.24, 0.05), CLAY.terra, -0.42, 1.62, 0);
    },
    wheat: function (p) {
      [-0.3, 0, 0.3].forEach(function (x) {
        p(can(0.03, 0.035, 1.5, 8), CLAY.ochre, x * 0.7, 0.75, 0, 0, 0, -x * 0.5);
        for (var i = 0; i < 6; i++) p(egg(0.07, 0.14, 0.07), CLAY.gold, x * 1.4 + (i % 2 ? 0.08 : -0.08), 1.36 + i * 0.12, 0);
      });
    },
    tree: function (p) {
      p(can(0.14, 0.22, 1, 18), CLAY.walnut, 0, 0.5);
      p(ball(0.72), CLAY.leaf, 0, 1.4);
      p(ball(0.48), CLAY.leaf, 0.5, 1.12, 0.1);
      p(ball(0.5), CLAY.leaf, -0.46, 1.16, -0.1);
    },
    mountain: function (p) {
      p(cone(1.4, 2.1, 12), CLAY.stone, 0, 1.05);
      p(cone(0.52, 0.72, 12), CLAY.cream, 0, 1.76);
      p(cone(0.86, 1.2, 12), CLAY.olive, 1, 0.6, 0.3);
    },
    bridge: function (p) {
      p(new T.TorusGeometry(0.92, 0.22, 14, 34, 3.1416), CLAY.stone, 0, 0.1);
      p(slab(2.9, 0.16, 0.76, 0.04), CLAY.stone, 0, 1.2);
      p(slab(0.42, 1.16, 0.7, 0.05), CLAY.stone, -1.24, 0.58);
      p(slab(0.42, 1.16, 0.7, 0.05), CLAY.stone, 1.24, 0.58);
    },
    mill: function (p) {
      p(can(0.5, 0.74, 1.7), CLAY.cream, 0, 0.85);
      p(cone(0.58, 0.46), CLAY.terra, 0, 1.92);
      for (var i = 0; i < 4; i++) p(slab(0.2, 1, 0.04, 0.02), CLAY.walnut, Math.sin(i * 1.5708) * 0.52, 1.6 + Math.cos(i * 1.5708) * 0.52, 0.64, 0, 0, -i * 1.5708);
    },
    tent: function (p) {
      p(cone(1.3, 1.5, 10), CLAY.cream, 0, 0.75);
      p(slab(0.42, 0.74, 0.05, 0.05), CLAY.walnut, 0, 0.37, 1.02, -0.5);
      p(can(0.03, 0.03, 0.5, 8), CLAY.ink, 0, 1.68);
    },
    factory: function (p) {
      p(slab(2.2, 1, 1.2, 0.05), CLAY.wine, 0, 0.5);
      p(can(0.2, 0.28, 1.5), CLAY.walnut, -0.66, 1.65);
      p(can(0.2, 0.28, 1.2), CLAY.walnut, 0.26, 1.5);
      p(ball(0.2), CLAY.stone, -0.74, 2.54);
      p(ball(0.14), CLAY.stone, -0.88, 2.78);
      p(slab(0.3, 0.34, 0.05, 0.04), CLAY.ochre, 0.6, 0.56, 0.61);
    },
    train: function (p) {
      p(can(0.42, 0.42, 1.8), CLAY.ink, -0.1, 0.84, 0, 0, 0, 1.5708);
      p(slab(0.8, 1.04, 0.9, 0.06), CLAY.wine, -1, 1);
      p(can(0.12, 0.17, 0.56), CLAY.ink, 0.46, 1.46);
      [-1, -0.2, 0.5].forEach(function (x) {
        p(can(0.3, 0.3, 0.1), CLAY.walnut, x, 0.3, 0.46, 1.5708);
        p(can(0.3, 0.3, 0.1), CLAY.walnut, x, 0.3, -0.46, 1.5708);
      });
    },
  };

  // `p`: a shape into the group, as clay. p.into puts the next shapes into another group.
  function maker(stage, group) {
    var p = function (geo, color, x, y, z, rx, ry, rz, done) {
      var m = new T.Mesh(done ? geo : lump(geo), clayOf(stage, color));
      m.position.set(x || 0, y || 0, z || 0);
      m.rotation.set(rx || 0, ry || 0, rz || 0);
      m.castShadow = true;
      m.receiveShadow = true;
      p.g.add(m);
      return m;
    };
    p.g = group;
    p.into = function (g, fill) {
      var was = p.g;
      p.g = g;
      fill();
      p.g = was;
    };
    return p;
  }
  function makeThing(stage, id, scale) {
    var g = new T.Group();
    (THINGS[id] || THINGS.scroll)(maker(stage, g), stage.c, g, stage);
    if (scale) g.scale.setScalar(scale);
    return g;
  }

  // ---- the table: wood, a sheet of old paper on it, a real map on the paper ----------------

  var TABLE_W = 32;
  var TABLE_H = 16;
  var SHEET = 3072;
  function mapView(lon, lat, span) {
    var wide = clamp(span, 8, 340);
    var mid = clamp(lat, -62, 74);
    var cos = Math.cos((mid * Math.PI) / 180);
    return { lon: lon, lat: mid, cos: cos, ppd: SHEET / (wide * cos) };
  }
  function project(v, lon, lat) {
    return [SHEET / 2 + (lon - v.lon) * v.cos * v.ppd, SHEET / 4 - (lat - v.lat) * v.ppd];
  }
  // The point on the table under a place.
  function onTable(v, lon, lat) {
    var q = project(v, lon, lat);
    return { x: (q[0] / SHEET - 0.5) * TABLE_W, z: (q[1] / (SHEET / 2) - 0.5) * TABLE_H };
  }
  function world() {
    return w.ITV_WORLD || { countries: [], cities: [] };
  }
  function findPlace(id) {
    var key = String(id || "");
    var W = world();
    var i;
    for (i = 0; i < W.countries.length; i++) if (W.countries[i].id === key) return W.countries[i];
    for (i = 0; i < W.cities.length; i++) if (W.cities[i].id === key) return W.cities[i];
    return null;
  }
  // The camera sees about this part of the table's width.
  var SEEN = 0.45;
  function viewForPlace(p) {
    if (!p) return mapView(15, 40, 150);
    if (!p.box) return mapView(p.lon, p.lat, 34 / SEEN);
    return mapView((p.box[0] + p.box[2]) / 2, (p.box[1] + p.box[3]) / 2, (Math.max(p.box[2] - p.box[0], (p.box[3] - p.box[1]) * 1.78) * 3 + 8) / SEEN);
  }
  function viewForRoute(a, b) {
    if (!a || !b) return mapView(15, 40, 150);
    var mid = (a.lat + b.lat) / 2;
    var cos = Math.cos((clamp(mid, -62, 74) * Math.PI) / 180);
    return mapView((a.lon + b.lon) / 2, mid, Math.max(Math.abs(a.lon - b.lon) / 0.6, (Math.abs(a.lat - b.lat) * 1.78) / 0.46 / cos, 24) / SEEN);
  }
  // Scenes that are not about a place lie on one of these, chosen by the scene.
  var SHEETS = [mapView(14, 42, 130), mapView(30, 32, 120), mapView(-40, 30, 170), mapView(95, 28, 150)];

  function trace(g, v, x) {
    for (var i = 0; i < x.rings.length; i++) {
      var r = x.rings[i];
      var first = project(v, r[0], r[1]);
      g.moveTo(first[0], first[1]);
      for (var k = 2; k < r.length; k += 2) {
        var q = project(v, r[k], r[k + 1]);
        g.lineTo(q[0], q[1]);
      }
      g.closePath();
    }
  }
  function compass(g, x, y, r) {
    g.save();
    g.translate(x, y);
    g.strokeStyle = "rgba(92,58,30,0.55)";
    g.fillStyle = "rgba(92,58,30,0.5)";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, r, 0, 6.2832);
    g.stroke();
    for (var i = 0; i < 8; i++) {
      g.rotate(0.7854);
      var long = i % 2 ? r * 1.2 : r * 0.72;
      g.beginPath();
      g.moveTo(0, -long);
      g.lineTo(r * 0.1, 0);
      g.lineTo(-r * 0.1, 0);
      g.closePath();
      g.fill();
    }
    g.restore();
  }
  var papers = {};
  var paperKeys = [];
  function paper(v, marked) {
    var id = [v.lon, v.lat, v.ppd, marked || ""].join("|");
    if (papers[id]) return papers[id];
    var c = d.createElement("canvas");
    c.width = SHEET;
    c.height = SHEET / 2;
    var g = c.getContext("2d");
    var H = SHEET / 2;
    var r = seeded(23);
    g.fillStyle = "#3a2314";
    g.fillRect(0, 0, SHEET, H);
    var i;
    for (i = 0; i < 480; i++) {
      g.strokeStyle = r() > 0.5 ? "rgba(20,10,4,0.16)" : "rgba(120,80,48,0.1)";
      g.lineWidth = 1 + r() * 5;
      var y = r() * H;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(SHEET * 0.3, y + (r() - 0.5) * 30, SHEET * 0.7, y + (r() - 0.5) * 30, SHEET, y + (r() - 0.5) * 16);
      g.stroke();
    }
    // the sheet, its edge torn by small steps
    var edge = function () {
      var pts = [];
      var m = SHEET * 0.04;
      var n = 90;
      var at = function (a, b) {
        pts.push([a + (r() - 0.5) * 16, b + (r() - 0.5) * 16]);
      };
      for (i = 0; i < n; i++) at(m + ((SHEET - 2 * m) * i) / n, m);
      for (i = 0; i < n / 2; i++) at(SHEET - m, m + ((H - 2 * m) * i) / (n / 2));
      for (i = 0; i < n; i++) at(SHEET - m - ((SHEET - 2 * m) * i) / n, H - m);
      for (i = 0; i < n / 2; i++) at(m, H - m - ((H - 2 * m) * i) / (n / 2));
      g.beginPath();
      pts.forEach(function (q, k) {
        if (k) g.lineTo(q[0], q[1]);
        else g.moveTo(q[0], q[1]);
      });
      g.closePath();
    };
    g.save();
    edge();
    g.shadowColor = "rgba(0,0,0,0.65)";
    g.shadowBlur = 40;
    g.fillStyle = "#d8c096";
    g.fill();
    g.restore();
    g.save();
    edge();
    g.clip();
    for (i = 0; i < 46; i++) {
      var sx = r() * SHEET;
      var sy = r() * H;
      var sr = 60 + r() * 300;
      var stain = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
      stain.addColorStop(0, r() > 0.5 ? "rgba(146,104,56,0.13)" : "rgba(255,240,205,0.14)");
      stain.addColorStop(1, "rgba(146,104,56,0)");
      g.fillStyle = stain;
      g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }
    g.strokeStyle = "rgba(92,58,30,0.2)";
    g.lineWidth = 2;
    var grid = v.ppd > 40 ? 5 : v.ppd > 16 ? 10 : 20;
    for (i = -180; i <= 180; i += grid) {
      var a = project(v, i, -85);
      var b = project(v, i, 85);
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
    }
    for (i = -80; i <= 80; i += grid) {
      var e = project(v, -180, i);
      var f = project(v, 180, i);
      g.beginPath();
      g.moveTo(e[0], e[1]);
      g.lineTo(f[0], f[1]);
      g.stroke();
    }
    g.beginPath();
    world().countries.forEach(function (x) {
      trace(g, v, x);
    });
    g.fillStyle = "rgba(160,120,74,0.5)";
    g.fill();
    g.strokeStyle = "rgba(92,58,30,0.7)";
    g.lineWidth = 3;
    g.lineJoin = "round";
    g.stroke();
    var hit = marked && findPlace(marked);
    if (hit && hit.rings) {
      g.beginPath();
      trace(g, v, hit);
      g.fillStyle = "rgba(196,98,58,0.62)";
      g.fill();
      g.strokeStyle = "#6f3218";
      g.lineWidth = 5;
      g.stroke();
    }
    compass(g, SHEET * 0.83, H * 0.76, 92);
    g.restore();
    papers[id] = c;
    paperKeys.push(id);
    // each is about 18 MB: only the last few stay
    while (paperKeys.length > 4) delete papers[paperKeys.shift()];
    return c;
  }

  // ---- the room: one warm lamp above a table, the rest falls away into the dark -------------

  function dress(stage, view) {
    var s = stage.scene;
    s.background = new T.Color(ROOM);
    s.fog = new T.Fog(ROOM, 20, 52);
    s.add(new T.HemisphereLight(0xffdcb0, 0x2a1709, 0.62));
    var lamp = new T.SpotLight(0xffd29a, 2.9, 80, 0.46, 1, 0);
    lamp.position.set(-5, 17, 8);
    lamp.target.position.set(view.lampAt ? view.lampAt[0] : 0, 0, view.lampAt ? view.lampAt[1] : 0);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1536, 1536);
    lamp.shadow.radius = 7;
    lamp.shadow.bias = -0.0006;
    lamp.shadow.normalBias = 0.02;
    s.add(lamp, lamp.target);
    stage.lamp = lamp;
    var fill = new T.DirectionalLight(0xffb878, 0.3);
    fill.position.set(8, 5, 6);
    s.add(fill);
    var v = view.map || SHEETS[stage.seed % SHEETS.length];
    var tex = new T.CanvasTexture(paper(v, view.marked));
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 8;
    var top = new T.Mesh(new T.PlaneGeometry(TABLE_W, TABLE_H), new T.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0 }));
    top.rotation.x = -Math.PI / 2;
    top.receiveShadow = true;
    s.add(top);
    var under = new T.Mesh(new T.PlaneGeometry(240, 240), new T.MeshStandardMaterial({ color: 0x28170d, roughness: 1 }));
    under.rotation.x = -Math.PI / 2;
    under.position.y = -0.02;
    s.add(under);
  }

  // A soft glow on the thing the story is about: a warm light, a halo behind it, and its own clay
  // lit a little from inside. It breathes slowly, from t alone.
  var haloImage = null;
  function halo() {
    if (haloImage) return haloImage;
    var c = d.createElement("canvas");
    c.width = 256;
    c.height = 256;
    var g = c.getContext("2d");
    var grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(255,190,120,0.42)");
    grad.addColorStop(0.45, "rgba(255,160,90,0.14)");
    grad.addColorStop(1, "rgba(255,150,80,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    haloImage = c;
    return c;
  }
  function glowOn(stage, g, scale, at) {
    var own = {};
    var made = [];
    g.traverse(function (o) {
      if (!o.isMesh) return;
      var key = o.material.uuid;
      if (!own[key]) {
        own[key] = o.material.clone();
        own[key].emissive = new T.Color(GLOW);
        made.push(own[key]);
      }
      o.material = own[key];
    });
    var tex = new T.CanvasTexture(halo());
    tex.colorSpace = T.SRGBColorSpace;
    var sprite = new T.Sprite(new T.SpriteMaterial({ map: tex, blending: T.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
    sprite.scale.setScalar(5.6 * scale);
    sprite.position.set(g.position.x, scale, g.position.z - 1.4 * scale);
    stage.scene.add(sprite);
    var light = new T.PointLight(0xffb06a, 7, 8, 1.5);
    light.position.set(g.position.x + 1.1 * scale, 1.5 * scale, g.position.z + 1.9 * scale);
    stage.scene.add(light);
    return function (t) {
      var b = 0.5 + 0.5 * Math.sin(t * 1.5);
      // it comes up with the thing, never before it
      var on = smooth(clamp((t - at) / 0.9));
      made.forEach(function (m) {
        m.emissiveIntensity = (0.04 + 0.03 * b) * on;
      });
      sprite.material.opacity = (0.72 + 0.28 * b) * on;
      light.intensity = (2.6 + 1.2 * b) * on;
    };
  }

  // One thing on the table, popping up and turning a little. `lit`: the story's glow is on it.
  function hero(stage, id, x, z, scale, at, lit, y) {
    var g = makeThing(stage, id);
    g.position.set(x, y || 0, z);
    stage.scene.add(g);
    var glow = lit ? glowOn(stage, g, scale, at || 0) : null;
    return function (t) {
      g.scale.setScalar(scale * pop(t, at || 0.05, 0.8));
      g.rotation.y = 0.32 * stage.side * Math.sin(t * 0.34);
      if (glow) glow(t);
    };
  }

  // ---- the words on screen: a note of old paper, or cream type in the dark above the table ---

  var CSS =
    ".clay-root{position:absolute;inset:0;width:1920px;height:1080px;overflow:hidden;color:var(--fg);font-family:var(--font-body);background:var(--bg)}" +
    ".clay-view{position:absolute;left:0;top:0;width:1920px;height:1080px}" +
    ".clay-clip{position:absolute;inset:0}" +
    ".clay-head{position:absolute;left:0;right:0;margin:0 auto;text-align:center;font-family:var(--font-display);font-weight:700;line-height:1.08;color:var(--fg);text-shadow:0 4px 26px rgba(0,0,0,0.75);opacity:0}" +
    ".clay-kick{position:absolute;left:0;right:0;margin:0 auto;text-align:center;font-family:var(--font-body);font-size:40px;font-style:italic;color:var(--accent-2);text-shadow:0 2px 16px rgba(0,0,0,0.8);opacity:0}" +
    ".clay-note{position:absolute;font-family:var(--font-display);font-weight:700;line-height:1.12;color:#2e1c10;background:#efdcb8;border-radius:14px 22px 16px 24px;padding:18px 34px 22px;box-shadow:0 12px 34px rgba(0,0,0,0.5),inset 0 0 26px rgba(148,102,54,0.24);opacity:0}" +
    ".clay-note b{font-weight:700;color:#a8441f}" +
    ".clay-panel{position:absolute;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:22px;align-items:flex-start}" +
    ".clay-panel .clay-note{position:relative}" +
    ".clay-tag{position:absolute;left:0;top:0;width:0;height:0}" +
    ".clay-tag>div{position:absolute;transform:translate(-50%,0);width:max-content;max-width:560px;text-align:center}" +
    ".clay-mark{position:relative;display:inline-block;z-index:0}" +
    ".clay-mark i{position:absolute;left:-4px;right:-4px;bottom:0;height:13px;background:#d0764a;border-radius:7px;transform-origin:0 50%;transform:scaleX(0);z-index:-1;opacity:0.72}" +
    ".clay-date{position:absolute;left:46px;top:40px;font-family:var(--font-body);font-size:34px;font-weight:600;line-height:1;letter-spacing:0.03em;color:#2e1c10;background:#efdcb8;border-radius:8px 12px 9px 13px;padding:11px 20px 13px;box-shadow:0 6px 18px rgba(0,0,0,0.45)}";
  function style() {
    if (d.getElementById("clay-style")) return;
    var s = d.createElement("style");
    s.id = "clay-style";
    s.textContent = CSS;
    d.head.appendChild(s);
  }

  var enter = { opacity: 1, y: 0, scale: 1, duration: 0.65, ease: "back.out(1.5)" };
  function appear(tl, el, at) {
    tl.fromTo(el, { opacity: 0, y: 26, scale: 0.96 }, enter, at);
  }
  function make(view, cls, text, place, px, room) {
    var e = d.createElement("div");
    e.className = cls;
    if (text !== null) e.textContent = text;
    e.style.cssText += ";" + (place || "") + ";font-size:" + px + "px;max-width:" + room + "px";
    (view.into || view.words).appendChild(e);
    return e;
  }
  function head(view, tl, text, top, base, lines, at) {
    appear(tl, make(view, "clay-head", text, "top:" + top + "px", size(text, base, 1680, lines), 1740), at === undefined ? 0.16 : at);
  }
  function note(view, tl, text, place, base, room, lines, at) {
    var e = make(view, "clay-note", text, place, size(text, base, room - 70, lines), room);
    appear(tl, e, at);
    return e;
  }
  // Paper notes in the left or the right part of the frame, centered on its height.
  function panel(view, tl, lines, side, base) {
    var box = d.createElement("div");
    box.className = "clay-panel";
    box.style.left = (side === "left" ? 96 : 1000) + "px";
    box.style.width = "830px";
    view.words.appendChild(box);
    view.into = box;
    lines.filter(Boolean).forEach(function (text, i) {
      note(view, tl, text, i ? "margin-left:34px" : "", base, 790, 3, 0.2 + i * 0.34);
    });
    view.into = null;
  }
  function tagFor(view, tl, text, base, at) {
    var box = d.createElement("div");
    box.className = "clay-tag";
    view.words.appendChild(box);
    var inner = make({ words: box }, "clay-note", text, "position:absolute;transform:translate(-50%,0);width:max-content;text-align:center", size(text, base || 54, 490, 2), 560);
    tl.fromTo(inner, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, ease: "back.out(1.5)" }, at);
    return box;
  }
  function pin(box, q) {
    box.style.transform = "translate(" + Math.round(q.x) + "px," + Math.round(q.y) + "px)";
  }

  // ---- the scene kinds: words(view, tl, v) and build(stage, v, D, view) -> update(t) --------

  var KINDS = {
    title: {
      words: function (view, tl, v) {
        if (v.kicker) appear(tl, make(view, "clay-kick", v.kicker, "top:64px", 40, 1700), 0.1);
        head(view, tl, v.headline, 114, 124, 2);
      },
      build: function (s, v, D) {
        var one = hero(s, v.object, 0, 0, 1.3, 0.05, true);
        return function (t) {
          s.view(t, D, { az: [0.3, -0.1], el: [0.17, 0.12], dist: [12.6, 10.8], look: [0, 1.25, 0], shift: [0, 0.16] });
          one(t);
        };
      },
    },
    // A new part of the story: the lamp comes up on a closed book.
    chapter: {
      words: function (view, tl, v) {
        head(view, tl, v.headline, 104, 112, 2, 0.34);
      },
      build: function (s, v, D) {
        var bed = makeThing(s, "book", 1.5);
        bed.rotation.y = 0.16;
        s.scene.add(bed);
        var one = hero(s, v.object, 0, 0, 1.02, 0.28, true, 0.92);
        var full = s.lamp.intensity;
        return function (t) {
          s.lamp.intensity = full * mix(0.16, 1, smooth(clamp(t / 0.8)));
          s.view(t, D, { az: [-0.34, 0.26], el: [0.3, 0.2], dist: [15, 13.4], look: [0, 1.2, 0], shift: [0, 0.16] });
          one(t);
        };
      },
    },
    statement: {
      words: function (view, tl, v) {
        panel(view, tl, [v.line1, v.line2], "right", 92);
      },
      build: function (s, v, D) {
        var one = hero(s, v.object, 0, 0, 1.25, 0.05, true);
        return function (t) {
          s.view(t, D, { az: [0.4, 0.06], el: [0.24, 0.16], dist: [11.4, 10], look: [0, 1.2, 0], shift: [-0.25, 0.05] });
          one(t);
        };
      },
    },
    word: {
      words: function (view, tl, v) {
        var e = make(view, "clay-head", v.word, "top:72px;color:var(--brand)", size(v.word, 208, 1680, 1), 1740);
        appear(tl, e, 0.1);
      },
      build: function (s, v, D) {
        var one = hero(s, v.object, 0, 0, 1.3, 0.05, true);
        return function (t) {
          s.view(t, D, { az: [-0.36, 0.3], el: [0.15, 0.11], dist: [12.8, 11.6], look: [0, 1.2, 0], shift: [0, 0.2] });
          one(t);
        };
      },
    },
    highlight: {
      words: function (view, tl, v) {
        var text = String(v.line);
        var e = note(view, tl, text, "left:96px;top:50%;margin-top:-150px", 92, 830, 3, 0.16);
        var mark = String(v.mark || "").trim();
        var at = mark ? text.toLowerCase().indexOf(mark.toLowerCase()) : -1;
        if (at < 0) return;
        e.textContent = "";
        e.appendChild(d.createTextNode(text.slice(0, at)));
        var word = d.createElement("span");
        word.className = "clay-mark";
        word.textContent = text.slice(at, at + mark.length);
        var bar2 = d.createElement("i");
        word.appendChild(bar2);
        e.appendChild(word);
        e.appendChild(d.createTextNode(text.slice(at + mark.length)));
        tl.fromTo(bar2, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: "power2.inOut" }, 0.72);
      },
      build: function (s, v, D) {
        var one = hero(s, v.object, 0, 0, 1.25, 0.05, true);
        return function (t) {
          s.view(t, D, { az: [-0.3, 0.16], el: [0.18, 0.24], dist: [11.6, 10.2], look: [0, 1.2, 0], shift: [0.25, 0.05] });
          one(t);
        };
      },
    },
    // Somebody looks at the thing, and wonders.
    question: {
      words: function (view, tl, v) {
        panel(view, tl, [String(v.question).replace(/[?\s]*$/, "?")], "right", 92);
      },
      build: function (s, v, D) {
        var who = makeThing(s, "figure");
        who.position.set(-1.25, 0, 0.1);
        who.rotation.y = 0.85;
        s.scene.add(who);
        var one = hero(s, v.object || "scroll", 0.95, 0.15, 0.88, 0.3, true);
        var arm = who.userData.arms[0];
        return function (t) {
          s.view(t, D, { az: [0.32, -0.06], el: [0.2, 0.15], dist: [11.6, 10.2], look: [0, 1.1, 0], shift: [-0.24, 0.05] });
          who.scale.setScalar(1.05 * pop(t, 0.04, 0.8));
          // a hand comes up to the chin, and stays
          arm.rotation.z = 0.14 + 2 * smooth(clamp((t - 0.5) / 0.7));
          one(t);
        };
      },
    },
    number: {
      words: function (view, tl, v) {
        var pre = v.before ? String(v.before) : "";
        var post = v.after ? String(v.after) : "";
        if (post.length > 2) post = " " + post;
        var end = Number(v.value) || 0;
        view.count = note(view, tl, "0", "left:96px;top:50%;margin-top:-140px;font-variant-numeric:tabular-nums;color:#a8441f", size(pre + end.toLocaleString("en-US") + post, 196, 760, 1), 830, 1, 0.08);
        view.ends = [pre, post, end];
      },
      build: function (s, v, D, view) {
        var end = view.ends[2];
        var digits = (String(v.value).split(".")[1] || "").length;
        var spots = [[0, 0], [1.9, 0.2], [-1.9, -0.2], [0.9, 1.8], [-1, 1.9], [1, -1.8], [-0.9, -1.9], [2.8, 1.8], [-2.9, 1.7]];
        // up to nine: exactly as many as the voice says, more than that is a crowd
        var many = Number.isInteger(end) && end >= 1 && end < spots.length ? end : spots.length;
        var pile = spots.slice(0, many).map(function (q, i) {
          return hero(s, v.object, q[0], q[1], 0.72, 0.1 + i * 0.12, i === 0);
        });
        return function (t) {
          s.view(t, D, { az: [0.42, 0.1], el: [0.32, 0.24], dist: [15.4, 14], look: [0, 1, 0], shift: [0.23, 0.06] });
          pile.forEach(function (f) { f(t); });
          var k = smooth(clamp((t - 0.1) / 1.5));
          var now = end * (1 - Math.pow(1 - k, 3));
          view.count.textContent = view.ends[0] + (t >= 1.6 ? end : now).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + view.ends[1];
        };
      },
    },
    // A year, large, in the dark above the table. Never with a thousands comma.
    year: {
      words: function (view, tl, v) {
        var e = make(view, "clay-head", "", "top:64px;color:var(--accent-2);font-variant-numeric:tabular-nums;letter-spacing:0.02em", 220, 1740);
        appear(tl, e, 0.08);
        view.count = e;
        if (v.line) note(view, tl, v.line, "left:50%;bottom:150px;transform:translateX(-50%);width:max-content;text-align:center", 54, 1320, 1, 0.75);
      },
      build: function (s, v, D, view) {
        var end = Math.round(Number(v.value)) || 0;
        var one = hero(s, v.object || "hourglass", 0, 0, 1.15, 0.05, true);
        return function (t) {
          s.view(t, D, { az: [-0.26, 0.2], el: [0.14, 0.11], dist: [13.4, 12.2], look: [0, 1.15, 0], shift: [0, 0.14] });
          one(t);
          // the last years tick by
          var k = smooth(clamp((t - 0.1) / 1.1));
          view.count.textContent = String(Math.round(end - 40 * (1 - k)));
        };
      },
    },
    // The thing the story is about, alone on a cloth in the lamp's light.
    relic: {
      words: function (view, tl, v) {
        if (v.line) note(view, tl, v.line, "left:50%;bottom:142px;transform:translateX(-50%);width:max-content;text-align:center", 62, 1400, 1, 0.5);
      },
      build: function (s, v, D) {
        var cloth = maker(s, new T.Group());
        s.scene.add(cloth.g);
        cloth(egg(1.75, 0.08, 1.35), 0x74302a, 0, 0.05);
        var one = hero(s, v.object, 0, 0, 1.28, 0.12, true);
        var full = s.lamp.intensity;
        return function (t) {
          s.lamp.intensity = full * 0.82;
          s.view(t, D, { az: [0.5, 0.14], el: [0.3, 0.2], dist: [11.4, 9.8], look: [0, 1.1, 0], shift: [0, -0.04] });
          cloth.g.scale.setScalar(pop(t, 0, 0.5));
          one(t);
        };
      },
    },
    map: {
      words: function (view, tl, v) {
        var place = findPlace(v.place);
        view.map = viewForPlace(place);
        view.marked = v.place;
        view.at = place ? onTable(view.map, place.lon, place.lat) : { x: 0, z: 0 };
        view.lampAt = [view.at.x, view.at.z];
        var name = v.label || (place ? place.name : "");
        view.tag = name ? tagFor(view, tl, name, 72, 0.55) : null;
        if (v.line && v.line !== name) note(view, tl, v.line, "left:96px;top:118px", 50, 1300, 1, 0.85);
      },
      build: function (s, v, D, view) {
        var at = view.at;
        var one = pinAt(s, at.x, at.z, 0.2);
        return function (t) {
          s.view(t, D, { az: [0.2, -0.08], el: [0.92, 0.82], dist: [15, 13], look: [at.x, 0, at.z], shift: [0, 0.03] });
          one(t);
          if (view.tag) pin(view.tag, s.screen(at.x, 0, at.z + 0.9));
        };
      },
    },
    // A rope of clay across the map, with who or what travels on it.
    route: {
      words: function (view, tl, v) {
        var a = findPlace(v.fromPlace);
        var b = findPlace(v.toPlace);
        view.map = viewForRoute(a, b);
        view.from = a ? onTable(view.map, a.lon, a.lat) : { x: -4, z: 1 };
        view.to = b ? onTable(view.map, b.lon, b.lat) : { x: 4, z: -1 };
        view.lampAt = [(view.from.x + view.to.x) / 2, (view.from.z + view.to.z) / 2];
        view.go = Math.max(1.1, view.D * 0.62);
        var nameA = v.fromLabel || (a ? a.name : "");
        var nameB = v.toLabel || (b ? b.name : "");
        view.tags = [nameA ? tagFor(view, tl, nameA, 60, 0.3) : null, nameB ? tagFor(view, tl, nameB, 60, 0.15 + view.go) : null];
        if (v.line) note(view, tl, v.line, "left:96px;top:118px", 50, 1300, 1, 0.6);
      },
      build: function (s, v, D, view) {
        var a = view.from;
        var b = view.to;
        var far = Math.hypot(b.x - a.x, b.z - a.z);
        var bend = far * 0.2;
        var path = new T.QuadraticBezierCurve3(new T.Vector3(a.x, 0.08, a.z), new T.Vector3((a.x + b.x) / 2 + ((b.z - a.z) / (far || 1)) * bend, 0.08, (a.z + b.z) / 2 - ((b.x - a.x) / (far || 1)) * bend), new T.Vector3(b.x, 0.08, b.z));
        var rope = new T.TubeGeometry(path, 90, 0.075, 8);
        var track = new T.Mesh(rope, new T.MeshStandardMaterial({ color: CLAY.terra, roughness: 0.84 }));
        track.castShadow = true;
        s.scene.add(track);
        var total = rope.index.count;
        var pinA = pinAt(s, a.x, a.z, 0.06);
        var pinB = pinAt(s, b.x, b.z, 0.15 + view.go);
        var who = makeThing(s, v.object === "ship" || v.object === "cart" || v.object === "horse" || v.object === "sailor" || v.object === "soldier" || v.object === "king" ? v.object : "figure");
        s.scene.add(who);
        var small = clamp(far * 0.1, 0.7, 1);
        var dist = Math.max(11, far * 1.4);
        return function (t) {
          s.view(t, D, { az: [-0.12, 0.1], el: [0.94, 0.86], dist: [dist * 1.06, dist], look: [view.lampAt[0], 0, view.lampAt[1]], shift: [0, 0.02] });
          pinA(t);
          pinB(t);
          var k = smooth(clamp((t - 0.15) / view.go));
          rope.setDrawRange(0, Math.floor((total * k) / 6) * 6);
          var q = path.getPoint(k);
          var ahead = path.getPoint(Math.min(1, k + 0.01));
          who.position.set(q.x, 0.06, q.z);
          who.rotation.y = Math.atan2(ahead.x - q.x, ahead.z - q.z) - 1.5708;
          who.scale.setScalar(small * pop(t, 0.05, 0.5));
          if (view.tags[0]) pin(view.tags[0], s.screen(a.x, 0, a.z + 0.7));
          if (view.tags[1]) pin(view.tags[1], s.screen(b.x, 0, b.z + 0.7));
        };
      },
    },
    // Two people, one of them speaking, what they speak about between them.
    talk: {
      words: function (view, tl, v) {
        view.tag = tagFor(view, tl, v.said, 56, 0.35);
      },
      build: function (s, v, D, view) {
        var isPerson = /^(figure|king|queen|soldier|sailor|farmer|scholar)$/.test(v.object);
        var a = makeThing(s, isPerson ? v.object : "figure");
        var b = makeThing(s, isPerson && v.object !== "scholar" ? "scholar" : "farmer");
        a.position.set(-1.7, 0, 0);
        b.position.set(1.7, 0, 0);
        a.rotation.y = 0.85;
        b.rotation.y = -0.85;
        s.scene.add(a, b);
        var prop = !isPerson ? hero(s, v.object, 0, 0.6, 0.62, 0.4, true) : null;
        return function (t) {
          s.view(t, D, { az: [-0.2, 0.2], el: [0.2, 0.16], dist: [11.4, 10.2], look: [0, 1.1, 0], shift: [0, 0.13] });
          a.scale.setScalar(1.12 * pop(t, 0.04, 0.8));
          b.scale.setScalar(1.12 * pop(t, 0.18, 0.8));
          // the speaker's hand and head move; the other one nods now and then
          a.userData.arms[0].rotation.z = 0.5 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2.6));
          a.rotation.z = 0.02 * Math.sin(t * 1.3);
          b.rotation.x = 0.03 * Math.max(0, Math.sin(t * 0.9));
          if (prop) prop(t);
          pin(view.tag, s.screen(-1.7, 2.75, 0));
        };
      },
    },
    versus: {
      words: function (view, tl, v) {
        view.tags = [tagFor(view, tl, v.left, 54, 0.2), tagFor(view, tl, v.right, 54, 0.55)];
      },
      build: function (s, v, D, view) {
        var base = maker(s, new T.Group());
        s.scene.add(base.g);
        base(can(1.8, 1.94, 0.34, 40), CLAY.terra, -3.1, 0.17);
        base(can(1.8, 1.94, 0.34, 40), CLAY.olive, 3.1, 0.17);
        var a = makeThing(s, v.leftObject);
        var b = makeThing(s, v.rightObject);
        a.position.set(-3.1, 0.34, 0);
        b.position.set(3.1, 0.34, 0);
        s.scene.add(a, b);
        return function (t) {
          s.view(t, D, { az: [-0.14, 0.14], el: [0.22, 0.18], dist: [15, 13.8], look: [0, 1.4, 0], shift: [0, 0] });
          a.scale.setScalar(1.25 * pop(t, 0.05, 0.8));
          b.scale.setScalar(1.25 * pop(t, 0.4, 0.8));
          a.rotation.y = 0.26 * Math.sin(t * 0.5);
          b.rotation.y = -0.26 * Math.sin(t * 0.5);
          pin(view.tags[0], s.screen(-3.1, 0, 2.2));
          pin(view.tags[1], s.screen(3.1, 0, 2.2));
        };
      },
    },
    cause: {
      words: function (view, tl, v) {
        view.tags = [tagFor(view, tl, v.from, 54, 0.2), tagFor(view, tl, v.to, 54, Math.max(0.9, view.D * 0.42))];
      },
      build: function (s, v, D, view) {
        var a = makeThing(s, v.fromObject);
        var b = makeThing(s, v.toObject);
        a.position.set(-3.5, 0, 0);
        b.position.set(3.5, 0, 0);
        s.scene.add(a, b);
        var path = new T.QuadraticBezierCurve3(new T.Vector3(-2.1, 1.2, 0), new T.Vector3(0, 3.3, 0), new T.Vector3(2, 1.4, 0));
        var rope = new T.TubeGeometry(path, 60, 0.07, 8);
        s.scene.add(new T.Mesh(rope, new T.MeshStandardMaterial({ color: CLAY.terra, roughness: 0.84 })));
        var p = maker(s, new T.Group());
        s.scene.add(p.g);
        p(cone(0.22, 0.5, 18), CLAY.terra, 2.05, 1.36, 0, 0, 0, -2.3);
        var bead = p(ball(0.24), CLAY.gold, 0, 0, 0);
        var total = rope.index.count;
        var go = Math.max(0.6, D * 0.42);
        return function (t) {
          s.view(t, D, { az: [0.16, -0.12], el: [0.17, 0.13], dist: [15.2, 13.9], look: [0, 1.3, 0], shift: [0, 0] });
          a.scale.setScalar(1.2 * pop(t, 0.05, 0.8));
          b.scale.setScalar(1.2 * pop(t, 0.35 + go, 0.8));
          a.rotation.y = 0.26 * Math.sin(t * 0.5);
          b.rotation.y = -0.26 * Math.sin(t * 0.5);
          var k = smooth(clamp((t - 0.5) / go));
          rope.setDrawRange(0, Math.floor((total * k) / 6) * 6);
          bead.position.copy(path.getPoint(k));
          bead.visible = k > 0 && k < 1;
          p.g.children[0].visible = k >= 1;
          pin(view.tags[0], s.screen(-3.5, 0, 1.9));
          pin(view.tags[1], s.screen(3.5, 0, 1.9));
        };
      },
    },
    // Three or four things laid out in a row, one after the other.
    board: {
      words: function (view, tl, v) {
        var items = [v.item1, v.item2, v.item3, v.item4].filter(Boolean);
        view.n = items.length;
        view.step = Math.min(0.55, view.D * 0.16);
        view.tags = items.map(function (text, i) {
          return tagFor(view, tl, text, 46, 0.25 + i * view.step);
        });
      },
      build: function (s, v, D, view) {
        var n = view.n;
        var wide = n > 3 ? 3.6 : 4.2;
        var xs = [];
        for (var i = 0; i < n; i++) xs.push((i - (n - 1) / 2) * wide);
        var things = xs.map(function (x, k) {
          return hero(s, v["object" + (k + 1)] || "scroll", x, 0, 1, 0.1 + k * view.step, k === n - 1);
        });
        return function (t) {
          s.view(t, D, { az: [-0.14, 0.14], el: [0.2, 0.15], dist: [15.8, 14.6], look: [0, 1, 0], shift: [0, -0.02] });
          things.forEach(function (f) { f(t); });
          view.tags.forEach(function (g, k) {
            pin(g, s.screen(xs[k], 0, 1.8));
          });
        };
      },
    },
  };

  // A pin stuck in the map: a thin stem, a ball of clay, a little glow where it stands.
  function pinAt(s, x, z, at) {
    var g = new T.Group();
    g.position.set(x, 0, z);
    s.scene.add(g);
    var p = maker(s, g);
    p(can(0.05, 0.03, 1, 10), CLAY.ink, 0, 0.5);
    p(ball(0.3), CLAY.terra, 0, 1.12);
    return function (t) {
      g.scale.setScalar(pop(t, at, 0.6));
    };
  }

  // ---- a block ----------------------------------------------------------------------------

  // The small date label in the corner: the last date the voice has said (the build fills it).
  function always(view, _tl, v) {
    if (!v.date || view.kind === "year") return;
    var e = d.createElement("div");
    e.className = "clay-date";
    e.textContent = v.date;
    // it stands still across a cut: no entrance
    view.words.appendChild(e);
  }

  w.ITVClay = {
    block: K.blockOf({ kinds: KINDS, style: style, host: ".clay-root", dress: dress, always: always }),
    OBJECTS: Object.keys(THINGS),
    KINDS: Object.keys(KINDS),
    viewForPlace: viewForPlace,
    viewForRoute: viewForRoute,
    findPlace: findPlace,
    onTable: onTable,
    noise: noise,
    WIDTH: WIDTH,
  };
})(window, document);

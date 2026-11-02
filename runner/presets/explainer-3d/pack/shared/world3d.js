// world3d.js: everything the 3D Explainer's blocks draw (docs/BUILD_PLAN.md phase 4,
// DECISIONS 148). Own code, simple shapes built from three.js primitives: no model
// files, no textures but the ones painted here, no real person, no brand.
//
// HyperFrames still makes every frame. A block only registers a paused timeline, as
// every block does, and one tween on it sets `p`: whatever the engine seeks to, the
// picture at that second is drawn. Nothing depends on the time before it, so a seek
// in any order gives the same frame.
//
// One page may hold about 16 WebGL contexts and a video has far more scenes, so there
// is one renderer for the page. Each scene has its own 2D canvas and copies the frame
// there, so a scene always shows its own picture. A scene's 3D objects and its canvas
// memory are built on its first frame and released when two newer scenes have drawn.

(function (w, d) {
  "use strict";
  var WIDTH = 1920;
  var HEIGHT = 1080;
  var KEEP = 2;
  var T = w.THREE;

  // ---- numbers, all from t ---------------------------------------------------------

  function clamp(x, a, b) {
    return Math.min(b === undefined ? 1 : b, Math.max(a === undefined ? 0 : a, x));
  }
  function mix(a, b, k) {
    return a + (b - a) * k;
  }
  function smooth(k) {
    var x = clamp(k);
    return x * x * (3 - 2 * x);
  }
  // A spring: slightly past 1, then settled.
  function pop(t, at, dur) {
    var x = clamp((t - at) / (dur || 0.7));
    if (x >= 1) return 1;
    var c = 1.9;
    var y = x - 1;
    return Math.max(0.0001, 1 + (c + 1) * y * y * y + c * y * y);
  }
  function hash(s) {
    var h = 7;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }
  function seeded(seed) {
    var x = seed >>> 0 || 1;
    return function () {
      x = (x * 1664525 + 1013904223) >>> 0;
      return x / 4294967296;
    };
  }

  // ---- materials and shapes --------------------------------------------------------

  function mat(color, o) {
    o = o || {};
    return new T.MeshStandardMaterial({ color: color, roughness: o.rough === undefined ? 0.58 : o.rough, metalness: 0, transparent: o.opacity !== undefined, opacity: o.opacity === undefined ? 1 : o.opacity, side: o.side || T.FrontSide, emissive: o.glow || 0x000000, emissiveIntensity: o.glow ? o.glowBy || 0.6 : 0, map: o.map || null, flatShading: !!o.flat });
  }
  function part(group, geo, material, x, y, z, rx, ry, rz) {
    var m = new T.Mesh(geo, material);
    m.position.set(x || 0, y || 0, z || 0);
    m.rotation.set(rx || 0, ry || 0, rz || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  }
  var ball = function (r, n) {
    return new T.SphereGeometry(r, n || 40, n ? Math.ceil(n * 0.7) : 28);
  };
  var box = function (a, b, c, r) {
    return r ? rounded(a, b, c, r) : new T.BoxGeometry(a, b, c);
  };
  var tube = function (a, b, h, n) {
    return new T.CylinderGeometry(a, b, h, n || 36);
  };
  function rounded(a, b, c, r) {
    var s = new T.Shape();
    var x = -a / 2;
    var y = -b / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + a - r, y);
    s.quadraticCurveTo(x + a, y, x + a, y + r);
    s.lineTo(x + a, y + b - r);
    s.quadraticCurveTo(x + a, y + b, x + a - r, y + b);
    s.lineTo(x + r, y + b);
    s.quadraticCurveTo(x, y + b, x, y + b - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    var depth = Math.max(0.001, c - 2 * r);
    var g = new T.ExtrudeGeometry(s, { depth: depth, bevelEnabled: true, bevelSegments: 4, bevelSize: r * 0.6, bevelThickness: r, curveSegments: 8 });
    g.translate(0, 0, -depth / 2);
    return g;
  }
  function lathe(points, n) {
    return new T.LatheGeometry(points.map(function (p) { return new T.Vector2(p[0], p[1]); }), n || 40);
  }
  // A picture painted here, once, from a seed.
  function painted(draw, size) {
    var c = d.createElement("canvas");
    c.width = size || 1024;
    c.height = (size || 1024) / 2;
    draw(c.getContext("2d"), c.width, c.height);
    var t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  }
  function blobs(g, W, H, rnd, n, color, size) {
    g.fillStyle = color;
    for (var i = 0; i < n; i++) {
      var x = rnd() * W;
      var y = H * (0.14 + rnd() * 0.72);
      var r = size * (0.5 + rnd());
      for (var k = 0; k < 9; k++) {
        g.beginPath();
        g.arc(x + (rnd() - 0.5) * r * 2.2, y + (rnd() - 0.5) * r * 1.3, r * (0.3 + rnd() * 0.6), 0, 6.3);
        g.fill();
      }
    }
  }

  // Every object stands on y = 0 and is about 2 units tall. `c`: the scene's colors.
  var OBJ = {
    orb: function (g, c) {
      part(g, ball(1), mat(c.brand, { rough: 0.35 }), 0, 1);
      part(g, new T.TorusGeometry(1.32, 0.05, 14, 80), mat(c.accent), 0, 1, 0, 1.25, 0.3);
    },
    planet: function (g) {
      var map = painted(function (x, W, H) {
        x.fillStyle = "#2f8fe0";
        x.fillRect(0, 0, W, H);
        blobs(x, W, H, seeded(11), 7, "#58c26d", 46);
        x.fillStyle = "#f4fbff";
        x.fillRect(0, 0, W, H * 0.05);
        x.fillRect(0, H * 0.95, W, H * 0.05);
      });
      part(g, ball(1, 56), mat(0xffffff, { map: map, rough: 0.5 }), 0, 1);
    },
    moon: function (g) {
      var map = painted(function (x, W, H) {
        x.fillStyle = "#c9ced6";
        x.fillRect(0, 0, W, H);
        blobs(x, W, H, seeded(5), 5, "#aab1bc", 40);
        var r = seeded(9);
        for (var i = 0; i < 46; i++) {
          x.fillStyle = i % 2 ? "#9aa2ae" : "#e0e4ea";
          x.beginPath();
          x.arc(r() * W, r() * H, 3 + r() * 13, 0, 6.3);
          x.fill();
        }
      });
      part(g, ball(1, 56), mat(0xffffff, { map: map, rough: 0.85 }), 0, 1);
    },
    sun: function (g) {
      part(g, ball(1, 48), new T.MeshBasicMaterial({ color: 0xffc23d }), 0, 1.05);
      var rays = mat(0xff9d2e, { glow: 0xff9d2e, glowBy: 0.8 });
      for (var i = 0; i < 12; i++) {
        var a = (i / 12) * Math.PI * 2;
        part(g, new T.ConeGeometry(0.14, 0.42, 14), rays, Math.cos(a) * 1.32, 1.05 + Math.sin(a) * 1.32, 0, 0, 0, a - Math.PI / 2);
      }
    },
    cube: function (g, c) {
      part(g, box(1.6, 1.6, 1.6, 0.14), mat(c.brand), 0, 0.95, 0, 0, 0.5);
    },
    crate: function (g) {
      var wood = mat(0xd9a766);
      var dark = mat(0xb9843f);
      part(g, box(1.7, 1.7, 1.7, 0.05), wood, 0, 0.86);
      [[-0.86, 0], [0.86, 0]].forEach(function (p) {
        part(g, box(0.16, 1.8, 0.16), dark, p[0], 0.86, 0.86);
        part(g, box(0.16, 1.8, 0.16), dark, p[0], 0.86, -0.86);
      });
      part(g, box(1.8, 0.16, 0.16), dark, 0, 1.72, 0.86);
      part(g, box(1.8, 0.16, 0.16), dark, 0, 0.02, 0.86);
    },
    tower: function (g, c) {
      var wall = mat(0xe8edf4);
      var glass = mat(c.accent, { rough: 0.25 });
      part(g, box(1, 2.2, 1, 0.04), wall, 0, 1.1);
      for (var y = 0; y < 7; y++) for (var x = 0; x < 3; x++) part(g, box(0.2, 0.17, 0.03), glass, -0.28 + x * 0.28, 0.32 + y * 0.28, 0.52);
    },
    house: function (g, c) {
      part(g, box(1.7, 1.1, 1.4, 0.03), mat(0xfbf3e4), 0, 0.55);
      var roof = new T.Mesh(new T.ConeGeometry(1.45, 0.95, 4), mat(c.brand));
      roof.position.y = 1.56;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      g.add(roof);
      part(g, box(0.34, 0.62, 0.05), mat(0x8a5a33), 0, 0.31, 0.71);
      part(g, box(0.3, 0.3, 0.05), mat(c.accent, { rough: 0.25 }), 0.52, 0.62, 0.71);
      part(g, box(0.3, 0.3, 0.05), mat(c.accent, { rough: 0.25 }), -0.52, 0.62, 0.71);
    },
    tree: function (g) {
      part(g, tube(0.13, 0.2, 0.9, 20), mat(0x9a6a3c), 0, 0.45);
      var leaf = mat(0x4fbf6c);
      part(g, ball(0.72, 28), leaf, 0, 1.3);
      part(g, ball(0.5, 24), leaf, 0.46, 1.08, 0.12);
      part(g, ball(0.5, 24), leaf, -0.44, 1.12, -0.1);
    },
    mountain: function (g) {
      part(g, new T.ConeGeometry(1.35, 2.1, 7), mat(0x8d9bb0, { flat: true }), 0, 1.05);
      part(g, new T.ConeGeometry(0.5, 0.78, 7), mat(0xffffff, { flat: true }), 0, 1.71);
      part(g, new T.ConeGeometry(0.85, 1.25, 7), mat(0xa7b3c6, { flat: true }), 0.95, 0.62, 0.25);
    },
    drop: function (g) {
      var pts = [];
      for (var i = 0; i <= 28; i++) {
        var a = (i / 28) * Math.PI;
        var r = Math.sin(a) * Math.pow(Math.sin(a / 2), 1.6) * 0.92;
        pts.push([Math.max(0.0001, r), 1.08 + Math.cos(a) * 1.08]);
      }
      part(g, lathe(pts), mat(0x3aa7ee, { rough: 0.18 }), 0, 0);
    },
    cloud: function (g) {
      var m = mat(0xffffff, { rough: 0.8 });
      [[0, 1.05, 0, 0.72], [-0.72, 0.85, 0, 0.5], [0.76, 0.86, 0, 0.54], [0.3, 1.32, 0.1, 0.46], [-0.32, 1.3, -0.1, 0.42]].forEach(function (p) {
        part(g, ball(p[3], 28), m, p[0], p[1], p[2]);
      });
    },
    // Drawn by code, no face: never a recognizable person.
    person: function (g, c) {
      var m = mat(c.brand);
      part(g, ball(0.33, 32), mat(0xf2c7a0), 0, 1.72);
      part(g, new T.CapsuleGeometry(0.34, 0.56, 8, 24), m, 0, 1, 0);
      part(g, new T.CapsuleGeometry(0.1, 0.5, 6, 14), m, 0.46, 1.02, 0, 0, 0, 0.2);
      part(g, new T.CapsuleGeometry(0.1, 0.5, 6, 14), m, -0.46, 1.02, 0, 0, 0, -0.2);
      part(g, new T.CapsuleGeometry(0.13, 0.42, 6, 14), mat(0x33415c), 0.17, 0.32);
      part(g, new T.CapsuleGeometry(0.13, 0.42, 6, 14), mat(0x33415c), -0.17, 0.32);
    },
    car: function (g, c) {
      part(g, box(2.2, 0.5, 1.05, 0.14), mat(c.brand), 0, 0.5);
      part(g, box(1.15, 0.5, 0.92, 0.14), mat(0xdcecf8, { rough: 0.2 }), -0.1, 0.92);
      var tire = mat(0x2b3242);
      [[-0.7, 0.5], [0.7, 0.5], [-0.7, -0.5], [0.7, -0.5]].forEach(function (p) {
        part(g, tube(0.25, 0.25, 0.16, 26), tire, p[0], 0.25, p[1], Math.PI / 2);
      });
    },
    rocket: function (g, c) {
      part(g, lathe([[0.0001, 2.3], [0.2, 2.08], [0.38, 1.6], [0.42, 1.0], [0.34, 0.42], [0.0001, 0.42]]), mat(0xf6f7fb), 0, 0);
      part(g, new T.ConeGeometry(0.2, 0.34, 26), mat(c.brand), 0, 2.16);
      part(g, ball(0.15, 22), mat(c.accent, { rough: 0.2 }), 0, 1.45, 0.34);
      [0, 2.09, 4.19].forEach(function (a) {
        part(g, box(0.06, 0.55, 0.42), mat(c.brand), Math.sin(a) * 0.42, 0.45, Math.cos(a) * 0.42, 0, a);
      });
    },
    plane: function (g, c) {
      part(g, new T.CapsuleGeometry(0.22, 1.9, 8, 24), mat(0xf6f7fb), 0, 1, 0, 0, 0, Math.PI / 2);
      part(g, box(0.62, 0.05, 2.3), mat(c.brand), 0, 1, 0);
      part(g, box(0.3, 0.04, 0.8), mat(c.brand), -1.1, 1.05, 0);
      part(g, box(0.3, 0.45, 0.04), mat(c.brand), -1.15, 1.28, 0);
    },
    ship: function (g, c) {
      var hull = new T.Shape();
      hull.moveTo(-1.3, 0.6);
      hull.lineTo(1.4, 0.6);
      hull.lineTo(1, 0);
      hull.lineTo(-1, 0);
      hull.closePath();
      var geo = new T.ExtrudeGeometry(hull, { depth: 0.8, bevelEnabled: false });
      geo.translate(0, 0, -0.4);
      part(g, geo, mat(c.brand), 0, 0, 0);
      part(g, box(1.3, 0.42, 0.6, 0.03), mat(0xf6f7fb), -0.1, 0.8);
      part(g, tube(0.13, 0.15, 0.5, 20), mat(0x33415c), 0.1, 1.25);
    },
    coin: function (g) {
      var gold = mat(0xf4bb3a, { rough: 0.32 });
      part(g, tube(0.95, 0.95, 0.18, 56), gold, 0, 1, 0, Math.PI / 2);
      part(g, new T.TorusGeometry(0.76, 0.05, 12, 56), mat(0xe29f1e, { rough: 0.32 }), 0, 1, 0.1);
    },
    gear: function (g, c) {
      var m = mat(c.accent, { rough: 0.4 });
      part(g, tube(0.72, 0.72, 0.36, 44), m, 0, 1, 0, Math.PI / 2);
      for (var i = 0; i < 10; i++) {
        var a = (i / 10) * Math.PI * 2;
        part(g, box(0.28, 0.36, 0.36), m, Math.cos(a) * 0.84, 1 + Math.sin(a) * 0.84, 0, 0, 0, a + Math.PI / 2);
      }
      part(g, tube(0.22, 0.22, 0.42, 26), mat(0xf6f7fb), 0, 1, 0, Math.PI / 2);
    },
    bottle: function (g, c) {
      part(g, lathe([[0.0001, 0], [0.48, 0], [0.5, 0.1], [0.5, 1.2], [0.2, 1.72], [0.2, 2], [0.0001, 2]]), mat(0x6fd0e8, { rough: 0.15 }), 0, 0);
      part(g, tube(0.22, 0.22, 0.18, 24), mat(c.brand), 0, 2.05);
      part(g, tube(0.51, 0.51, 0.5, 40), mat(0xf6f7fb), 0, 0.72);
    },
    cup: function (g, c) {
      part(g, tube(0.72, 0.56, 1.25, 44), mat(c.brand), 0, 0.63);
      part(g, tube(0.65, 0.65, 0.04, 40), mat(0x6b3f22), 0, 1.25);
      part(g, new T.TorusGeometry(0.3, 0.08, 12, 28), mat(c.brand), 0.76, 0.66);
    },
    clock: function (g, c) {
      part(g, tube(1, 1, 0.22, 56), mat(c.brand), 0, 1.02, 0, Math.PI / 2);
      part(g, tube(0.88, 0.88, 0.04, 56), mat(0xffffff), 0, 1.02, 0.12, Math.PI / 2);
      part(g, box(0.07, 0.62, 0.03), mat(0x1c2a44), 0.16, 1.26, 0.15, 0, 0, -0.55);
      part(g, box(0.07, 0.44, 0.03), mat(0x1c2a44), -0.14, 1.14, 0.15, 0, 0, 0.8);
    },
    bulb: function (g) {
      part(g, lathe([[0.0001, 2.1], [0.46, 1.98], [0.68, 1.56], [0.54, 1.08], [0.3, 0.74], [0.3, 0.66], [0.0001, 0.66]]), mat(0xffe27a, { glow: 0xffd24a, glowBy: 0.55, rough: 0.2 }), 0, 0);
      part(g, tube(0.3, 0.24, 0.5, 26), mat(0x8e98a8, { rough: 0.35 }), 0, 0.41);
    },
    battery: function (g, c) {
      part(g, tube(0.56, 0.56, 1.75, 36), mat(0x33415c), 0, 0.88);
      part(g, tube(0.57, 0.57, 0.8, 36), mat(c.accent), 0, 1.36);
      part(g, tube(0.2, 0.2, 0.14, 24), mat(0xc2c9d4, { rough: 0.3 }), 0, 1.82);
    },
    book: function (g, c) {
      part(g, box(1.5, 0.36, 2, 0.02), mat(0xfdfaf0), 0.02, 0.2);
      part(g, box(1.6, 0.05, 2.08), mat(c.brand), 0, 0.02);
      part(g, box(1.6, 0.05, 2.08), mat(c.brand), 0, 0.4);
      part(g, box(0.05, 0.42, 2.08), mat(c.brand), -0.8, 0.21);
    },
    phone: function (g, c) {
      part(g, box(1.05, 2.05, 0.14, 0.05), mat(0x1c2a44), 0, 1.04);
      part(g, box(0.92, 1.84, 0.02), mat(c.accent, { rough: 0.2, glow: c.accent, glowBy: 0.25 }), 0, 1.04, 0.13);
    },
    key: function (g) {
      var m = mat(0xf0b93c, { rough: 0.3 });
      part(g, new T.TorusGeometry(0.4, 0.13, 16, 44), m, 0, 1.55);
      part(g, box(0.17, 1.2, 0.12), m, 0, 0.62);
      part(g, box(0.34, 0.15, 0.12), m, 0.22, 0.18);
      part(g, box(0.26, 0.15, 0.12), m, 0.18, 0.46);
    },
    bug: function (g) {
      var m = mat(0x5a3b2e);
      part(g, ball(0.42, 26), m, -0.62, 0.5);
      part(g, ball(0.28, 22), m, 0, 0.42);
      part(g, ball(0.34, 24), m, 0.56, 0.5);
      [-0.3, 0, 0.3].forEach(function (x) {
        part(g, tube(0.025, 0.025, 1.1, 8), m, x, 0.28, 0, 1.25);
      });
      part(g, tube(0.02, 0.02, 0.6, 8), m, 0.84, 0.88, 0.12, 0, 0, -0.7);
      part(g, tube(0.02, 0.02, 0.6, 8), m, 0.84, 0.88, -0.12, 0, 0, -0.7);
    },
    fish: function (g, c) {
      var body = part(g, ball(0.72, 36), mat(c.accent, { rough: 0.3 }), 0.2, 1);
      body.scale.set(1.3, 0.72, 0.5);
      part(g, new T.ConeGeometry(0.48, 0.72, 4), mat(c.brand), -1.02, 1, 0, 0, 0, -Math.PI / 2);
      part(g, ball(0.09, 14), mat(0x1c2a44), 0.92, 1.12, 0.26);
    },
    bone: function (g) {
      var m = mat(0xf6efe0);
      part(g, tube(0.16, 0.16, 1.5, 24), m, 0, 1, 0, 0, 0, 1.1);
      [[-0.67, 0.67], [0.67, 1.33]].forEach(function (p, i) {
        part(g, ball(0.27, 20), m, p[0] + 0.13, p[1] + (i ? 0.1 : -0.1));
        part(g, ball(0.27, 20), m, p[0] - 0.13, p[1] + (i ? -0.1 : 0.1));
      });
    },
    tooth: function (g) {
      var m = mat(0xfbfaf4, { rough: 0.25 });
      part(g, box(1.2, 0.95, 1, 0.3), m, 0, 1.45);
      part(g, new T.ConeGeometry(0.3, 1.05, 20), m, -0.28, 0.6, 0, Math.PI);
      part(g, new T.ConeGeometry(0.3, 1.05, 20), m, 0.28, 0.6, 0, Math.PI);
    },
    egg: function (g) {
      var e = part(g, ball(0.8, 44), mat(0xf7e7cd, { rough: 0.4 }), 0, 1.06);
      e.scale.set(1, 1.32, 1);
    },
    apple: function (g) {
      part(g, lathe([[0.0001, 0.1], [0.42, 0.03], [0.82, 0.46], [0.88, 0.98], [0.62, 1.48], [0.28, 1.52], [0.0001, 1.32]]), mat(0xe9483c, { rough: 0.3 }), 0, 0);
      part(g, tube(0.035, 0.05, 0.42, 10), mat(0x7a4d2a), 0.02, 1.5);
      var leaf = part(g, ball(0.2, 16), mat(0x54b95f), 0.25, 1.68);
      leaf.scale.set(1.3, 0.3, 0.6);
    },
    cell: function (g, c) {
      part(g, ball(1, 44), mat(0x9fe3d2, { opacity: 0.5, rough: 0.2 }), 0, 1);
      part(g, ball(0.38, 28), mat(c.brand), 0.1, 1.08, 0.1);
      var r = seeded(3);
      for (var i = 0; i < 7; i++) part(g, ball(0.11, 12), mat(c.accent), (r() - 0.5) * 1.2, 1 + (r() - 0.5) * 1.2, (r() - 0.5) * 1.2);
    },
    atom: function (g, c) {
      part(g, ball(0.32, 28), mat(c.brand), 0, 1);
      [0, 1.05, 2.1].forEach(function (a, i) {
        part(g, new T.TorusGeometry(0.98, 0.022, 10, 90), mat(0x53627c), 0, 1, 0, 1.2, 0, a);
        part(g, ball(0.09, 14), mat(c.accent), Math.cos(a + i) * 0.98, 1 + Math.sin(a + i) * 0.44, Math.sin(a + i) * 0.44);
      });
    },
    brain: function (g) {
      var m = mat(0xf2a7b4, { rough: 0.55 });
      var r = seeded(8);
      for (var i = 0; i < 44; i++) {
        var a = r() * 6.28;
        var b = Math.acos(2 * r() - 1);
        part(g, ball(0.26, 12), m, Math.sin(b) * Math.cos(a) * 0.82, 1.02 + Math.cos(b) * 0.62, Math.sin(b) * Math.sin(a) * 0.62);
      }
    },
    heart: function (g, c) {
      var s = new T.Shape();
      s.moveTo(0, -0.95);
      s.bezierCurveTo(-1.5, 0, -0.95, 1.05, 0, 0.42);
      s.bezierCurveTo(0.95, 1.05, 1.5, 0, 0, -0.95);
      var geo = new T.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 5, curveSegments: 22 });
      geo.translate(0, 0, -0.15);
      part(g, geo, mat(c.brand, { rough: 0.3 }), 0, 1.05);
    },
    cheese: function (g) {
      var s = new T.Shape();
      s.moveTo(-1, 0);
      s.lineTo(1.1, 0);
      s.lineTo(1.1, 1.3);
      s.closePath();
      var geo = new T.ExtrudeGeometry(s, { depth: 0.9, bevelEnabled: false });
      geo.translate(0, 0, -0.45);
      part(g, geo, mat(0xf8c63e), 0, 0);
      [[0.45, 0.4], [0.86, 0.8], [0.12, 0.2]].forEach(function (p) {
        part(g, tube(0.12, 0.12, 0.02, 20), mat(0xd99f1c), p[0], p[1], 0.46, Math.PI / 2);
      });
    },
    question: function (g, c) {
      var m = mat(c.brand, { rough: 0.35 });
      var arc = new T.TorusGeometry(0.62, 0.17, 18, 60, Math.PI * 1.4);
      part(g, arc, m, 0, 1.72, 0, 0, 0, -Math.PI * 0.42);
      part(g, new T.CapsuleGeometry(0.17, 0.32, 8, 20), m, 0, 0.86);
      part(g, ball(0.2, 24), m, 0, 0.2);
    },
  };

  function makeObject(id, c, scale) {
    var g = new T.Group();
    (OBJ[id] || OBJ.orb)(g, c);
    if (scale) g.scale.setScalar(scale);
    return g;
  }

  // ---- the one renderer, and each scene's stage -------------------------------------

  var renderer = null;
  function gl() {
    if (renderer) return renderer;
    var canvas = d.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(WIDTH, HEIGHT, false);
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    return renderer;
  }

  function Stage(c, seed) {
    this.c = c;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(32, WIDTH / HEIGHT, 0.1, 400);
    this.side = seed % 2 ? 1 : -1;
    var sky = new T.HemisphereLight(0xffffff, 0xd9dfec, 1.55);
    this.scene.add(sky);
    var key = new T.DirectionalLight(0xfff6ea, 2.3);
    key.position.set(5, 11, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -9;
    key.shadow.camera.right = 9;
    key.shadow.camera.top = 9;
    key.shadow.camera.bottom = -9;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    key.shadow.radius = 7;
    key.shadow.bias = -0.0006;
    this.scene.add(key);
    var fill = new T.DirectionalLight(0xdfeaff, 0.65);
    fill.position.set(-7, 4, 3);
    this.scene.add(fill);
    var floor = new T.Mesh(new T.PlaneGeometry(120, 120), new T.ShadowMaterial({ opacity: 0.17 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }
  // The camera around a point. Angles and distance go from their first to their last
  // value over the whole scene, smoothly. `shift`: where that point sits on the screen,
  // in parts of the frame from its middle.
  Stage.prototype.view = function (t, D, o) {
    var k = smooth(t / Math.max(0.001, D));
    var az = mix(o.az[0], o.az[1], k) * this.side;
    var el = mix(o.el[0], o.el[1], k);
    var dist = mix(o.dist[0], o.dist[1], k);
    var at = o.look;
    var ax = at[0];
    var ay = at[1];
    if (o.look2) {
      ax = mix(ax, o.look2[0], k);
      ay = mix(ay, o.look2[1], k);
    }
    this.camera.position.set(ax + Math.sin(az) * Math.cos(el) * dist, ay + Math.sin(el) * dist, at[2] + Math.cos(az) * Math.cos(el) * dist);
    this.camera.lookAt(ax, ay, at[2]);
    var s = o.shift || [0, 0];
    this.camera.setViewOffset(WIDTH, HEIGHT, -s[0] * WIDTH, -s[1] * HEIGHT, WIDTH, HEIGHT);
    this.camera.updateMatrixWorld();
  };
  // Where a point in the world is on the 1920 by 1080 frame.
  Stage.prototype.screen = function (x, y, z) {
    var v = new T.Vector3(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * WIDTH, y: (0.5 - v.y * 0.5) * HEIGHT };
  };

  function colorsOf(root) {
    var s = getComputedStyle(root);
    var read = function (name, fallback) {
      var v = (s.getPropertyValue(name) || "").trim();
      return v ? new T.Color(v).getHex(T.SRGBColorSpace) : fallback;
    };
    return { brand: read("--brand", 0xff6a4d), accent: read("--accent", 0x23b5a6), third: read("--accent-2", 0xffc145), fg: read("--fg", 0x16233b) };
  }

  function dispose(stage) {
    stage.scene.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
      if (o.shadow && o.shadow.map) o.shadow.map.dispose();
    });
    // the renderer's lists keep the last scene alive until the next render
    if (renderer) renderer.renderLists.dispose();
  }

  var live = [];
  function draw(view, t) {
    if (!view.stage) {
      view.stage = new Stage(colorsOf(view.root), hash(view.kind + JSON.stringify(view.vars)));
      view.update = KINDS[view.kind].build(view.stage, view.vars, view.D, view);
      view.canvas.width = WIDTH;
      view.canvas.height = HEIGHT;
      view.ctx = view.canvas.getContext("2d");
      live.push(view);
      while (live.length > KEEP) {
        var old = live.shift();
        dispose(old.stage);
        old.stage = null;
        old.update = null;
        old.canvas.width = 1;
        old.canvas.height = 1;
      }
    }
    view.update(t);
    gl().render(view.stage.scene, view.stage.camera);
    view.ctx.clearRect(0, 0, WIDTH, HEIGHT);
    view.ctx.drawImage(gl().domElement, 0, 0);
  }

  // ---- the words on screen ----------------------------------------------------------

  var CSS =
    ".x3d-root{position:absolute;inset:0;width:1920px;height:1080px;overflow:hidden;color:var(--fg);font-family:var(--font-body);background:radial-gradient(1500px 1000px at 50% 24%,#fff 0%,var(--bg) 62%,var(--surface) 100%)}" +
    ".x3d-root.flood{background:radial-gradient(1500px 1000px at 50% 40%,rgba(255,255,255,0.26) 0%,rgba(255,255,255,0) 72%),var(--brand)}" +
    ".x3d-view{position:absolute;left:0;top:0;width:1920px;height:1080px}" +
    ".x3d-clip{position:absolute;inset:0}" +
    ".x3d-t{position:absolute;font-family:var(--font-display);font-weight:700;line-height:1.12;letter-spacing:-0.01em;opacity:0}" +
    ".x3d-t b{font-weight:700;color:var(--brand)}" +
    ".x3d-kick{font-family:var(--font-body);font-weight:600;color:var(--muted);letter-spacing:0.08em;text-transform:uppercase}" +
    ".x3d-tag{position:absolute;left:0;top:0;width:0;height:0}" +
    ".x3d-tag>div{position:absolute;transform:translate(-50%,0);width:max-content;max-width:600px;text-align:center;font-family:var(--font-display);font-weight:600;font-size:58px;line-height:1.1;background:rgba(255,255,255,0.88);border-radius:20px;padding:12px 30px;opacity:0}" +
    ".x3d-mark{position:absolute;left:0;bottom:-6px;height:12px;width:100%;background:var(--brand);border-radius:8px;transform-origin:0 50%;transform:scaleX(0);z-index:-1;opacity:0.9}" +
    ".x3d-word{position:relative;display:inline-block;z-index:0}" +
    ".x3d-panel{position:absolute;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:18px}" +
    ".x3d-panel .x3d-t{position:relative}";
  function style() {
    if (d.getElementById("x3d-style")) return;
    var s = d.createElement("style");
    s.id = "x3d-style";
    s.textContent = CSS;
    d.head.appendChild(s);
  }

  var enter = { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "power3.out" };
  function appear(tl, el, at) {
    tl.fromTo(el, { opacity: 0, y: 34, scale: 0.985 }, enter, at);
  }
  // The size that fits the words in `lines` lines of `room` pixels, from their letters
  // and not from a measurement: the same size on every run and in every worker.
  function linesAt(words, perLine) {
    var n = 1;
    var used = 0;
    words.forEach(function (x) {
      if (used && used + 1 + x.length > perLine) {
        n++;
        used = x.length;
      } else used += (used ? 1 : 0) + x.length;
    });
    return n;
  }
  function size(text, base, room, lines) {
    var words = String(text).split(/\s+/).filter(Boolean);
    var longest = words.reduce(function (m, x) { return Math.max(m, x.length); }, 1);
    var px = base;
    while (px > 36) {
      var perLine = room / (px * 0.56);
      if (longest <= perLine && linesAt(words, perLine) <= (lines || 2)) break;
      px -= 2;
    }
    return px;
  }
  function line(view, text, place, base, room, lines) {
    var e = d.createElement("div");
    e.className = "x3d-t";
    e.textContent = text;
    e.style.cssText += ";" + place + ";font-size:" + size(text, base, room, lines) + "px;max-width:" + room + "px";
    (view.into || view.words).appendChild(e);
    return e;
  }
  function tag(view, text) {
    var e = d.createElement("div");
    e.className = "x3d-tag";
    var inner = d.createElement("div");
    inner.textContent = text;
    inner.style.fontSize = size(text, 58, 540, 2) + "px";
    e.appendChild(inner);
    view.words.appendChild(e);
    return { box: e, inner: inner };
  }
  function pin(t, p) {
    t.box.style.transform = "translate(" + Math.round(p.x) + "px," + Math.round(p.y) + "px)";
  }
  // Up to two lines, in the left or the right part of the frame, centered on its height.
  function panel(view, tl, lines, side, base) {
    var box = d.createElement("div");
    box.className = "x3d-panel";
    box.style.left = (side === "left" ? 110 : 990) + "px";
    box.style.width = "830px";
    view.words.appendChild(box);
    view.into = box;
    lines.forEach(function (text, i) {
      var e = line(view, text, "", base, 830, 3);
      if (i === 1) e.style.color = "var(--brand)";
      appear(tl, e, 0.18 + i * 0.32);
    });
    view.into = null;
  }

  // ---- the scene kinds: words(view, tl) and build(stage, vars, D) -> update(t) -------

  // One object on the floor, popping up and turning slowly.
  function hero(stage, id, x, z, scale, at) {
    var g = makeObject(id, stage.c);
    g.position.set(x, 0, z);
    stage.scene.add(g);
    return function (t) {
      g.scale.setScalar(scale * pop(t, at || 0.05, 0.8));
      g.rotation.y = 0.45 * stage.side * Math.sin(t * 0.38);
    };
  }

  var KINDS = {
    title: {
      words: function (view, tl, v) {
        if (v.kicker) appear(tl, Object.assign(line(view, v.kicker, "left:0;right:0;top:70px;text-align:center", 40, 1600), { className: "x3d-t x3d-kick" }), 0.1);
        var h = line(view, v.headline, "left:0;right:0;top:120px;text-align:center;margin:0 auto", 128, 1700, 2);
        appear(tl, h, 0.2);
      },
      build: function (s, v, D) {
        var one = hero(s, v.object, 0, 0, 1.42);
        return function (t) {
          s.view(t, D, { az: [0.34, -0.12], el: [0.2, 0.1], dist: [12.4, 10.4], look: [0, 1.3, 0], shift: [0, 0.15] });
          one(t);
        };
      },
    },
    chapter: {
      flood: true,
      words: function (view, tl, v) {
        var h = line(view, v.headline, "left:0;right:0;top:96px;text-align:center;margin:0 auto;color:#fff", 116, 1700, 2);
        appear(tl, h, 0.16);
      },
      build: function (s, v, D) {
        var disc = new T.Mesh(tube(3.2, 3.2, 0.22, 90), mat(0xffffff, { rough: 0.5 }));
        disc.position.y = 0.11;
        disc.receiveShadow = true;
        disc.castShadow = true;
        s.scene.add(disc);
        var one = hero(s, v.object, 0, 0, 1.1);
        return function (t) {
          s.view(t, D, { az: [-0.5, 0.45], el: [0.34, 0.24], dist: [15.4, 14.2], look: [0, 1.2, 0], shift: [0, 0.13] });
          disc.scale.setScalar(pop(t, 0, 0.55));
          one(t);
        };
      },
    },
    statement: {
      words: function (view, tl, v) {
        panel(view, tl, [v.line1, v.line2], "right", 108);
      },
      build: function (s, v, D) {
        var one = hero(s, v.object, 0, 0, 1.3);
        return function (t) {
          s.view(t, D, { az: [0.42, 0.04], el: [0.2, 0.13], dist: [11.2, 9.8], look: [0, 1.25, 0], shift: [-0.26, 0.02] });
          one(t);
        };
      },
    },
    word: {
      words: function (view, tl, v) {
        var h = line(view, v.word, "left:0;right:0;top:70px;text-align:center;margin:0 auto;color:var(--brand)", 220, 1740, 1);
        appear(tl, h, 0.1);
      },
      build: function (s, v, D) {
        var one = hero(s, v.object, 0, 0, 1.4);
        return function (t) {
          s.view(t, D, { az: [-0.4, 0.34], el: [0.16, 0.1], dist: [12.6, 11.4], look: [0, 1.2, 0], shift: [0, 0.16] });
          one(t);
        };
      },
    },
    highlight: {
      words: function (view, tl, v) {
        var e = line(view, v.line, "left:110px;top:50%;margin-top:-180px", 108, 860, 3);
        var mark = String(v.mark || "").trim();
        var low = v.line.toLowerCase();
        var at = mark ? low.indexOf(mark.toLowerCase()) : -1;
        var bar = null;
        if (at >= 0) {
          e.textContent = "";
          e.appendChild(d.createTextNode(v.line.slice(0, at)));
          var w2 = d.createElement("span");
          w2.className = "x3d-word";
          w2.textContent = v.line.slice(at, at + mark.length);
          bar = d.createElement("i");
          bar.className = "x3d-mark";
          w2.appendChild(bar);
          e.appendChild(w2);
          e.appendChild(d.createTextNode(v.line.slice(at + mark.length)));
        }
        appear(tl, e, 0.16);
        if (bar) tl.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: "power2.inOut" }, 0.72);
      },
      build: function (s, v, D) {
        var one = hero(s, v.object, 0, 0, 1.3);
        return function (t) {
          s.view(t, D, { az: [-0.3, 0.2], el: [0.14, 0.2], dist: [11.4, 10], look: [0, 1.25, 0], shift: [0.26, 0.02] });
          one(t);
        };
      },
    },
    question: {
      words: function (view, tl, v) {
        panel(view, tl, [String(v.question).replace(/[?\s]*$/, "?")], "right", 108);
      },
      build: function (s, v, D) {
        var mark = hero(s, "question", -0.1, 0, 1.45);
        var one = v.object && v.object !== "question" ? hero(s, v.object, 1.5, 1.1, 0.62, 0.35) : null;
        return function (t) {
          s.view(t, D, { az: [0.4, -0.1], el: [0.15, 0.1], dist: [11.6, 10], look: [0.3, 1.4, 0], shift: [-0.25, 0.02] });
          mark(t);
          if (one) one(t);
        };
      },
    },
    number: {
      words: function (view, tl, v) {
        view.count = line(view, "0", "left:110px;top:372px;color:var(--brand)", 230, 860);
        view.count.style.fontVariantNumeric = "tabular-nums";
        appear(tl, view.count, 0.1);
      },
      build: function (s, v, D, view) {
        var end = Number(v.value) || 0;
        var digits = (String(v.value).split(".")[1] || "").length;
        var pre = v.before ? String(v.before) : "";
        var post = v.after ? String(v.after) : "";
        // a word after the number needs its space; a unit like % or k does not
        if (post.length > 2) post = " " + post;
        var px = size(pre + end.toLocaleString("en-US") + post, 230, 860, 1);
        view.count.style.fontSize = px + "px";
        var pile = [];
        var spots = [[0, 0, 0], [2.1, 0, 0.2], [-2.1, 0, -0.2], [1, 0, 2], [-1.1, 0, 2.1], [1.1, 0, -2], [-1, 0, -2.1], [3.1, 0, 2], [-3.2, 0, 1.9]];
        // up to nine: exactly as many as the voice says, more than that is a crowd
        var many = Number.isInteger(end) && end >= 1 && end < spots.length ? end : spots.length;
        spots.slice(0, many).forEach(function (p, i) {
          pile.push(hero(s, v.object, p[0], p[2], 0.8, 0.1 + i * 0.12));
        });
        return function (t) {
          s.view(t, D, { az: [0.5, 0.08], el: [0.3, 0.2], dist: [15.6, 14], look: [0, 1, 0], shift: [0.24, 0.03] });
          pile.forEach(function (f) { f(t); });
          var k = smooth(clamp((t - 0.1) / 1.5));
          var now = end * (1 - Math.pow(1 - k, 3));
          view.count.textContent = pre + (t >= 1.6 ? end : now).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + post;
        };
      },
    },
    percent: {
      words: function (view, tl, v) {
        view.count = line(view, "0%", "left:120px;top:366px;color:var(--brand)", 250, 820);
        appear(tl, view.count, 0.1);
      },
      build: function (s, v, D, view) {
        var end = clamp(Number(v.value) / 100);
        var height = 4;
        var glass = new T.Mesh(tube(1.5, 1.5, height + 0.2, 72), mat(0xdfeaf6, { opacity: 0.2, rough: 0.12, side: T.DoubleSide }));
        glass.position.y = (height + 0.2) / 2;
        s.scene.add(glass);
        var base = part(s.scene, tube(1.7, 1.7, 0.16, 72), mat(0xf6f7fb), 0, 0.08);
        var liquid = part(s.scene, tube(1.42, 1.42, 1, 72), mat(s.c.brand, { rough: 0.3 }), 0, 0);
        return function (t) {
          s.view(t, D, { az: [0.4, -0.08], el: [0.24, 0.18], dist: [15, 13.6], look: [0, 2.1, 0], shift: [0.24, 0] });
          var k = 1 - Math.pow(1 - clamp((t - 0.2) / 1.6), 3);
          var h = Math.max(0.001, end * k * height);
          liquid.scale.y = h;
          liquid.position.y = 0.16 + h / 2;
          base.scale.setScalar(pop(t, 0, 0.5));
          view.count.textContent = Math.round(end * 100 * k) + "%";
        };
      },
    },
    scale: {
      words: function (view, tl, v) {
        view.tags = [tag(view, v.small), tag(view, v.big)];
        appear(tl, view.tags[0].inner, 0.2);
        tl.fromTo(view.tags[1].inner, { opacity: 0 }, { opacity: 1, duration: 0.5 }, Math.max(1.2, view.D * 0.48));
        if (v.ratio) appear(tl, line(view, v.ratio, "left:0;right:0;top:60px;text-align:center;margin:0 auto;color:var(--brand)", 104, 1500), Math.max(1.5, view.D * 0.56));
      },
      build: function (s, v, D, view) {
        // A ratio the voice says is the ratio on screen; without one, a clear difference.
        var said = parseFloat(String(v.ratio || "").replace(/,/g, ""));
        var small = 3.2 / (said > 1 ? said : 9);
        var tiny = makeObject(v.smallObject, s.c, small);
        var huge = makeObject(v.bigObject, s.c, 3.2);
        tiny.position.set(-2.2, 0, 1.2);
        huge.position.set(3.1, 0, -1);
        s.scene.add(tiny, huge);
        return function (t) {
          // close on the small one, then the camera pulls back and shows the other
          var k = smooth(clamp((t - D * 0.22) / (D * 0.62)));
          s.view(k, 1, { az: [0.34, -0.1], el: [0.14, 0.14], dist: [Math.max(1.4, small * 9.4), 20], look: [-2.2, small * 1.15, 0.4], look2: [0.2, 3.1, 0.4], shift: [0, 0] });
          tiny.scale.setScalar(small * pop(t, 0, 0.6));
          huge.scale.setScalar(3.2 * pop(t, D * 0.3, 0.9));
          huge.rotation.y = 0.12 * Math.sin(t * 0.4);
          pin(view.tags[0], s.screen(-2.2, 0, 2));
          pin(view.tags[1], s.screen(3.1, 0, 2.4));
        };
      },
    },
    cutaway: {
      words: function (view, tl, v) {
        var h = line(view, v.headline, "left:0;right:0;top:48px;text-align:center;margin:0 auto", 92, 1700, 1);
        appear(tl, h, 0.12);
        view.labels = [v.outer, v.middle, v.inner].map(function (text, i) {
          if (!text) return null;
          var e = line(view, text, "left:1270px;top:" + (340 + i * 170) + "px", 72, 590, 1);
          appear(tl, e, 0.7 + i * Math.min(0.5, view.D * 0.1));
          return e;
        });
        view.svg = d.createElementNS("http://www.w3.org/2000/svg", "svg");
        view.svg.setAttribute("width", WIDTH);
        view.svg.setAttribute("height", HEIGHT);
        view.svg.style.cssText = "position:absolute;left:0;top:0";
        view.lines = view.labels.map(function (l, i) {
          if (!l) return null;
          var p = d.createElementNS("http://www.w3.org/2000/svg", "line");
          p.setAttribute("stroke", "var(--fg)");
          p.setAttribute("stroke-width", "4");
          p.setAttribute("stroke-linecap", "round");
          p.setAttribute("opacity", "0");
          view.svg.appendChild(p);
          tl.fromTo(p, { opacity: 0 }, { opacity: 0.75, duration: 0.4 }, 0.7 + i * Math.min(0.5, view.D * 0.1));
          return p;
        });
        view.words.appendChild(view.svg);
      },
      build: function (s, v, D, view) {
        var SKIN = { planet: 0x2f8fe0, moon: 0xc9ced6, sun: 0xffc23d, apple: 0xe9483c, egg: 0xf7e7cd, cell: 0x9fe3d2, drop: 0x3aa7ee, cheese: 0xf8c63e, tree: 0x4fbf6c };
        var layers = [
          { r: 2.2, color: SKIN[v.object] || s.c.brand },
          { r: 1.62, color: s.c.third },
          { r: 1.02, color: s.c.accent },
        ];
        var open = new T.Group();
        open.position.y = 2.3;
        layers.forEach(function (l, i) {
          // a sphere with a quarter taken out, and the two flat faces of the cut
          var skin = new T.Mesh(new T.SphereGeometry(l.r, 64, 44, Math.PI, Math.PI * 1.5), mat(l.color, { side: T.DoubleSide, rough: 0.48 }));
          skin.castShadow = true;
          open.add(skin);
          var inner = i === layers.length - 1 ? 0.001 : layers[i + 1].r;
          var face = new T.RingGeometry(inner, l.r, 64, 1, -Math.PI / 2, Math.PI);
          var faceMat = mat(new T.Color(l.color).lerp(new T.Color(0xffffff), 0.1).getHex(), { side: T.DoubleSide, rough: 0.7 });
          open.add(new T.Mesh(face, faceMat));
          var other = new T.Mesh(face, faceMat);
          other.rotation.y = -Math.PI / 2;
          open.add(other);
        });
        s.scene.add(open);
        var named = view.labels.some(Boolean);
        // the cut faces this way: the camera always stays on that side
        s.side = 1;
        var spots = [new T.Vector3(1.32, 1.32, 0), new T.Vector3(1.05, 0.72, 0), new T.Vector3(0.62, 0.1, 0)];
        return function (t) {
          s.view(t, D, { az: [0.86, 0.72], el: [0.42, 0.34], dist: [14.2, 13], look: [0, 2.3, 0], shift: [named ? -0.17 : 0, 0.06] });
          open.scale.setScalar(pop(t, 0, 0.8));
          open.rotation.y = 0;
          view.lines.forEach(function (l, i) {
            if (!l) return;
            var w0 = open.localToWorld(spots[i].clone());
            var p = s.screen(w0.x, w0.y, w0.z);
            l.setAttribute("x1", Math.round(p.x));
            l.setAttribute("y1", Math.round(p.y));
            l.setAttribute("x2", 1250);
            l.setAttribute("y2", 384 + i * 170);
          });
        };
      },
    },
    versus: {
      words: function (view, tl, v) {
        view.tags = [tag(view, v.left), tag(view, v.right)];
        appear(tl, view.tags[0].inner, 0.2);
        appear(tl, view.tags[1].inner, 0.55);
      },
      build: function (s, v, D, view) {
        [-3.3, 3.3].forEach(function (x, i) {
          var plinth = part(s.scene, tube(1.9, 2.05, 0.4, 72), mat(i ? s.c.accent : s.c.brand), x, 0.2);
          plinth.castShadow = true;
        });
        var a = makeObject(v.leftObject, s.c, 1.35);
        var b = makeObject(v.rightObject, s.c, 1.35);
        a.position.set(-3.3, 0.4, 0);
        b.position.set(3.3, 0.4, 0);
        s.scene.add(a, b);
        return function (t) {
          s.view(t, D, { az: [-0.16, 0.16], el: [0.2, 0.16], dist: [15.4, 14], look: [0, 1.5, 0], shift: [0, -0.01] });
          a.scale.setScalar(1.35 * pop(t, 0.05, 0.8));
          b.scale.setScalar(1.35 * pop(t, 0.4, 0.8));
          a.rotation.y = 0.3 * Math.sin(t * 0.5);
          b.rotation.y = -0.3 * Math.sin(t * 0.5);
          pin(view.tags[0], s.screen(-3.3, 0, 2.3));
          pin(view.tags[1], s.screen(3.3, 0, 2.3));
        };
      },
    },
    cause: {
      words: function (view, tl, v) {
        view.tags = [tag(view, v.from), tag(view, v.to)];
        appear(tl, view.tags[0].inner, 0.2);
        tl.fromTo(view.tags[1].inner, { opacity: 0 }, { opacity: 1, duration: 0.5 }, Math.max(0.9, view.D * 0.42));
      },
      build: function (s, v, D, view) {
        var a = makeObject(v.fromObject, s.c, 1.25);
        var b = makeObject(v.toObject, s.c, 1.25);
        a.position.set(-3.6, 0, 0);
        b.position.set(3.6, 0, 0);
        s.scene.add(a, b);
        var path = new T.QuadraticBezierCurve3(new T.Vector3(-2.1, 1.3, 0), new T.Vector3(0, 3.5, 0), new T.Vector3(2, 1.5, 0));
        var track = new T.Mesh(new T.TubeGeometry(path, 60, 0.05, 12), mat(s.c.fg, { rough: 0.5 }));
        s.scene.add(track);
        var head = new T.Mesh(new T.ConeGeometry(0.2, 0.5, 22), mat(s.c.fg));
        head.position.set(2.05, 1.46, 0);
        head.rotation.z = -Math.PI * 0.72;
        s.scene.add(head);
        var runner = part(s.scene, ball(0.26, 26), mat(s.c.brand, { glow: s.c.brand, glowBy: 0.4 }), 0, 0);
        return function (t) {
          s.view(t, D, { az: [0.18, -0.14], el: [0.14, 0.1], dist: [15.6, 14.2], look: [0, 1.4, 0], shift: [0, -0.01] });
          a.scale.setScalar(1.25 * pop(t, 0.05, 0.8));
          a.rotation.y = 0.3 * Math.sin(t * 0.5);
          b.rotation.y = -0.3 * Math.sin(t * 0.5);
          var k = clamp((t - 0.5) / Math.max(0.6, D * 0.42));
          b.scale.setScalar(1.25 * pop(t, 0.5 + Math.max(0.6, D * 0.42) - 0.15, 0.8));
          var e = smooth(k);
          var at = path.getPoint(e);
          runner.position.copy(at);
          var seen = k > 0 && k < 1;
          runner.visible = seen;
          track.material.opacity = 1;
          pin(view.tags[0], s.screen(-3.6, 0, 2));
          pin(view.tags[1], s.screen(3.6, 0, 2));
        };
      },
    },
    stairs: {
      words: function (view, tl, v) {
        view.tags = [v.step1, v.step2, v.step3, v.step4].map(function (text, i) {
          var g = tag(view, text);
          var at = 0.2 + (i / 4) * view.D * 0.8;
          tl.fromTo(g.inner, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, at);
          return g;
        });
      },
      build: function (s, v, D, view) {
        var tones = [s.c.accent, s.c.third, s.c.brand, s.c.fg];
        var step = function (i) {
          return { x: -5.1 + i * 3.4, h: 0.7 + i * 1.05 };
        };
        tones.forEach(function (c, i) {
          var p = step(i);
          part(s.scene, box(3.3, p.h, 3, 0.04), mat(c), p.x, p.h / 2);
        });
        var hop = part(s.scene, ball(0.42, 28), mat(0xffffff, { rough: 0.3 }), 0, 0);
        return function (t) {
          s.view(t, D, { az: [-0.3, 0.1], el: [0.18, 0.24], dist: [17.6, 16.4], look: [0, 2.4, 0], shift: [0, -0.03] });
          var q = clamp((t - 0.2) / (D * 0.8)) * 4;
          var n = Math.min(3, Math.floor(q));
          var inside = clamp((q - n) / 0.34);
          var from = step(Math.max(0, n - 1));
          var to = step(n);
          hop.position.set(mix(from.x, to.x, smooth(inside)), mix(from.h, to.h, smooth(inside)) + 0.42 + Math.sin(inside * Math.PI) * 0.8, 0);
          view.tags.forEach(function (g, i) {
            var p = step(i);
            pin(g, s.screen(p.x, 0.2, 1.8));
          });
        };
      },
    },
    shelf: {
      words: function (view, tl, v) {
        view.tags = [v.item1, v.item2, v.item3, v.item4].map(function (text, i) {
          var g = tag(view, text);
          tl.fromTo(g.inner, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, 0.25 + i * Math.min(0.5, view.D * 0.16));
          return g;
        });
      },
      build: function (s, v, D, view) {
        var xs = [-5.1, -1.7, 1.7, 5.1];
        var parts = [v.object1, v.object2, v.object3, v.object4].map(function (id, i) {
          return hero(s, id, xs[i], 0, 1, 0.1 + i * Math.min(0.5, D * 0.16));
        });
        return function (t) {
          s.view(t, D, { az: [-0.16, 0.16], el: [0.16, 0.12], dist: [15.6, 14.4], look: [0, 1, 0], shift: [0, -0.02] });
          parts.forEach(function (f) { f(t); });
          view.tags.forEach(function (g, i) {
            pin(g, s.screen(xs[i], 0, 1.9));
          });
        };
      },
    },
  };

  // ---- a block ---------------------------------------------------------------------

  var first = true;
  // A mounted block's values are on its host and in what the runtime gave its script.
  function valuesOf(root, given) {
    var host = root.closest("[data-variable-values]");
    var own = {};
    try {
      own = host ? JSON.parse(host.getAttribute("data-variable-values")) : {};
    } catch (e) {
      own = {};
    }
    return Object.assign({}, given, own);
  }
  function block(root, kind, given) {
    style();
    var clip = root.querySelector("[data-scene-dur]");
    var vars = valuesOf(root, given);
    var D = Math.max(0.1, parseFloat(clip.getAttribute("data-scene-dur")) || 4);
    var view = { root: root, canvas: root.querySelector("canvas"), kind: kind, vars: vars, D: D, stage: null, words: clip };
    var host = root.querySelector(".x3d-root");
    if (KINDS[kind].flood && host) host.classList.add("flood");
    var tl = gsap.timeline({ paused: true });
    KINDS[kind].words(view, tl, vars);
    // Every frame of this scene goes through this one value (see the top of this file).
    var value = 0;
    var proxy = {
      get p() {
        return value;
      },
      // A scene outside its own time is not on screen, and the engine still moves its
      // timeline on every frame: drawing there rebuilt every past scene, every frame
      // (measured: 3 times slower by the sixth scene, and worse after that). At exactly 0
      // its objects have not popped up yet, so nothing is lost.
      set p(k) {
        var same = k === value;
        value = k;
        if (k <= 0 || k >= 1 || (same && view.stage)) return;
        draw(view, k * D);
      },
    };
    tl.to(proxy, { p: 1, duration: D, ease: "none" }, 0);
    // Nothing moves a timeline to the time it already has: the video's first frame.
    if (first) {
      first = false;
      draw(view, 0);
    }
    return tl;
  }

  w.ITV3D = { block: block, OBJECTS: Object.keys(OBJ) };
})(window, document);

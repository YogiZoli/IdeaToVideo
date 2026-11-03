// nightfile.js: everything Night Case File's blocks draw (docs/BUILD_PLAN.md phase 7, DECISIONS 158).
// Own code on a 2D canvas: no image files, no real person, no brand, no weapon. Rooms and streets
// are simple shapes, people are faceless figures glowing in one accent color. What happens in a
// story is only implied: a light flashes and a sound is heard, nothing else is ever shown.
// The maps are Natural Earth (public domain), Archive Collage's map-data.js.
//
// HyperFrames still makes every frame. A block only registers a paused timeline, as every block
// does, and one tween on it sets `p`: whatever the engine seeks to, the picture at that second is
// drawn. Nothing depends on the time before it. What is costly (a street, a room, a map, a thing
// with its glow) is made once from a seed and kept, so a seek in any order gives the same frame.

(function (w, d) {
  "use strict";
  var WIDTH = 1920;
  var HEIGHT = 1080;
  var KEEP = 2;
  // The first flash of a flash scene, in seconds from its start. The block's `sound` in
  // make-night-blocks.mjs says the same number, so the sound lands on the light.
  var FLASH_AT = 0.5;
  // Never more than three flashes in any second, and the sky only lifts a little.
  var FLASH_GAPS = [0, 0.42, 0.92];
  var SKY_LIFT = 0.13;

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
  function seeded(seed) {
    var x = seed >>> 0 || 1;
    return function () {
      x = (x * 1664525 + 1013904223) >>> 0;
      return x / 4294967296;
    };
  }
  function hash(text) {
    var h = 2166136261;
    var s = String(text);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // ---- the camera: one slow move per scene, near layers move more ---------------------------

  function cameraAt(seed, u) {
    var r = seeded(seed);
    var angle = r() * Math.PI * 2;
    var reach = 22 + r() * 14;
    var k = u - 0.5;
    return { x: Math.cos(angle) * reach * k, y: Math.sin(angle) * reach * 0.5 * k, zoom: 1 + 0.035 * u };
  }
  function layerAt(cam, depth) {
    return { x: cam.x * depth, y: cam.y * depth, s: 1 + (cam.zoom - 1) * depth };
  }
  function enterLayer(g, cam, depth) {
    var l = layerAt(cam, depth);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.translate(WIDTH / 2 + l.x, HEIGHT / 2 + l.y);
    g.scale(l.s, l.s);
    g.translate(-WIDTH / 2, -HEIGHT / 2);
  }
  var DEPTH = { far: 0.35, near: 0.8, figure: 1, words: 1.15 };

  // ---- the look ---------------------------------------------------------------------------

  var COLORS = { night: "#070b14", wall: "#0e1522", line: "#24324a", text: "#e8edf6", muted: "#7e8ea8", glow: "#ffb02e", paper: "#c9d3e3" };
  var colorsRead = false;
  function readColors(root) {
    if (colorsRead) return;
    colorsRead = true;
    var s = getComputedStyle(root);
    var read = function (name, fallback) {
      return (s.getPropertyValue(name) || "").trim() || fallback;
    };
    COLORS = { night: read("--bg", COLORS.night), wall: read("--surface", COLORS.wall), line: read("--border", COLORS.line), text: read("--fg", COLORS.text), muted: read("--muted", COLORS.muted), glow: read("--brand", COLORS.glow), paper: read("--accent", COLORS.paper) };
  }
  function rgb(hex) {
    var h = String(hex).replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgba(hex, a) {
    var c = rgb(hex);
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  }
  // What windows and street lights are: a cold pale light, so that only people and what the
  // story is about have the accent.
  var COLD = "#9fb6d8";
  function canvasOf(a, b) {
    var c = d.createElement("canvas");
    c.width = a;
    c.height = b;
    return c;
  }
  // A shape stroked many times, wide and faint to thin and bright: a glow with no blur filter.
  function glowing(g, stroke, width, color, strength) {
    var was = g.globalCompositeOperation;
    var alpha = g.globalAlpha;
    var k = strength === undefined ? 1 : strength;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.globalCompositeOperation = "lighter";
    [[5.6, 0.022], [4.6, 0.03], [3.7, 0.045], [2.9, 0.07], [2.1, 0.12], [1.5, 0.2]].forEach(function (pass) {
      g.strokeStyle = rgba(color, pass[1] * k);
      g.lineWidth = width * pass[0];
      stroke(g);
    });
    g.globalCompositeOperation = was;
    g.globalAlpha = alpha;
    g.strokeStyle = color;
    g.lineWidth = width;
    stroke(g);
  }
  function pool(g, x, y, r, color, a) {
    var grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rgba(color, a));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Light falling from a lamp: a soft cone, on the "lighter" mode.
  function cone(g, x, y, spread, down, color, a) {
    var grad = g.createLinearGradient(0, y, 0, y + down);
    grad.addColorStop(0, rgba(color, a));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x - 10, y);
    g.lineTo(x + 10, y);
    g.lineTo(x + spread, y + down);
    g.lineTo(x - spread, y + down);
    g.closePath();
    g.fill();
  }

  // ---- a figure: faceless, one color, feet planted when it walks -----------------------------

  // Where the two feet are after `dist` of walking. A foot stands still for half of its cycle,
  // then swings to its next spot, so a planted foot never slides. Pure.
  function gait(dist, step) {
    var S = step || 90;
    return [0, 0.5].map(function (offset) {
      var u = dist / (2 * S) + offset;
      var k = Math.floor(u);
      var s = u - k;
      var spot = 2 * S * (k + 0.25 - offset);
      if (s < 0.5) return { x: spot, lift: 0 };
      var q = (s - 0.5) * 2;
      return { x: spot + 2 * S * smooth(q), lift: Math.sin(q * Math.PI) };
    });
  }
  // The middle joint of a limb of two equal bones.
  function joint(ax, ay, bx, by, len, side) {
    var dx = bx - ax;
    var dy = by - ay;
    var dist = Math.min(Math.sqrt(dx * dx + dy * dy), len * 1.99) || 1;
    var h = Math.sqrt(Math.max(0, len * len - (dist * dist) / 4));
    return [(ax + bx) / 2 + (-dy / dist) * h * side, (ay + by) / 2 + (dx / dist) * h * side];
  }
  // One figure on the ground at (x, ground), `h` tall. o.feet: from gait, else standing.
  function figure(g, o) {
    var h = o.h;
    var u = h / 100;
    var color = o.color || COLORS.glow;
    var hip = [o.x, o.ground - 50 * u];
    var neck = [o.x + (o.lean || 0) * u, o.ground - 84 * u];
    var feet = o.feet || [{ x: o.x - 9 * u, lift: 0 }, { x: o.x + 9 * u, lift: 0 }];
    var limbs = [];
    feet.forEach(function (f, i) {
      var foot = [f.x, o.ground - f.lift * 8 * u];
      var knee = joint(hip[0], hip[1], foot[0], foot[1], 26 * u, o.back ? -1 : 1);
      limbs.push([hip, knee, foot]);
      // the arms swing against the legs, and hang still when it stands
      var swing = o.feet ? (f.x - o.x) * -0.7 : i ? 11 * u : -11 * u;
      var hand = [neck[0] + swing, o.ground - 50 * u];
      limbs.push([neck, joint(neck[0], neck[1], hand[0], hand[1], 18.5 * u, o.back ? -1 : 1), hand]);
    });
    var body = function (c) {
      c.beginPath();
      limbs.forEach(function (l) {
        c.moveTo(l[0][0], l[0][1]);
        c.lineTo(l[1][0], l[1][1]);
        c.lineTo(l[2][0], l[2][1]);
      });
      c.moveTo(hip[0], hip[1]);
      c.lineTo(neck[0], neck[1]);
      c.stroke();
    };
    glowing(g, body, 6.6 * u, color);
    // the head: a plain lit shape, no eyes, no mouth, nobody
    var hx = neck[0];
    var hy = neck[1] - 11 * u;
    pool(g, hx, hy, 34 * u, color, 0.26);
    g.fillStyle = color;
    g.beginPath();
    g.arc(hx, hy, 7.6 * u, 0, Math.PI * 2);
    g.fill();
    pool(g, o.x, o.ground, 48 * u, color, 0.14);
  }

  // ---- the things: outlines, what the story is about has the glow ----------------------------

  function P(c, pts, closed) {
    c.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    if (closed) c.closePath();
  }
  function R(c, x, y, a, b) {
    P(c, [[x, y], [x + a, y], [x + a, y + b], [x, y + b]], true);
  }
  function O(c, x, y, r) {
    c.moveTo(x + r, y);
    c.arc(x, y, r, 0, Math.PI * 2);
  }
  // In a box of about 200 by 200, standing on y = 0. Never a weapon.
  var PROP = {
    folder: function (c) {
      P(c, [[-96, 0], [-96, -126], [-30, -126], [-14, -106], [96, -106], [96, 0]], true);
      P(c, [[-96, -82], [96, -82]]);
    },
    figure: function (c) {
      O(c, 0, -162, 24);
      P(c, [[0, -138], [0, -66], [-26, 0]]);
      P(c, [[0, -66], [26, 0]]);
      P(c, [[-34, -74], [0, -122], [34, -74]]);
    },
    house: function (c) {
      P(c, [[-78, 0], [-78, -92], [0, -160], [78, -92], [78, 0]], true);
      R(c, -18, -58, 36, 58);
      R(c, -60, -78, 28, 26);
      R(c, 32, -78, 28, 26);
    },
    car: function (c) {
      P(c, [[-100, -26], [-96, -62], [-48, -66], [-22, -106], [46, -106], [72, -66], [100, -56], [100, -26]], true);
      O(c, -56, -22, 22);
      O(c, 56, -22, 22);
      P(c, [[8, -106], [8, -66]]);
    },
    door: function (c) {
      R(c, -50, -186, 100, 186);
      O(c, 30, -92, 6);
      R(c, -30, -166, 60, 50);
    },
    window: function (c) {
      R(c, -72, -176, 144, 150);
      P(c, [[0, -176], [0, -26]]);
      P(c, [[-72, -100], [72, -100]]);
      P(c, [[-90, -26], [90, -26]]);
    },
    phone: function (c) {
      R(c, -46, -172, 92, 172);
      P(c, [[-46, -148], [46, -148]]);
      P(c, [[-46, -28], [46, -28]]);
      O(c, 0, -14, 6);
    },
    letter: function (c) {
      R(c, -92, -122, 184, 122);
      P(c, [[-92, -122], [0, -52], [92, -122]]);
    },
    key: function (c) {
      O(c, -56, -60, 34);
      P(c, [[-22, -60], [92, -60], [92, -36]]);
      P(c, [[60, -60], [60, -40]]);
    },
    clock: function (c) {
      O(c, 0, -90, 84);
      P(c, [[0, -142], [0, -90], [38, -70]]);
    },
    bag: function (c) {
      R(c, -82, -112, 164, 112);
      P(c, [[-36, -112], [-36, -146], [36, -146], [36, -112]]);
      P(c, [[-82, -66], [82, -66]]);
    },
    camera: function (c) {
      P(c, [[-92, 0], [-92, -106], [-38, -106], [-22, -134], [22, -134], [38, -106], [92, -106], [92, 0]], true);
      O(c, 0, -54, 36);
    },
    photo: function (c) {
      R(c, -82, -164, 164, 164);
      R(c, -64, -146, 128, 106);
      O(c, 0, -106, 18);
      P(c, [[-34, -40], [-24, -76], [24, -76], [34, -40]]);
    },
    fingerprint: function (c) {
      [18, 34, 50, 66].forEach(function (r) {
        c.moveTo(-r, -86);
        c.arc(0, -86, r, Math.PI, Math.PI * 2);
        c.lineTo(r, -60 + r * 0.4);
      });
      P(c, [[0, -86], [0, -30]]);
      P(c, [[-34, -86], [-34, -44]]);
    },
    footprint: function (c) {
      c.moveTo(38, -108);
      c.ellipse(0, -108, 38, 52, 0, 0, Math.PI * 2);
      c.moveTo(28, -24);
      c.ellipse(0, -24, 28, 24, 0, 0, Math.PI * 2);
    },
    tape: function (c) {
      R(c, -98, -118, 196, 118);
      O(c, -44, -66, 20);
      O(c, 44, -66, 20);
      P(c, [[-64, 0], [-46, -28], [46, -28], [64, 0]]);
    },
    notebook: function (c) {
      R(c, -68, -172, 136, 172);
      P(c, [[-44, -172], [-44, 0]]);
      P(c, [[-24, -132], [46, -132]]);
      P(c, [[-24, -100], [46, -100]]);
      P(c, [[-24, -68], [46, -68]]);
    },
    lamp: function (c) {
      P(c, [[-52, -112], [-24, -176], [24, -176], [52, -112]], true);
      P(c, [[0, -112], [0, -14]]);
      P(c, [[-44, 0], [-44, -14], [44, -14], [44, 0]], true);
    },
    money: function (c) {
      R(c, -98, -76, 196, 76);
      O(c, 0, -38, 22);
      R(c, -82, -100, 196, 24);
    },
    boat: function (c) {
      P(c, [[-100, -44], [100, -44], [68, 0], [-72, 0]], true);
      P(c, [[0, -44], [0, -176], [70, -60], [0, -60]]);
    },
    computer: function (c) {
      R(c, -92, -152, 184, 112);
      P(c, [[-34, -40], [-44, 0], [44, 0], [34, -40]], true);
    },
    ticket: function (c) {
      P(c, [[-98, -112], [98, -112], [98, -74], [84, -56], [98, -38], [98, 0], [-98, 0], [-98, -38], [-84, -56], [-98, -74]], true);
      P(c, [[30, -112], [30, 0]]);
    },
  };
  // A thing and its glow as a picture, kept: it is made once.
  var sprites = {};
  function sprite(id, px) {
    var key = id + "|" + px;
    if (sprites[key]) return sprites[key];
    var pad = 60;
    var c = canvasOf(px + pad * 2, px + pad * 2);
    var g = c.getContext("2d");
    var k = px / 240;
    g.translate(c.width / 2, c.height - pad - 10);
    g.scale(k, k);
    var draw = PROP[id] || PROP.folder;
    g.beginPath();
    draw(g);
    g.fillStyle = "rgba(7,11,20,0.82)";
    g.fill();
    glowing(g, function (x) {
      x.beginPath();
      draw(x);
      x.stroke();
    }, 4.4, COLORS.glow);
    sprites[key] = { canvas: c, pad: pad };
    return sprites[key];
  }
  // It comes up out of the dark, it does not pop: the mood of the whole preset.
  function thing(g, id, x, ground, px, t, at) {
    var k = smooth((t - (at || 0)) / 0.7);
    if (k <= 0) return;
    var s = sprite(id, px);
    var was = g.globalAlpha;
    g.globalAlpha = was * k;
    g.drawImage(s.canvas, x - s.canvas.width / 2, ground - s.canvas.height + s.pad + 10 + (1 - k) * 18);
    g.globalAlpha = was;
  }

  // ---- places: streets, rooms and tables out of simple shapes, kept as pictures ----------------

  var ROOM_X = 130;
  var ROOM_Y = 80;
  var backs = {};
  var backOrder = [];
  function kept(key, make) {
    if (backs[key]) return backs[key];
    var made = make();
    backs[key] = made;
    backOrder.push(key);
    while (backOrder.length > 3) delete backs[backOrder.shift()];
    return made;
  }
  function layer() {
    var c = canvasOf(WIDTH + ROOM_X * 2, HEIGHT + ROOM_Y * 2);
    var g = c.getContext("2d");
    g.translate(ROOM_X, ROOM_Y);
    return { c: c, g: g };
  }
  function sky(g, r) {
    var grad = g.createLinearGradient(0, -ROOM_Y, 0, HEIGHT);
    grad.addColorStop(0, "#050810");
    grad.addColorStop(0.62, "#0c1626");
    grad.addColorStop(1, "#111e33");
    g.fillStyle = grad;
    g.fillRect(-ROOM_X, -ROOM_Y, WIDTH + ROOM_X * 2, HEIGHT + ROOM_Y * 2);
    for (var i = 0; i < 90; i++) {
      g.fillStyle = "rgba(190,205,230," + (0.1 + r() * 0.4) + ")";
      g.fillRect(-ROOM_X + r() * (WIDTH + ROOM_X * 2), -ROOM_Y + r() * 520, 2, 2);
    }
  }
  // A row of buildings: dark blocks, a few lit windows.
  function buildings(g, r, y, least, most, fill, lit) {
    var x = -ROOM_X;
    while (x < WIDTH + ROOM_X) {
      var a = 110 + r() * 170;
      var b = least + r() * (most - least);
      g.fillStyle = fill;
      g.fillRect(x, y - b, a + 1, b + 200);
      for (var wy = y - b + 26; wy < y - 30; wy += 46) {
        for (var wx = x + 18; wx < x + a - 26; wx += 42) {
          if (r() < lit) {
            g.fillStyle = rgba(COLD, 0.1 + r() * 0.38);
            g.fillRect(wx, wy, 20, 26);
          }
        }
      }
      x += a + (r() < 0.2 ? 14 : 0);
    }
  }
  var GROUND = 880;
  function lampPost(g, x, ground, tall) {
    g.strokeStyle = "#1b2840";
    g.lineWidth = 9;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(x, ground);
    g.lineTo(x, ground - tall);
    g.lineTo(x + 54, ground - tall - 12);
    g.stroke();
    var was = g.globalCompositeOperation;
    g.globalCompositeOperation = "lighter";
    cone(g, x + 54, ground - tall - 10, 190, tall + 10, COLD, 0.17);
    pool(g, x + 54, ground - tall - 10, 110, COLD, 0.42);
    pool(g, x + 54, ground + 8, 230, COLD, 0.1);
    g.globalCompositeOperation = was;
    g.fillStyle = "#eaf1fb";
    g.beginPath();
    g.arc(x + 54, ground - tall - 10, 9, 0, Math.PI * 2);
    g.fill();
  }
  function street(seed) {
    return kept("street" + seed, function () {
      var r = seeded(seed);
      var far = layer();
      sky(far.g, r);
      buildings(far.g, r, GROUND, 320, 640, "#0b1321", 0.12);
      var near = layer();
      buildings(near.g, r, GROUND, 120, 380, "#0a101c", 0.16);
      var grad = near.g.createLinearGradient(0, GROUND - 16, 0, HEIGHT + ROOM_Y);
      grad.addColorStop(0, "#141f33");
      grad.addColorStop(1, "#090e18");
      near.g.fillStyle = grad;
      near.g.fillRect(-ROOM_X, GROUND - 16, WIDTH + ROOM_X * 2, HEIGHT);
      // the curb, and the road's dashes
      near.g.fillStyle = "#26354f";
      near.g.fillRect(-ROOM_X, GROUND + 26, WIDTH + ROOM_X * 2, 5);
      near.g.fillStyle = "rgba(159,182,216,0.22)";
      for (var x = -ROOM_X + r() * 160; x < WIDTH + ROOM_X; x += 240) near.g.fillRect(x, GROUND + 112, 120, 7);
      var lamps = [300 + r() * 120, 1040 + r() * 160, 1700 + r() * 80];
      lamps.forEach(function (x) {
        lampPost(near.g, x, GROUND + 18, 430);
      });
      return { far: far.c, near: near.c, lamps: lamps };
    });
  }
  function room(seed) {
    return kept("room" + seed, function () {
      var r = seeded(seed);
      var far = layer();
      var g = far.g;
      g.fillStyle = "#0b1220";
      g.fillRect(-ROOM_X, -ROOM_Y, WIDTH + ROOM_X * 2, HEIGHT + ROOM_Y * 2);
      // the back wall, a floor and a ceiling in perspective
      var wall = g.createLinearGradient(0, 120, 0, GROUND - 60);
      wall.addColorStop(0, "#101a2c");
      wall.addColorStop(1, "#16233a");
      g.fillStyle = wall;
      g.fillRect(250, 90, 1420, GROUND - 150);
      g.strokeStyle = "#2b3b58";
      g.lineWidth = 4;
      g.beginPath();
      P(g, [[-ROOM_X, -ROOM_Y], [250, 90], [1670, 90], [WIDTH + ROOM_X, -ROOM_Y]]);
      P(g, [[-ROOM_X, HEIGHT + ROOM_Y], [250, GROUND - 60], [1670, GROUND - 60], [WIDTH + ROOM_X, HEIGHT + ROOM_Y]]);
      P(g, [[250, 90], [250, GROUND - 60]]);
      P(g, [[1670, 90], [1670, GROUND - 60]]);
      g.stroke();
      var floor = g.createLinearGradient(0, GROUND - 60, 0, HEIGHT + ROOM_Y);
      floor.addColorStop(0, "#131e32");
      floor.addColorStop(1, "#080d17");
      g.fillStyle = floor;
      g.beginPath();
      P(g, [[-ROOM_X, HEIGHT + ROOM_Y], [250, GROUND - 60], [1670, GROUND - 60], [WIDTH + ROOM_X, HEIGHT + ROOM_Y]], true);
      g.fill();
      // a window with moonlight on the side the seed gives, a door on the other
      var left = r() < 0.5;
      var wx = left ? 390 : 1180;
      var doorX = left ? 1400 : 400;
      g.fillStyle = "#1c3050";
      g.fillRect(wx, 200, 340, 330);
      g.strokeStyle = "#39506f";
      g.lineWidth = 8;
      g.strokeRect(wx, 200, 340, 330);
      g.beginPath();
      P(g, [[wx + 170, 200], [wx + 170, 530]]);
      P(g, [[wx, 365], [wx + 340, 365]]);
      g.stroke();
      g.globalCompositeOperation = "lighter";
      pool(g, wx + 170, 365, 430, COLD, 0.14);
      g.fillStyle = rgba(COLD, 0.055);
      g.beginPath();
      P(g, [[wx, 530], [wx + 340, 530], [wx + 240 + (left ? 240 : -240), HEIGHT], [wx - 100 + (left ? 240 : -240), HEIGHT]], true);
      g.fill();
      g.globalCompositeOperation = "source-over";
      g.fillStyle = "#0a111d";
      g.fillRect(doorX, 296, 190, GROUND - 356);
      g.strokeStyle = "#2b3b58";
      g.lineWidth = 6;
      g.strokeRect(doorX, 296, 190, GROUND - 356);
      var near = layer();
      // a table and the lamp over it
      var t = near.g;
      var tx = left ? 1010 : 660;
      t.globalCompositeOperation = "lighter";
      cone(t, tx + 130, 0, 330, 700, COLD, 0.11);
      t.globalCompositeOperation = "source-over";
      t.strokeStyle = "#1b2840";
      t.lineWidth = 6;
      t.beginPath();
      t.moveTo(tx + 130, -ROOM_Y);
      t.lineTo(tx + 130, 0);
      t.stroke();
      t.fillStyle = "#23334f";
      t.beginPath();
      P(t, [[tx + 70, 38], [tx + 92, 0], [tx + 168, 0], [tx + 190, 38]], true);
      t.fill();
      t.fillStyle = "#1a2740";
      t.fillRect(tx - 80, 690, 420, 20);
      t.fillStyle = "#101a2b";
      t.fillRect(tx - 60, 710, 18, 190);
      t.fillRect(tx + 300, 710, 18, 190);
      return { far: far.c, near: near.c, doorX: doorX + 95, windowX: wx + 170, tableX: tx + 130, tableY: 690 };
    });
  }
  // A dark table seen from the front, one pool of light on it.
  function table(seed) {
    return kept("table" + seed, function () {
      var far = layer();
      var g = far.g;
      var grad = g.createLinearGradient(0, -ROOM_Y, 0, 700);
      grad.addColorStop(0, "#060a12");
      grad.addColorStop(1, "#0d1626");
      g.fillStyle = grad;
      g.fillRect(-ROOM_X, -ROOM_Y, WIDTH + ROOM_X * 2, HEIGHT + ROOM_Y * 2);
      var near = layer();
      var top = near.g.createLinearGradient(0, 700, 0, HEIGHT + ROOM_Y);
      top.addColorStop(0, "#1a2740");
      top.addColorStop(1, "#0a101c");
      near.g.fillStyle = top;
      near.g.fillRect(-ROOM_X, 720, WIDTH + ROOM_X * 2, HEIGHT);
      near.g.fillStyle = "#2b3b58";
      near.g.fillRect(-ROOM_X, 716, WIDTH + ROOM_X * 2, 5);
      return { far: far.c, near: near.c };
    });
  }
  function drawBack(g, back, cam) {
    enterLayer(g, cam, DEPTH.far);
    g.drawImage(back.far, -ROOM_X, -ROOM_Y);
    enterLayer(g, cam, DEPTH.near);
    g.drawImage(back.near, -ROOM_X, -ROOM_Y);
    enterLayer(g, cam, DEPTH.figure);
  }

  // ---- the maps: the same Natural Earth data, in the dark -------------------------------------

  function viewOf(lon, lat, spanLon) {
    var span = clamp(spanLon, 8, 340);
    var latMid = clamp(lat, -62, 74);
    var ppd = WIDTH / (span * Math.cos((latMid * Math.PI) / 180));
    return { lon: lon, lat: latMid, ppd: ppd, cos: Math.cos((latMid * Math.PI) / 180) };
  }
  function project(view, lon, lat) {
    return [WIDTH / 2 + (lon - view.lon) * view.cos * view.ppd, HEIGHT / 2 - (lat - view.lat) * view.ppd];
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
  function viewForPlace(p) {
    if (!p) return viewOf(12, 22, 340);
    if (!p.box) return viewOf(p.lon, p.lat, 34);
    var wide = p.box[2] - p.box[0];
    var tall = (p.box[3] - p.box[1]) * (WIDTH / HEIGHT);
    return viewOf((p.box[0] + p.box[2]) / 2, (p.box[1] + p.box[3]) / 2, Math.max(wide, tall) * 3 + 8);
  }
  function viewForRoute(a, b) {
    if (!a || !b) return viewOf(12, 22, 340);
    var midLat = (a.lat + b.lat) / 2;
    var cos = Math.cos((clamp(midLat, -62, 74) * Math.PI) / 180);
    var wide = Math.abs(a.lon - b.lon) / 0.6;
    var tall = (Math.abs(a.lat - b.lat) * (WIDTH / HEIGHT)) / 0.46 / cos;
    var v = viewOf((a.lon + b.lon) / 2, midLat, Math.max(wide, tall, 24));
    v.lat += 36 / v.ppd;
    return v;
  }
  function tracePlace(g, view, country) {
    for (var i = 0; i < country.rings.length; i++) {
      var r = country.rings[i];
      var first = project(view, r[0], r[1]);
      g.moveTo(first[0], first[1]);
      for (var k = 2; k < r.length; k += 2) {
        var q = project(view, r[k], r[k + 1]);
        g.lineTo(q[0], q[1]);
      }
      g.closePath();
    }
  }
  function mapBack(view, marked) {
    return kept("map" + [view.lon, view.lat, view.ppd, marked || ""].join("|"), function () {
      var far = layer();
      var g = far.g;
      g.fillStyle = "#060a13";
      g.fillRect(-ROOM_X, -ROOM_Y, WIDTH + ROOM_X * 2, HEIGHT + ROOM_Y * 2);
      g.strokeStyle = "rgba(90,115,155,0.14)";
      g.lineWidth = 1.5;
      var grid = view.ppd > 40 ? 5 : view.ppd > 16 ? 10 : 20;
      var i;
      for (i = -180; i <= 180; i += grid) {
        var a = project(view, i, -85);
        var b = project(view, i, 85);
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(b[0], b[1]);
        g.stroke();
      }
      for (i = -80; i <= 80; i += grid) {
        var e = project(view, -180, i);
        var f = project(view, 180, i);
        g.beginPath();
        g.moveTo(e[0], e[1]);
        g.lineTo(f[0], f[1]);
        g.stroke();
      }
      var W = world();
      g.beginPath();
      W.countries.forEach(function (x) {
        tracePlace(g, view, x);
      });
      g.fillStyle = "#121c2e";
      g.fill();
      g.strokeStyle = "#2f4162";
      g.lineWidth = 2;
      g.lineJoin = "round";
      g.stroke();
      var hit = marked && findPlace(marked);
      if (hit && hit.rings) {
        g.beginPath();
        tracePlace(g, view, hit);
        g.fillStyle = "#223452";
        g.fill();
        g.strokeStyle = COLORS.paper;
        g.lineWidth = 3;
        g.stroke();
      }
      return { far: far.c, near: canvasOf(1, 1) };
    });
  }
  function pin(g, x, y, t, at) {
    var k = smooth((t - at) / 0.4);
    if (k <= 0) return;
    // a ring goes out from it, again and again, from t alone
    var ph = ((t - at) % 1.8) / 1.8;
    g.globalCompositeOperation = "lighter";
    pool(g, x, y, 90 * k, COLORS.glow, 0.44);
    g.globalCompositeOperation = "source-over";
    glowing(g, function (c) {
      c.beginPath();
      c.arc(x, y, 12 + ph * 76, 0, Math.PI * 2);
      c.stroke();
    }, 3, COLORS.glow, 1 - ph);
    g.fillStyle = COLORS.glow;
    g.beginPath();
    g.arc(x, y, 13 * k, 0, Math.PI * 2);
    g.fill();
  }
  function arc(a, b, lift, n) {
    var out = [];
    for (var i = 0; i <= n; i++) {
      var k = i / n;
      out.push([mix(a[0], b[0], k), mix(a[1], b[1], k) + Math.sin(k * Math.PI) * lift]);
    }
    return out;
  }
  // A line drawn up to `k` of its length, with its glow. Returns where its head is.
  function glowLine(g, pts, width, k, color) {
    if (k <= 0) return null;
    var lengths = [0];
    var i;
    for (i = 1; i < pts.length; i++) lengths.push(lengths[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    var want = lengths[lengths.length - 1] * clamp(k);
    var head = pts[0];
    var run = function (c) {
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (var n = 1; n < pts.length; n++) {
        if (lengths[n] <= want) {
          c.lineTo(pts[n][0], pts[n][1]);
          head = pts[n];
          continue;
        }
        var q = (want - lengths[n - 1]) / (lengths[n] - lengths[n - 1] || 1);
        head = [mix(pts[n - 1][0], pts[n][0], q), mix(pts[n - 1][1], pts[n][1], q)];
        c.lineTo(head[0], head[1]);
        break;
      }
      c.stroke();
    };
    glowing(g, run, width, color || COLORS.glow);
    return head;
  }

  // ---- the words -----------------------------------------------------------------------------

  var CSS =
    ".nf-root{position:absolute;inset:0;width:1920px;height:1080px;overflow:hidden;color:var(--fg);font-family:var(--font-body);background:radial-gradient(ellipse at 50% 40%,#111b2d 0%,var(--bg) 72%)}" +
    ".nf-view{position:absolute;left:0;top:0;width:1920px;height:1080px}" +
    ".nf-clip{position:absolute;inset:0;transform-origin:50% 50%}" +
    ".nf-shade{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 46%,rgba(3,5,10,0) 52%,rgba(3,5,10,.62) 100%)}" +
    ".nf-grain{position:absolute;inset:0;pointer-events:none;background-size:256px 256px}" +
    ".nf-t{position:absolute;width:max-content;font-family:var(--font-display);font-weight:400;line-height:1.02;letter-spacing:.012em;opacity:0;text-shadow:0 3px 22px rgba(3,5,10,.92),0 0 3px rgba(3,5,10,.8)}" +
    ".nf-lit{color:var(--brand);text-shadow:0 0 34px color-mix(in srgb,var(--brand) 62%,transparent),0 0 6px color-mix(in srgb,var(--brand) 50%,transparent)}" +
    ".nf-tag{position:absolute;width:max-content;font-family:var(--font-body);font-weight:600;line-height:1.2;padding:.32em .6em;color:var(--accent);background:rgba(5,8,15,.8);border-left:6px solid var(--accent);opacity:0}" +
    ".nf-word{position:relative;display:inline-block}" +
    ".nf-mark{position:absolute;left:-1%;bottom:-.03em;height:.075em;width:102%;background:var(--brand);box-shadow:0 0 22px var(--brand);transform-origin:0 50%;transform:scaleX(0)}" +
    ".nf-stamp{position:absolute;width:max-content;text-align:center;color:var(--accent);border:10px solid var(--accent);padding:.1em .3em .06em;font-family:var(--font-display);line-height:1;letter-spacing:.03em;opacity:0;font-variant-numeric:tabular-nums}" +
    ".nf-where{display:block;font-family:var(--font-body);font-weight:600;font-size:.3em;letter-spacing:.09em;margin:.3em 0 .26em;line-height:1.1}" +
    ".nf-card{position:absolute;width:max-content;max-width:400px;text-align:center;color:#0b1220;font-family:var(--font-body);font-weight:600;line-height:1.14;opacity:0}";
  function style() {
    if (d.getElementById("nf-style")) return;
    var s = d.createElement("style");
    s.id = "nf-style";
    s.textContent = CSS;
    d.head.appendChild(s);
  }
  // Comes up out of the dark with a small rise: nothing bounces in this preset.
  function rise(tl, el, at) {
    tl.fromTo(el, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, at);
  }
  // A sign that catches: on, off, on. Seek-safe, it is only tweens on the timeline.
  function flicker(tl, el, at) {
    tl.set(el, { opacity: 0.9 }, at);
    tl.set(el, { opacity: 0.12 }, at + 0.07);
    tl.set(el, { opacity: 0.8 }, at + 0.16);
    tl.set(el, { opacity: 0.2 }, at + 0.22);
    tl.set(el, { opacity: 1 }, at + 0.32);
  }
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
  // The size that fits the words, from their letters and not from a measurement: the same size
  // on every run and in every worker. The display font is narrow.
  function size(text, base, room, lines, wide) {
    var words = String(text).split(/\s+/).filter(Boolean);
    var longest = words.reduce(function (m, x) { return Math.max(m, x.length); }, 1);
    var px = base;
    while (px > 30) {
      var perLine = room / (px * (wide || 0.46));
      if (longest <= perLine && linesAt(words, perLine) <= (lines || 2)) break;
      px -= 2;
    }
    return px;
  }
  function words(view, text, place, base, room, lines, lit) {
    var e = d.createElement("div");
    e.className = "nf-t" + (lit ? " nf-lit" : "");
    e.textContent = text;
    e.style.cssText += ";" + place + ";font-size:" + size(text, base, room, lines) + "px;max-width:" + room + "px";
    view.words.appendChild(e);
    return e;
  }
  function tag(view, text, place, base, room) {
    var e = d.createElement("div");
    e.className = "nf-tag";
    e.textContent = text;
    e.style.cssText += ";" + place + ";font-size:" + size(text, base, room - 60, 2, 0.6) + "px;max-width:" + room + "px";
    view.words.appendChild(e);
    return e;
  }
  function underlined(host, text, mark) {
    var word = String(mark || "").trim();
    var at = word ? String(text).toLowerCase().indexOf(word.toLowerCase()) : -1;
    if (at < 0) return null;
    host.textContent = "";
    host.appendChild(d.createTextNode(text.slice(0, at)));
    var span = d.createElement("span");
    span.className = "nf-word";
    span.textContent = text.slice(at, at + word.length);
    var bar = d.createElement("i");
    bar.className = "nf-mark";
    span.appendChild(bar);
    host.appendChild(span);
    host.appendChild(d.createTextNode(text.slice(at + word.length)));
    return bar;
  }
  function swipe(tl, bar, at) {
    tl.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: "power2.inOut" }, at);
  }
  // A stamp lands hard, once: no spring, it is a rubber stamp on paper.
  function stampIn(tl, el, at, turn) {
    tl.fromTo(el, { opacity: 0, scale: 1.45, rotation: turn - 2 }, { opacity: 0.94, scale: 1, rotation: turn, duration: 0.18, ease: "power4.in" }, at);
  }

  // ---- the flash: what happens in a story is only ever implied --------------------------------

  // How lit the frame is at t: quick pulses that die away. Pure.
  function flashAt(t) {
    var out = 0;
    FLASH_GAPS.forEach(function (gap, i) {
      var q = t - FLASH_AT - gap;
      if (q >= 0) out = Math.max(out, (i === 2 ? 0.7 : 1) * Math.exp(-q * 7));
    });
    return out;
  }
  // One dark building in front of the street, its windows are what the flash lights.
  function building(seed) {
    return kept("building" + seed, function () {
      var r = seeded(seed + 9);
      var a = 620 + r() * 300;
      var b = 480 + r() * 180;
      var x = 960 - a / 2 + (r() - 0.5) * 240;
      var y = GROUND + 16 - b;
      var list = [];
      for (var wy = y + 60; wy < GROUND - 80; wy += 124) {
        for (var wx = x + 54; wx < x + a - 110; wx += 136) list.push([wx, wy]);
      }
      return { x: x, y: y, a: a, b: b, windows: list };
    });
  }

  // ---- the scene kinds: words(view, tl, v) and paint(g, t, v, D, view) ---------------------------

  var KINDS = {
    title: {
      words: function (view, tl, v) {
        if (v.kicker) rise(tl, tag(view, v.kicker, "left:110px;top:112px", 40, 900), 0.12);
        rise(tl, words(view, v.headline, "left:104px;top:190px", 170, 1180, 3), 0.28);
      },
      paint: function (g, t, v, D, view) {
        var back = street(view.seed);
        drawBack(g, back, view.cam);
        var lamp = back.lamps[1];
        figure(g, { x: lamp + 74, ground: GROUND + 18, h: 290 });
      },
    },
    chapter: {
      words: function (view, tl, v) {
        flicker(tl, words(view, v.headline, "left:150px;top:360px", 190, 1120, 2), 0.3);
      },
      paint: function (g, t, v, D, view) {
        var back = table(view.seed);
        drawBack(g, back, view.cam);
        // a folder on the table, and one flashlight going over it
        thing(g, v.object || "folder", 1420, 900, 620, t, 0.1);
        var k = t / Math.max(1.6, D);
        g.globalCompositeOperation = "lighter";
        pool(g, mix(200, 1720, smooth(k)), mix(420, 640, Math.sin(k * 3.1)), 420, COLD, 0.28);
        g.globalCompositeOperation = "source-over";
      },
    },
    statement: {
      words: function (view, tl, v) {
        rise(tl, words(view, v.line1, "left:900px;top:220px", 128, 930, 2), 0.14);
        rise(tl, words(view, v.line2, "left:900px;top:530px", 150, 930, 2, true), 0.5);
      },
      paint: function (g, t, v, D, view) {
        var back = room(view.seed);
        drawBack(g, back, view.cam);
        figure(g, { x: 420, ground: 940, h: 440, back: true });
        if (v.object && v.object !== "folder" && v.object !== "figure") thing(g, v.object, 640, 950, 220, t, 0.3);
      },
    },
    word: {
      words: function (view, tl, v) {
        var e = words(view, v.word, "left:0;right:0;margin:0 auto;text-align:center;top:190px", 380, 1640, 1, true);
        flicker(tl, e, 0.12);
      },
      paint: function (g, t, v, D, view) {
        var back = street(view.seed);
        drawBack(g, back, view.cam);
        if (v.object && v.object !== "folder") thing(g, v.object, 960, 930, 320, t, 0.3);
      },
    },
    highlight: {
      words: function (view, tl, v) {
        var e = words(view, v.line, "left:110px;top:270px", 150, 1030, 3);
        var bar = underlined(e, v.line, v.mark);
        rise(tl, e, 0.14);
        if (bar) swipe(tl, bar, 0.6);
      },
      paint: function (g, t, v, D, view) {
        drawBack(g, table(view.seed), view.cam);
        g.globalCompositeOperation = "lighter";
        cone(g, 1480, -40, 360, 830, COLD, 0.17);
        pool(g, 1480, 780, 360, COLD, 0.12);
        g.globalCompositeOperation = "source-over";
        thing(g, v.object || "folder", 1480, 806, 430, t, 0.2);
      },
    },
    question: {
      words: function (view, tl, v) {
        var q = String(v.question).replace(/[?\s]*$/, "?");
        rise(tl, words(view, q, "left:820px;top:290px", 150, 1000, 3), 0.2);
      },
      paint: function (g, t, v, D, view) {
        // one lit doorway in the dark, somebody standing in it
        drawBack(g, table(view.seed), view.cam);
        var x = 250;
        var y = 180;
        var a = 340;
        var b = 720;
        g.globalCompositeOperation = "lighter";
        pool(g, x + a / 2, y + b / 2, 620, COLD, 0.16);
        g.fillStyle = rgba(COLD, 0.1);
        g.beginPath();
        P(g, [[x, y + b], [x + a, y + b], [x + a + 260, HEIGHT], [x - 70, HEIGHT]], true);
        g.fill();
        g.globalCompositeOperation = "source-over";
        var inside = g.createLinearGradient(0, y, 0, y + b);
        inside.addColorStop(0, "#5f7ba6");
        inside.addColorStop(1, "#2e4263");
        g.fillStyle = inside;
        g.fillRect(x, y, a, b);
        g.strokeStyle = "#39506f";
        g.lineWidth = 10;
        g.strokeRect(x, y, a, b);
        figure(g, { x: x + a / 2, ground: y + b, h: 540, back: true });
      },
    },
    stamp: {
      words: function (view, tl, v) {
        var e = d.createElement("div");
        e.className = "nf-stamp";
        e.textContent = v.when;
        if (v.where) {
          var below = d.createElement("span");
          below.className = "nf-where";
          below.textContent = v.where;
          e.appendChild(below);
        }
        e.style.cssText += ";left:130px;top:190px;font-size:" + size(v.when, 230, 1040, 1, 0.5) + "px";
        view.words.appendChild(e);
        stampIn(tl, e, 0.12, -3.5);
        if (v.line) rise(tl, words(view, v.line, "left:136px;top:630px", 96, 1100, 2), 0.5);
      },
      paint: function (g, t, v, D, view) {
        var back = street(view.seed);
        drawBack(g, back, view.cam);
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = "rgba(5,8,15,0.5)";
        g.fillRect(0, 0, WIDTH, HEIGHT);
        enterLayer(g, view.cam, DEPTH.figure);
        thing(g, v.object || "folder", 1520, 900, 420, t, 0.3);
      },
    },
    board: {
      words: function (view, tl, v) {
        var items = [v.item1, v.item2, v.item3, v.item4].filter(Boolean);
        var spots = items.length > 3 ? [[300, 300], [800, 240], [1270, 330], [760, 660]] : [[320, 320], [860, 250], [1290, 500]];
        view.cards = items.map(function (text, i) {
          var at = 0.25 + i * Math.min(0.9, (view.D * 0.7) / items.length);
          var e = d.createElement("div");
          e.className = "nf-card";
          e.textContent = text;
          e.style.cssText += ";left:" + (spots[i][0] - 170) + "px;top:" + (spots[i][1] + 44) + "px;width:340px;max-width:340px;font-size:" + size(text, 54, 320, 3, 0.62) + "px;transform:rotate(" + (i % 2 ? 1.4 : -1.4) + "deg)";
          view.words.appendChild(e);
          tl.fromTo(e, { opacity: 0 }, { opacity: 1, duration: 0.2 }, at + 0.1);
          return { x: spots[i][0], y: spots[i][1], at: at, turn: i % 2 ? 0.025 : -0.025 };
        });
      },
      paint: function (g, t, v, D, view) {
        enterLayer(g, view.cam, DEPTH.far);
        g.fillStyle = "#070c15";
        g.fillRect(-ROOM_X, -ROOM_Y, WIDTH + ROOM_X * 2, HEIGHT + ROOM_Y * 2);
        enterLayer(g, view.cam, DEPTH.near);
        // the board: a plain dark sheet with a frame, one lamp above it
        g.fillStyle = "#131d30";
        g.fillRect(90, 70, 1740, 900);
        g.strokeStyle = "#2f4162";
        g.lineWidth = 12;
        g.strokeRect(90, 70, 1740, 900);
        g.globalCompositeOperation = "lighter";
        pool(g, 960, 300, 980, COLD, 0.12);
        g.globalCompositeOperation = "source-over";
        enterLayer(g, view.cam, DEPTH.figure);
        var cards = view.cards;
        cards.forEach(function (c) {
          var k = smooth((t - c.at) / 0.25);
          if (k <= 0) return;
          g.save();
          g.translate(c.x, c.y + 110);
          g.rotate(c.turn);
          g.scale(mix(1.08, 1, k), mix(1.08, 1, k));
          g.globalAlpha = k;
          g.fillStyle = "rgba(0,0,0,0.5)";
          g.fillRect(-182, -122, 380, 262);
          g.fillStyle = COLORS.paper;
          g.fillRect(-190, -130, 380, 262);
          g.restore();
        });
        // one string, from pin to pin, drawn as the cards arrive
        var pts = cards.map(function (c) {
          return [c.x, c.y - 4];
        });
        var last = cards[cards.length - 1].at;
        var line = [];
        pts.forEach(function (p, i) {
          if (i) line = line.concat(arc(pts[i - 1], p, 34, 14));
        });
        glowLine(g, line, 4.5, smooth((t - cards[0].at) / Math.max(0.3, last - cards[0].at + 0.3)));
        cards.forEach(function (c) {
          var k = smooth((t - c.at) / 0.2);
          if (k <= 0) return;
          g.globalCompositeOperation = "lighter";
          pool(g, c.x, c.y - 4, 44, COLORS.glow, 0.5 * k);
          g.globalCompositeOperation = "source-over";
          g.fillStyle = COLORS.glow;
          g.beginPath();
          g.arc(c.x, c.y - 4, 12 * k, 0, Math.PI * 2);
          g.fill();
        });
      },
    },
    evidence: {
      words: function (view, tl, v) {
        if (v.line) rise(tl, words(view, v.line, "left:1000px;top:230px", 124, 830, 3), 0.44);
      },
      paint: function (g, t, v, D, view) {
        drawBack(g, table(view.seed), view.cam);
        g.globalCompositeOperation = "lighter";
        cone(g, 520, -40, 400, 830, COLD, 0.2);
        pool(g, 520, 800, 420, COLD, 0.15);
        g.globalCompositeOperation = "source-over";
        thing(g, v.object || "folder", 520, 830, 520, t, 0.14);
        // a blank marker beside it, the kind left on a table: no number nobody said
        var k = smooth((t - 0.5) / 0.3);
        if (k > 0) {
          g.fillStyle = rgba(COLORS.paper, k);
          g.beginPath();
          P(g, [[820, 868], [918, 868], [900, 792], [838, 792]], true);
          g.fill();
          g.fillStyle = rgba("#0b1220", k);
          g.fillRect(846, 816, 46, 8);
        }
      },
    },
    map: {
      words: function (view, tl, v) {
        var place = findPlace(v.place);
        view.map = viewForPlace(place);
        view.pinAt = place ? project(view.map, place.lon, place.lat) : [WIDTH / 2, HEIGHT / 2];
        var name = v.label || (place ? place.name : "");
        var right = view.pinAt[0] < 1100;
        if (name) rise(tl, words(view, name, (right ? "left:" + Math.round(view.pinAt[0] + 58) : "right:" + Math.round(WIDTH - view.pinAt[0] + 58)) + "px;top:" + Math.round(view.pinAt[1] - 64) + "px", 104, 720, 1, true), 0.52);
        if (v.line && v.line !== name) rise(tl, tag(view, v.line, view.pinAt[1] > 560 ? "left:96px;top:90px" : "left:96px;top:880px", 46, 1300), 0.8);
      },
      paint: function (g, t, v, D, view) {
        drawBack(g, mapBack(view.map, v.place), view.cam);
        enterLayer(g, view.cam, DEPTH.words);
        pin(g, view.pinAt[0], view.pinAt[1], t, 0.28);
      },
    },
    route: {
      words: function (view, tl, v) {
        var a = findPlace(v.fromPlace);
        var b = findPlace(v.toPlace);
        view.map = viewForRoute(a, b);
        view.a = a ? project(view.map, a.lon, a.lat) : [480, 620];
        view.b = b ? project(view.map, b.lon, b.lat) : [1440, 460];
        view.from = 0.2;
        view.to = Math.max(1.1, view.D * 0.62);
        var label = function (text, xy, other, at) {
          var right = xy[0] >= other[0] ? xy[0] + 500 < WIDTH : xy[0] - 500 < 60;
          rise(tl, words(view, text, (right ? "left:" + Math.round(xy[0] + 46) : "right:" + Math.round(WIDTH - xy[0] + 46)) + "px;top:" + Math.round(xy[1] - 42) + "px", 78, 440, 1), at);
        };
        var nameA = v.fromLabel || (a ? a.name : "");
        var nameB = v.toLabel || (b ? b.name : "");
        if (nameA) label(nameA, view.a, view.b, 0.3);
        if (nameB) label(nameB, view.b, view.a, view.from + view.to - 0.1);
        if (v.line) rise(tl, tag(view, v.line, Math.max(view.a[1], view.b[1]) > 620 ? "left:96px;top:90px" : "left:96px;top:880px", 46, 1300), 0.6);
      },
      paint: function (g, t, v, D, view) {
        drawBack(g, mapBack(view.map, null), view.cam);
        enterLayer(g, view.cam, DEPTH.words);
        var lift = Math.hypot(view.b[0] - view.a[0], view.b[1] - view.a[1]) * 0.14 * (view.b[0] >= view.a[0] ? -1 : 1);
        var k = smooth((t - view.from) / view.to);
        var head = glowLine(g, arc(view.a, view.b, lift, 40), 7, k);
        if (head && k < 1) {
          g.globalCompositeOperation = "lighter";
          pool(g, head[0], head[1], 56, COLORS.glow, 0.7);
          g.globalCompositeOperation = "source-over";
        }
        pin(g, view.a[0], view.a[1], t, 0.08);
        pin(g, view.b[0], view.b[1], t, view.from + view.to - 0.2);
      },
    },
    number: {
      words: function (view, tl, v) {
        var big = words(view, "", "left:110px;top:270px;font-variant-numeric:tabular-nums", 430, 1200, 1, true);
        view.count = d.createElement("span");
        big.appendChild(view.count);
        var pre = v.before ? String(v.before) : "";
        var post = v.after ? String(v.after) : "";
        if (post.length > 2) post = " " + post;
        view.parts = [pre, post];
        big.style.fontSize = size(pre + (Number(v.value) || 0).toLocaleString("en-US") + post, 430, 1160, 1, 0.5) + "px";
        rise(tl, big, 0.08);
      },
      paint: function (g, t, v, D, view) {
        var end = Number(v.value) || 0;
        var digits = (String(v.value).split(".")[1] || "").length;
        var shown = end * smooth(t / Math.min(1.3, D * 0.5));
        view.count.textContent = view.parts[0] + shown.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + view.parts[1];
        drawBack(g, table(view.seed), view.cam);
        g.globalCompositeOperation = "lighter";
        cone(g, 1560, -40, 300, 830, COLD, 0.14);
        g.globalCompositeOperation = "source-over";
        if (v.object && v.object !== "folder") thing(g, v.object, 1560, 800, 400, t, 0.3);
      },
    },
    room: {
      words: function (view, tl, v) {
        if (v.line) rise(tl, tag(view, v.line, "left:96px;top:84px", 58, 1400), 0.3);
      },
      paint: function (g, t, v, D, view) {
        var back = room(view.seed);
        drawBack(g, back, view.cam);
        // somebody crosses from the door toward the table, feet planted
        var from = back.doorX;
        var to = back.tableX + (from < back.tableX ? -190 : 190);
        var dir = to >= from ? 1 : -1;
        var dist = Math.min(Math.abs(to - from), t * 112);
        var feet = gait(dist, 58).map(function (f) {
          return { x: from + dir * f.x, lift: f.lift };
        });
        figure(g, { x: from + dir * dist, ground: 900, h: 400, feet: feet, lean: dir * 2.4 });
        thing(g, v.object || "folder", back.tableX, back.tableY + 4, 190, t, 0.2);
      },
    },
    street: {
      words: function (view, tl, v) {
        if (v.line) rise(tl, tag(view, v.line, "left:96px;top:84px", 58, 1400), 0.3);
      },
      paint: function (g, t, v, D, view) {
        var back = street(view.seed);
        drawBack(g, back, view.cam);
        var dir = view.seed % 2 ? 1 : -1;
        var from = dir > 0 ? 180 : 1740;
        var dist = t * 130;
        var feet = gait(dist, 62).map(function (f) {
          return { x: from + dir * f.x, lift: f.lift };
        });
        if (v.object && v.object !== "folder") thing(g, v.object, 1000, GROUND + 26, 240, t, 0.3);
        figure(g, { x: from + dir * dist, ground: GROUND + 26, h: 300, feet: feet, lean: dir * 2.2 });
      },
    },
    flash: {
      words: function (view, tl, v) {
        if (v.line) rise(tl, tag(view, v.line, "left:96px;top:84px", 58, 1400), 1.1);
      },
      paint: function (g, t, v, D, view) {
        var back = street(view.seed);
        drawBack(g, back, view.cam);
        var b = building(view.seed);
        var k = flashAt(t);
        g.fillStyle = "#070c15";
        g.fillRect(b.x, b.y, b.a, b.b);
        g.strokeStyle = "#1f2c44";
        g.lineWidth = 4;
        g.strokeRect(b.x, b.y, b.a, b.b);
        // the windows: dark, and for a moment too bright to look into. Nothing is seen in them.
        var c = rgb(COLD);
        b.windows.forEach(function (x) {
          g.fillStyle = "rgb(" + Math.round(mix(14, 244, k)) + "," + Math.round(mix(22, 248, k)) + "," + Math.round(mix(36, 255, k)) + ")";
          g.fillRect(x[0], x[1], 72, 84);
        });
        if (k > 0.01) {
          g.globalCompositeOperation = "lighter";
          b.windows.forEach(function (x) {
            pool(g, x[0] + 36, x[1] + 42, 190, COLD, 0.34 * k);
          });
          pool(g, b.x + b.a / 2, GROUND + 60, 620, COLD, 0.22 * k);
          g.globalCompositeOperation = "source-over";
          // the sky answers a little: the whole frame stays dark
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.fillStyle = "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + SKY_LIFT * k + ")";
          g.fillRect(0, 0, WIDTH, HEIGHT);
          enterLayer(g, view.cam, DEPTH.figure);
        }
        // somebody across the street, who only looks
        figure(g, { x: b.x + b.a + 150 > 1780 ? b.x - 150 : b.x + b.a + 150, ground: GROUND + 40, h: 300, back: true });
      },
    },
  };

  // ---- grain: one still layer over everything, faint, against banding in the dark ---------------

  var grainDone = false;
  function makeGrain() {
    if (grainDone) return;
    grainDone = true;
    var size2 = 256;
    var c = canvasOf(size2, size2);
    var g = c.getContext("2d");
    var img = g.createImageData(size2, size2);
    var r = seeded(11);
    for (var i = 0; i < img.data.length; i += 4) {
      var light = r() > 0.5;
      var v = r();
      img.data[i] = img.data[i + 1] = img.data[i + 2] = light ? 255 : 0;
      img.data[i + 3] = v < 0.5 ? 0 : Math.round(v * 9);
    }
    g.putImageData(img, 0, 0);
    var style2 = d.createElement("style");
    style2.textContent = ".nf-grain{background-image:url(" + c.toDataURL("image/png") + ")}";
    d.head.appendChild(style2);
  }

  // ---- a scene on its canvas -----------------------------------------------------------------

  var live = [];
  function draw(view, t) {
    if (!view.g) {
      view.canvas.width = WIDTH;
      view.canvas.height = HEIGHT;
      view.g = view.canvas.getContext("2d");
      live.push(view);
      while (live.length > KEEP) {
        var old = live.shift();
        old.g = null;
        old.canvas.width = 1;
        old.canvas.height = 1;
      }
    }
    var g = view.g;
    view.cam = cameraAt(view.seed, t / view.D);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.clearRect(0, 0, WIDTH, HEIGHT);
    KINDS[view.kind].paint(g, t, view.vars, view.D, view);
    var l = layerAt(view.cam, DEPTH.words);
    view.words.style.transform = "translate(" + l.x.toFixed(2) + "px," + l.y.toFixed(2) + "px) scale(" + l.s.toFixed(4) + ")";
  }

  var first = true;
  // A mounted block's values are on its host and in what the runtime gave its script.
  function valuesOf(host, given) {
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
    readColors(root);
    makeGrain();
    var clip = root.querySelector("[data-scene-dur]");
    var host = root.closest("[data-variable-values]");
    var vars = valuesOf(host, given);
    var D = Math.max(0.1, parseFloat(clip.getAttribute("data-scene-dur")) || 4);
    var canvas = root.querySelector("canvas");
    var holder = canvas.parentNode;
    var shade = d.createElement("div");
    shade.className = "nf-shade";
    holder.insertBefore(shade, clip);
    var grain = d.createElement("div");
    grain.className = "nf-grain";
    holder.appendChild(grain);
    var start = (host && parseFloat(host.getAttribute("data-start"))) || 0;
    var view = { root: root, canvas: canvas, kind: kind, vars: vars, D: D, words: clip, g: null, start: start, seed: hash(kind + JSON.stringify(vars) + start) };
    view.cam = cameraAt(view.seed, 0);
    var tl = gsap.timeline({ paused: true });
    KINDS[kind].words(view, tl, vars);
    // Every frame of this scene goes through this one value (see the top of this file).
    var value = 0;
    var proxy = {
      get p() {
        return value;
      },
      // The engine moves every scene's timeline on every frame, also one that is over:
      // a scene draws only inside its own time (DECISIONS 151).
      set p(k) {
        var same = k === value;
        value = k;
        if (k <= 0 || k >= 1 || (same && view.g)) return;
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

  w.ITVNight = {
    block: block,
    OBJECTS: Object.keys(PROP),
    KINDS: Object.keys(KINDS),
    FLASH_AT: FLASH_AT,
    FLASH_GAPS: FLASH_GAPS,
    SKY_LIFT: SKY_LIFT,
    flashAt: flashAt,
    gait: gait,
    cameraAt: cameraAt,
    layerAt: layerAt,
    DEPTH: DEPTH,
    project: project,
    viewForPlace: viewForPlace,
    viewForRoute: viewForRoute,
    findPlace: findPlace,
  };
})(window, document);

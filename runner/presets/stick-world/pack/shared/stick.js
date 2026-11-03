// stick.js: everything Stick World's blocks draw (docs/BUILD_PLAN.md phase 5, DECISIONS 152).
// Own code, lines and circles on a 2D canvas: no images, no real person, no brand.
//
// HyperFrames still makes every frame. A block only registers a paused timeline, as every
// block does, and one tween on it sets `p`: whatever the engine seeks to, the picture at
// that second is drawn. Nothing depends on the time before it, so a seek in any order gives
// the same frame. A blink comes from the video's own clock and a step from the distance
// walked, both plain functions, so they are the same in every worker.

(function (w, d) {
  "use strict";
  var WIDTH = 1920;
  var HEIGHT = 1080;
  var GROUND = 862;
  var KEEP = 2;

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
    var x = clamp((t - at) / (dur || 0.5));
    if (x >= 1) return 1;
    var c = 1.7;
    var y = x - 1;
    return Math.max(0.0001, 1 + (c + 1) * y * y * y + c * y * y);
  }
  function seeded(seed) {
    var x = seed >>> 0 || 1;
    return function () {
      x = (x * 1664525 + 1013904223) >>> 0;
      return x / 4294967296;
    };
  }

  // ---- a blink: every 3.5 to 4 seconds of the video's own clock -----------------------

  var BLINK = 0.16;
  var blinkLists = {};
  function blinks(seed, until) {
    var list = blinkLists[seed];
    if (!list) {
      var r = seeded(seed * 7919 + 13);
      list = blinkLists[seed] = { next: r, times: [0.4 + r() * 3.1] };
    }
    while (list.times[list.times.length - 1] < until) list.times.push(list.times[list.times.length - 1] + 3.5 + list.next() * 0.5);
    return list.times;
  }
  // How open the eyes are: 1 open, 0 shut.
  function eyesAt(seed, clock) {
    var times = blinks(seed, clock + 4);
    for (var i = times.length - 1; i >= 0; i--) {
      if (times[i] > clock) continue;
      var into = clock - times[i];
      return into < BLINK ? Math.abs(into / BLINK - 0.5) * 2 : 1;
    }
    return 1;
  }

  // ---- a step: the feet are a function of the distance walked -------------------------

  // `d`: how far the hips have come, `S`: the length of one step. One foot moves at a time,
  // over the first 70% of its step, and the other stands exactly where it landed. After a
  // whole number of steps the feet are half a step behind and ahead of the hips, so a walk
  // can stop there. Positions are from where the hips started. Pure, and the test reads it.
  function gait(dist, S) {
    var x = Math.max(0, dist);
    var n = Math.floor(x / S + 1e-9);
    var u = clamp((x - n * S) / (0.7 * S));
    var moving = n % 2;
    var feet = [0, 1].map(function (f) {
      var moves = f === 0 ? Math.ceil(n / 2) : Math.floor(n / 2);
      var at = (f === 0 ? -S / 2 : S / 2) + 2 * S * moves;
      if (f === moving && u > 0 && u < 1) return { x: at + 2 * S * smooth(u), lift: Math.sin(Math.PI * u) };
      if (f === moving && u >= 1) return { x: at + 2 * S, lift: 0 };
      return { x: at, lift: 0 };
    });
    return feet;
  }
  // A walk that fits the shot: never over 3 steps a second, and a whole number of steps.
  function route(D, want, S) {
    var n = Math.max(2, Math.min(Math.round(want / S), Math.floor(D * 0.85 * 3)));
    return { S: S, n: n, dist: n * S };
  }
  // A two-bone limb: where the joint between `a` and `b` is. `side` picks which way it bends.
  function joint(ax, ay, bx, by, len, side) {
    var dx = bx - ax;
    var dy = by - ay;
    var far = Math.sqrt(dx * dx + dy * dy) || 0.001;
    var half = Math.min(far / 2, len);
    var up = Math.sqrt(Math.max(0, len * len - half * half));
    return { x: (ax + bx) / 2 - (dy / far) * up * side, y: (ay + by) / 2 + (dx / far) * up * side };
  }

  // ---- drawing helpers ---------------------------------------------------------------

  function ink(g, width, color) {
    g.lineWidth = width;
    g.strokeStyle = color || g.fg;
    g.fillStyle = color || g.fg;
    g.lineCap = "round";
    g.lineJoin = "round";
  }
  function path(g, pts, closed, fill) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    if (closed) g.closePath();
    if (fill) {
      g.fillStyle = fill;
      g.fill();
    }
    g.stroke();
  }
  function circle(g, x, y, r, fill) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    if (fill) {
      g.fillStyle = fill;
      g.fill();
    }
    g.stroke();
  }
  function rect(g, x, y, a, b, fill) {
    path(g, [[x, y], [x + a, y], [x + a, y + b], [x, y + b]], true, fill);
  }

  // ---- the figure --------------------------------------------------------------------

  var HIP = 184;
  var LEG = 100;
  var TORSO = 112;
  var ARM = 66;
  var HEAD = 36;
  var HANDS = {
    relaxed: [[-44, 114], [44, 114]],
    up: [[-70, -104], [70, -104]],
    shrug: [[-92, -22], [92, -22]],
    point: [[-44, 114], [128, -18]],
    chin: [[-44, 114], [34, -46]],
    talk: [[-44, 114], [104, 20]],
  };

  // `o`: x, k (size), face (1 right, -1 left), feet [{x, lift} in frame pixels from `x`, at
  // k = 1], pose, hero, seed, wave (a hand that moves). Everything but the scarf is one ink.
  function figure(g, o, clock) {
    var k = o.k || 1;
    var face = o.face || 1;
    var feet = o.feet || [{ x: -26, lift: 0 }, { x: 26, lift: 0 }];
    g.save();
    g.translate(o.x, o.ground === undefined ? GROUND : o.ground);
    g.scale(k, k);
    ink(g, 11);
    var hipX = o.hip || 0;
    var breathe = o.walking ? 0 : Math.sin(clock * 1.7 + (o.seed || 0)) * 1.6;
    var hipY = -HIP + breathe + (o.bob || 0);
    feet.forEach(function (f) {
      var fy = -f.lift * 22;
      // a knee bends the way the figure faces
      var knee = joint(hipX, hipY, f.x, fy, LEG, -face);
      path(g, [[hipX, hipY], [knee.x, knee.y], [f.x, fy], [f.x + face * 20, fy]]);
    });
    var sy = hipY - TORSO;
    var sx = hipX + face * 3;
    path(g, [[hipX, hipY], [sx, sy]]);
    var pose = HANDS[o.pose || "relaxed"];
    pose.forEach(function (h, i) {
      var hx = h[0] * face;
      var hy = h[1] + (o.wave && i === 1 ? Math.sin(clock * 7) * 16 : 0);
      // an elbow bends away from the body
      var el = joint(sx, sy, sx + hx, sy + hy, ARM, hx > 0 === hy > 0 ? -1 : 1);
      path(g, [[sx, sy], [el.x, el.y], [sx + hx, sy + hy]]);
    });
    var hx = sx + face * 2;
    var hy = sy - 14 - HEAD;
    path(g, [[sx, sy], [hx, hy]]);
    circle(g, hx, hy, HEAD, g.fg);
    // the eyes: the one thing that blinks
    var open = eyesAt(o.seed || 1, clock);
    g.fillStyle = "#ffffff";
    [8, 26].forEach(function (x) {
      g.beginPath();
      g.ellipse(hx + face * x, hy - 6, 6.5, Math.max(1, 10 * open), 0, 0, Math.PI * 2);
      g.fill();
    });
    if (o.hero) {
      // one item of clothing in the accent color: a scarf, its tail behind
      var tail = Math.sin(clock * 2.4) * 8 + (o.walking ? 10 : 0);
      ink(g, 19, g.brand);
      path(g, [[sx - 26, sy - 7], [sx + 26, sy - 7]]);
      ink(g, 15, g.brand);
      g.beginPath();
      g.moveTo(sx - face * 22, sy - 5);
      g.quadraticCurveTo(sx - face * (56 + tail), sy + 10, sx - face * (58 + tail * 1.6), sy + 62);
      g.stroke();
    }
    g.restore();
  }
  // A figure too small for a face, for 100 people.
  function tiny(g, x, y, color) {
    ink(g, 5, color);
    circle(g, x, y - 37, 10, color);
    path(g, [[x, y - 27], [x, y - 11]]);
    path(g, [[x - 10, y - 22], [x + 10, y - 22]]);
    path(g, [[x - 8, y], [x, y - 11], [x + 8, y]]);
  }

  // ---- the things: in a box 100 wide, standing on y = 0, up to 100 tall ------------------

  var W = "#ffffff";
  var PROP = {
    none: function () {},
    box: function (g) {
      rect(g, -42, -70, 84, 70, W);
      path(g, [[-42, -48], [42, -48]]);
      path(g, [[-12, -70], [-12, -48], [12, -48], [12, -70]]);
    },
    house: function (g) {
      rect(g, -44, -58, 88, 58, W);
      path(g, [[-54, -56], [0, -100], [54, -56]], true, W);
      rect(g, -11, -32, 22, 32, W);
      rect(g, 20, -44, 16, 15, W);
      rect(g, -36, -44, 16, 15, W);
    },
    door: function (g) {
      rect(g, -28, -100, 56, 100, W);
      circle(g, 15, -48, 3.5, g.fg);
    },
    tree: function (g) {
      path(g, [[0, 0], [0, -48]]);
      circle(g, 0, -68, 30, W);
      circle(g, -19, -56, 19, W);
      circle(g, 19, -56, 19, W);
    },
    car: function (g) {
      path(g, [[-58, -14], [-58, -34], [-32, -36], [-16, -58], [24, -58], [40, -36], [58, -30], [58, -14]], true, W);
      path(g, [[-22, -36], [36, -36]]);
      circle(g, -32, -12, 12, W);
      circle(g, 32, -12, 12, W);
    },
    phone: function (g) {
      rect(g, -22, -88, 44, 88, W);
      path(g, [[-22, -74], [22, -74]]);
      path(g, [[-22, -14], [22, -14]]);
    },
    bed: function (g) {
      path(g, [[-60, 0], [-60, -62]]);
      path(g, [[60, 0], [60, -36]]);
      rect(g, -60, -30, 120, 16, W);
      rect(g, -54, -46, 30, 16, W);
    },
    table: function (g) {
      path(g, [[-54, -48], [54, -48]]);
      path(g, [[-44, -48], [-44, 0]]);
      path(g, [[44, -48], [44, 0]]);
    },
    chair: function (g) {
      path(g, [[-22, -80], [-22, 0]]);
      path(g, [[-22, -40], [24, -40], [24, 0]]);
    },
    clock: function (g) {
      circle(g, 0, -48, 44, W);
      path(g, [[0, -48], [0, -76]]);
      path(g, [[0, -48], [20, -38]]);
    },
    coins: function (g) {
      [-50, -32, -14].forEach(function (y) {
        g.beginPath();
        g.ellipse(-20, y + 8, 28, 9, 0, 0, Math.PI * 2);
        g.fillStyle = W;
        g.fill();
        g.stroke();
      });
      [-20, -2].forEach(function (y) {
        g.beginPath();
        g.ellipse(30, y - 6, 28, 9, 0, 0, Math.PI * 2);
        g.fillStyle = W;
        g.fill();
        g.stroke();
      });
    },
    rocket: function (g) {
      path(g, [[-18, -18], [-18, -72], [0, -100], [18, -72], [18, -18]], true, W);
      circle(g, 0, -62, 7, W);
      path(g, [[-18, -38], [-34, -8], [-18, -18]], true, W);
      path(g, [[18, -38], [34, -8], [18, -18]], true, W);
    },
    boat: function (g) {
      path(g, [[-58, -24], [58, -24], [38, 0], [-38, 0]], true, W);
      path(g, [[0, -24], [0, -96]]);
      path(g, [[0, -92], [42, -36], [0, -36]], true, W);
    },
    mountain: function (g) {
      path(g, [[-64, 0], [-8, -96], [20, -52], [34, -68], [66, 0]], true, W);
      path(g, [[-26, -66], [-12, -56], [-2, -66], [9, -70]]);
    },
    sun: function (g) {
      circle(g, 0, -54, 28, W);
      for (var i = 0; i < 10; i++) {
        var a = (i / 10) * Math.PI * 2;
        path(g, [[Math.cos(a) * 38, -54 + Math.sin(a) * 38], [Math.cos(a) * 50, -54 + Math.sin(a) * 50]]);
      }
    },
    moon: function (g) {
      g.beginPath();
      g.arc(0, -52, 42, 1.05, -1.05 + Math.PI * 2);
      g.quadraticCurveTo(-24, -52, Math.cos(1.05) * 42, -52 + Math.sin(1.05) * 42);
      g.closePath();
      g.fillStyle = W;
      g.fill();
      g.stroke();
    },
    planet: function (g) {
      circle(g, 0, -50, 38, W);
      g.beginPath();
      g.ellipse(0, -50, 64, 14, -0.3, 0, Math.PI * 2);
      g.stroke();
    },
    cloud: function (g) {
      circle(g, -24, -56, 20, W);
      circle(g, 22, -56, 24, W);
      circle(g, 0, -72, 24, W);
      g.save();
      g.lineWidth = 0;
      g.fillStyle = W;
      g.fillRect(-26, -66, 50, 24);
      g.restore();
      path(g, [[-30, -36], [40, -36]]);
    },
    book: function (g) {
      path(g, [[-48, -70], [0, -58], [48, -70], [48, -12], [0, 0], [-48, -12]], true, W);
      path(g, [[0, -58], [0, 0]]);
    },
    apple: function (g) {
      circle(g, 0, -36, 34, W);
      path(g, [[0, -68], [6, -86]]);
      path(g, [[6, -80], [24, -88]]);
    },
    dog: function (g) {
      path(g, [[-36, -26], [-36, 0]]);
      path(g, [[-14, -26], [-14, 0]]);
      path(g, [[14, -26], [14, 0]]);
      path(g, [[34, -26], [34, 0]]);
      path(g, [[-48, -46], [-36, -26], [36, -26], [44, -40]]);
      circle(g, 52, -50, 15, W);
      circle(g, 58, -54, 2.5, g.fg);
    },
    bottle: function (g) {
      path(g, [[-22, 0], [-22, -54], [-9, -72], [-9, -92], [9, -92], [9, -72], [22, -54], [22, 0]], true, W);
    },
    ladder: function (g) {
      path(g, [[-24, 0], [-24, -100]]);
      path(g, [[24, 0], [24, -100]]);
      [-16, -36, -56, -76, -94].forEach(function (y) {
        path(g, [[-24, y], [24, y]]);
      });
    },
    computer: function (g) {
      rect(g, -44, -74, 88, 58, W);
      path(g, [[0, -16], [0, 0]]);
      path(g, [[-24, 0], [24, 0]]);
    },
    bag: function (g) {
      rect(g, -36, -62, 72, 62, W);
      path(g, [[-14, -62], [-14, -78], [14, -78], [14, -62]]);
    },
    lamp: function (g) {
      path(g, [[0, 0], [0, -64]]);
      path(g, [[-22, 0], [22, 0]]);
      path(g, [[-30, -60], [-14, -96], [14, -96], [30, -60]], true, W);
    },
    bridge: function (g) {
      path(g, [[-70, -24], [70, -24]]);
      g.beginPath();
      g.moveTo(-58, 0);
      g.quadraticCurveTo(0, -46, 58, 0);
      g.stroke();
      path(g, [[-70, -24], [-70, 0]]);
      path(g, [[70, -24], [70, 0]]);
    },
  };
  // One thing on the floor, `h` pixels for a box 100 tall, popping up at `at`.
  function prop(g, id, x, t, at, h, ground) {
    var draw = PROP[id] || PROP.none;
    if (draw === PROP.none) return;
    var s = (h / 100) * pop(t, at === undefined ? 0.1 : at);
    g.save();
    g.translate(x, ground === undefined ? GROUND : ground);
    g.scale(s, s);
    ink(g, 8 / Math.max(0.3, h / 100));
    draw(g);
    g.restore();
  }

  // ---- the words on screen ----------------------------------------------------------

  var CSS =
    ".stk-root{position:absolute;inset:0;width:1920px;height:1080px;overflow:hidden;color:var(--fg);font-family:var(--font-body);background:var(--bg)}" +
    ".stk-view{position:absolute;left:0;top:0;width:1920px;height:1080px}" +
    ".stk-clip{position:absolute;inset:0}" +
    ".stk-t{position:absolute;font-family:var(--font-display);font-weight:700;line-height:1.1;letter-spacing:-0.01em;opacity:0}" +
    ".stk-kick{font-family:var(--font-body);font-weight:700;color:var(--muted);letter-spacing:0.08em;text-transform:uppercase}" +
    ".stk-mark{position:absolute;left:0;bottom:-8px;height:14px;width:100%;background:var(--brand);border-radius:8px;transform-origin:0 50%;transform:scaleX(0);z-index:-1}" +
    ".stk-word{position:relative;display:inline-block;z-index:0}" +
    ".stk-bubble{position:absolute;left:50%;bottom:650px;width:max-content;max-width:1300px;padding:26px 48px;background:#fff;border:7px solid var(--fg);border-radius:46px;text-align:center;font-family:var(--font-display);font-weight:600;line-height:1.14;opacity:0}" +
    ".stk-sign{position:absolute;width:350px;text-align:center;font-family:var(--font-display);font-weight:600;line-height:1.1;opacity:0}";
  function style() {
    if (d.getElementById("stk-style")) return;
    var s = d.createElement("style");
    s.id = "stk-style";
    s.textContent = CSS;
    d.head.appendChild(s);
  }

  var enter = { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "power3.out" };
  function appear(tl, el, at) {
    tl.fromTo(el, { opacity: 0, y: 26, scale: 0.985 }, enter, at);
  }
  // The size that fits the words in `lines` lines of `room` pixels, from their letters and
  // not from a measurement: the same size on every run and in every worker.
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
    while (px > 34) {
      var perLine = room / (px * 0.58);
      if (longest <= perLine && linesAt(words, perLine) <= (lines || 2)) break;
      px -= 2;
    }
    return px;
  }
  function line(view, text, place, base, room, lines) {
    var e = d.createElement("div");
    e.className = "stk-t";
    e.textContent = text;
    e.style.cssText += ";" + place + ";font-size:" + size(text, base, room, lines) + "px;max-width:" + room + "px";
    view.words.appendChild(e);
    return e;
  }
  var CENTER = "left:0;right:0;margin:0 auto;text-align:center;";

  // ---- the scene kinds: words(view, tl, v) and paint(g, t, v, D, view) --------------------

  var ME = 1;
  // The hero, with what a figure needs of the shot's clock.
  function me(g, view, o) {
    o.hero = true;
    o.seed = ME;
    figure(g, o, view.clock);
  }
  function other(g, view, o, seed) {
    o.seed = seed;
    figure(g, o, view.clock);
  }
  // A walk: the figure's place and feet at a distance, facing right.
  function walker(from, r, t, D, k) {
    var at = r.dist * smooth(clamp(t / Math.min(D * 0.9, r.n / 2.4)));
    var feet = gait(at, r.S).map(function (f) { return { x: f.x - at, lift: f.lift }; });
    var moving = at > 0 && at < r.dist;
    return { x: from + at * (k || 1), k: k || 1, feet: feet, walking: moving, bob: moving ? Math.cos((at / r.S) * Math.PI * 2) * 3 : 0 };
  }
  var STEP = 64;

  var KINDS = {
    title: {
      words: function (view, tl, v) {
        if (v.kicker) {
          var kick = line(view, v.kicker, CENTER + "top:62px", 38, 1600);
          kick.className = "stk-t stk-kick";
          appear(tl, kick, 0.08);
        }
        appear(tl, line(view, v.headline, CENTER + "top:112px", 128, 1720, 2), 0.14);
      },
      paint: function (g, t, v, D, view) {
        var some = v.object && v.object !== "none";
        prop(g, v.object, 1260, t, 0.2, 340);
        me(g, view, { x: some ? 720 : 960, pose: some ? "point" : "chin" });
      },
    },
    chapter: {
      words: function (view, tl, v) {
        appear(tl, line(view, v.headline, CENTER + "top:110px", 124, 1720, 2), 0.1);
      },
      paint: function (g, t, v, D, view) {
        var r = route(D, 840, STEP);
        prop(g, v.object, 1520, t, 0.1, 320);
        var from = 1240 - r.dist;
        var m = walker(from, r, t, D);
        m.pose = "relaxed";
        me(g, view, m);
      },
    },
    statement: {
      words: function (view, tl, v) {
        var box = d.createElement("div");
        box.style.cssText = "position:absolute;left:980px;top:440px;width:840px;transform:translateY(-50%);display:flex;flex-direction:column;gap:22px";
        view.words.appendChild(box);
        [v.line1, v.line2].forEach(function (text, i) {
          var e = line(view, text, "position:relative", 112, 840, 2);
          box.appendChild(e);
          appear(tl, e, 0.1 + i * 0.32);
        });
      },
      paint: function (g, t, v, D, view) {
        var some = v.object && v.object !== "none";
        prop(g, v.object, 700, t, 0.25, 300);
        me(g, view, { x: some ? 300 : 460, k: 1.45, pose: "point" });
      },
    },
    word: {
      words: function (view, tl, v) {
        appear(tl, line(view, v.word, CENTER + "top:90px", 250, 1760, 1), 0.06);
      },
      paint: function (g, t, v, D, view) {
        var some = v.object && v.object !== "none";
        prop(g, v.object, 1250, t, 0.2, 320);
        me(g, view, { x: some ? 760 : 960, pose: t < 0.12 ? "relaxed" : "up", bob: t < 0.4 ? -Math.sin(clamp(t / 0.4) * Math.PI) * 8 : 0 });
      },
    },
    highlight: {
      words: function (view, tl, v) {
        var e = line(view, v.line, "left:110px;top:300px", 112, 960, 3);
        var mark = String(v.mark || "").trim();
        var at = mark ? v.line.toLowerCase().indexOf(mark.toLowerCase()) : -1;
        var bar = null;
        if (at >= 0) {
          e.textContent = "";
          e.appendChild(d.createTextNode(v.line.slice(0, at)));
          var word = d.createElement("span");
          word.className = "stk-word";
          word.textContent = v.line.slice(at, at + mark.length);
          bar = d.createElement("i");
          bar.className = "stk-mark";
          word.appendChild(bar);
          e.appendChild(word);
          e.appendChild(d.createTextNode(v.line.slice(at + mark.length)));
        }
        appear(tl, e, 0.1);
        if (bar) tl.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: "power2.inOut" }, 0.5);
      },
      paint: function (g, t, v, D, view) {
        var some = v.object && v.object !== "none";
        prop(g, v.object, 1700, t, 0.25, 280);
        me(g, view, { x: some ? 1370 : 1480, k: 1.35, face: -1, pose: "point" });
      },
    },
    question: {
      words: function (view, tl, v) {
        appear(tl, line(view, String(v.question).replace(/[?\s]*$/, "?"), "left:980px;top:360px", 112, 840, 3), 0.1);
        view.mark = line(view, "?", "left:330px;top:40px;color:var(--fg)", 230, 300, 1);
        appear(tl, view.mark, 0.3);
      },
      paint: function (g, t, v, D, view) {
        prop(g, v.object, 780, t, 0.25, 280);
        me(g, view, { x: 410, k: 1.4, pose: "shrug" });
      },
    },
    thought: {
      words: function (view, tl, v) {
        appear(tl, line(view, v.line, "left:90px;top:60px", 84, 720, 3), 0.1);
      },
      paint: function (g, t, v, D, view) {
        me(g, view, { x: 400, k: 1.3, pose: "chin" });
        ink(g, 8);
        [[612, 520, 14, 0.15], [690, 462, 22, 0.25]].forEach(function (b) {
          var s = pop(t, b[3], 0.4);
          circle(g, b[0], b[1], b[2] * s, W);
        });
        var c = pop(t, 0.32, 0.55);
        g.save();
        g.translate(1270, 400);
        g.scale(c, c);
        ink(g, 8);
        [[-330, 40, 150], [-170, -130, 170], [70, -160, 190], [290, -70, 170], [340, 90, 140], [130, 180, 170], [-130, 180, 160]].forEach(function (b) {
          circle(g, b[0], b[1], b[2], W);
        });
        g.fillStyle = W;
        g.beginPath();
        g.ellipse(10, 20, 380, 220, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
        if (!v.object || v.object === "none") {
          ink(g, 8);
          [-90, 0, 90].forEach(function (x, i) {
            var s = pop(t, 0.55 + i * 0.1, 0.35);
            circle(g, 1280 + x, 420, 22 * s, g.fg);
          });
        } else prop(g, v.object, 1280, t, 0.55, 360, 570);
      },
    },
    talk: {
      words: function (view, tl, v) {
        var e = d.createElement("div");
        e.className = "stk-bubble";
        e.textContent = v.said;
        e.style.fontSize = size(v.said, 84, 1200, 2) + "px";
        e.style.transform = "translateX(-50%)";
        view.words.appendChild(e);
        tl.fromTo(e, { opacity: 0, xPercent: -50, x: 0, y: 24 }, { opacity: 1, xPercent: -50, x: 0, y: 0, transform: "none", duration: 0.35, ease: "power3.out" }, 0.12);
      },
      paint: function (g, t, v, D, view) {
        prop(g, v.object, 960, t, 0.2, 200);
        me(g, view, { x: 640, pose: "talk", wave: t > 0.2 });
        other(g, view, { x: 1280, face: -1, pose: "chin" }, 2);
        var s = clamp((t - 0.12) / 0.2);
        if (s > 0) {
          ink(g, 7);
          path(g, [[690, 420], [704, 420 + 48 * s], [740, 420]], false, W);
        }
      },
    },
    walk: {
      words: function (view, tl, v) {
        appear(tl, line(view, v.line, CENTER + "top:110px", 116, 1720, 2), 0.1);
      },
      paint: function (g, t, v, D, view) {
        var r = route(D, 980, STEP);
        prop(g, v.object, 1560, t, 0.1, 340);
        me(g, view, walker(1280 - r.dist, r, t, D));
      },
    },
    number: {
      words: function (view, tl, v) {
        view.count = line(view, "0", CENTER + "top:90px;font-variant-numeric:tabular-nums", 260, 1720, 1);
        appear(tl, view.count, 0.06);
        var end = Number(v.value) || 0;
        var pre = v.before ? String(v.before) : "";
        var post = v.after ? String(v.after) : "";
        if (post.length > 2) post = " " + post;
        view.count.style.fontSize = size(pre + end.toLocaleString("en-US") + post, 260, 1720, 1) + "px";
      },
      paint: function (g, t, v, D, view) {
        var end = Number(v.value) || 0;
        var digits = (String(v.value).split(".")[1] || "").length;
        var pre = v.before ? String(v.before) : "";
        var post = v.after ? String(v.after) : "";
        if (post.length > 2) post = " " + post;
        var shown = end * smooth(t / Math.min(1.2, D * 0.5));
        view.count.textContent = pre + shown.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + post;
        // exactly as many as the voice says, more than nine is a crowd of 13 in one row
        var few = Number.isInteger(end) && end >= 1 && end <= 9;
        var many = few ? end : 13;
        var gap = few ? Math.min(200, 1500 / many) : 136;
        for (var i = 0; i < many; i++) {
          var k = few ? Math.min(1, 0.55 + 2 / many) : 0.62;
          var x = 960 + (i - (many - 1) / 2) * gap;
          var s = pop(t, 0.08 + i * (few ? 0.1 : 0.04), 0.35);
          figure(g, { x: x, k: k * s, seed: i + 2, hero: i === Math.floor(many / 2) }, view.clock);
        }
      },
    },
    percent: {
      words: function (view, tl, v) {
        view.count = line(view, "0%", "left:100px;top:340px;font-variant-numeric:tabular-nums", 270, 860, 1);
        appear(tl, view.count, 0.06);
      },
      paint: function (g, t, v, D, view) {
        var end = clamp(Number(v.value) || 0, 0, 100);
        var k = smooth((t - 0.1) / Math.min(1.4, D * 0.55));
        view.count.textContent = Math.round(end * k) + "%";
        // a hundred people: as many in ink as the voice says, each one exact
        var lit = Math.round(end) * k;
        for (var i = 0; i < 100; i++) {
          var x = 1040 + (i % 10) * 82;
          var y = 118 + Math.floor(i / 10) * 80;
          tiny(g, x, y, i < lit ? g.fg : g.border);
        }
      },
    },
    versus: {
      words: function (view, tl, v) {
        appear(tl, line(view, v.left, "left:70px;top:90px;width:830px;text-align:center", 96, 830, 2), 0.1);
        appear(tl, line(view, v.right, "left:1020px;top:90px;width:830px;text-align:center", 96, 830, 2), 0.4);
      },
      paint: function (g, t, v, D, view) {
        ink(g, 6, g.border);
        path(g, [[960, 60], [960, GROUND]]);
        var a = v.leftObject && v.leftObject !== "none";
        var b = v.rightObject && v.rightObject !== "none";
        prop(g, v.leftObject, 660, t, 0.2, 270);
        prop(g, v.rightObject, 1620, t, 0.5, 270);
        me(g, view, { x: a ? 300 : 480, pose: "relaxed" });
        other(g, view, { x: b ? 1260 : 1440, face: b ? 1 : -1, pose: "relaxed" }, 2);
      },
    },
    cause: {
      words: function (view, tl, v) {
        appear(tl, line(view, v.from, "left:90px;top:100px;width:720px;text-align:center", 100, 720, 2), 0.1);
        appear(tl, line(view, v.to, "left:1110px;top:100px;width:720px;text-align:center", 100, 720, 2), Math.min(0.9, view.D * 0.34));
      },
      paint: function (g, t, v, D, view) {
        var at = Math.min(0.9, D * 0.34);
        prop(g, v.fromObject, 610, t, 0.15, 240);
        me(g, view, { x: v.fromObject && v.fromObject !== "none" ? 300 : 450, k: 0.92, pose: "relaxed" });
        var k = smooth((t - at * 0.4) / (at * 0.6));
        if (k > 0) {
          var x = mix(800, 1110, k);
          ink(g, 13);
          path(g, [[800, 640], [x, 640]]);
          if (k > 0.2) path(g, [[x - 44, 600], [x, 640], [x - 44, 680]]);
        }
        prop(g, v.toObject, 1320, t, at, 240);
        if (t >= at) me(g, view, { x: v.toObject && v.toObject !== "none" ? 1620 : 1470, k: 0.92 * pop(t, at, 0.35), pose: "up" });
      },
    },
    path: {
      words: function (view, tl, v) {
        view.times = [0, 1, 2, 3].map(function (i) { return Math.min(view.D * 0.85, 0.1 + i * (view.D * 0.26)); });
        [v.step1, v.step2, v.step3, v.step4].forEach(function (text, i) {
          var e = d.createElement("div");
          e.className = "stk-sign";
          e.textContent = text;
          e.style.left = 185 + i * 400 + "px";
          e.style.top = "150px";
          e.style.fontSize = size(text, 62, 340, 3) + "px";
          view.words.appendChild(e);
          appear(tl, e, view.times[i]);
        });
      },
      paint: function (g, t, v, D, view) {
        var xs = [360, 760, 1160, 1560];
        xs.forEach(function (x, i) {
          var s = pop(t, view.times[i], 0.35);
          ink(g, 9);
          path(g, [[x, GROUND], [x, GROUND - (GROUND - 400) * s]]);
          circle(g, x, GROUND - (GROUND - 400) * s, 22 * s, W);
        });
        var r = route(D, 1200, STEP);
        me(g, view, walker(300, r, t, D));
      },
    },
  };

  // ---- a scene on its canvas -----------------------------------------------------------

  var live = [];
  function draw(view, t) {
    if (!view.g) {
      view.canvas.width = WIDTH;
      view.canvas.height = HEIGHT;
      view.g = view.canvas.getContext("2d");
      var s = getComputedStyle(view.root);
      var read = function (name, fallback) {
        return (s.getPropertyValue(name) || "").trim() || fallback;
      };
      view.colors = { fg: read("--fg", "#141414"), brand: read("--brand", "#e0332e"), border: read("--border", "#d9d5ca") };
      live.push(view);
      while (live.length > KEEP) {
        var old = live.shift();
        old.g = null;
        old.canvas.width = 1;
        old.canvas.height = 1;
      }
    }
    var g = view.g;
    g.fg = view.colors.fg;
    g.brand = view.colors.brand;
    g.border = view.colors.border;
    view.clock = view.start + t;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, WIDTH, HEIGHT);
    // nearly still: under 2% over the shot, around the place the figures stand
    var push = 1 + 0.016 * smooth(t / Math.max(0.1, view.D));
    g.translate(960, 660);
    g.scale(push, push);
    g.translate(-960, -660);
    // the floor, the one line every figure stands on
    ink(g, 6);
    if (view.kind !== "percent") path(g, [[-40, GROUND + 5], [WIDTH + 40, GROUND + 5]]);
    KINDS[view.kind].paint(g, t, view.vars, view.D, view);
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
    var clip = root.querySelector("[data-scene-dur]");
    var host = root.closest("[data-variable-values]");
    var vars = valuesOf(host, given);
    var D = Math.max(0.1, parseFloat(clip.getAttribute("data-scene-dur")) || 4);
    var view = { root: root, canvas: root.querySelector("canvas"), kind: kind, vars: vars, D: D, words: clip, g: null, start: (host && parseFloat(host.getAttribute("data-start"))) || 0 };
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

  w.ITVStick = { block: block, OBJECTS: Object.keys(PROP), KINDS: Object.keys(KINDS), gait: gait, route: route, blinks: blinks, eyesAt: eyesAt };
})(window, document);

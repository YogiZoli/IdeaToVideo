// collage.js: everything Archive Collage's blocks draw (docs/BUILD_PLAN.md phase 6, DECISIONS 155).
// Own code on a 2D canvas: no image files, no real person, no brand. The maps are Natural
// Earth (public domain), in map-data.js.
//
// HyperFrames still makes every frame. A block only registers a paused timeline, as every
// block does, and one tween on it sets `p`: whatever the engine seeks to, the picture at that
// second is drawn. Nothing depends on the time before it. What is costly (the paper, a cutout's
// halftone, a map) is made once from a seed and kept, so a seek in any order gives the same frame.

(function (w, d) {
  "use strict";
  var WIDTH = 1920;
  var HEIGHT = 1080;
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
  // A spring pop-up: slightly past 1, then settled. Stays a plain function of t.
  function pop(t, at, dur) {
    var x = clamp((t - at) / (dur || 0.5));
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var c = 1.9;
    var y = x - 1;
    return 1 + (c + 1) * y * y * y + c * y * y;
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

  // ---- the camera: one slow drift per scene, each layer moves by its depth ----------------

  // What a layer at `depth` does at this moment: near layers move more, so the depth is real.
  function cameraAt(seed, u) {
    var r = seeded(seed);
    var angle = r() * Math.PI * 2;
    var reach = 34 + r() * 16;
    var inward = r() < 0.7 ? 1 : -1;
    var k = u - 0.5;
    return { x: Math.cos(angle) * reach * k, y: Math.sin(angle) * reach * 0.6 * k, zoom: 1 + 0.03 * (inward > 0 ? u : 1 - u) };
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
  var DEPTH = { paper: 0.25, back: 0.55, map: 0.8, cutout: 1, words: 1.2, front: 1.7 };

  // ---- the look -------------------------------------------------------------------------

  var COLORS = { paper: "#e6dbc2", sheet: "#f3ebd8", line: "#bdae8c", ink: "#17140f", muted: "#5f5441", hot: "#e8401c", second: "#0e6a70" };
  var colorsRead = false;
  function readColors(root) {
    if (colorsRead) return;
    colorsRead = true;
    var s = getComputedStyle(root);
    var read = function (name, fallback) {
      return (s.getPropertyValue(name) || "").trim() || fallback;
    };
    COLORS = { paper: read("--bg", COLORS.paper), sheet: read("--surface", COLORS.sheet), line: read("--border", COLORS.line), ink: read("--fg", COLORS.ink), muted: read("--muted", COLORS.muted), hot: read("--brand", COLORS.hot), second: read("--accent", COLORS.second) };
  }
  function canvasOf(a, b) {
    var c = d.createElement("canvas");
    c.width = a;
    c.height = b;
    return c;
  }

  // ---- the projection: flat, the scale true at the view's own latitude ---------------------

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
  // The view that shows a place with room around it.
  function viewForPlace(p) {
    if (!p) return viewOf(12, 22, 340);
    if (!p.box) return viewOf(p.lon, p.lat, 34);
    var wide = p.box[2] - p.box[0];
    var tall = (p.box[3] - p.box[1]) * (WIDTH / HEIGHT);
    var mid = [(p.box[0] + p.box[2]) / 2, (p.box[1] + p.box[3]) / 2];
    return viewOf(mid[0], mid[1], Math.max(wide, tall) * 3 + 8);
  }
  // The view that holds two places, with their route and labels inside.
  function viewForRoute(a, b) {
    if (!a || !b) return viewOf(12, 22, 340);
    var midLat = (a.lat + b.lat) / 2;
    var cos = Math.cos((clamp(midLat, -62, 74) * Math.PI) / 180);
    var wide = Math.abs(a.lon - b.lon) / 0.6;
    var tall = (Math.abs(a.lat - b.lat) * (WIDTH / HEIGHT)) / 0.46 / cos;
    var v = viewOf((a.lon + b.lon) / 2, midLat, Math.max(wide, tall, 24));
    // a pin stands above its place: the middle of the view moves up a little
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
  // Print dots in one tone, as a fill.
  var patterns = {};
  function dots(g, color, cell, radius) {
    var key = color + cell + radius;
    if (!patterns[key]) {
      var c = canvasOf(cell, cell);
      var h = c.getContext("2d");
      h.fillStyle = color;
      [[cell / 4, cell / 4], [(3 * cell) / 4, (3 * cell) / 4]].forEach(function (p) {
        h.beginPath();
        h.arc(p[0], p[1], radius, 0, Math.PI * 2);
        h.fill();
      });
      patterns[key] = c;
    }
    return g.createPattern(patterns[key], "repeat");
  }

  // A whole map as one sheet, kept: it is made once, in any order of frames.
  var MAP_ROOM = 150;
  var mapSheets = {};
  var mapOrder = [];
  function mapSheet(view, marked) {
    var key = [view.lon, view.lat, view.ppd, marked || ""].join("|");
    if (mapSheets[key]) return mapSheets[key];
    var c = canvasOf(WIDTH + MAP_ROOM * 2, HEIGHT + MAP_ROOM * 2);
    var g = c.getContext("2d");
    g.translate(MAP_ROOM, MAP_ROOM);
    g.fillStyle = COLORS.sheet;
    g.fillRect(-MAP_ROOM, -MAP_ROOM, c.width, c.height);
    // the sea: lines of longitude and latitude
    g.strokeStyle = COLORS.line;
    g.lineWidth = 1.5;
    var grid = view.ppd > 40 ? 5 : view.ppd > 16 ? 10 : 20;
    var lo;
    for (lo = -180; lo <= 180; lo += grid) {
      var a = project(view, lo, -85);
      var b = project(view, lo, 85);
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
    }
    for (lo = -80; lo <= 80; lo += grid) {
      var e = project(view, -180, lo);
      var f = project(view, 180, lo);
      g.beginPath();
      g.moveTo(e[0], e[1]);
      g.lineTo(f[0], f[1]);
      g.stroke();
    }
    // the land: a darker paper with print dots
    var W = world();
    g.beginPath();
    W.countries.forEach(function (x) {
      tracePlace(g, view, x);
    });
    g.fillStyle = "#d5c6a1";
    g.fill();
    g.fillStyle = dots(g, "rgba(23,20,15,0.3)", 9, 1.5);
    g.fill();
    // the place the story is about: ink dots, never the accent
    var hit = marked && findPlace(marked);
    if (hit && hit.rings) {
      g.beginPath();
      tracePlace(g, view, hit);
      g.fillStyle = "#a8997a";
      g.fill();
      g.fillStyle = dots(g, COLORS.ink, 8, 2.6);
      g.fill();
    }
    g.lineJoin = "round";
    g.strokeStyle = "rgba(23,20,15,0.5)";
    g.lineWidth = 1.5;
    g.beginPath();
    W.countries.forEach(function (x) {
      tracePlace(g, view, x);
    });
    g.stroke();
    if (hit && hit.rings) {
      g.beginPath();
      tracePlace(g, view, hit);
      g.strokeStyle = COLORS.ink;
      g.lineWidth = 3.5;
      g.stroke();
    }
    mapSheets[key] = c;
    mapOrder.push(key);
    while (mapOrder.length > 3) {
      delete mapSheets[mapOrder.shift()];
    }
    return c;
  }

  // ---- paper: the stage, made once, as a picture behind every canvas ----------------------

  var paperDone = false;
  function makePaper() {
    if (paperDone) return;
    paperDone = true;
    var W2 = WIDTH + 240;
    var H2 = HEIGHT + 140;
    var c = canvasOf(W2, H2);
    var g = c.getContext("2d");
    var r = seeded(77);
    g.fillStyle = COLORS.paper;
    g.fillRect(0, 0, W2, H2);
    var i;
    // age: wide stains, darker to the edges
    for (i = 0; i < 26; i++) {
      var x = r() * W2;
      var y = r() * H2;
      var rad = 140 + r() * 460;
      var dark = r() < 0.72;
      var grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, dark ? "rgba(112,84,40,0.075)" : "rgba(255,247,226,0.1)");
      grad.addColorStop(1, "rgba(112,84,40,0)");
      g.fillStyle = grad;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    var edge = g.createRadialGradient(W2 / 2, H2 / 2, H2 * 0.45, W2 / 2, H2 / 2, W2 * 0.68);
    edge.addColorStop(0, "rgba(70,50,20,0)");
    edge.addColorStop(1, "rgba(70,50,20,0.26)");
    g.fillStyle = edge;
    g.fillRect(0, 0, W2, H2);
    // a map sheet printed faintly into the paper
    var view = viewOf(12, 25, 300);
    g.save();
    g.translate(120, 70);
    g.globalAlpha = 0.14;
    g.strokeStyle = COLORS.ink;
    g.lineWidth = 1.6;
    g.beginPath();
    world().countries.forEach(function (x) {
      tracePlace(g, view, x);
    });
    g.stroke();
    g.globalAlpha = 0.07;
    g.lineWidth = 1;
    for (i = -160; i <= 160; i += 20) {
      var a = project(view, i, -80);
      var b = project(view, i, 80);
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
    }
    for (i = -60; i <= 80; i += 20) {
      var e = project(view, -170, i);
      var f = project(view, 170, i);
      g.beginPath();
      g.moveTo(e[0], e[1]);
      g.lineTo(f[0], f[1]);
      g.stroke();
    }
    g.restore();
    // fold lines and fibers
    g.strokeStyle = "rgba(60,44,20,0.13)";
    g.lineWidth = 2;
    [[0, H2 * 0.5, W2, H2 * 0.49], [W2 * 0.33, 0, W2 * 0.335, H2], [W2 * 0.66, 0, W2 * 0.655, H2]].forEach(function (l) {
      g.beginPath();
      g.moveTo(l[0], l[1]);
      g.lineTo(l[2], l[3]);
      g.stroke();
    });
    g.lineWidth = 1;
    for (i = 0; i < 2400; i++) {
      var fx = r() * W2;
      var fy = r() * H2;
      var ang = r() * Math.PI * 2;
      var len = 3 + r() * 16;
      g.strokeStyle = r() < 0.5 ? "rgba(60,44,20,0.1)" : "rgba(255,250,232,0.16)";
      g.beginPath();
      g.moveTo(fx, fy);
      g.lineTo(fx + Math.cos(ang) * len, fy + Math.sin(ang) * len);
      g.stroke();
    }
    var style = d.createElement("style");
    style.textContent = ".cx-paper{background-image:url(" + c.toDataURL("image/jpeg", 0.86) + ")}.cx-grain{background-image:url(" + grainTile() + ")}";
    d.head.appendChild(style);
  }
  // Print grain over everything: small dark and light specks, the same on every frame. Matte.
  function grainTile() {
    var size = 384;
    var c = canvasOf(size, size);
    var g = c.getContext("2d");
    var img = g.createImageData(size, size);
    var r = seeded(5);
    for (var i = 0; i < img.data.length; i += 4) {
      var n = r();
      var light = n > 0.5;
      var v = r();
      img.data[i] = img.data[i + 1] = img.data[i + 2] = light ? 255 : 18;
      img.data[i + 3] = v < 0.55 ? 0 : Math.round(v * (light ? 15 : 21));
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  }

  // ---- torn edges -------------------------------------------------------------------------

  // A jagged line from a to b: the same one for a seed.
  function jag(a, b, r, reach, step) {
    var dx = b[0] - a[0];
    var dy = b[1] - a[1];
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var n = Math.max(2, Math.round(len / step));
    var out = [];
    var drift = 0;
    for (var i = 0; i < n; i++) {
      drift = clamp(drift + (r() - 0.5) * reach, -reach, reach);
      out.push([a[0] + (dx * i) / n + (-dy / len) * drift, a[1] + (dy * i) / n + (dx / len) * drift]);
    }
    return out;
  }
  // A torn sheet's outline, in pixels.
  function tornOutline(x, y, a, b, seed, reach) {
    var r = seeded(seed);
    var q = reach === undefined ? 7 : reach;
    return jag([x, y], [x + a, y], r, q, 13).concat(jag([x + a, y], [x + a, y + b], r, q, 13), jag([x + a, y + b], [x, y + b], r, q, 13), jag([x, y + b], [x, y], r, q, 13));
  }
  function trace(g, pts) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
  }
  // Paper on paper: a matte shadow, the white of the tear, then the sheet.
  function sheet(g, x, y, a, b, seed, color, angle, s) {
    var out = tornOutline(-a / 2, -b / 2, a, b, seed);
    g.save();
    g.translate(x + a / 2, y + b / 2);
    g.rotate(angle || 0);
    g.scale(s === undefined ? 1 : s, s === undefined ? 1 : s);
    g.save();
    g.translate(5, 8);
    trace(g, out);
    g.fillStyle = "rgba(30,20,8,0.2)";
    g.fill();
    g.restore();
    trace(g, tornOutline(-a / 2 - 4, -b / 2 - 4, a + 8, b + 8, seed + 1, 8));
    g.fillStyle = "#fbf6ea";
    g.fill();
    trace(g, out);
    g.fillStyle = color || COLORS.sheet;
    g.fill();
    g.restore();
  }
  // A torn polygon for the words' own strips, in percent of their box. CSS, so it fits any text.
  function tornClip(seed) {
    var r = seeded(seed);
    var pts = [];
    var i;
    for (i = 0; i <= 28; i++) pts.push((i / 28) * 100 + "% " + (r() * 5).toFixed(1) + "%");
    for (i = 1; i < 6; i++) pts.push(100 - r() * 1.1 + "% " + (i / 6) * 100 + "%");
    for (i = 28; i >= 0; i--) pts.push((i / 28) * 100 + "% " + (100 - r() * 5).toFixed(1) + "%");
    for (i = 5; i > 0; i--) pts.push(r() * 1.1 + "% " + (i / 6) * 100 + "%");
    return "polygon(" + pts.join(",") + ")";
  }

  // ---- the cutouts: gray shapes, turned into halftone with a rough keyline and an accent ------

  // Tones from 0 (ink) to 1 (paper). A shape's fill runs across it, so the dots have a shape too.
  function tone(g, l, a, b) {
    var from = clamp(l - 0.16);
    var to = clamp(l + 0.2);
    var grad = g.createLinearGradient(a === undefined ? -100 : a, -100, b === undefined ? 100 : b, 100);
    var c1 = Math.round(from * 255);
    var c2 = Math.round(to * 255);
    grad.addColorStop(0, "rgb(" + c1 + "," + c1 + "," + c1 + ")");
    grad.addColorStop(1, "rgb(" + c2 + "," + c2 + "," + c2 + ")");
    g.fillStyle = grad;
  }
  function poly(g, l, pts) {
    tone(g, l);
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.fill();
  }
  function box(g, l, x, y, a, b) {
    tone(g, l);
    g.fillRect(x, y, a, b);
  }
  function ball(g, l, x, y, r) {
    tone(g, l, x - r, x + r);
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  function person(g, x, l, k) {
    var s = k || 1;
    ball(g, l + 0.3, x, -158 * s, 22 * s);
    box(g, l + 0.2, x - 8 * s, -142 * s, 16 * s, 18 * s);
    poly(g, l, [[x - 16 * s, -128 * s], [x + 16 * s, -128 * s], [x + 42 * s, -116 * s], [x + 50 * s, -44 * s], [x + 34 * s, -42 * s], [x + 28 * s, -92 * s], [x + 25 * s, -60 * s], [x + 22 * s, 0], [x + 4 * s, 0], [x, -52 * s], [x - 4 * s, 0], [x - 22 * s, 0], [x - 25 * s, -60 * s], [x - 28 * s, -92 * s], [x - 34 * s, -42 * s], [x - 50 * s, -44 * s], [x - 42 * s, -116 * s]]);
  }
  // In a box of about 200 by 200, standing on y = 0.
  var PROP = {
    figure: function (g) {
      person(g, 0, 0.38, 1.15);
    },
    crowd: function (g) {
      person(g, -86, 0.72, 0.8);
      person(g, 86, 0.66, 0.84);
      person(g, -44, 0.54, 0.96);
      person(g, 46, 0.46, 1.02);
      person(g, 0, 0.34, 1.12);
    },
    ship: function (g) {
      poly(g, 0.26, [[-100, -44], [100, -56], [76, 0], [-82, 0]]);
      box(g, 0.74, -56, -88, 104, 42);
      box(g, 0.52, -36, -124, 56, 36);
      poly(g, 0.2, [[-10, -172], [20, -172], [24, -124], [-14, -124]]);
    },
    plane: function (g) {
      poly(g, 0.56, [[-100, -92], [66, -106], [100, -84], [60, -68], [-100, -74]]);
      poly(g, 0.26, [[-22, -84], [36, -84], [-30, -18], [-58, -18]]);
      poly(g, 0.32, [[-96, -88], [-72, -88], [-92, -142], [-108, -142]]);
    },
    train: function (g) {
      box(g, 0.4, -100, -112, 150, 88);
      poly(g, 0.26, [[50, -112], [92, -96], [100, -24], [50, -24]]);
      box(g, 0.2, -70, -146, 24, 34);
      box(g, 0.86, -80, -96, 40, 30);
      box(g, 0.86, -24, -96, 40, 30);
      ball(g, 0.14, -66, -18, 18);
      ball(g, 0.14, 0, -18, 18);
      ball(g, 0.14, 60, -18, 18);
    },
    car: function (g) {
      poly(g, 0.38, [[-100, -26], [-96, -62], [-48, -66], [-22, -106], [46, -106], [72, -66], [100, -56], [100, -26]]);
      poly(g, 0.84, [[-34, -68], [-14, -96], [10, -96], [10, -68]]);
      poly(g, 0.84, [[22, -68], [22, -96], [40, -96], [60, -68]]);
      ball(g, 0.14, -56, -22, 24);
      ball(g, 0.14, 56, -22, 24);
    },
    factory: function (g) {
      poly(g, 0.42, [[-100, 0], [-100, -74], [-58, -106], [-58, -74], [-14, -106], [-14, -74], [30, -106], [30, -74], [100, -74], [100, 0]]);
      box(g, 0.24, 48, -176, 30, 110);
      box(g, 0.3, -90, -160, 22, 90);
      box(g, 0.86, -80, -50, 30, 26);
      box(g, 0.86, -28, -50, 30, 26);
      box(g, 0.86, 24, -50, 30, 26);
    },
    city: function (g) {
      box(g, 0.56, -100, -92, 46, 92);
      box(g, 0.3, -60, -168, 50, 168);
      box(g, 0.48, -14, -122, 42, 122);
      box(g, 0.22, 24, -190, 42, 190);
      box(g, 0.58, 62, -96, 40, 96);
      var r = seeded(3);
      for (var i = 0; i < 26; i++) box(g, r() < 0.5 ? 0.95 : 0.8, -92 + Math.floor(r() * 18) * 10, -22 - Math.floor(r() * 8) * 11, 5, 7);
    },
    tower: function (g) {
      poly(g, 0.32, [[-58, 0], [-12, -152], [12, -152], [58, 0], [32, 0], [0, -74], [-32, 0]]);
      box(g, 0.26, -34, -86, 68, 12);
      poly(g, 0.2, [[-5, -192], [5, -192], [12, -152], [-12, -152]]);
    },
    bridge: function (g) {
      box(g, 0.26, -110, -62, 220, 14);
      box(g, 0.32, -66, -160, 16, 160);
      box(g, 0.32, 50, -160, 16, 160);
      g.strokeStyle = "rgb(70,70,70)";
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(-110, -116);
      g.quadraticCurveTo(-58, -40, -58, -160);
      g.quadraticCurveTo(0, -20, 58, -160);
      g.quadraticCurveTo(58, -40, 110, -116);
      g.stroke();
    },
    bank: function (g) {
      poly(g, 0.5, [[-100, -128], [0, -176], [100, -128]]);
      box(g, 0.68, -92, -128, 184, 14);
      [-76, -36, 12, 52].forEach(function (x) {
        box(g, 0.56, x, -112, 24, 94);
      });
      box(g, 0.32, -100, -18, 200, 18);
    },
    house: function (g) {
      box(g, 0.66, -70, -86, 140, 86);
      poly(g, 0.26, [[-92, -82], [0, -158], [92, -82]]);
      box(g, 0.2, -16, -54, 32, 54);
      box(g, 0.9, 30, -66, 24, 24);
      box(g, 0.9, -54, -66, 24, 24);
    },
    barrel: function (g) {
      poly(g, 0.36, [[-54, 0], [-66, -46], [-66, -110], [-54, -156], [54, -156], [66, -110], [66, -46], [54, 0]]);
      box(g, 0.14, -66, -112, 132, 10);
      box(g, 0.14, -66, -54, 132, 10);
    },
    coins: function (g) {
      [[-44, -14, 0.5], [-44, -38, 0.44], [-44, -62, 0.52], [-44, -86, 0.46], [34, -14, 0.46], [34, -38, 0.54], [-44, -110, 0.56]].forEach(function (c) {
        tone(g, c[2], -100, 60);
        g.beginPath();
        g.ellipse(c[0], c[1], 54, 17, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.fillStyle = "rgb(35,35,35)";
        g.ellipse(c[0], c[1] + 8, 54, 12, 0, 0, Math.PI);
        g.fill();
      });
    },
    cash: function (g) {
      [[12, -44, 0.22], [-8, -60, 0.32], [0, -24, 0.44]].forEach(function (c) {
        g.save();
        g.translate(c[0], c[1]);
        g.rotate(c[1] / 300);
        box(g, c[2], -92, -46, 184, 92);
        box(g, 0.86, -80, -36, 160, 72);
        ball(g, c[2], 0, 0, 26);
        g.restore();
      });
    },
    crown: function (g) {
      poly(g, 0.4, [[-86, 0], [-100, -116], [-48, -66], [0, -140], [48, -66], [100, -116], [86, 0]]);
      box(g, 0.2, -86, -22, 172, 22);
      ball(g, 0.82, -100, -120, 11);
      ball(g, 0.82, 0, -146, 12);
      ball(g, 0.82, 100, -120, 11);
    },
    globe: function (g) {
      ball(g, 0.68, 0, -100, 96);
      poly(g, 0.26, [[-70, -150], [-20, -176], [14, -150], [-12, -116], [-42, -96], [-74, -112]]);
      poly(g, 0.26, [[10, -96], [64, -112], [84, -74], [38, -28], [20, -58]]);
      poly(g, 0.3, [[-40, -68], [-14, -60], [-22, -24], [-38, -22]]);
    },
    newspaper: function (g) {
      poly(g, 0.92, [[-84, 0], [-100, -172], [84, -184], [100, -12]]);
      poly(g, 0.14, [[-84, -146], [78, -156], [80, -128], [-82, -118]]);
      poly(g, 0.5, [[-78, -106], [-6, -110], [-2, -32], [-72, -28]]);
      for (var i = 0; i < 6; i++) poly(g, 0.36, [[10, -106 + i * 14], [78, -110 + i * 14], [78, -104 + i * 14], [10, -100 + i * 14]]);
    },
    letter: function (g) {
      box(g, 0.88, -100, -130, 200, 130);
      poly(g, 0.56, [[-100, -130], [100, -130], [0, -54]]);
      poly(g, 0.7, [[-100, 0], [-30, -74], [30, -74], [100, 0]]);
      ball(g, 0.24, 0, -62, 18);
    },
    book: function (g) {
      poly(g, 0.22, [[-96, -146], [96, -146], [96, 0], [-96, 0]]);
      poly(g, 0.92, [[-84, -156], [0, -134], [84, -156], [84, -14], [0, 8], [-84, -14]]);
      for (var i = 0; i < 5; i++) {
        poly(g, 0.46, [[-68, -128 + i * 22], [-14, -114 + i * 22], [-14, -108 + i * 22], [-68, -122 + i * 22]]);
        poly(g, 0.46, [[14, -114 + i * 22], [68, -128 + i * 22], [68, -122 + i * 22], [14, -108 + i * 22]]);
      }
    },
    clock: function (g) {
      ball(g, 0.24, 0, -100, 96);
      ball(g, 0.92, 0, -100, 78);
      box(g, 0.1, -5, -162, 10, 66);
      g.save();
      g.translate(0, -100);
      g.rotate(1.9);
      box(g, 0.1, -5, -50, 10, 54);
      g.restore();
    },
    key: function (g) {
      g.save();
      g.translate(0, -60);
      g.rotate(-0.62);
      ball(g, 0.3, -76, 0, 46);
      ball(g, 0.95, -76, 0, 20);
      box(g, 0.3, -36, -11, 138, 22);
      box(g, 0.24, 68, 8, 16, 28);
      box(g, 0.24, 92, 8, 14, 22);
      g.restore();
    },
    bulb: function (g) {
      ball(g, 0.8, 0, -116, 66);
      poly(g, 0.72, [[-34, -68], [34, -68], [24, -32], [-24, -32]]);
      box(g, 0.2, -24, -32, 48, 32);
    },
    anchor: function (g) {
      ball(g, 0.2, 0, -164, 22);
      ball(g, 0.95, 0, -164, 9);
      box(g, 0.2, -11, -146, 22, 138);
      box(g, 0.2, -48, -128, 96, 16);
      g.strokeStyle = "rgb(50,50,50)";
      g.lineWidth = 22;
      g.beginPath();
      g.arc(0, -76, 80, 0.25, Math.PI - 0.25);
      g.stroke();
    },
    rocket: function (g) {
      poly(g, 0.72, [[-32, -24], [-32, -128], [0, -192], [32, -128], [32, -24]]);
      ball(g, 0.2, 0, -116, 16);
      poly(g, 0.24, [[-32, -70], [-68, 0], [-32, -24]]);
      poly(g, 0.24, [[32, -70], [68, 0], [32, -24]]);
    },
    tree: function (g) {
      box(g, 0.2, -13, -80, 26, 80);
      ball(g, 0.36, -48, -96, 48);
      ball(g, 0.5, 50, -102, 50);
      ball(g, 0.26, 0, -146, 58);
    },
    mountain: function (g) {
      poly(g, 0.36, [[-110, 0], [-20, -172], [30, -92], [58, -124], [110, 0]]);
      poly(g, 0.92, [[-52, -110], [-20, -172], [10, -122], [-10, -130], [-28, -106]]);
    },
    wheat: function (g) {
      [-46, 0, 46].forEach(function (x, n) {
        box(g, 0.28, x - 3, -128, 6, 128);
        for (var i = 0; i < 6; i++) {
          g.save();
          g.translate(x, -132 - i * 12 - n * 4);
          g.rotate(0.6);
          box(g, 0.34, -6, -16, 12, 24);
          g.rotate(-1.2);
          box(g, 0.34, -6, -16, 12, 24);
          g.restore();
        }
      });
    },
    phone: function (g) {
      box(g, 0.14, -50, -188, 100, 188);
      box(g, 0.82, -40, -170, 80, 140);
      ball(g, 0.7, 0, -14, 7);
    },
    computer: function (g) {
      box(g, 0.2, -100, -176, 200, 130);
      box(g, 0.82, -86, -162, 172, 102);
      box(g, 0.3, -18, -46, 36, 30);
      box(g, 0.24, -66, -16, 132, 16);
    },
    scale: function (g) {
      box(g, 0.2, -7, -172, 14, 172);
      box(g, 0.2, -52, -14, 104, 14);
      box(g, 0.2, -100, -168, 200, 10);
      [-82, 82].forEach(function (x) {
        poly(g, 0.5, [[x - 40, -80], [x + 40, -80], [x + 22, -58], [x - 22, -58]]);
        poly(g, 0.3, [[x - 2, -168], [x + 2, -168], [x + 40, -82], [x + 36, -82]]);
        poly(g, 0.3, [[x - 2, -168], [x + 2, -168], [x - 36, -82], [x - 40, -82]]);
      });
    },
    flag: function (g) {
      box(g, 0.14, -80, -188, 12, 188);
      poly(g, 0.5, [[-68, -184], [-10, -172], [44, -186], [92, -176], [92, -90], [44, -100], [-10, -86], [-68, -98]]);
      poly(g, 0.26, [[-68, -156], [-10, -144], [44, -158], [92, -148], [92, -120], [44, -130], [-10, -116], [-68, -128]]);
    },
  };

  var CELL = 8;
  var ROOM = 44;
  var stickers = {};
  var stickerOrder = [];
  // One cutout at one size: its gray drawing printed as dots on white, a rough light keyline
  // around it and an offset stroke in the accent. Made once, so any seek gets the same one.
  function sticker(id, px) {
    var draw = PROP[id] || PROP.figure;
    var key = id + "@" + px;
    if (stickers[key]) return stickers[key];
    // measured first, so every thing fills its box and stands in its middle
    var look = canvasOf(320, 320);
    var m = look.getContext("2d");
    m.translate(160, 280);
    draw(m);
    var seen = m.getImageData(0, 0, 320, 320).data;
    var x0 = 320;
    var y0 = 320;
    var x1 = 0;
    var y1 = 0;
    for (var my = 0; my < 320; my += 2) {
      for (var mx = 0; mx < 320; mx += 2) {
        if (seen[(my * 320 + mx) * 4 + 3] < 40) continue;
        x0 = Math.min(x0, mx);
        x1 = Math.max(x1, mx);
        y0 = Math.min(y0, my);
        y1 = Math.max(y1, my);
      }
    }
    var unit = px / Math.max(40, x1 - x0, y1 - y0);
    var size = Math.ceil(px + ROOM * 2);
    var base = canvasOf(size, size);
    var b = base.getContext("2d");
    b.translate(size / 2, size / 2);
    b.scale(unit, unit);
    b.translate(-(x0 + x1) / 2 + 160, -(y0 + y1) / 2 + 280);
    draw(b);
    var gray = b.getImageData(0, 0, size, size).data;
    // the dots, at 45 degrees
    var printed = canvasOf(size, size);
    var p = printed.getContext("2d");
    p.fillStyle = "#f5efdf";
    p.fillRect(0, 0, size, size);
    p.fillStyle = COLORS.ink;
    p.beginPath();
    for (var u = -size; u < size * 2; u += CELL) {
      for (var v = -size; v < size * 2; v += CELL) {
        var x = (u + v) * 0.7071;
        var y = (u - v) * 0.7071;
        if (x < 0 || y < 0 || x >= size - 1 || y >= size - 1) continue;
        var i = (Math.round(y) * size + Math.round(x)) * 4;
        if (gray[i + 3] < 40) continue;
        // never a solid black: paper shows between the dots even in the darkest tone
        var dark = 1 - gray[i] / 255;
        var rad = CELL * 0.47 * Math.sqrt(0.08 + 0.92 * dark);
        if (dark < 0.03) continue;
        p.moveTo(x + rad, y);
        p.arc(x, y, rad, 0, Math.PI * 2);
      }
    }
    p.fill();
    p.globalCompositeOperation = "destination-in";
    p.drawImage(base, 0, 0);
    // the shape in one color, for the keyline and the accent
    var tint = function (color) {
      var c = canvasOf(size, size);
      var h = c.getContext("2d");
      h.drawImage(base, 0, 0);
      h.globalCompositeOperation = "source-in";
      h.fillStyle = color;
      h.fillRect(0, 0, size, size);
      return c;
    };
    var out = canvasOf(size, size);
    var o = out.getContext("2d");
    var r = seeded(hash(key));
    var hot = tint(COLORS.hot);
    var pale = tint("#f8f3e5");
    var n;
    var steps = 18;
    var near = Math.max(5, Math.round(px / 56));
    for (n = 0; n < steps; n++) {
      var a = (n / steps) * Math.PI * 2;
      o.drawImage(hot, Math.cos(a) * near * 0.8 + near * 1.3, Math.sin(a) * near * 0.8 + near);
    }
    for (n = 0; n < steps; n++) {
      var ang = (n / steps) * Math.PI * 2;
      var q = near * (0.72 + r() * 0.6);
      o.drawImage(pale, Math.cos(ang) * q, Math.sin(ang) * q);
    }
    o.drawImage(printed, 0, 0);
    stickers[key] = out;
    stickerOrder.push(key);
    while (stickerOrder.length > 36) delete stickers[stickerOrder.shift()];
    return out;
  }
  // A cutout in the box of `px` that ends at `ground`, around x, popping up at `at`.
  function cutout(g, id, x, ground, px, t, at, turn) {
    if (!id) return;
    var s = pop(t, at === undefined ? 0.1 : at, 0.5);
    if (s <= 0) return;
    var pic = sticker(id, px);
    g.save();
    g.translate(x, ground - px / 2);
    g.rotate((turn || 0) + (1 - clamp((t - (at || 0)) / 0.5)) * -0.1);
    g.scale(s, s);
    g.drawImage(pic, -pic.width / 2, -pic.height / 2);
    g.restore();
  }

  // ---- the words ---------------------------------------------------------------------------

  var CSS =
    ".cx-root{position:absolute;inset:0;width:1920px;height:1080px;overflow:hidden;color:var(--fg);font-family:var(--font-body);background:var(--bg)}" +
    ".cx-paper{position:absolute;left:-120px;top:-70px;width:2160px;height:1220px;background-size:100% 100%;will-change:transform}" +
    ".cx-view{position:absolute;left:0;top:0;width:1920px;height:1080px}" +
    ".cx-clip{position:absolute;inset:0;transform-origin:50% 50%}" +
    ".cx-grain{position:absolute;inset:0;pointer-events:none;background-size:384px 384px}" +
    ".cx-t{position:absolute;font-family:var(--font-display);font-weight:400;line-height:1.08;letter-spacing:-0.012em;opacity:0}" +
    ".cx-strip{position:absolute;width:max-content;font-family:var(--font-display);font-weight:400;line-height:1.08;letter-spacing:-0.012em;opacity:0}" +
    ".cx-strip>.cx-hot,.cx-strip>.cx-sheet{position:absolute;inset:0}" +
    ".cx-hot{background:var(--brand);transform:translate(9px,9px)}" +
    ".cx-sheet{background:#f6f0e0}" +
    ".cx-strip.cx-dark>.cx-sheet{background:var(--fg)}" +
    ".cx-strip.cx-dark>.cx-in{color:#f6f0e0}" +
    ".cx-in{position:relative;display:block;padding:.3em .52em .32em}" +
    ".cx-small{font-family:var(--font-body);font-weight:700;letter-spacing:0;line-height:1.1}" +
    ".cx-word{position:relative;display:inline-block}" +
    ".cx-mark{position:absolute;left:-2%;bottom:-.02em;height:.13em;width:104%;background:var(--brand);transform-origin:0 50%;transform:scaleX(0);border-radius:2px 8px 3px 6px}" +
    ".cx-stamp{position:absolute;font-family:var(--font-display);font-weight:400;color:var(--accent);border:14px solid var(--accent);border-radius:18px;padding:.04em .22em;line-height:1.02;opacity:0;font-variant-numeric:tabular-nums}";
  function style() {
    if (d.getElementById("cx-style")) return;
    var s = d.createElement("style");
    s.id = "cx-style";
    s.textContent = CSS;
    d.head.appendChild(s);
  }

  // A spring pop-up, with the slight overshoot of the plan, and its stagger comes from `at`.
  function popIn(tl, el, at, turn) {
    tl.fromTo(el, { opacity: 0, scale: 0.72, rotation: (turn || 0) - 3.5 }, { opacity: 1, scale: 1, rotation: turn || 0, duration: 0.5, ease: "back.out(1.9)" }, at);
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
  function size(text, base, room, lines, wide) {
    var words = String(text).split(/\s+/).filter(Boolean);
    var longest = words.reduce(function (m, x) { return Math.max(m, x.length); }, 1);
    var px = base;
    while (px > 30) {
      var perLine = room / (px * (wide || 0.66));
      if (longest <= perLine && linesAt(words, perLine) <= (lines || 2)) break;
      px -= 2;
    }
    return px;
  }
  // Bare ink on the paper: the giant numbers and the huge word.
  function bare(view, text, place, base, room, lines) {
    var e = d.createElement("div");
    e.className = "cx-t";
    e.textContent = text;
    e.style.cssText += ";" + place + ";font-size:" + size(text, base, room, lines) + "px;max-width:" + room + "px";
    view.words.appendChild(e);
    return e;
  }
  // Words on their own torn strip, with an offset stroke in the accent behind it.
  function strip(view, text, place, base, room, lines, kind) {
    var e = d.createElement("div");
    var cut = tornClip(hash(text + place));
    e.className = "cx-strip" + (kind === "dark" ? " cx-dark" : "") + (kind === "small" ? " cx-small" : "");
    e.innerHTML = '<i class="cx-hot"></i><i class="cx-sheet"></i><span class="cx-in"></span>';
    e.firstChild.style.clipPath = cut;
    e.children[1].style.clipPath = cut;
    e.children[2].textContent = text;
    var px = size(text, base, room - base * 0.5, lines, kind === "small" ? 0.5 : 0.66);
    e.style.cssText += ";" + place + ";font-size:" + px + "px;max-width:" + room + "px";
    view.words.appendChild(e);
    return e;
  }
  // The word to underline inside a text, with its swipe; null when the text does not have it.
  function underlined(host, text, mark) {
    var word = String(mark || "").trim();
    var at = word ? String(text).toLowerCase().indexOf(word.toLowerCase()) : -1;
    if (at < 0) return null;
    host.textContent = "";
    host.appendChild(d.createTextNode(text.slice(0, at)));
    var span = d.createElement("span");
    span.className = "cx-word";
    span.textContent = text.slice(at, at + word.length);
    var bar = d.createElement("i");
    bar.className = "cx-mark";
    span.appendChild(bar);
    host.appendChild(span);
    host.appendChild(d.createTextNode(text.slice(at + word.length)));
    return bar;
  }
  function swipe(tl, bar, at) {
    tl.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: 0.42, ease: "power2.inOut" }, at);
  }
  // A swipe under a whole text.
  function swipeUnder(view, tl, el, at) {
    var bar = d.createElement("i");
    bar.className = "cx-mark";
    bar.style.cssText = "bottom:-.07em;height:.085em";
    el.appendChild(bar);
    swipe(tl, bar, at);
  }
  var CENTER = "left:0;right:0;margin:0 auto;width:max-content;text-align:center;";
  // Beside a point, on the side away from `other`, unless that side has no room.
  function besideAt(xy, other, room, gap) {
    var wantRight = other ? xy[0] >= other[0] : xy[0] < 1160;
    var right = wantRight ? xy[0] + gap + room < WIDTH - 60 : xy[0] - gap - room < 60;
    return (right ? "left:" + Math.round(xy[0] + gap) + "px;" : "right:" + Math.round(WIDTH - xy[0] + gap) + "px;") + "top:" + Math.round(xy[1] - 92) + "px;";
  }
  // A corner for a line of words that covers no point of the map. The first one free wins.
  function freeCorner(points, tall) {
    var corners = [["left:96px;top:84px;", 96, 84], ["left:96px;top:" + (HEIGHT - 84 - tall) + "px;", 96, HEIGHT - 84 - tall], ["right:96px;top:84px;", 960, 84], ["right:96px;top:" + (HEIGHT - 84 - tall) + "px;", 960, HEIGHT - 84 - tall]];
    for (var i = 0; i < corners.length; i++) {
      var c = corners[i];
      var clear = points.every(function (p) {
        return p[0] < c[1] - 120 || p[0] > c[1] + 880 || p[1] < c[2] - 40 || p[1] > c[2] + tall + 110;
      });
      if (clear) return c[0];
    }
    return corners[1][0];
  }

  // Drawn hot strokes: a hand's line, not a ruler's.
  function hotLine(g, pts, width, k, color) {
    if (k <= 0) return;
    var total = 0;
    var i;
    for (i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    var left = total * k;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.lineWidth = width;
    g.strokeStyle = color || COLORS.hot;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    var end = pts[0];
    var dir = [1, 0];
    for (i = 1; i < pts.length && left > 0; i++) {
      var dx = pts[i][0] - pts[i - 1][0];
      var dy = pts[i][1] - pts[i - 1][1];
      var len = Math.hypot(dx, dy) || 1;
      var part = Math.min(1, left / len);
      end = [pts[i - 1][0] + dx * part, pts[i - 1][1] + dy * part];
      dir = [dx / len, dy / len];
      g.lineTo(end[0], end[1]);
      left -= len;
    }
    g.stroke();
    return { at: end, dir: dir };
  }
  function arrowHead(g, tip, width) {
    if (!tip) return;
    var a = 36;
    var nx = -tip.dir[1];
    var ny = tip.dir[0];
    g.beginPath();
    g.moveTo(tip.at[0] - tip.dir[0] * a + nx * a * 0.75, tip.at[1] - tip.dir[1] * a + ny * a * 0.75);
    g.lineTo(tip.at[0], tip.at[1]);
    g.lineTo(tip.at[0] - tip.dir[0] * a - nx * a * 0.75, tip.at[1] - tip.dir[1] * a - ny * a * 0.75);
    g.lineWidth = width;
    g.stroke();
  }
  function arc(a, b, lift, n) {
    var out = [];
    for (var i = 0; i <= n; i++) {
      var k = i / n;
      var nx = -(b[1] - a[1]);
      var ny = b[0] - a[0];
      var len = Math.hypot(nx, ny) || 1;
      var h = Math.sin(k * Math.PI) * lift;
      out.push([mix(a[0], b[0], k) + (nx / len) * h, mix(a[1], b[1], k) + (ny / len) * h]);
    }
    return out;
  }
  // A map pin: a ring in the accent, its point on the place.
  function pin(g, x, y, s) {
    if (s <= 0) return;
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.fillStyle = "rgba(30,20,8,0.22)";
    g.beginPath();
    g.ellipse(9, 4, 20, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-44, -44, -40, -92, 0, -92);
    g.bezierCurveTo(40, -92, 44, -44, 0, 0);
    g.closePath();
    g.fillStyle = "#f6f0e0";
    g.fill();
    g.lineWidth = 11;
    g.strokeStyle = COLORS.hot;
    g.stroke();
    g.fillStyle = COLORS.ink;
    g.beginPath();
    g.arc(0, -56, 13, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // A map on a torn sheet, nearly the whole frame, at the map's own depth.
  function mapStage(g, view, cam, t, seed, sheetMap) {
    enterLayer(g, cam, DEPTH.map);
    var s = 0.985 + 0.015 * smooth(t / 0.3);
    var edge = tornOutline(58, 48, WIDTH - 116, HEIGHT - 96, seed, 8);
    g.save();
    g.save();
    g.translate(6, 10);
    trace(g, edge);
    g.fillStyle = "rgba(30,20,8,0.22)";
    g.fill();
    g.restore();
    trace(g, tornOutline(52, 42, WIDTH - 104, HEIGHT - 84, seed + 3, 8));
    g.fillStyle = "#fbf6ea";
    g.fill();
    trace(g, edge);
    g.clip();
    g.translate(WIDTH / 2, HEIGHT / 2);
    g.scale(s, s);
    g.translate(-WIDTH / 2, -HEIGHT / 2);
    g.drawImage(sheetMap, -MAP_ROOM, -MAP_ROOM);
    g.restore();
  }

  // Torn scraps at the frame's edges, nearest to the eye: they move the most.
  function scraps(g, view, t) {
    var r = seeded(view.seed + 11);
    enterLayer(g, view.cam, DEPTH.front);
    var corner = Math.floor(r() * 4);
    for (var i = 0; i < 2; i++) {
      var c = (corner + i * 2) % 4;
      var a = 330 + r() * 240;
      var b = 74 + r() * 44;
      var x = c % 3 === 0 ? -80 - r() * 40 : WIDTH - a + 80 + r() * 40;
      var y = c < 2 ? -38 - r() * 12 : HEIGHT - b + 38 + r() * 12;
      sheet(g, x, y, a, b, view.seed + 40 + i, i ? "#dccfaf" : "#efe6cf", (r() - 0.5) * 0.09);
    }
  }
  // A torn sheet behind what the scene shows: a layer between the paper and the cutouts.
  function backSheet(g, view, t, x, y, a, b, at) {
    enterLayer(g, view.cam, DEPTH.back);
    var r = seeded(view.seed + 3);
    var s = pop(t, at === undefined ? 0 : at, 0.45);
    if (s <= 0) return;
    sheet(g, x, y, a, b, view.seed + 21, COLORS.sheet, (r() - 0.5) * 0.07, s);
    // a printed dot field on it, so the depth reads
    g.save();
    g.translate(x + a / 2, y + b / 2);
    g.rotate((r() - 0.5) * 0.07);
    g.scale(s, s);
    g.fillStyle = dots(g, "rgba(23,20,15,0.17)", 12, 2);
    g.fillRect(-a / 2 + 26, -b / 2 + 26, a - 52, b - 52);
    g.restore();
  }

  // ---- the scene kinds: words(view, tl, v) and paint(g, t, v, D, view) -----------------------

  var KINDS = {
    title: {
      words: function (view, tl, v) {
        if (v.kicker) popIn(tl, strip(view, v.kicker, "left:116px;top:92px", 46, 900, 1, "small"), 0.08, -1);
        popIn(tl, strip(view, v.headline, "left:112px;top:196px", 108, 1120, 3), 0.16, -0.6);
      },
      paint: function (g, t, v, D, view) {
        backSheet(g, view, t, 1100, 170, 690, 760, 0);
        enterLayer(g, view.cam, DEPTH.cutout);
        cutout(g, v.object, 1445, 860, 590, t, 0.28, 0.02);
      },
    },
    chapter: {
      words: function (view, tl, v) {
        var e = strip(view, v.headline, "left:112px;top:640px", 124, 1320, 2, "dark");
        popIn(tl, e, 0.12, -0.5);
      },
      paint: function (g, t, v, D, view) {
        backSheet(g, view, t, 1020, 90, 800, 560, 0);
        enterLayer(g, view.cam, DEPTH.cutout);
        cutout(g, v.object, 1420, 620, 460, t, 0.26, -0.02);
      },
    },
    statement: {
      words: function (view, tl, v) {
        popIn(tl, strip(view, v.line1, "left:840px;top:260px", 84, 1000, 2), 0.14, -0.8);
        popIn(tl, strip(view, v.line2, "left:900px;top:560px", 100, 940, 2, "dark"), 0.46, 0.6);
      },
      paint: function (g, t, v, D, view) {
        backSheet(g, view, t, 90, 130, 660, 800, 0);
        enterLayer(g, view.cam, DEPTH.cutout);
        cutout(g, v.object, 420, 880, 590, t, 0.08, -0.015);
      },
    },
    word: {
      words: function (view, tl, v) {
        var e = bare(view, v.word, CENTER + "top:110px", 290, 1640, 1);
        popIn(tl, e, 0.06);
        swipeUnder(view, tl, e, 0.42);
      },
      paint: function (g, t, v, D, view) {
        enterLayer(g, view.cam, DEPTH.cutout);
        cutout(g, v.object, 960, 1030, 470, t, 0.24);
      },
    },
    highlight: {
      words: function (view, tl, v) {
        var e = strip(view, v.line, "left:90px;top:300px", 98, 1060, 3);
        var bar = underlined(e.children[2], v.line, v.mark);
        popIn(tl, e, 0.12, -0.6);
        if (bar) swipe(tl, bar, 0.52);
      },
      paint: function (g, t, v, D, view) {
        backSheet(g, view, t, 1160, 150, 660, 770, 0);
        enterLayer(g, view.cam, DEPTH.cutout);
        cutout(g, v.object, 1490, 850, 560, t, 0.24, 0.015);
      },
    },
    question: {
      words: function (view, tl, v) {
        var q = String(v.question).replace(/[?\s]*$/, "?");
        popIn(tl, strip(view, q, "left:760px;top:360px", 96, 1060, 3), 0.14, 0.7);
        popIn(tl, bare(view, "?", "left:120px;top:40px", 330, 330, 1), 0.3, -8);
      },
      paint: function (g, t, v, D, view) {
        backSheet(g, view, t, 110, 300, 580, 640, 0);
        enterLayer(g, view.cam, DEPTH.cutout);
        cutout(g, v.object, 400, 900, 520, t, 0.14, -0.02);
      },
    },
    number: {
      words: function (view, tl, v) {
        var big = bare(view, "", "left:110px;top:270px;width:max-content;font-variant-numeric:tabular-nums", 400, 1200, 1);
        view.count = d.createElement("span");
        big.appendChild(view.count);
        popIn(tl, big, 0.06, -1);
        var pre = v.before ? String(v.before) : "";
        var post = v.after ? String(v.after) : "";
        if (post.length > 2) post = " " + post;
        view.parts = [pre, post];
        big.style.fontSize = size(pre + (Number(v.value) || 0).toLocaleString("en-US") + post, 400, 1160, 1, 0.72) + "px";
        swipeUnder(view, tl, big, 0.34);
      },
      paint: function (g, t, v, D, view) {
        var end = Number(v.value) || 0;
        var digits = (String(v.value).split(".")[1] || "").length;
        var shown = end * smooth(t / Math.min(1.3, D * 0.5));
        view.count.textContent = view.parts[0] + shown.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + view.parts[1];
        backSheet(g, view, t, 1240, 210, 580, 690, 0.04);
        enterLayer(g, view.cam, DEPTH.cutout);
        cutout(g, v.object, 1530, 850, 500, t, 0.3, 0.02);
      },
    },
    percent: {
      words: function (view, tl, v) {
        var big = bare(view, "", "left:120px;top:360px;width:max-content;font-variant-numeric:tabular-nums", 270, 780, 1);
        view.count = d.createElement("span");
        view.count.textContent = "0%";
        big.appendChild(view.count);
        big.style.fontSize = "270px";
        popIn(tl, big, 0.06, -1);
        swipeUnder(view, tl, big, 0.34);
      },
      paint: function (g, t, v, D, view) {
        var end = clamp(Number(v.value) || 0, 0, 100);
        var k = smooth((t - 0.1) / Math.min(1.4, D * 0.55));
        view.count.textContent = Math.round(end * k) + "%";
        backSheet(g, view, t, 960, 110, 860, 860, 0);
        enterLayer(g, view.cam, DEPTH.cutout);
        // a disc in print dots: the share in ink is exactly what the voice says
        var s = pop(t, 0.1, 0.5);
        var cx = 1390;
        var cy = 540;
        var R = 340 * s;
        if (R <= 0) return;
        g.beginPath();
        g.arc(cx, cy, R + 13, 0, Math.PI * 2);
        g.fillStyle = "#f8f3e5";
        g.fill();
        g.beginPath();
        g.arc(cx, cy, R, 0, Math.PI * 2);
        g.fillStyle = "#dacdb0";
        g.fill();
        var from = -Math.PI / 2;
        var to = from + ((Math.PI * 2 * end) / 100) * k;
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, R, from, to);
        g.closePath();
        g.fillStyle = "#9a8e74";
        g.fill();
        g.fillStyle = dots(g, COLORS.ink, 11, 4.3);
        g.fill();
        if (k > 0) {
          g.lineCap = "round";
          g.lineWidth = 11;
          g.strokeStyle = COLORS.hot;
          g.beginPath();
          g.arc(cx, cy, R + 13, from, to);
          g.stroke();
        }
      },
    },
    versus: {
      words: function (view, tl, v) {
        popIn(tl, strip(view, v.left, "left:70px;top:90px", 78, 800, 2), 0.1, -0.8);
        popIn(tl, strip(view, v.right, "left:1040px;top:90px", 78, 800, 2, "dark"), 0.42, 0.7);
      },
      paint: function (g, t, v, D, view) {
        enterLayer(g, view.cam, DEPTH.back);
        // one sheet torn in two down the middle: the right half is darker, and arrives late
        var r = seeded(view.seed);
        var tear = jag([1000, -40], [930, HEIGHT + 40], r, 16, 18);
        var right = pop(t, 0.34, 0.45);
        g.save();
        g.translate((1 - right) * 340, 0);
        g.beginPath();
        g.moveTo(tear[0][0], tear[0][1]);
        tear.forEach(function (p) { g.lineTo(p[0], p[1]); });
        g.lineTo(930, HEIGHT + 40);
        g.lineTo(WIDTH + 90, HEIGHT + 90);
        g.lineTo(WIDTH + 90, -90);
        g.closePath();
        g.fillStyle = "#cdbf9f";
        g.fill();
        g.fillStyle = dots(g, "rgba(23,20,15,0.22)", 12, 2.3);
        g.fill();
        g.lineWidth = 11;
        g.strokeStyle = "#fbf6ea";
        g.beginPath();
        g.moveTo(tear[0][0], tear[0][1]);
        tear.forEach(function (p) { g.lineTo(p[0], p[1]); });
        g.stroke();
        g.restore();
        enterLayer(g, view.cam, DEPTH.cutout);
        cutout(g, v.leftObject, 470, 980, 560, t, 0.2, -0.02);
        cutout(g, v.rightObject, 1450, 980, 560, t, 0.52, 0.02);
      },
    },
    cause: {
      words: function (view, tl, v) {
        popIn(tl, strip(view, v.from, "left:90px;top:96px", 76, 720, 2), 0.1, -0.7);
        popIn(tl, strip(view, v.to, "left:1120px;top:96px", 76, 720, 2, "dark"), Math.min(0.9, view.D * 0.34), 0.7);
      },
      paint: function (g, t, v, D, view) {
        var at = Math.min(0.9, D * 0.34);
        backSheet(g, view, t, 120, 300, 650, 650, 0);
        enterLayer(g, view.cam, DEPTH.cutout);
        cutout(g, v.fromObject, 445, 900, 520, t, 0.16, -0.02);
        var tip = hotLine(g, arc([760, 620], [1130, 610], 54, 22), 18, smooth((t - at * 0.4) / (at * 0.6)));
        if (t > at * 0.65) arrowHead(g, tip, 18);
        cutout(g, v.toObject, 1460, 900, 520, t, at, 0.02);
      },
    },
    year: {
      words: function (view, tl, v) {
        var e = d.createElement("div");
        e.className = "cx-stamp";
        e.style.cssText += ";left:130px;top:190px;font-size:240px;transform:rotate(-5deg)";
        e.textContent = String(Math.round(Number(v.value) || 0));
        view.words.appendChild(e);
        // a stamp: it lands big and hard, with no spring
        tl.fromTo(e, { opacity: 0, scale: 1.5, rotation: -9 }, { opacity: 0.94, scale: 1, rotation: -5, duration: 0.2, ease: "power4.in" }, 0.06);
        popIn(tl, strip(view, v.line, "left:130px;top:640px", 74, 980, 2), 0.42, -0.5);
      },
      paint: function (g, t, v, D, view) {
        backSheet(g, view, t, 1170, 150, 650, 780, 0);
        enterLayer(g, view.cam, DEPTH.cutout);
        cutout(g, v.object, 1495, 860, 560, t, 0.3, 0.02);
      },
    },
    map: {
      words: function (view, tl, v) {
        var place = findPlace(v.place);
        view.place = place;
        view.map = viewForPlace(place);
        view.pinAt = place ? project(view.map, place.lon, place.lat) : [WIDTH / 2, HEIGHT / 2];
        var name = v.label || (place ? place.name : "");
        if (name) popIn(tl, strip(view, name, besideAt(view.pinAt, null, 560, 58), 62, 560, 1), 0.5, -1);
        if (v.line && v.line !== name) popIn(tl, strip(view, v.line, freeCorner([view.pinAt], 100), 58, 1180, 1, "dark"), 0.82, -0.4);
      },
      paint: function (g, t, v, D, view) {
        mapStage(g, view, view.cam, t, view.seed, mapSheet(view.map, v.place));
        enterLayer(g, view.cam, DEPTH.words);
        pin(g, view.pinAt[0], view.pinAt[1], pop(t, 0.28, 0.5));
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
        var label = function (text, xy, away, at, turn) {
          popIn(tl, strip(view, text, besideAt(xy, away, 440, 50), 54, 440, 1), at, turn);
        };
        var nameA = v.fromLabel || (a ? a.name : "");
        var nameB = v.toLabel || (b ? b.name : "");
        if (nameA) label(nameA, view.a, view.b, 0.3, -1);
        if (nameB) label(nameB, view.b, view.a, view.from + view.to - 0.1, 1);
        // the corner of the line keeps off the pins and off the route between them
        var way = arc(view.a, view.b, Math.hypot(view.b[0] - view.a[0], view.b[1] - view.a[1]) * 0.16 * (view.b[0] >= view.a[0] ? -1 : 1), 16);
        if (v.line) popIn(tl, strip(view, v.line, freeCorner(way, 96), 56, 1180, 1, "dark"), 0.6, -0.4);
      },
      paint: function (g, t, v, D, view) {
        mapStage(g, view, view.cam, t, view.seed, mapSheet(view.map, null));
        enterLayer(g, view.cam, DEPTH.words);
        var lift = Math.hypot(view.b[0] - view.a[0], view.b[1] - view.a[1]) * 0.16;
        var side = view.b[0] >= view.a[0] ? -1 : 1;
        var k = smooth((t - view.from) / view.to);
        // the route line, as the plan asks, and its head travels with it
        var tip = hotLine(g, arc(view.a, view.b, lift * side, 40), 13, k);
        if (tip && k < 1) {
          g.fillStyle = COLORS.hot;
          g.beginPath();
          g.arc(tip.at[0], tip.at[1], 15, 0, Math.PI * 2);
          g.fill();
        }
        pin(g, view.a[0], view.a[1], pop(t, 0.08, 0.45));
        pin(g, view.b[0], view.b[1], pop(t, view.from + view.to - 0.2, 0.45));
      },
    },
    path: {
      words: function (view, tl, v) {
        view.times = [0, 1, 2, 3].map(function (i) { return Math.min(view.D * 0.8, 0.14 + i * (view.D * 0.2)); });
        view.spots = [[110, 590], [540, 210], [980, 590], [1400, 210]];
        [v.step1, v.step2, v.step3, v.step4].forEach(function (text, i) {
          popIn(tl, strip(view, text, "left:" + view.spots[i][0] + "px;top:" + view.spots[i][1] + "px", 66, 450, 3, i % 2 ? "dark" : ""), view.times[i], i % 2 ? 1.2 : -1.2);
        });
      },
      paint: function (g, t, v, D, view) {
        enterLayer(g, view.cam, DEPTH.cutout);
        var pts = [[100, 870], [420, 560], [760, 370], [1010, 760], [1330, 640], [1700, 330]];
        var line = [];
        for (var i = 0; i < pts.length - 1; i++) line = line.concat(arc(pts[i], pts[i + 1], (i % 2 ? 1 : -1) * 40, 12));
        var tip = hotLine(g, line, 14, smooth(t / Math.max(0.2, view.times[3] + 0.5)));
        if (t > view.times[3] + 0.3) arrowHead(g, tip, 14);
      },
    },
    alert: {
      words: function (view, tl, v) {
        var e = bare(view, v.line, "left:120px;top:200px;width:1020px", 140, 1020, 3);
        // no spring on the word of a crisis: it lands
        tl.fromTo(e, { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 0.16, ease: "power3.in" }, 0.18);
      },
      paint: function (g, t, v, D, view) {
        // the whole frame floods with the accent, over everything, from a torn edge
        g.setTransform(1, 0, 0, 1, 0, 0);
        var k = smooth(t / 0.26);
        var r = seeded(view.seed);
        var edge = jag([-60 + k * 2100, -40], [-200 + k * 2240, HEIGHT + 40], r, 30, 22);
        g.beginPath();
        g.moveTo(-300, -60);
        edge.forEach(function (p) { g.lineTo(p[0], p[1]); });
        g.lineTo(-300, HEIGHT + 60);
        g.closePath();
        g.fillStyle = COLORS.hot;
        g.fill();
        enterLayer(g, view.cam, DEPTH.cutout);
        g.globalCompositeOperation = "multiply";
        var old = g.globalAlpha;
        if (t > 0.08) cutout(g, v.object, 1480, 930, 600, t, 0.1, 0.015);
        g.globalAlpha = old;
        g.globalCompositeOperation = "source-over";
      },
    },
  };
  var FLOODS = { alert: true };
  var ON_MAP = { map: true, route: true };

  // ---- a scene on its canvas -----------------------------------------------------------

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
    g.clearRect(0, 0, WIDTH, HEIGHT);
    KINDS[view.kind].paint(g, t, view.vars, view.D, view);
    if (!FLOODS[view.kind] && !ON_MAP[view.kind]) scraps(g, view, t);
    // the layers of the DOM move with the same camera, each by its own depth
    var paper = layerAt(view.cam, DEPTH.paper);
    view.paper.style.transform = "translate(" + paper.x.toFixed(2) + "px," + paper.y.toFixed(2) + "px) scale(" + paper.s.toFixed(4) + ")";
    var words = layerAt(view.cam, DEPTH.words);
    view.words.style.transform = "translate(" + words.x.toFixed(2) + "px," + words.y.toFixed(2) + "px) scale(" + words.s.toFixed(4) + ")";
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
    makePaper();
    var clip = root.querySelector("[data-scene-dur]");
    var host = root.closest("[data-variable-values]");
    var vars = valuesOf(host, given);
    var D = Math.max(0.1, parseFloat(clip.getAttribute("data-scene-dur")) || 4);
    var canvas = root.querySelector("canvas");
    var holder = canvas.parentNode;
    var paper = d.createElement("div");
    paper.className = "cx-paper";
    holder.insertBefore(paper, canvas);
    var grain = d.createElement("div");
    grain.className = "cx-grain";
    holder.appendChild(grain);
    var start = (host && parseFloat(host.getAttribute("data-start"))) || 0;
    var view = { root: root, canvas: canvas, paper: paper, kind: kind, vars: vars, D: D, words: clip, g: null, start: start, seed: hash(kind + JSON.stringify(vars) + start) };
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

  w.ITVCollage = {
    block: block,
    OBJECTS: Object.keys(PROP),
    KINDS: Object.keys(KINDS),
    cameraAt: cameraAt,
    layerAt: layerAt,
    DEPTH: DEPTH,
    pop: pop,
    viewOf: viewOf,
    project: project,
    viewForPlace: viewForPlace,
    viewForRoute: viewForRoute,
    findPlace: findPlace,
  };
})(window, document);

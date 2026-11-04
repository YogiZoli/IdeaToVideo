<script lang="ts">
  // Demo (DECISIONS 170): a tiny moving frame that shows what a wizard's choice does,
  // so it is clear at a glance, without reading. Drawn by CSS on this computer, no
  // file and no render: an illustration of the idea, not the real render, which the
  // Motion wizard's "Render preview" shows. `of` is "<what>:<which>":
  //   transition:<name>  background:<id>  camera:<id>  pace:<id>  energy:<id>
  //   kind:<text|icon|image|video>  role:<scene role>  mix (with `mix`)
  let { of, mix = null }: { of: string; mix?: Record<string, number> | null } = $props();

  const what = $derived(of.split(":")[0]);
  const which = $derived(of.split(":")[1] ?? "");
  const SHOWN = ["cut", "crossfade", "blur-crossfade", "push-slide", "zoom-through", "squeeze", "domain-warp", "ridged-burn", "whip-pan", "sdf-iris", "ripple-waves", "gravitational-lens", "cinematic-zoom", "chromatic-split", "glitch", "swirl-vortex", "thermal-distortion", "flash-through-white", "cross-warp-morph", "light-leak"];
  const transition = $derived(what === "energy" ? "push-slide" : SHOWN.includes(which) ? which : "crossfade");
  // how long one round lasts, so the change takes as long as it says (a fifth of a round)
  const ENERGY: Record<string, string> = { calm: "3.25s", medium: "2s", high: "1.25s" };
  const PACE: Record<string, string> = { calm: "6s", balanced: "3.6s", fast: "2.1s" };

  const KINDS = ["text", "icon", "image", "video"] as const;
  // the share of each kind as twelve tiles, spread out as a video would mix them
  const tiles = $derived.by(() => {
    if (!mix) return [];
    const total = KINDS.reduce((a, k) => a + (mix![k] ?? 0), 0) || 1;
    const owed = Object.fromEntries(KINDS.map((k) => [k, 0]));
    const out: string[] = [];
    for (let i = 0; i < 12; i++) {
      for (const k of KINDS) owed[k] += (mix![k] ?? 0) / total;
      const next = KINDS.reduce((a, b) => (owed[b] > owed[a] ? b : a));
      owed[next] -= 1;
      out.push(next);
    }
    return out;
  });
</script>

{#snippet sceneA()}<div class="a"><span class="big">A</span><i class="l1"></i><i class="l2"></i></div>{/snippet}
{#snippet sceneB()}<div class="b"><span class="big">B</span><i class="dot"></i></div>{/snippet}
{#snippet land()}
  <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="160" height="90" fill="#7cc4e8" />
    <circle class="sun" cx="118" cy="26" r="11" fill="#ffd166" />
    <path d="M0 62 L38 34 L66 58 L96 28 L160 66 V90 H0 Z" fill="#3f7d5a" />
    <path d="M0 78 Q50 58 100 74 T160 70 V90 H0 Z" fill="#2c5e45" />
  </svg>
{/snippet}

<div class="demo {what}" aria-hidden="true" style={what === "energy" ? `--loop: ${ENERGY[which] ?? "2s"}` : what === "pace" ? `--loop: ${PACE[which] ?? "3.6s"}` : ""}>
  {#if what === "transition" || what === "energy"}
    <div class="stage t-{transition}">
      {@render sceneA()}
      {@render sceneB()}
      <div class="o"></div>
    </div>
  {:else if what === "background"}
    <div class="stage bg-{which}">
      <div class="lights"><b></b><b></b></div>
      <div class="sheet"><i class="l1"></i><i class="l2"></i></div>
    </div>
  {:else if what === "camera"}
    <div class="stage cam-{which}">
      <div class="moving"><span class="big">Title</span><i class="l1"></i><i class="l2"></i></div>
      <div class="corners"></div>
    </div>
  {:else if what === "pace"}
    <div class="stage"><div class="strip"><span class="p1">1</span><span class="p2">2</span><span class="p3">3</span></div></div>
    <div class="ticks"><i></i></div>
  {:else if what === "kind"}
    <div class="stage k-{which}">
      {#if which === "text"}
        <div class="words"><b>Big</b> <b>clear</b> <b>words</b></div>
      {:else if which === "icon"}
        <div class="icons">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></svg>
          <svg viewBox="0 0 24 24"><path d="M12 3l3 6 6 1-4.5 4.5 1 6.5-5.5-3-5.5 3 1-6.5L3 10l6-1z" /></svg>
          <svg viewBox="0 0 24 24"><path d="M4 18V6M4 18h16M8 15v-4M13 15V8M18 15v-6" /></svg>
        </div>
      {:else if which === "image"}
        <div class="photo">{@render land()}</div>
      {:else}
        <div class="photo moving">{@render land()}</div>
        <span class="play"></span><span class="bar"><i></i></span>
      {/if}
    </div>
  {:else if what === "role"}
    <div class="stage r-{which}">
      {#if which === "opening"}
        <span class="num">01</span><i class="h1"></i><i class="h2"></i>
      {:else if which === "emphasis"}
        <span class="sent">the <b>one thing</b> that counts</span>
      {:else if which === "proof"}
        <span class="val">73%</span><div class="bars"><i></i><i></i><i></i></div>
      {:else if which === "list"}
        <div class="rows"><p><u></u><i></i></p><p><u></u><i></i></p><p><u></u><i></i></p></div>
      {:else if which === "diagram"}
        <div class="flow"><b>A</b><i></i><b>B</b></div>
      {:else if which === "quote"}
        <span class="q">"</span><i class="h2"></i><i class="h3"></i>
      {:else if which === "closing"}
        <span class="pill">Comment GUIDE</span>
      {:else}
        <i class="w1"></i><i class="w2"></i><i class="w3"></i>
      {/if}
    </div>
  {:else if what === "mix"}
    <div class="stage film">
      {#each tiles as t, i (i)}<span class="tile {t}"></span>{/each}
      <em class="head"></em>
    </div>
  {/if}
</div>

<style>
  .demo { position: relative; width: 100%; --loop: 3s; font-family: inherit; }
  .stage { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border-radius: 8px; background: #111827; color: #fff; contain: paint; }
  .big { font-weight: 800; font-size: clamp(16px, 3.4vw, 26px); line-height: 1; }
  i { display: block; }

  /* two scenes: A hands over to B in the middle fifth of the round, then it starts again */
  .a, .b, .o { position: absolute; inset: 0; animation: var(--loop) linear infinite both; }
  .a { background: #1e3a8a; display: grid; align-content: center; justify-items: center; gap: 4px; }
  .a .l1, .a .l2 { height: 4px; border-radius: 2px; background: #bfdbfe; }
  .a .l1 { width: 46%; }
  .a .l2 { width: 30%; opacity: 0.7; }
  .b { background: #f59e0b; color: #451a03; display: grid; place-items: center; opacity: 1; }
  .b .dot { position: absolute; right: 12%; bottom: 14%; width: 18%; aspect-ratio: 1; border-radius: 50%; background: #fff7ed; }
  .o { opacity: 0; pointer-events: none; }

  .t-cut .b { animation-name: b-cut; }
  @keyframes b-cut { 0%, 49.9% { opacity: 0; } 50%, 100% { opacity: 1; } }
  .t-crossfade .b { animation-name: b-fade; }
  @keyframes b-fade { 0%, 40% { opacity: 0; } 60%, 100% { opacity: 1; } }

  .t-blur-crossfade .a { animation-name: a-blur; }
  .t-blur-crossfade .b { animation-name: b-blur; }
  @keyframes a-blur { 0%, 40% { filter: blur(0); } 60%, 100% { filter: blur(6px); } }
  @keyframes b-blur { 0%, 40% { opacity: 0; filter: blur(6px); } 60%, 100% { opacity: 1; filter: blur(0); } }

  .t-push-slide .a { animation-name: a-push; animation-timing-function: ease-in-out; }
  .t-push-slide .b { animation-name: b-push; animation-timing-function: ease-in-out; }
  @keyframes a-push { 0%, 40% { transform: translateX(0); } 60%, 100% { transform: translateX(-100%); } }
  @keyframes b-push { 0%, 40% { transform: translateX(100%); } 60%, 100% { transform: translateX(0); } }

  .t-zoom-through .a { animation-name: a-zoom; }
  .t-zoom-through .b { animation-name: b-zoom; }
  @keyframes a-zoom { 0%, 40% { transform: scale(1); opacity: 1; } 60%, 100% { transform: scale(3); opacity: 0; } }
  @keyframes b-zoom { 0%, 40% { transform: scale(0.4); opacity: 0; } 60%, 100% { transform: scale(1); opacity: 1; } }

  .t-squeeze .a { animation-name: a-squeeze; transform-origin: left center; }
  .t-squeeze .b { animation-name: b-squeeze; transform-origin: right center; }
  @keyframes a-squeeze { 0%, 40% { transform: scaleX(1); } 60%, 100% { transform: scaleX(0); } }
  @keyframes b-squeeze { 0%, 40% { transform: scaleX(0); } 60%, 100% { transform: scaleX(1); } }

  .t-domain-warp .a { animation-name: a-warp; }
  .t-domain-warp .b { animation-name: b-warp; }
  @keyframes a-warp { 0%, 40% { transform: none; filter: blur(0); } 50% { transform: skew(14deg, 5deg) scale(1.2); filter: blur(2px); } 60%, 100% { transform: skew(-14deg, -5deg) scale(1.3); filter: blur(4px); } }
  @keyframes b-warp { 0%, 42% { opacity: 0; transform: skew(-16deg, 6deg) scale(1.3); } 60%, 100% { opacity: 1; transform: none; } }

  .t-ridged-burn .b, .t-sdf-iris .b, .t-ripple-waves .b { animation-name: b-iris; }
  @keyframes b-iris { 0%, 40% { clip-path: circle(0% at 50% 50%); } 60%, 100% { clip-path: circle(120% at 50% 50%); } }
  .t-ridged-burn .o { background: radial-gradient(circle, rgb(255 90 0 / 0.95) 0 30%, rgb(255 200 60 / 0.8) 45%, transparent 70%); animation-name: o-peak; }
  .t-ripple-waves .o { background: repeating-radial-gradient(circle, rgb(255 255 255 / 0.5) 0 3px, transparent 3px 11px); animation-name: o-peak; }
  @keyframes o-peak { 0%, 40% { opacity: 0; transform: scale(0.6); } 50% { opacity: 1; } 60%, 100% { opacity: 0; transform: scale(1.5); } }

  .t-whip-pan .a { animation-name: a-whip; animation-timing-function: cubic-bezier(0.7, 0, 0.3, 1); }
  .t-whip-pan .b { animation-name: b-whip; animation-timing-function: cubic-bezier(0.7, 0, 0.3, 1); }
  @keyframes a-whip { 0%, 40% { transform: translateX(0); filter: blur(0); } 50% { filter: blur(8px); } 60%, 100% { transform: translateX(-120%); filter: blur(8px); } }
  @keyframes b-whip { 0%, 40% { transform: translateX(120%); filter: blur(8px); } 50% { filter: blur(8px); } 60%, 100% { transform: translateX(0); filter: blur(0); } }

  .t-gravitational-lens .a { animation-name: a-lens; }
  .t-gravitational-lens .b { animation-name: b-lens; }
  @keyframes a-lens { 0%, 40% { clip-path: circle(120% at 50% 50%); transform: scale(1); } 60%, 100% { clip-path: circle(0% at 50% 50%); transform: scale(1.5); } }
  @keyframes b-lens { 0%, 40% { transform: scale(1.5); } 60%, 100% { transform: scale(1); } }

  .t-cinematic-zoom .a { animation-name: a-cine; }
  .t-cinematic-zoom .b { animation-name: b-cine; }
  @keyframes a-cine { 0%, 40% { transform: scale(1); filter: blur(0); } 60%, 100% { transform: scale(1.8); filter: blur(5px); } }
  @keyframes b-cine { 0%, 44% { transform: scale(1.3); opacity: 0; } 60%, 100% { transform: scale(1); opacity: 1; } }

  .t-chromatic-split .b { animation-name: b-fade; }
  .t-chromatic-split .o { background: linear-gradient(90deg, rgb(255 0 90 / 0.7) 0 33%, transparent 33% 66%, rgb(0 220 255 / 0.7) 66%); mix-blend-mode: screen; animation-name: o-split; }
  @keyframes o-split { 0%, 40% { opacity: 0; transform: translateX(-12%); } 50% { opacity: 1; } 60%, 100% { opacity: 0; transform: translateX(12%); } }

  .t-glitch .b { animation-name: b-glitch; animation-timing-function: steps(1); }
  @keyframes b-glitch {
    0%, 41% { opacity: 0; clip-path: inset(0); transform: none; }
    42% { opacity: 1; clip-path: inset(0 0 70% 0); transform: translateX(-10%); }
    46% { clip-path: inset(40% 0 25% 0); transform: translateX(10%); }
    50% { clip-path: inset(10% 0 55% 0); transform: translateX(-6%); }
    54% { clip-path: inset(60% 0 5% 0); transform: translateX(8%); }
    58%, 100% { opacity: 1; clip-path: inset(0); transform: none; }
  }

  .t-swirl-vortex .a { animation-name: a-swirl; }
  .t-swirl-vortex .b { animation-name: b-swirl; }
  @keyframes a-swirl { 0%, 40% { transform: rotate(0) scale(1); } 60%, 100% { transform: rotate(200deg) scale(0); } }
  @keyframes b-swirl { 0%, 40% { transform: rotate(-200deg) scale(0); } 60%, 100% { transform: rotate(0) scale(1); } }

  .t-thermal-distortion .a { animation-name: a-heat; }
  .t-thermal-distortion .b { animation-name: b-heat; }
  @keyframes a-heat { 0%, 40% { transform: none; } 44% { transform: skewX(5deg); } 48% { transform: skewX(-5deg); } 52% { transform: skewX(4deg); } 56%, 100% { transform: skewX(-3deg); } }
  @keyframes b-heat { 0%, 44% { opacity: 0; transform: skewX(4deg); } 50% { transform: skewX(-4deg); } 55% { transform: skewX(3deg); } 60%, 100% { opacity: 1; transform: none; } }

  .t-flash-through-white .b { animation-name: b-cut; }
  .t-flash-through-white .o { background: #fff; animation-name: o-flash; }
  @keyframes o-flash { 0%, 40% { opacity: 0; } 50% { opacity: 1; } 60%, 100% { opacity: 0; } }

  .t-cross-warp-morph .a { animation-name: a-morph; }
  .t-cross-warp-morph .b { animation-name: b-morph; }
  @keyframes a-morph { 0%, 40% { transform: none; opacity: 1; border-radius: 0; } 60%, 100% { transform: skewY(8deg) scale(0.7); opacity: 0; border-radius: 50%; } }
  @keyframes b-morph { 0%, 40% { transform: skewY(-8deg) scale(0.7); opacity: 0; border-radius: 50%; } 60%, 100% { transform: none; opacity: 1; border-radius: 0; } }

  .t-light-leak .b { animation-name: b-fade; }
  .t-light-leak .o { background: radial-gradient(ellipse at 30% 50%, rgb(255 190 90 / 0.95), rgb(255 90 60 / 0.5) 40%, transparent 70%); animation-name: o-leak; }
  @keyframes o-leak { 0%, 36% { opacity: 0; transform: translateX(-50%); } 50% { opacity: 1; } 64%, 100% { opacity: 0; transform: translateX(50%); } }

  /* the background behind a scene */
  .sheet { position: absolute; left: 20%; right: 20%; top: 26%; bottom: 26%; background: rgb(255 255 255 / 0.92); border-radius: 6px; display: grid; align-content: center; justify-items: center; gap: 4px; z-index: 1; }
  .sheet .l1, .sheet .l2 { height: 4px; border-radius: 2px; background: #334155; }
  .sheet .l1 { width: 60%; }
  .sheet .l2 { width: 40%; opacity: 0.6; }
  .lights { display: none; position: absolute; inset: 0; }
  .bg-plain { background: #e2e8f0; }
  .bg-grain-field { background-color: #e2e8f0; background-image: radial-gradient(#64748b 1.4px, transparent 1.6px); background-size: 12px 12px; animation: dots 6s linear infinite; }
  @keyframes dots { to { background-position: 48px 24px; } }
  .bg-aurora-drift { background: #0b1b3a; }
  .bg-aurora-drift .lights { display: block; }
  .lights b { position: absolute; width: 70%; aspect-ratio: 1; border-radius: 50%; filter: blur(18px); opacity: 0.75; animation: drift 7s ease-in-out infinite alternate; }
  .lights b:first-child { background: #22d3ee; left: -20%; top: -50%; }
  .lights b:last-child { background: #a78bfa; right: -20%; bottom: -60%; animation-delay: -3s; }
  @keyframes drift { to { transform: translate(30%, 25%); } }

  /* the camera */
  .moving { position: absolute; inset: 0; background: #0f766e; display: grid; align-content: center; justify-items: center; gap: 5px; }
  .moving .l1, .moving .l2 { height: 4px; border-radius: 2px; background: #ccfbf1; }
  .moving .l1 { width: 44%; }
  .moving .l2 { width: 28%; opacity: 0.7; }
  .cam-push .moving { animation: push 4.5s linear infinite; }
  @keyframes push { from { transform: scale(1) translate(-2%, 1%); } to { transform: scale(1.22) translate(3%, -2%); } }
  .cam-jitter .moving { animation: jitter 0.5s steps(1) infinite; }
  @keyframes jitter { 0% { transform: translate(0, 0); } 25% { transform: translate(1.5px, -1px); } 50% { transform: translate(-1px, 1.5px); } 75% { transform: translate(1px, 1px); } }

  /* how often the picture changes */
  .strip { display: flex; width: 300%; height: 100%; animation: flip var(--loop) steps(3) infinite; }
  .strip span { flex: 1; display: grid; place-items: center; font-weight: 800; font-size: clamp(16px, 3.4vw, 26px); }
  .p1 { background: #1e3a8a; }
  .p2 { background: #0f766e; }
  .p3 { background: #b45309; }
  @keyframes flip { to { transform: translateX(-100%); } }
  .ticks { height: 3px; margin-top: 4px; background: var(--muted); border-radius: 2px; overflow: hidden; }
  .ticks i { height: 100%; background: var(--primary); animation: tick var(--loop) linear infinite; }
  @keyframes tick { from { width: 0; } to { width: 100%; } }

  /* what is on screen */
  .k-text { background: #f8fafc; color: #0f172a; display: grid; place-items: center; }
  .words { font-size: clamp(13px, 2.6vw, 20px); text-align: center; }
  .words b { display: inline-block; animation: pop 3s ease-out infinite both; }
  .words b:nth-child(2) { animation-delay: 0.3s; color: #2563eb; }
  .words b:nth-child(3) { animation-delay: 0.6s; }
  @keyframes pop { 0% { opacity: 0; transform: translateY(40%) scale(0.8); } 12%, 85% { opacity: 1; transform: none; } 100% { opacity: 0; } }
  .k-icon { background: #f8fafc; display: grid; place-items: center; }
  .icons { display: flex; gap: 10%; width: 70%; justify-content: center; }
  .icons svg { width: 30%; fill: none; stroke: #0f766e; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; animation: pop 3s ease-out infinite both; }
  .icons svg:nth-child(2) { animation-delay: 0.3s; }
  .icons svg:nth-child(3) { animation-delay: 0.6s; }
  .photo { position: absolute; inset: 0; animation: slowzoom 6s ease-in-out infinite alternate; }
  .photo svg { width: 100%; height: 100%; display: block; }
  @keyframes slowzoom { to { transform: scale(1.18); } }
  .k-video .photo { animation-duration: 3s; }
  .k-video .sun { animation: sunmove 3s linear infinite; }
  @keyframes sunmove { from { transform: translateX(-30px); } to { transform: translateX(30px); } }
  .play { position: absolute; left: 8px; bottom: 7px; width: 0; height: 0; border-left: 8px solid #fff; border-top: 5px solid transparent; border-bottom: 5px solid transparent; }
  .bar { position: absolute; left: 22px; right: 8px; bottom: 10px; height: 3px; background: rgb(255 255 255 / 0.4); border-radius: 2px; overflow: hidden; }
  .bar i { height: 100%; background: #fff; animation: tick 3s linear infinite; }

  /* the kinds of scene */
  [class*="r-"] { background: #f8fafc; color: #0f172a; display: grid; place-items: center; align-content: center; gap: 5px; padding: 6%; box-sizing: border-box; }
  [class*="r-"] i { background: #334155; border-radius: 2px; height: 5px; }
  .h1 { width: 62%; height: 9px !important; animation: slidein 3s ease-out infinite both; }
  .h2 { width: 50%; animation: slidein 3s ease-out 0.2s infinite both; }
  .h3 { width: 36%; animation: slidein 3s ease-out 0.4s infinite both; }
  @keyframes slidein { 0% { opacity: 0; transform: translateX(-20%); } 14%, 90% { opacity: 1; transform: none; } 100% { opacity: 0; } }
  .num { font-weight: 800; color: #2563eb; font-size: clamp(11px, 2vw, 16px); }
  .w1, .w2, .w3 { animation: slidein 3s ease-out infinite both; height: 8px !important; }
  .w1 { width: 70%; }
  .w2 { width: 56%; animation-delay: 0.2s; }
  .w3 { width: 40%; animation-delay: 0.4s; }
  .sent { font-size: clamp(10px, 1.8vw, 14px); text-align: center; }
  .sent b { padding: 0 3px; border-radius: 3px; background: linear-gradient(#fde047, #fde047) no-repeat left / 0 100%; animation: mark 3s ease-out infinite; }
  @keyframes mark { 10%, 90% { background-size: 100% 100%; } 100% { background-size: 0 100%; } }
  .val { font-weight: 800; font-size: clamp(13px, 2.6vw, 20px); color: #2563eb; }
  .bars { display: flex; align-items: flex-end; gap: 6px; height: 34%; width: 50%; justify-content: center; }
  .bars i { width: 22%; height: 100%; background: #2563eb !important; transform-origin: bottom; animation: grow 3s ease-out infinite both; }
  .bars i:nth-child(1) { --h: 0.4; }
  .bars i:nth-child(2) { --h: 0.7; animation-delay: 0.15s; }
  .bars i:nth-child(3) { --h: 1; animation-delay: 0.3s; }
  @keyframes grow { 0% { transform: scaleY(0); } 15%, 90% { transform: scaleY(var(--h, 1)); } 100% { transform: scaleY(0); } }
  .rows { display: grid; gap: 5px; width: 66%; }
  .rows p { margin: 0; display: flex; gap: 6px; align-items: center; animation: slidein 3s ease-out infinite both; }
  .rows p:nth-child(2) { animation-delay: 0.25s; }
  .rows p:nth-child(3) { animation-delay: 0.5s; }
  .rows u { width: 7px; height: 7px; flex: none; border-radius: 50%; background: #16a34a; }
  .rows i { flex: 1; }
  .flow { display: flex; align-items: center; justify-content: center; gap: 6px; width: 80%; }
  .flow b { padding: 4px 10px; border: 2px solid #2563eb; border-radius: 6px; color: #2563eb; font-size: clamp(10px, 1.8vw, 14px); }
  .flow i { flex: 1; height: 3px !important; background: #334155; transform-origin: left; animation: draw 3s ease-out infinite both; }
  @keyframes draw { 0% { transform: scaleX(0); } 25%, 90% { transform: scaleX(1); } 100% { transform: scaleX(0); } }
  .q { font-size: clamp(22px, 5vw, 38px); line-height: 0.7; font-weight: 800; color: #94a3b8; }
  .pill { padding: 4px 10px; border-radius: 999px; background: #dc2626; color: #fff; font-weight: 700; font-size: clamp(9px, 1.6vw, 13px); animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 50% { transform: scale(1.07); } }

  /* the mix of a whole video */
  .film { display: grid; grid-template-columns: repeat(6, 1fr); grid-template-rows: repeat(2, 1fr); gap: 3px; padding: 4px; box-sizing: border-box; background: #1f2937; }
  .tile { border-radius: 3px; }
  .tile.text { background: #60a5fa; }
  .tile.icon { background: #34d399; }
  .tile.image { background: #fbbf24; }
  .tile.video { background: #f87171; }
  .head { position: absolute; top: 0; bottom: 0; width: 2px; background: #fff; animation: head 6s linear infinite; }
  @keyframes head { from { left: 0; } to { left: 100%; } }

  @media (prefers-reduced-motion: reduce) {
    .demo * { animation-duration: 0.01s !important; animation-iteration-count: 1 !important; }
  }
</style>

# GSAP licenc-kérdés (eladás előtt)

Állapot: 2026-10-07, megfogalmazva, **nincs elküldve, és nem is küldjük** (Zoltan döntése, 2026-10-07: kicsi a kockázat, az app videót gyárt, nem animációszerkesztő). Ha a helyzet változik, innen elküldhető. Zoltan küldi el a
https://gsap.com/contact űrlapon (vagy Claude, Zoltan kifejezett igenjével).

## Miért kell

A GSAP Standard License (https://gsap.com/standard-license/) ingyenes,
kereskedelmi célra is, de írásos engedélyhez köti a "Prohibited Uses" körét:
GSAP használata olyan eszközben, amely kód nélkül enged vizuális animációt
építeni, és ezzel a Webflow vizuális animáció-építőjével versenyző megoldást
segít. Az IdeaToVideo videót gyárt, nem animációszerkesztő, de van benne
vizuális varázsló (Motion, Scenes), ezért nem egyértelmű. Egy írásos válasz
megszünteti a kockázatot.

Ha a válasz nem: a HyperFrames más futtatókat is ismer (CSS keyframes, Web
Animations API), a mozgás átírható GSAP nélkül. Ez munka, nem pénz.

## Az üzenet (angolul, másolható)

Subject: Standard License question: desktop app that renders explainer videos

Hello,

I am building IdeaToVideo, a desktop app (Windows, later macOS) that turns a
topic into a finished explainer video file (MP4) on the user's own computer.
The user writes or approves a script, and the app renders the video with the
open-source HyperFrames engine, which uses GSAP for its timelines.

How GSAP is used:
- GSAP runs only inside the render step, to animate text, icons and scene
  transitions in HTML compositions that are rendered to video frames.
- The output is a video file, not a website, web page or interactive
  animation. Users never get GSAP code, an animation timeline or an
  animation editor.
- The app offers a few presets (pace, camera movement, transitions, colour
  and font choices) in simple wizards. There is no visual timeline,
  keyframe editor or web animation builder, and nothing is exported to the
  web.

The app will be sold as a one-time purchase, a few hundred copies at first.

Could you confirm that this use is not a "Prohibited Use" under the GSAP
Standard License, or tell me what consent or licence I would need?

Thank you,
Zoltan Gero

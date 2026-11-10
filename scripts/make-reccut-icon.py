# make-reccut-icon.py: RecCut's own icon, drawn by code (DECISIONS 185). A film strip
# cut by a pair of scissors, white on a warm coral square, so it never looks like
# IdeaToVideo's dark blue icon in the taskbar. No letters, no brand.
#   python scripts/make-reccut-icon.py app/src-tauri/icons-reccut/source.png
import math
import sys
from PIL import Image, ImageDraw

S = 1024
K = 4  # drawn 4x larger, then scaled down: smooth edges
W = S * K
img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

def box(x0, y0, x1, y1):
    return [x0 * K, y0 * K, x1 * K, y1 * K]

# the rounded square, coral to a deeper red-orange
top, bottom = (255, 112, 84), (214, 58, 52)
grad = Image.new("RGBA", (W, W))
gd = ImageDraw.Draw(grad)
for y in range(W):
    t = y / (W - 1)
    gd.line([(0, y), (W, y)], fill=tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,))
mask = Image.new("L", (W, W), 0)
ImageDraw.Draw(mask).rounded_rectangle(box(40, 40, 984, 984), radius=220 * K, fill=255)
img.paste(grad, (0, 0), mask)

WHITE = (255, 255, 255, 255)
HOLE = (214, 70, 56, 255)

# the film strip, cut in two with a gap, slightly tilted halves
def strip(x0, x1, y0, y1):
    d.rounded_rectangle(box(x0, y0, x1, y1), radius=26 * K, fill=WHITE)
    n = int((x1 - x0 - 40) // 70)
    for i in range(n):
        hx = x0 + 34 + i * 70
        d.rounded_rectangle(box(hx, y0 + 18, hx + 36, y0 + 52), radius=8 * K, fill=HOLE)
        d.rounded_rectangle(box(hx, y1 - 52, hx + 36, y1 - 18), radius=8 * K, fill=HOLE)
    d.rounded_rectangle(box(x0 + 30, y0 + 74, x1 - 30, y1 - 74), radius=12 * K, fill=(255, 196, 180, 255))

strip(150, 452, 560, 830)
strip(572, 874, 560, 830)

# the scissors above the cut: each half is a ring, a handle through the pivot, and a
# blade tapering to its tip, the two tips crossing over the gap between the halves
cx, cy = 512, 420
for side in (-1, 1):
    ring = (cx - side * 96, cy - 190)
    tip = (cx + side * 70, cy + 190)
    # handle: ring to pivot
    d.line([(ring[0] * K, ring[1] * K), (cx * K, cy * K)], fill=WHITE, width=40 * K)
    # blade: wide at the pivot, sharp at the tip
    dx, dy = tip[0] - cx, tip[1] - cy
    L = math.hypot(dx, dy)
    nx, ny = -dy / L, dx / L
    d.polygon([((cx + nx * 26) * K, (cy + ny * 26) * K), ((cx - nx * 26) * K, (cy - ny * 26) * K), (tip[0] * K, tip[1] * K)], fill=WHITE)
    d.ellipse(box(ring[0] - 80, ring[1] - 80, ring[0] + 80, ring[1] + 80), fill=WHITE)
    d.ellipse(box(ring[0] - 44, ring[1] - 44, ring[0] + 44, ring[1] + 44), fill=(250, 106, 80, 255))
d.ellipse(box(cx - 24, cy - 24, cx + 24, cy + 24), fill=HOLE)

img = img.resize((S, S), Image.LANCZOS)
img.save(sys.argv[1] if len(sys.argv) > 1 else "reccut-icon.png")

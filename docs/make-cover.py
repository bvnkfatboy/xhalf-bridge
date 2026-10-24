#!/usr/bin/env python3
"""Generate the Xhalf Bridge README cover (1600x800) with Pillow."""
from PIL import Image, ImageDraw, ImageFont
import os

S = 2  # supersample factor — all layout coords are 1x (1600x800), multiplied at draw time
W, H = 1600 * S, 800 * S

# ---------- palette ----------
BG_TOP = (16, 17, 18)
BG_BOT = (27, 29, 31)
OLIVE = (163, 177, 138)
OLIVE_DARK = (125, 143, 98)
INK = (20, 24, 13)
FG = (232, 230, 225)
MUTED = (148, 148, 141)
LINE = (52, 55, 58)
HOLE = (40, 43, 46)

def sc(v):
    return int(v * S)

def load_font(candidates, size):
    size = int(size * S)
    for path, idx in candidates:
        full = path if path.startswith("/") else f"/System/Library/Fonts/{path}"
        try:
            # NOTE: os.path.exists lies inside the sandbox for /System/Library/Fonts,
            # so we let truetype try and catch the failure instead.
            return ImageFont.truetype(full, size, index=idx)
        except Exception:
            continue
    return ImageFont.load_default(size)

DISPLAY = load_font([("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 0),
                     ("/System/Library/Fonts/Helvetica.ttc", 1)], 1)
REG = load_font([("/System/Library/Fonts/SFNS.ttf", 0),
                 ("/System/Library/Fonts/Supplemental/Arial.ttf", 0)], 1)
MONO = load_font([("/System/Library/Fonts/Menlo.ttc", 0)], 1)
THAI = load_font([("/System/Library/Fonts/SukhumvitSet.ttc", 0),
                  ("/System/Library/Fonts/Thonburi.ttc", 0),
                  ("/System/Library/Fonts/Supplemental/Ayuthaya.ttf", 0)], 1)

img = Image.new("RGB", (W, H))
d = ImageDraw.Draw(img)

# vertical gradient background
for y in range(H):
    t = y / H
    c = tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * t) for i in range(3))
    d.line([(0, y), (W, y)], fill=c)

# soft olive glow behind the right-side frames
glow = Image.new("L", (W, H), 0)
gd = ImageDraw.Draw(glow)
gcx, gcy = sc(1280), sc(400)
for r in range(sc(430), 0, -sc(18)):
    a = int(30 * (1 - r / sc(430)))
    gd.ellipse([gcx - r, gcy - int(r * 0.72), gcx + r, gcy + int(r * 0.72)], fill=a)
img = Image.composite(Image.new("RGB", (W, H), OLIVE_DARK), img, glow.point(lambda v: min(v, 34)))
d = ImageDraw.Draw(img)

# film perforation strips (top + bottom)
STRIP, HW, HH, GAP = sc(40), sc(29), sc(20), sc(23)
for y0 in (0, H - STRIP):
    d.rectangle([0, y0, W, y0 + STRIP], fill=(12, 13, 14))
    x = sc(24)
    hy = y0 + (STRIP - HH) // 2
    while x + HW < W - sc(12):
        d.rounded_rectangle([x, hy, x + HW, hy + HH], radius=sc(5), fill=HOLE)
        x += HW + GAP

# ---------- left: logo + wordmark ----------
LX, LY, LS = sc(90), sc(300), sc(96)
d.rounded_rectangle([LX, LY, LX + LS, LY + LS], radius=sc(21), fill=OLIVE)
lf = load_font([("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 0)], 50)
bb = d.textbbox((0, 0), "X½", font=lf)
d.text((LX + (LS - (bb[2] - bb[0])) / 2 - bb[0], LY + (LS - (bb[3] - bb[1])) / 2 - bb[1]),
       "X½", font=lf, fill=INK)

WX = LX + LS + sc(28)
d.text((WX, LY - sc(2)), "Xhalf Bridge", font=load_font([("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 0)], 74), fill=FG)
d.text((WX + sc(2), LY + sc(96)), "Photo studio for the Fujifilm X half", font=load_font([("/System/Library/Fonts/SFNS.ttf", 0)], 27), fill=MUTED)
if THAI:
    d.text((WX + sc(2), LY + sc(140)), "สตูดิโอภาพถ่ายสำหรับ Fujifilm X half — จัดเก็บ ตกแต่ง สำรอง ครบจบในแอปเดียว",
           font=load_font([("/System/Library/Fonts/SukhumvitSet.ttc", 0),
                           ("/System/Library/Fonts/Thonburi.ttc", 0)], 21), fill=(122, 122, 115))

# ---------- right: half-frame pair ----------
FX0, FY0, FX1, FY1 = sc(1040), sc(170), sc(1510), sc(632)
d.rounded_rectangle([FX0, FY0, FX1, FY1], radius=sc(20), fill=(20, 20, 20), outline=OLIVE, width=sc(3))
pad = sc(20)
slot_w = ((FX1 - FX0) - pad * 3) // 2
slot_h = (FY1 - FY0) - pad * 2

def v_gradient(x0, y0, x1, y1, c0, c1):
    for y in range(y0, y1):
        t = (y - y0) / max(1, y1 - y0)
        d.line([(x0, y), (x1, y)], fill=tuple(int(c0[i] + (c1[i] - c0[i]) * t) for i in range(3)))

s1x0 = FX0 + pad
v_gradient(s1x0, FY0 + pad, s1x0 + slot_w, FY0 + pad + slot_h, (125, 106, 158), (79, 143, 139))
s2x0 = s1x0 + slot_w + pad
v_gradient(s2x0, FY0 + pad, s2x0 + slot_w, FY0 + pad + slot_h, (201, 138, 91), (163, 177, 138))
d.rectangle([s1x0 + slot_w, FY0 + pad, s1x0 + slot_w + pad, FY0 + pad + slot_h], fill=(20, 20, 20))

cap = "HALF-FRAME PAIR"
cf = load_font([("/System/Library/Fonts/Menlo.ttc", 0)], 17)
cb = d.textbbox((0, 0), cap, font=cf)
d.text(((FX0 + FX1) / 2 - (cb[2] - cb[0]) / 2, FY1 + sc(17)), cap, font=cf, fill=(111, 111, 104))

# ---------- badges ----------
badges = ["macOS", "Windows", "Local-first", "Offline-first", "No AI"]
by, bx = sc(560), sc(90)
bf = load_font([("/System/Library/Fonts/SFNS.ttf", 0)], 22)
pad_x = sc(17)
for label in badges:
    bb = d.textbbox((0, 0), label, font=bf)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    pill = [bx, by, bx + tw + pad_x * 2, by + th + sc(15)]
    d.rounded_rectangle(pill, radius=(pill[3] - pill[1]) // 2, outline=LINE, width=S)
    d.text((pill[0] + pad_x - bb[0], by + sc(7) - bb[1]), label, font=bf, fill=OLIVE)
    bx = pill[2] + sc(13)

# ---------- footer + version ----------
d.text((sc(90), sc(712)), "Local-first  ·  Offline-first  ·  No AI  ·  MIT", font=load_font([("/System/Library/Fonts/Menlo.ttc", 0)], 16), fill=(97, 97, 91))
ver = "v0.1.0"
vb = d.textbbox((0, 0), ver, font=load_font([("/System/Library/Fonts/Menlo.ttc", 0)], 16))
d.text((W - sc(90) - (vb[2] - vb[0]), sc(712)), ver, font=load_font([("/System/Library/Fonts/Menlo.ttc", 0)], 16), fill=OLIVE_DARK)

out = img.resize((1600, 800), Image.LANCZOS)
out.save("/Users/bvnkxd/Documents/Project/xhalf-bridge/docs/assets/cover.png", optimize=True)
print("cover saved:", out.size)

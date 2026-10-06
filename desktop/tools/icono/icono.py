# Logo de Mate der Untoten: el mate de Ley Matera (mate-trazo.png) hecho
# muerto vivo, en una insignia roja oscura. Sale a 1024 y se achica con
# antialias: icono.png (1024), icono.ico (16..256) en esta carpeta.
# Para el juego: copiar icono.ico y un icono.png de 256 a desktop/static.
import math
from PIL import Image, ImageDraw, ImageFilter, ImageChops

S = 1024
BASE = 'C:/Users/ignac/Documents/Ley Matera/public/assets/brand/mate-trazo.png'
OUT = __import__('os').path.dirname(__import__('os').path.abspath(__file__)) + '/'

BONE = (238, 228, 204)
RED = (150, 18, 20)
DARK = (14, 4, 4)
GREEN = (120, 200, 60)
BODY = (66, 98, 38)
BODY2 = (38, 60, 22)


def radial(size, inner, outer, cx=None, cy=None, r=None):
    w, h = size
    cx = w / 2 if cx is None else cx
    cy = h / 2 if cy is None else cy
    r = r or max(w, h) / 2
    img = Image.new('RGB', size)
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = min(1, math.hypot(x - cx, y - cy) / r)
            px[x, y] = tuple(int(inner[i] + (outer[i] - inner[i]) * t) for i in range(3))
    return img


def circle_mask(r, pad=0):
    m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).ellipse([S / 2 - r + pad, S / 2 - r + pad, S / 2 + r - pad, S / 2 + r - pad], fill=255)
    return m


out = Image.new('RGBA', (S, S), (0, 0, 0, 0))

# la insignia: aro de hueso, aro rojo, fondo rojo oscuro con viñeta
R = 500
out.paste(Image.new('RGB', (S, S), BONE), (0, 0), circle_mask(R))
out.paste(Image.new('RGB', (S, S), RED), (0, 0), circle_mask(R - 22))
bg = radial((S, S), (70, 10, 10), DARK, r=440)
out.paste(bg, (0, 0), circle_mask(R - 58))

# el mate: el trazo de la marca, grande y centrado
tr = Image.open(BASE).convert('RGBA')
H = 690
W = int(tr.width * H / tr.height)
tr = tr.resize((W, H), Image.LANCZOS)
ox = (S - W) // 2 + 10
oy = (S - H) // 2 + 30
line = Image.new('L', (S, S), 0)
line.paste(tr.getchannel('A'), (ox, oy))
line = line.point(lambda v: 255 if v > 90 else 0)

# relleno del cuerpo: flood fill desde adentro de la calabaza
fill = line.copy()
ImageDraw.floodfill(fill, (S // 2 + 10, oy + int(H * 0.68)), 128)
ImageDraw.floodfill(fill, (S // 2 + 10, 522), 128)
body = fill.point(lambda v: 255 if v == 128 else 0)
# y la boca (la yerba), adentro del óvalo de arriba
rim = line.copy()
ImageDraw.floodfill(rim, (S // 2 - 60, oy + int(H * 0.115)), 128)
yerba = rim.point(lambda v: 255 if v == 128 else 0)
if sum(yerba.get_flattened_data()) > S * S * 255 * 0.2:  # se escapó el relleno: sin yerba
    yerba = Image.new('L', (S, S), 0)

# brillo verde atrás del mate
glow = ImageChops.lighter(body, line).filter(ImageFilter.GaussianBlur(38))
out.paste(Image.new('RGB', (S, S), (90, 170, 40)), (0, 0), glow.point(lambda v: int(v * 0.55)))

# el cuerpo: verde podrido, más oscuro abajo
bodyc = Image.new('RGB', (S, S))
d = ImageDraw.Draw(bodyc)
for y in range(S):
    t = min(1, max(0, (y - oy - H * 0.25) / (H * 0.7)))
    d.line([(0, y), (S, y)], fill=tuple(int(BODY[i] + (BODY2[i] - BODY[i]) * t) for i in range(3)))
out.paste(bodyc, (0, 0), body)
out.paste(Image.new('RGB', (S, S), (40, 52, 18)), (0, 0), yerba)

# la cara: dos ojos rojos que brillan y la boca cosida
face = Image.new('L', (S, S), 0)
fd = ImageDraw.Draw(face)
ey = 648
ex = S // 2 + 6
for sx in (-1, 1):
    cx = ex + sx * 78
    fd.ellipse([cx - 44, ey - 34, cx + 44, ey + 34], fill=255)
eyes_glow = face.filter(ImageFilter.GaussianBlur(22))
out.paste(Image.new('RGB', (S, S), (255, 40, 20)), (0, 0), eyes_glow)
out.paste(Image.new('RGB', (S, S), (20, 2, 2)), (0, 0), face)
pup = Image.new('L', (S, S), 0)
pd = ImageDraw.Draw(pup)
for sx in (-1, 1):
    cx = ex + sx * 78
    pd.ellipse([cx - 22, ey - 18, cx + 22, ey + 18], fill=255)
out.paste(Image.new('RGB', (S, S), (255, 70, 30)), (0, 0), pup.filter(ImageFilter.GaussianBlur(3)))
out.paste(Image.new('RGB', (S, S), (255, 210, 150)), (0, 0), pup.filter(ImageFilter.GaussianBlur(1)).point(lambda v: 255 if v > 200 else 0).filter(ImageFilter.MinFilter(9)))

# la boca: la sonrisa del trazo, cosida (puntadas que la cruzan)
mouth = Image.new('L', (S, S), 0)
md = ImageDraw.Draw(mouth)
for x in range(ex - 92, ex + 100, 30):
    ys = [y for y in range(700, 800) if line.getpixel((x, y)) > 0]
    if not ys:
        continue
    yc = (min(ys) + max(ys)) / 2
    md.line([(x - 6, yc - 26), (x + 6, yc + 26)], fill=255, width=9)
out.paste(Image.new('RGB', (S, S), BONE), (0, 0), mouth)

# baba verde que chorrea del borde
drip = Image.new('L', (S, S), 0)
dd = ImageDraw.Draw(drip)
ry = 488
for (dx, ln, w) in [(-120, 92, 30), (-52, 50, 24), (38, 118, 32), (128, 64, 24)]:
    x = S // 2 + 10 + dx
    dd.rounded_rectangle([x - w / 2, ry - 10, x + w / 2, ry + ln], radius=w / 2, fill=255)
    dd.ellipse([x - w * 0.75, ry + ln - w * 0.9, x + w * 0.75, ry + ln + w * 0.6], fill=255)
drip = ImageChops.multiply(drip, body)
out.paste(Image.new('RGB', (S, S), (60, 120, 30)), (0, 0), drip.filter(ImageFilter.GaussianBlur(6)))
out.paste(Image.new('RGB', (S, S), GREEN), (0, 0), drip)

# el trazo de hueso encima de todo (y la bombilla)
out.paste(Image.new('RGB', (S, S), BONE), (0, 0), line.filter(ImageFilter.GaussianBlur(0.8)))

# fuera del círculo, transparente
alpha = circle_mask(R)
out.putalpha(ImageChops.multiply(out.getchannel('A'), alpha))

out.save(OUT + 'icono.png')
sizes = [16, 24, 32, 48, 64, 128, 256]
out.save(OUT + 'icono.ico', sizes=[(s, s) for s in sizes])
# hoja para mirarlo: grande y chico, sobre claro y oscuro
sheet = Image.new('RGBA', (1024 + 40 + 256 + 40, 1024), (40, 40, 44, 255))
sheet.paste(out, (0, 0), out)
x = 1064
y = 20
for s in [256, 128, 64, 48, 32, 24, 16]:
    sm = out.resize((s, s), Image.LANCZOS)
    for j, bgc in enumerate([(40, 40, 44, 255), (235, 235, 235, 255)]):
        tile = Image.new('RGBA', (s + 8, s + 8), bgc)
        tile.paste(sm, (4, 4), sm)
        sheet.paste(tile, (x + j * (s + 14) if s < 128 else x, y + (0 if s < 128 or j == 0 else 0)))
    y += s + 16
sheet.save(OUT + 'hoja.png')
print('ok')

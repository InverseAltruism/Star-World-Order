#!/usr/bin/env python3
"""Generate 60 companion sprite PNGs for Star Sanctuary.

10 constellations × 6 moods = 60 sprites at 32×32 transparent PNG.
Based on the purple_skrumpey.png reference style.
"""
from PIL import Image
import os

SIZE = 32
T = (0, 0, 0, 0)

# Base palette extracted from reference purple_skrumpey.png
C_OUTLINE = (85, 40, 105, 255)
C_BODY = (144, 100, 164, 255)
C_HIGHLIGHT = (174, 110, 204, 255)
C_SHADOW = (101, 61, 119, 255)
C_EYE_BLK = (20, 20, 30, 255)
C_EYE_WHT = (220, 220, 230, 255)
C_EYE_CYN = (119, 252, 253, 255)
C_EYE_PNK = (255, 136, 156, 255)
C_MOUTH = (50, 35, 65, 255)
C_MOUTH_INNER = (30, 15, 40, 255)

# Constellation accent colors from SANCTUARY_STYLE_DOCTRINE.md §3
CONSTELLATIONS = {
    'aether':   ((232, 224, 255), (200, 190, 240)),
    'spectra':  ((255, 102, 170), (102, 187, 255)),
    'solveil':  ((255, 215, 0),   (255, 180, 50)),
    'nebulu':   ((176, 136, 255), (140, 100, 220)),
    'chroma':   ((255, 68, 102),  (68, 255, 136)),
    'rose':     ((255, 136, 170), (255, 170, 200)),
    'monflare': ((255, 153, 68),  (255, 120, 40)),
    'auracore': ((68, 221, 187),  (40, 180, 150)),
    'parallel': ((68, 136, 255),  (40, 100, 220)),
    'prime':    ((255, 215, 0),   (153, 102, 255)),
}

MOODS = ['idle', 'happy', 'excited', 'calm', 'sleepy', 'curious']

# Body shape: y -> (left_outline_x, right_outline_x)
BODY_SHAPE = {
    8:  (12, 20),
    9:  (11, 21),
    10: (10, 22),
    11: (9, 23),
    12: (8, 24),
    13: (8, 24),
    14: (8, 24),
    15: (8, 24),
    16: (9, 23),
    17: (9, 23),
    18: (10, 22),
    19: (10, 22),
    20: (11, 21),
    21: (12, 20),
}


def px(img, x, y, color):
    if 0 <= x < SIZE and 0 <= y < SIZE:
        c = color if len(color) == 4 else (*color, 255)
        img.putpixel((x, y), c)


def draw_glow(img, accent):
    glow = (accent[0], accent[1], accent[2], 45)
    for y, (lx, rx) in BODY_SHAPE.items():
        for dy in (-1, 0, 1):
            px(img, lx - 1, y + dy, glow)
            px(img, rx + 1, y + dy, glow)
    for x in range(12, 21):
        px(img, x, 7, glow)
        px(img, x, 22, glow)
    for x in range(11, 22):
        px(img, x, 6, (accent[0], accent[1], accent[2], 25))


def draw_body(img):
    # Top/bottom full outline rows
    for x in range(12, 21):
        px(img, x, 8, C_OUTLINE)
    for x in range(12, 21):
        px(img, x, 21, C_OUTLINE)

    for y, (lx, rx) in BODY_SHAPE.items():
        px(img, lx, y, C_OUTLINE)
        px(img, rx, y, C_OUTLINE)
        for x in range(lx + 1, rx):
            px(img, x, y, C_BODY)

    # Highlight band across top inner row
    for x in range(12, 21):
        px(img, x, 9, C_HIGHLIGHT)

    # Shadow on left edges of body
    for y in range(11, 17):
        lx = BODY_SHAPE[y][0]
        px(img, lx + 1, y, C_SHADOW)

    # Highlight on right edges
    for y in range(11, 17):
        rx = BODY_SHAPE[y][1]
        px(img, rx - 1, y, C_HIGHLIGHT)

    # Bottom highlight for feet hint
    px(img, 13, 20, C_HIGHLIGHT)
    px(img, 14, 20, C_HIGHLIGHT)
    px(img, 18, 20, C_HIGHLIGHT)
    px(img, 19, 20, C_HIGHLIGHT)


def draw_crown(img, accent, accent2):
    px(img, 15, 5, accent)
    px(img, 16, 5, accent)
    px(img, 17, 5, accent)
    px(img, 14, 6, accent)
    px(img, 15, 6, accent2)
    px(img, 16, 6, accent2)
    px(img, 17, 6, accent2)
    px(img, 18, 6, accent)
    px(img, 13, 7, accent)
    px(img, 19, 7, accent)


def draw_ears(img, accent, accent2):
    # Left ear (accent colored)
    px(img, 6, 12, C_OUTLINE)
    px(img, 7, 12, accent)
    px(img, 6, 13, C_OUTLINE)
    px(img, 7, 13, accent2)
    px(img, 6, 14, C_OUTLINE)
    # Right ear
    px(img, 25, 12, accent)
    px(img, 26, 12, C_OUTLINE)
    px(img, 25, 13, accent2)
    px(img, 26, 13, C_OUTLINE)
    px(img, 26, 14, C_OUTLINE)


def draw_standard_eye(img, ex, ey, mirrored):
    if not mirrored:
        px(img, ex, ey, C_EYE_BLK)
        px(img, ex + 1, ey, C_EYE_BLK)
        px(img, ex + 2, ey, C_EYE_WHT)
        px(img, ex, ey + 1, C_EYE_CYN)
        px(img, ex + 1, ey + 1, C_EYE_BLK)
        px(img, ex + 2, ey + 1, C_EYE_BLK)
        px(img, ex, ey + 2, C_EYE_PNK)
        px(img, ex + 1, ey + 2, C_EYE_PNK)
    else:
        px(img, ex, ey, C_EYE_WHT)
        px(img, ex + 1, ey, C_EYE_BLK)
        px(img, ex + 2, ey, C_EYE_BLK)
        px(img, ex, ey + 1, C_EYE_BLK)
        px(img, ex + 1, ey + 1, C_EYE_BLK)
        px(img, ex + 2, ey + 1, C_EYE_CYN)
        px(img, ex + 1, ey + 2, C_EYE_PNK)
        px(img, ex + 2, ey + 2, C_EYE_PNK)


def draw_eyes(img, mood, accent):
    # Left eye top-left: (11, 12), Right eye top-left: (19, 12)
    lex, ley = 11, 12
    rex, rey = 19, 12

    if mood == 'idle':
        draw_standard_eye(img, lex, ley, False)
        draw_standard_eye(img, rex, rey, True)

    elif mood == 'happy':
        # ^_^ curved closed eyes
        px(img, lex + 1, ley, C_EYE_BLK)
        px(img, lex, ley + 1, C_EYE_BLK)
        px(img, lex + 2, ley + 1, C_EYE_BLK)
        px(img, rex + 1, rey, C_EYE_BLK)
        px(img, rex, rey + 1, C_EYE_BLK)
        px(img, rex + 2, rey + 1, C_EYE_BLK)

    elif mood == 'excited':
        # Wide sparkly eyes with accent-colored reflections
        a = (*accent, 255) if len(accent) == 3 else accent
        # Left
        px(img, lex, ley, C_EYE_WHT)
        px(img, lex + 1, ley, C_EYE_BLK)
        px(img, lex + 2, ley, C_EYE_WHT)
        px(img, lex, ley + 1, C_EYE_CYN)
        px(img, lex + 1, ley + 1, C_EYE_BLK)
        px(img, lex + 2, ley + 1, C_EYE_BLK)
        px(img, lex, ley + 2, a)
        px(img, lex + 1, ley + 2, a)
        px(img, lex + 2, ley + 2, a)
        # Right
        px(img, rex, rey, C_EYE_WHT)
        px(img, rex + 1, rey, C_EYE_BLK)
        px(img, rex + 2, rey, C_EYE_WHT)
        px(img, rex, rey + 1, C_EYE_BLK)
        px(img, rex + 1, rey + 1, C_EYE_BLK)
        px(img, rex + 2, rey + 1, C_EYE_CYN)
        px(img, rex, rey + 2, a)
        px(img, rex + 1, rey + 2, a)
        px(img, rex + 2, rey + 2, a)

    elif mood == 'calm':
        # Half-closed serene eyes (only bottom row visible)
        px(img, lex, ley + 1, C_EYE_BLK)
        px(img, lex + 1, ley + 1, C_EYE_BLK)
        px(img, lex + 2, ley + 1, C_EYE_BLK)
        px(img, rex, rey + 1, C_EYE_BLK)
        px(img, rex + 1, rey + 1, C_EYE_BLK)
        px(img, rex + 2, rey + 1, C_EYE_BLK)

    elif mood == 'sleepy':
        # Closed flat lines
        px(img, lex, ley + 1, C_EYE_BLK)
        px(img, lex + 1, ley + 1, C_EYE_BLK)
        px(img, lex + 2, ley + 1, C_EYE_BLK)
        px(img, rex, rey + 1, C_EYE_BLK)
        px(img, rex + 1, rey + 1, C_EYE_BLK)
        px(img, rex + 2, rey + 1, C_EYE_BLK)

    elif mood == 'curious':
        # Left eye normal, right eye smaller (looking sideways)
        draw_standard_eye(img, lex, ley, False)
        # Right eye: small 2-pixel eye
        px(img, rex + 1, rey + 1, C_EYE_BLK)
        px(img, rex + 2, rey + 1, C_EYE_BLK)
        px(img, rex + 2, rey, C_EYE_WHT)


def draw_mouth(img, mood):
    cx = 16

    if mood == 'idle':
        px(img, cx - 1, 17, C_MOUTH)
        px(img, cx, 17, C_MOUTH)

    elif mood == 'happy':
        px(img, cx - 2, 16, C_MOUTH)
        px(img, cx - 1, 17, C_MOUTH)
        px(img, cx, 17, C_MOUTH)
        px(img, cx + 1, 17, C_MOUTH)
        px(img, cx + 2, 16, C_MOUTH)

    elif mood == 'excited':
        px(img, cx - 1, 16, C_MOUTH)
        px(img, cx, 16, C_MOUTH)
        px(img, cx + 1, 16, C_MOUTH)
        px(img, cx - 1, 17, C_MOUTH)
        px(img, cx + 1, 17, C_MOUTH)
        px(img, cx - 1, 18, C_MOUTH)
        px(img, cx, 18, C_MOUTH)
        px(img, cx + 1, 18, C_MOUTH)
        # Inner mouth
        px(img, cx, 17, C_MOUTH_INNER)

    elif mood == 'calm':
        px(img, cx - 1, 17, C_MOUTH)
        px(img, cx, 17, C_MOUTH)
        px(img, cx + 1, 17, C_MOUTH)

    elif mood == 'sleepy':
        px(img, cx, 17, C_MOUTH)
        px(img, cx + 1, 17, C_MOUTH)

    elif mood == 'curious':
        px(img, cx, 17, C_MOUTH)
        px(img, cx + 1, 17, C_MOUTH)
        px(img, cx + 2, 16, C_MOUTH)


def draw_cheeks(img, mood, accent):
    if mood in ('happy', 'excited', 'calm'):
        blush = (accent[0], accent[1], accent[2], 140)
        px(img, 10, 15, blush)
        px(img, 11, 15, blush)
        px(img, 21, 15, blush)
        px(img, 22, 15, blush)


def draw_mood_extras(img, mood, accent):
    a = (*accent, 255) if len(accent) == 3 else accent

    if mood == 'sleepy':
        # zzz marks floating to the right
        px(img, 25, 8, a)
        px(img, 26, 7, a)
        px(img, 27, 8, a)
        # Smaller z
        px(img, 27, 10, a)
        px(img, 28, 9, a)

    elif mood == 'excited':
        # Sparkle star mark
        px(img, 26, 9, a)
        px(img, 25, 10, a)
        px(img, 27, 10, a)
        px(img, 26, 11, a)

    elif mood == 'curious':
        # ? mark above head
        px(img, 22, 5, a)
        px(img, 23, 4, a)
        px(img, 24, 4, a)
        px(img, 24, 5, a)
        px(img, 23, 6, a)
        px(img, 23, 8, a)


def create_sprite(constellation, mood):
    img = Image.new('RGBA', (SIZE, SIZE), T)
    accent1, accent2 = CONSTELLATIONS[constellation]
    a1 = (*accent1, 255)
    a2 = (*accent2, 255)

    draw_glow(img, accent1)
    draw_body(img)
    draw_crown(img, a1, a2)
    draw_ears(img, a1, a2)
    draw_eyes(img, mood, accent1)
    draw_mouth(img, mood)
    draw_cheeks(img, mood, accent1)
    draw_mood_extras(img, mood, accent1)

    return img


def main():
    out_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'public', 'sanctuary', 'companions'
    )
    total = 0
    max_size = 0

    for constellation in CONSTELLATIONS:
        dir_path = os.path.join(out_dir, constellation)
        os.makedirs(dir_path, exist_ok=True)

        for mood in MOODS:
            img = create_sprite(constellation, mood)
            file_path = os.path.join(dir_path, f'{mood}.png')
            img.save(file_path, 'PNG', optimize=True)
            fsize = os.path.getsize(file_path)
            max_size = max(max_size, fsize)
            total += 1

    print(f"Generated {total} sprites in {out_dir}")
    print(f"Max file size: {max_size} bytes ({max_size/1024:.1f} KB)")


if __name__ == '__main__':
    main()

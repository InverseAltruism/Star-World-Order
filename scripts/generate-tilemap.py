#!/usr/bin/env python3
"""Generate a synthwave-themed tileset PNG and Tiled-format tilemap JSON for Sanctuary V2.

Map: 40x30 tiles at 16px = 640x480
Zones: Town Square (center hub) + 8 surrounding locations
Camera zoom 2x means viewport ~512x288, allowing meaningful scroll.
"""

import json
import os
from PIL import Image, ImageDraw

TILE_SIZE = 16
TILESET_COLS = 16
MAP_W, MAP_H = 40, 30

# --- Color palette (synthwave doctrine) ---
C_VOID       = (10, 0, 21)        # #0a0015 deep space
C_GROUND     = (26, 0, 51)        # #1a0033 space ground
C_GROUND2    = (20, 5, 40)        # slightly different ground
C_PATH       = (60, 30, 90)       # purple path
C_PATH_EDGE  = (45, 20, 70)       # path border
C_WATER      = (0, 80, 140)       # deep blue water
C_WATER_HI   = (0, 120, 180)      # water highlight
C_WALL       = (40, 15, 60)       # wall/collision
C_WALL_TOP   = (55, 25, 80)       # wall top edge
C_TREE_TRUNK = (50, 20, 40)       # tree trunk
C_TREE_LEAF  = (100, 0, 180)      # purple tree canopy
C_TREE_LEAF2 = (130, 30, 200)     # lighter canopy
C_ROCK       = (60, 40, 70)       # rock
C_ROCK_HI    = (80, 55, 90)       # rock highlight

# Zone accent colors
C_TOWN       = (153, 102, 255)    # #9966ff purple (Town Square)
C_HOTSPRING  = (0, 180, 220)      # cyan/teal
C_TRAINING   = (255, 68, 68)      # red
C_GARDEN     = (68, 255, 136)     # green
C_LIBRARY    = (176, 136, 255)    # lavender
C_KITCHEN    = (255, 153, 68)     # orange
C_HOLLOW     = (100, 80, 200)     # deep purple
C_FORGE      = (255, 100, 50)     # flame
C_OBSERVATORY= (255, 215, 0)      # gold

C_SPAWN_MARK = (0, 247, 255)      # #00f7ff neon cyan


def draw_tile(draw: ImageDraw.Draw, tx: int, ty: int, fill, pattern=None, accent=None):
    """Draw a 16x16 tile at tileset position (tx, ty)."""
    x0, y0 = tx * TILE_SIZE, ty * TILE_SIZE
    draw.rectangle([x0, y0, x0 + 15, y0 + 15], fill=fill)

    if pattern == 'dots':
        for dx, dy in [(3,3),(11,7),(7,12),(14,2)]:
            c = accent or tuple(min(v+30,255) for v in fill)
            draw.point((x0+dx, y0+dy), fill=c)
    elif pattern == 'cross':
        c = accent or tuple(min(v+40,255) for v in fill)
        draw.line([(x0+7, y0+2), (x0+7, y0+13)], fill=c)
        draw.line([(x0+2, y0+7), (x0+13, y0+7)], fill=c)
    elif pattern == 'border_top':
        c = accent or tuple(min(v+30,255) for v in fill)
        draw.line([(x0, y0), (x0+15, y0)], fill=c)
    elif pattern == 'border_left':
        c = accent or tuple(min(v+30,255) for v in fill)
        draw.line([(x0, y0), (x0, y0+15)], fill=c)
    elif pattern == 'waves':
        c = accent or C_WATER_HI
        for row in [4, 10]:
            for col in range(0, 16, 4):
                draw.point((x0+col, y0+row), fill=c)
                draw.point((x0+col+1, y0+row-1), fill=c)
    elif pattern == 'bricks':
        c = accent or tuple(min(v+20,255) for v in fill)
        draw.line([(x0, y0+4), (x0+15, y0+4)], fill=c)
        draw.line([(x0, y0+11), (x0+15, y0+11)], fill=c)
        draw.line([(x0+8, y0), (x0+8, y0+4)], fill=c)
        draw.line([(x0+4, y0+4), (x0+4, y0+11)], fill=c)
        draw.line([(x0+12, y0+11), (x0+12, y0+15)], fill=c)
    elif pattern == 'tree':
        draw.rectangle([x0+6, y0+10, x0+9, y0+15], fill=C_TREE_TRUNK)
        draw.ellipse([x0+2, y0+1, x0+13, y0+11], fill=C_TREE_LEAF)
        draw.ellipse([x0+4, y0+2, x0+11, y0+8], fill=C_TREE_LEAF2)
    elif pattern == 'rock':
        draw.polygon([(x0+3,y0+14),(x0+8,y0+3),(x0+13,y0+14)], fill=C_ROCK)
        draw.polygon([(x0+5,y0+12),(x0+8,y0+5),(x0+11,y0+12)], fill=C_ROCK_HI)
    elif pattern == 'spawn':
        draw.rectangle([x0+2, y0+2, x0+13, y0+13], fill=fill)
        draw.rectangle([x0+4, y0+4, x0+11, y0+11], outline=C_SPAWN_MARK)
        draw.point((x0+7, y0+7), fill=C_SPAWN_MARK)
        draw.point((x0+8, y0+8), fill=C_SPAWN_MARK)
    elif pattern == 'zone_marker':
        c = accent or C_TOWN
        draw.rectangle([x0+1, y0+1, x0+14, y0+14], outline=c)
        draw.rectangle([x0+3, y0+3, x0+12, y0+12], outline=c)
        inner = tuple(min(v+20,255) for v in fill)
        draw.rectangle([x0+5, y0+5, x0+10, y0+10], fill=inner)
    elif pattern == 'star':
        c = accent or C_OBSERVATORY
        pts = [(x0+8,y0+1),(x0+10,y0+6),(x0+15,y0+6),(x0+11,y0+9),
               (x0+13,y0+14),(x0+8,y0+11),(x0+3,y0+14),(x0+5,y0+9),
               (x0+1,y0+6),(x0+6,y0+6)]
        draw.polygon(pts, fill=c)


def create_tileset():
    """Create an 16-column tileset image. Each tile is 16x16."""
    # We need about 32 tiles. 16 cols x 4 rows = 64 slots, plenty.
    rows = 4
    img = Image.new('RGB', (TILESET_COLS * TILE_SIZE, rows * TILE_SIZE), C_VOID)
    draw = ImageDraw.Draw(img)

    # Row 0: Base terrain
    # 0: void/empty
    draw_tile(draw, 0, 0, C_VOID)
    # 1: space ground
    draw_tile(draw, 1, 0, C_GROUND, 'dots')
    # 2: space ground variant
    draw_tile(draw, 2, 0, C_GROUND2, 'dots')
    # 3: path center
    draw_tile(draw, 3, 0, C_PATH)
    # 4: path edge (top)
    draw_tile(draw, 4, 0, C_PATH, 'border_top', C_PATH_EDGE)
    # 5: water
    draw_tile(draw, 5, 0, C_WATER, 'waves')
    # 6: wall
    draw_tile(draw, 6, 0, C_WALL, 'bricks')
    # 7: tree
    draw_tile(draw, 7, 0, C_GROUND, 'tree')
    # 8: rock
    draw_tile(draw, 8, 0, C_GROUND, 'rock')
    # 9: spawn marker
    draw_tile(draw, 9, 0, C_PATH, 'spawn')
    # 10: path with left border
    draw_tile(draw, 10, 0, C_PATH, 'border_left', C_PATH_EDGE)
    # 11: wall top
    draw_tile(draw, 11, 0, C_WALL, 'border_top', C_WALL_TOP)
    # 12-15: reserved
    for i in range(12, 16):
        draw_tile(draw, i, 0, C_VOID)

    # Row 1: Zone floors (one per zone)
    # 16: Town Square floor
    draw_tile(draw, 0, 1, C_TOWN, 'cross')
    # 17: Hot Springs floor
    draw_tile(draw, 1, 1, C_HOTSPRING, 'waves')
    # 18: Training Grounds floor
    draw_tile(draw, 2, 1, C_TRAINING, 'dots')
    # 19: Star Garden floor
    draw_tile(draw, 3, 1, C_GARDEN, 'dots')
    # 20: Cosmic Library floor
    draw_tile(draw, 4, 1, C_LIBRARY, 'bricks')
    # 21: Nebula Kitchen floor
    draw_tile(draw, 5, 1, C_KITCHEN, 'dots')
    # 22: Dream Hollow floor
    draw_tile(draw, 6, 1, C_HOLLOW, 'dots')
    # 23: Aura Forge floor
    draw_tile(draw, 7, 1, C_FORGE, 'dots')
    # 24: Observatory floor
    draw_tile(draw, 8, 1, C_OBSERVATORY, 'star')
    # 25-31: reserved
    for i in range(9, 16):
        draw_tile(draw, i, 1, C_VOID)

    # Row 2: Zone markers / decorations
    # 32: Town Square marker
    draw_tile(draw, 0, 2, C_PATH, 'zone_marker', C_TOWN)
    # 33: Hot Springs marker
    draw_tile(draw, 1, 2, C_GROUND, 'zone_marker', C_HOTSPRING)
    # 34: Training marker
    draw_tile(draw, 2, 2, C_GROUND, 'zone_marker', C_TRAINING)
    # 35: Garden marker
    draw_tile(draw, 3, 2, C_GROUND, 'zone_marker', C_GARDEN)
    # 36: Library marker
    draw_tile(draw, 4, 2, C_GROUND, 'zone_marker', C_LIBRARY)
    # 37: Kitchen marker
    draw_tile(draw, 5, 2, C_GROUND, 'zone_marker', C_KITCHEN)
    # 38: Hollow marker
    draw_tile(draw, 6, 2, C_GROUND, 'zone_marker', C_HOLLOW)
    # 39: Forge marker
    draw_tile(draw, 7, 2, C_GROUND, 'zone_marker', C_FORGE)
    # 40: Observatory marker
    draw_tile(draw, 8, 2, C_GROUND, 'zone_marker', C_OBSERVATORY)
    # 41-47: reserved
    for i in range(9, 16):
        draw_tile(draw, i, 2, C_VOID)

    # Row 3: Extra decorations
    # 48: path horizontal
    draw_tile(draw, 0, 3, C_PATH, 'border_top', C_PATH_EDGE)
    # 49: path vertical
    draw_tile(draw, 1, 3, C_PATH, 'border_left', C_PATH_EDGE)
    # 50: water deep
    draw_tile(draw, 2, 3, (0, 50, 100), 'waves')
    # 51: star decoration (ground)
    draw_tile(draw, 3, 3, C_GROUND, 'star', (200, 180, 255))
    # 52-63: reserved
    for i in range(4, 16):
        draw_tile(draw, i, 3, C_VOID)

    return img


# Tile ID constants (1-indexed for Tiled format, 0 = empty)
T_VOID = 0
T_GROUND = 2      # tile index 1, Tiled GID = 2
T_GROUND2 = 3     # tile index 2
T_PATH = 4        # tile index 3
T_PATH_TOP = 5    # tile index 4
T_WATER = 6       # tile index 5
T_WALL = 7        # tile index 6
T_TREE = 8        # tile index 7
T_ROCK = 9        # tile index 8
T_SPAWN = 10      # tile index 9
T_PATH_LEFT = 11  # tile index 10
T_WALL_TOP = 12   # tile index 11

T_TOWN_FLOOR = 17
T_HOTSPRING_FLOOR = 18
T_TRAINING_FLOOR = 19
T_GARDEN_FLOOR = 20
T_LIBRARY_FLOOR = 21
T_KITCHEN_FLOOR = 22
T_HOLLOW_FLOOR = 23
T_FORGE_FLOOR = 24
T_OBSERVATORY_FLOOR = 25

T_TOWN_MARKER = 33
T_HOTSPRING_MARKER = 34
T_TRAINING_MARKER = 35
T_GARDEN_MARKER = 36
T_LIBRARY_MARKER = 37
T_KITCHEN_MARKER = 38
T_HOLLOW_MARKER = 39
T_FORGE_MARKER = 40
T_OBSERVATORY_MARKER = 41

T_STAR_DECO = 52


def make_ground_layer():
    """Base ground layer - fills the whole map with ground tiles."""
    data = []
    for row in range(MAP_H):
        for col in range(MAP_W):
            # Alternate ground tiles for visual variety
            if (row + col) % 7 == 0:
                data.append(T_GROUND2)
            else:
                data.append(T_GROUND)
    return data


def fill_rect(data, x, y, w, h, tile):
    """Fill a rectangular area in the map data."""
    for row in range(y, min(y + h, MAP_H)):
        for col in range(x, min(x + w, MAP_W)):
            data[row * MAP_W + col] = tile


def draw_path_h(data, x1, x2, y):
    """Draw a horizontal path."""
    for col in range(min(x1, x2), max(x1, x2) + 1):
        if 0 <= y < MAP_H and 0 <= col < MAP_W:
            data[y * MAP_W + col] = T_PATH
            if y - 1 >= 0:
                data[(y-1) * MAP_W + col] = T_PATH


def draw_path_v(data, x, y1, y2):
    """Draw a vertical path."""
    for row in range(min(y1, y2), max(y1, y2) + 1):
        if 0 <= row < MAP_H and 0 <= x < MAP_W:
            data[row * MAP_W + x] = T_PATH
            if x + 1 < MAP_W:
                data[row * MAP_W + (x+1)] = T_PATH


def set_tile(data, x, y, tile):
    if 0 <= x < MAP_W and 0 <= y < MAP_H:
        data[y * MAP_W + x] = tile


def make_detail_layer():
    """Detail layer with zone floors, paths, water, decorations."""
    data = [T_VOID] * (MAP_W * MAP_H)

    # --- Zone definitions: (x, y, w, h, floor_tile, marker_tile) ---
    zones = {
        'town':        (16, 11, 8, 8, T_TOWN_FLOOR, T_TOWN_MARKER),
        'hotsprings':  (2,  2,  8, 6, T_HOTSPRING_FLOOR, T_HOTSPRING_MARKER),
        'observatory': (16, 1,  8, 6, T_OBSERVATORY_FLOOR, T_OBSERVATORY_MARKER),
        'library':     (30, 2,  8, 6, T_LIBRARY_FLOOR, T_LIBRARY_MARKER),
        'garden':      (1,  12, 8, 6, T_GARDEN_FLOOR, T_GARDEN_MARKER),
        'forge':       (31, 12, 8, 6, T_FORGE_FLOOR, T_FORGE_MARKER),
        'training':    (2,  22, 8, 6, T_TRAINING_FLOOR, T_TRAINING_MARKER),
        'hollow':      (16, 23, 8, 6, T_HOLLOW_FLOOR, T_HOLLOW_MARKER),
        'kitchen':     (30, 22, 8, 6, T_KITCHEN_FLOOR, T_KITCHEN_MARKER),
    }

    # Fill zone floors
    for name, (zx, zy, zw, zh, floor, marker) in zones.items():
        fill_rect(data, zx, zy, zw, zh, floor)
        # Place marker at center of zone
        cx, cy = zx + zw // 2, zy + zh // 2
        set_tile(data, cx, cy, marker)

    # Place spawn marker at Town Square center
    set_tile(data, 20, 15, T_SPAWN)

    # --- Paths from Town Square to each zone ---
    tc_x, tc_y = 20, 15  # Town center

    # North path: Town → Observatory
    draw_path_v(data, tc_x, 7, tc_y - 1)

    # South path: Town → Dream Hollow
    draw_path_v(data, tc_x, tc_y + 1, 22)

    # West path: Town → Star Garden
    draw_path_h(data, 9, tc_x - 1, tc_y)

    # East path: Town → Aura Forge
    draw_path_h(data, tc_x + 1, 30, tc_y)

    # NW diagonal path: Town → Hot Springs (via L-shape)
    draw_path_h(data, 10, tc_x - 1, 10)
    draw_path_v(data, 10, 8, 10)
    # Connector from north path
    draw_path_h(data, 10, tc_x, 10)

    # NE diagonal path: Town → Cosmic Library (via L-shape)
    draw_path_h(data, tc_x + 1, 30, 10)
    draw_path_v(data, 30, 8, 10)

    # SW diagonal path: Town → Training Grounds (via L-shape)
    draw_path_h(data, 10, tc_x - 1, 20)
    draw_path_v(data, 10, 20, 21)
    # Connector from south path
    draw_path_h(data, 10, tc_x, 20)

    # SE diagonal path: Town → Nebula Kitchen (via L-shape)
    draw_path_h(data, tc_x + 1, 30, 20)
    draw_path_v(data, 30, 20, 21)

    # --- Water features ---
    # Hot Springs has water
    fill_rect(data, 4, 4, 3, 2, T_WATER)

    # Star Garden has a small pond
    fill_rect(data, 3, 14, 2, 2, T_WATER)

    # --- Scatter star decorations on ground ---
    import random
    random.seed(42)
    for _ in range(15):
        sx = random.randint(0, MAP_W - 1)
        sy = random.randint(0, MAP_H - 1)
        if data[sy * MAP_W + sx] == T_VOID:
            data[sy * MAP_W + sx] = T_STAR_DECO

    return data


def make_collision_layer():
    """Collision layer: walls around zones, trees, rocks as obstacles."""
    data = [T_VOID] * (MAP_W * MAP_H)

    # Map border walls
    for col in range(MAP_W):
        set_tile(data, col, 0, T_WALL)
        set_tile(data, col, MAP_H - 1, T_WALL)
    for row in range(MAP_H):
        set_tile(data, 0, row, T_WALL)
        set_tile(data, MAP_W - 1, row, T_WALL)

    # Zone border walls (outline each zone with walls, leaving gap for path entry)
    zones_bounds = {
        'hotsprings':  (2,  2,  8, 6),
        'observatory': (16, 1,  8, 6),
        'library':     (30, 2,  8, 6),
        'garden':      (1,  12, 8, 6),
        'forge':       (31, 12, 8, 6),
        'training':    (2,  22, 8, 6),
        'hollow':      (16, 23, 8, 6),
        'kitchen':     (30, 22, 8, 6),
    }

    for name, (zx, zy, zw, zh) in zones_bounds.items():
        # Top wall
        for col in range(zx, zx + zw):
            set_tile(data, col, zy - 1, T_WALL)
        # Bottom wall
        for col in range(zx, zx + zw):
            set_tile(data, col, zy + zh, T_WALL)
        # Left wall
        for row in range(zy - 1, zy + zh + 1):
            set_tile(data, zx - 1, row, T_WALL)
        # Right wall
        for row in range(zy - 1, zy + zh + 1):
            set_tile(data, zx + zw, row, T_WALL)

    # Clear wall tiles where paths enter zones (create doorways)
    doorways = [
        # Hot Springs: entry from south-east
        (10, 8), (11, 8),
        # Observatory: entry from south
        (20, 7), (21, 7),
        # Library: entry from south-west
        (30, 8), (29, 8),
        # Garden: entry from east
        (9, 14), (9, 15),
        # Forge: entry from west
        (31, 14), (31, 15),  # Note: wall is at 30
        # Training: entry from north-east
        (10, 21), (11, 21),
        # Hollow: entry from north
        (20, 22), (21, 22),
        # Kitchen: entry from north-west
        (30, 21), (29, 21),
    ]

    for dx, dy in doorways:
        set_tile(data, dx, dy, T_VOID)

    # Scatter trees and rocks in open areas
    import random
    random.seed(123)
    obstacles = []
    for _ in range(40):
        ox = random.randint(1, MAP_W - 2)
        oy = random.randint(1, MAP_H - 2)
        obstacles.append((ox, oy))

    # Only place obstacles on empty ground (not on paths, zones, or existing walls)
    detail = make_detail_layer()
    for ox, oy in obstacles:
        idx = oy * MAP_W + ox
        if data[idx] == T_VOID and detail[idx] == T_VOID:
            tile = T_TREE if random.random() > 0.4 else T_ROCK
            set_tile(data, ox, oy, tile)

    return data


def make_tilemap_json(ground, detail, collision):
    """Build Tiled-format JSON."""
    return {
        "compressionlevel": -1,
        "height": MAP_H,
        "infinite": False,
        "layers": [
            {
                "data": ground,
                "height": MAP_H,
                "id": 1,
                "name": "Ground",
                "opacity": 1,
                "type": "tilelayer",
                "visible": True,
                "width": MAP_W,
                "x": 0,
                "y": 0
            },
            {
                "data": detail,
                "height": MAP_H,
                "id": 2,
                "name": "Detail",
                "opacity": 1,
                "type": "tilelayer",
                "visible": True,
                "width": MAP_W,
                "x": 0,
                "y": 0
            },
            {
                "data": collision,
                "height": MAP_H,
                "id": 3,
                "name": "Collision",
                "opacity": 1,
                "type": "tilelayer",
                "visible": True,
                "width": MAP_W,
                "x": 0,
                "y": 0
            },
            {
                "objects": [
                    {
                        "height": 16,
                        "id": 1,
                        "name": "spawn",
                        "rotation": 0,
                        "type": "spawn",
                        "visible": True,
                        "width": 16,
                        "x": 20 * TILE_SIZE,
                        "y": 15 * TILE_SIZE
                    },
                    {
                        "height": 16, "id": 2, "name": "Hot Springs",
                        "type": "zone", "visible": True, "width": 16,
                        "x": 6 * TILE_SIZE, "y": 5 * TILE_SIZE,
                        "properties": [{"name": "zoneId", "type": "string", "value": "hotsprings"}]
                    },
                    {
                        "height": 16, "id": 3, "name": "Observatory",
                        "type": "zone", "visible": True, "width": 16,
                        "x": 20 * TILE_SIZE, "y": 4 * TILE_SIZE,
                        "properties": [{"name": "zoneId", "type": "string", "value": "observatory"}]
                    },
                    {
                        "height": 16, "id": 4, "name": "Cosmic Library",
                        "type": "zone", "visible": True, "width": 16,
                        "x": 34 * TILE_SIZE, "y": 5 * TILE_SIZE,
                        "properties": [{"name": "zoneId", "type": "string", "value": "library"}]
                    },
                    {
                        "height": 16, "id": 5, "name": "Star Garden",
                        "type": "zone", "visible": True, "width": 16,
                        "x": 5 * TILE_SIZE, "y": 15 * TILE_SIZE,
                        "properties": [{"name": "zoneId", "type": "string", "value": "garden"}]
                    },
                    {
                        "height": 16, "id": 6, "name": "Aura Forge",
                        "type": "zone", "visible": True, "width": 16,
                        "x": 35 * TILE_SIZE, "y": 15 * TILE_SIZE,
                        "properties": [{"name": "zoneId", "type": "string", "value": "forge"}]
                    },
                    {
                        "height": 16, "id": 7, "name": "Training Grounds",
                        "type": "zone", "visible": True, "width": 16,
                        "x": 6 * TILE_SIZE, "y": 25 * TILE_SIZE,
                        "properties": [{"name": "zoneId", "type": "string", "value": "training"}]
                    },
                    {
                        "height": 16, "id": 8, "name": "Dream Hollow",
                        "type": "zone", "visible": True, "width": 16,
                        "x": 20 * TILE_SIZE, "y": 26 * TILE_SIZE,
                        "properties": [{"name": "zoneId", "type": "string", "value": "hollow"}]
                    },
                    {
                        "height": 16, "id": 9, "name": "Nebula Kitchen",
                        "type": "zone", "visible": True, "width": 16,
                        "x": 34 * TILE_SIZE, "y": 25 * TILE_SIZE,
                        "properties": [{"name": "zoneId", "type": "string", "value": "kitchen"}]
                    }
                ],
                "id": 4,
                "name": "Objects",
                "opacity": 1,
                "type": "objectgroup",
                "visible": True,
                "x": 0,
                "y": 0
            }
        ],
        "nextlayerid": 5,
        "nextobjectid": 10,
        "orientation": "orthogonal",
        "renderorder": "right-down",
        "tiledversion": "1.10.2",
        "tileheight": TILE_SIZE,
        "tilesets": [
            {
                "columns": TILESET_COLS,
                "firstgid": 1,
                "image": "tileset.png",
                "imageheight": 4 * TILE_SIZE,
                "imagewidth": TILESET_COLS * TILE_SIZE,
                "margin": 0,
                "name": "sanctuary",
                "spacing": 0,
                "tilecount": TILESET_COLS * 4,
                "tileheight": TILE_SIZE,
                "tilewidth": TILE_SIZE
            }
        ],
        "tilewidth": TILE_SIZE,
        "type": "map",
        "version": "1.10",
        "width": MAP_W
    }


def main():
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'public', 'sanctuary')
    os.makedirs(out_dir, exist_ok=True)

    # Generate tileset PNG
    tileset_img = create_tileset()
    tileset_path = os.path.join(out_dir, 'tileset.png')
    tileset_img.save(tileset_path)
    print(f"Tileset saved: {tileset_path} ({tileset_img.size[0]}x{tileset_img.size[1]})")

    # Generate tilemap layers
    ground = make_ground_layer()
    detail = make_detail_layer()
    collision = make_collision_layer()

    # Build and save tilemap JSON
    tilemap = make_tilemap_json(ground, detail, collision)
    tilemap_path = os.path.join(out_dir, 'world-map.json')
    with open(tilemap_path, 'w') as f:
        json.dump(tilemap, f, indent=2)
    print(f"Tilemap saved: {tilemap_path}")

    # Print zone summary
    print("\nMap zones (40×30 @ 16px = 640×480):")
    zones = [
        ("Town Square",      16, 11, 8, 8),
        ("Hot Springs",       2,  2, 8, 6),
        ("Observatory",      16,  1, 8, 6),
        ("Cosmic Library",   30,  2, 8, 6),
        ("Star Garden",       1, 12, 8, 6),
        ("Aura Forge",       31, 12, 8, 6),
        ("Training Grounds",  2, 22, 8, 6),
        ("Dream Hollow",     16, 23, 8, 6),
        ("Nebula Kitchen",   30, 22, 8, 6),
    ]
    for name, x, y, w, h in zones:
        print(f"  {name:20s} @ ({x},{y}) {w}×{h}")
    print(f"\nSpawn: (20, 15) = Town Square center")


if __name__ == '__main__':
    main()

import os
import zlib
import struct
import math

def create_png(width, height, get_pixel_func):
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # filter type 0 (None)
        for x in range(width):
            r, g, b, a = get_pixel_func(x, y, width, height)
            raw_data.extend([r, g, b, a])
    
    def chunk(tag, data):
        length = struct.pack(">I", len(data))
        crc = struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
        return length + tag + data + crc

    png = bytearray(b"\x89PNG\r\n\x1a\n")
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png.extend(chunk(b"IHDR", ihdr_data))
    png.extend(chunk(b"IDAT", zlib.compress(bytes(raw_data), 9)))
    png.extend(chunk(b"IEND", b""))
    return bytes(png)

def get_cf_recall_pixel(x, y, w, h):
    # Normalized coordinates 0..1
    nx = x / float(w)
    ny = y / float(h)
    cx, cy = 0.5, 0.5
    
    # Distance from center for rounded container
    dx = (nx - cx)
    dy = (ny - cy)
    r = math.sqrt(dx*dx + dy*dy)
    
    # Background: dark sleek slate #181926
    if r > 0.48:
        return (0, 0, 0, 0) # transparent outer
    
    # Border ring
    if r > 0.44:
        return (100, 110, 255, 240)
    
    # Background interior
    bg_r, bg_g, bg_b = 24, 26, 40
    
    # Draw three Codeforces bars:
    # Bar 1 (Yellow / Left): x: 0.22..0.38, y: 0.48..0.76
    # Bar 2 (Blue / Center): x: 0.42..0.58, y: 0.28..0.76
    # Bar 3 (Red / Right):  x: 0.62..0.78, y: 0.38..0.76
    
    # Bar 1: Yellow
    if 0.23 <= nx <= 0.37 and 0.50 <= ny <= 0.74:
        return (255, 204, 0, 255)
    
    # Bar 2: Blue
    if 0.43 <= nx <= 0.57 and 0.28 <= ny <= 0.74:
        return (33, 150, 243, 255)
        
    # Bar 3: Red
    if 0.63 <= nx <= 0.77 and 0.40 <= ny <= 0.74:
        return (244, 67, 54, 255)
        
    # Draw glowing green badge at top left (0.25, 0.28)
    badge_dx = nx - 0.30
    badge_dy = ny - 0.28
    badge_dist = math.sqrt(badge_dx*badge_dx + badge_dy*badge_dy)
    if badge_dist < 0.12:
        return (16, 185, 129, 255) # Emerald solo dot
    if badge_dist < 0.16:
        return (16, 185, 129, 120)

    return (bg_r, bg_g, bg_b, 255)

os.makedirs("cf-recall-extension/icons", exist_ok=True)
for size in [16, 48, 128]:
    img_data = create_png(size, size, get_cf_recall_pixel)
    with open(f"cf-recall-extension/icons/icon{size}.png", "wb") as f:
        f.write(img_data)
    print(f"Generated icon{size}.png ({len(img_data)} bytes)")

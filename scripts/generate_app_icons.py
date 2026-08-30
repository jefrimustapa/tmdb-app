import os
import io
import base64
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def generate_all_icons():
    base_path = 'D:/ai_project/tmdb_stream/icon/PowerToys_Paste_20260830181757.png'
    img = Image.open(base_path).convert('RGBA')

    # 1. Precise circular crop of the base icon
    cx = 516.5
    cy = 490.0
    r = 287.5

    pad = 10
    crop_box = (int(cx - r - pad), int(cy - r - pad), int(cx + r + pad), int(cy + r + pad))
    cropped = img.crop(crop_box)

    scale = 4
    large = cropped.resize((cropped.width * scale, cropped.height * scale), Image.Resampling.BICUBIC)

    mask = Image.new('L', large.size, 0)
    draw = ImageDraw.Draw(mask)
    lcx = (cx - crop_box[0]) * scale
    lcy = (cy - crop_box[1]) * scale
    lr = r * scale

    draw.ellipse((lcx - lr, lcy - lr, lcx + lr, lcy + lr), fill=255)

    masked = Image.new('RGBA', large.size, (0, 0, 0, 0))
    masked.paste(large, (0, 0), mask=mask)
    masked_crop = masked.crop((int(lcx - lr), int(lcy - lr), int(lcx + lr), int(lcy + lr)))

    master_icon = masked_crop.resize((1024, 1024), Image.Resampling.LANCZOS)

    # 2. Save public web assets
    public_dir = 'D:/ai_project/tmdb_stream/public'
    os.makedirs(public_dir, exist_ok=True)

    master_icon.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(public_dir, 'icon.png'))
    master_icon.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(public_dir, 'icon-512.png'))
    master_icon.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join(public_dir, 'icon-192.png'))
    master_icon.resize((64, 64), Image.Resampling.LANCZOS).save(os.path.join(public_dir, 'favicon.png'))

    # Base64 encoded png for favicon.svg
    buf = io.BytesIO()
    master_icon.resize((256, 256), Image.Resampling.LANCZOS).save(buf, format='PNG')
    b64_icon = base64.b64encode(buf.getvalue()).decode('utf-8')

    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <radialGradient id="haloGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#9055ff" stop-opacity="0.4" />
      <stop offset="100%" stop-color="#00d2ff" stop-opacity="0" />
    </radialGradient>
  </defs>
  <circle cx="50" cy="50" r="49" fill="url(#haloGlow)" />
  <image href="data:image/png;base64,{b64_icon}" x="1" y="1" width="98" height="98" />
</svg>
'''
    with open(os.path.join(public_dir, 'favicon.svg'), 'w', encoding='utf-8') as f:
        f.write(svg_content)

    print('[IconGen] Saved public web icons & favicon.svg!')

    # 2.5 Extract pure TMDB Emblem (TM ▶ B) without outer circle for Launcher
    # Emblem is inside radius < 240 from center (516.5, 490.0)
    arr = np.array(img)
    y, x = np.ogrid[:arr.shape[0], :arr.shape[1]]
    dist = np.sqrt((x - cx)**2 + (y - cy)**2)
    inside_ring = dist < 242

    r_ch = arr[:, :, 0].astype(float)
    g_ch = arr[:, :, 1].astype(float)
    b_ch = arr[:, :, 2].astype(float)
    brightness = np.maximum.reduce([r_ch, g_ch, b_ch])

    alpha = np.clip((brightness - 35) / 30.0 * 255.0, 0, 255).astype(np.uint8)
    alpha[~inside_ring] = 0

    emblem_arr = arr.copy()
    emblem_arr[:, :, 3] = alpha
    emblem_full = Image.fromarray(emblem_arr)

    coords = np.argwhere(alpha > 30)
    y_min, x_min = coords.min(axis=0)
    y_max, x_max = coords.max(axis=0)
    emblem_cropped = emblem_full.crop((x_min, y_min, x_max, y_max))

    # Master emblem
    master_emblem = emblem_cropped

    # 3. Save Android mipmap launcher icons (WITHOUT outer circle)
    res_dir = 'D:/ai_project/tmdb_stream/android/app/src/main/res'
    densities = {
        'mdpi': (48, 108),
        'hdpi': (72, 162),
        'xhdpi': (96, 216),
        'xxhdpi': (144, 324),
        'xxxhdpi': (192, 432),
    }

    for density, (icon_sz, fg_sz) in densities.items():
        mipmap_dir = os.path.join(res_dir, f'mipmap-{density}')
        os.makedirs(mipmap_dir, exist_ok=True)
        
        # 3a. ic_launcher.png (Dark solid background with bold centered TMDB emblem)
        launcher_bg = Image.new('RGBA', (icon_sz, icon_sz), (7, 5, 14, 255))
        # Emblem sized to ~76% width
        e_w = int(icon_sz * 0.76)
        e_h = int(e_w * (master_emblem.height / master_emblem.width))
        scaled_e = master_emblem.resize((e_w, e_h), Image.Resampling.LANCZOS)
        e_x = (icon_sz - e_w) // 2
        e_y = (icon_sz - e_h) // 2
        launcher_bg.paste(scaled_e, (e_x, e_y), mask=scaled_e)
        launcher_bg.save(os.path.join(mipmap_dir, 'ic_launcher.png'))
        
        # 3b. ic_launcher_round.png
        round_mask = Image.new('L', (icon_sz, icon_sz), 0)
        r_draw = ImageDraw.Draw(round_mask)
        r_draw.ellipse((0, 0, icon_sz - 1, icon_sz - 1), fill=255)
        launcher_round = Image.new('RGBA', (icon_sz, icon_sz), (0, 0, 0, 0))
        launcher_round.paste(launcher_bg, (0, 0), mask=round_mask)
        launcher_round.save(os.path.join(mipmap_dir, 'ic_launcher_round.png'))
        
        # 3c. ic_launcher_foreground.png (for adaptive icons, centered in safe 66% viewport)
        fg_img = Image.new('RGBA', (fg_sz, fg_sz), (0, 0, 0, 0))
        fg_w = int(fg_sz * 0.65)
        fg_h = int(fg_w * (master_emblem.height / master_emblem.width))
        scaled_fg = master_emblem.resize((fg_w, fg_h), Image.Resampling.LANCZOS)
        fg_x = (fg_sz - fg_w) // 2
        fg_y = (fg_sz - fg_h) // 2
        fg_img.paste(scaled_fg, (fg_x, fg_y), mask=scaled_fg)
        fg_img.save(os.path.join(mipmap_dir, 'ic_launcher_foreground.png'))

    print('[IconGen] Saved Android mipmap launcher icons without outer circle!')

    # 4. Generate Splash Screens
    def create_splash(width, height):
        # Create dark background
        splash = Image.new('RGBA', (width, height), (9, 9, 18, 255))
        
        # Soft radial neon glow in center
        glow_radius = min(width, height) // 2
        glow = Image.new('RGBA', (glow_radius * 2, glow_radius * 2), (0, 0, 0, 0))
        glow_draw = ImageDraw.Draw(glow)
        for i in range(glow_radius, 0, -4):
            alpha = int(45 * (1 - i / glow_radius)**1.5)
            # Interpolate purple to cyan
            r_col = int(144 * (1 - i / glow_radius) + 103 * (i / glow_radius))
            g_col = int(85 * (1 - i / glow_radius) + 58 * (i / glow_radius))
            b_col = int(255)
            glow_draw.ellipse(
                (glow_radius - i, glow_radius - i, glow_radius + i, glow_radius + i),
                fill=(r_col, g_col, b_col, alpha)
            )
        
        glow = glow.filter(ImageFilter.GaussianBlur(15))
        
        # Center glow
        glow_x = (width - glow.width) // 2
        glow_y = (height - glow.height) // 2 - int(height * 0.05)
        splash.paste(glow, (glow_x, glow_y), mask=glow)

        # Center circular icon
        is_landscape = width >= height
        icon_dim = int(min(width, height) * (0.28 if is_landscape else 0.36))
        scaled_icon = master_icon.resize((icon_dim, icon_dim), Image.Resampling.LANCZOS)
        
        icon_x = (width - icon_dim) // 2
        icon_y = (height - icon_dim) // 2 - int(height * 0.06)
        splash.paste(scaled_icon, (icon_x, icon_y), mask=scaled_icon)

        # Draw "TMDB STREAMER" & "CINEMATIC STREAMING CATALOG"
        # We use a built-in clean vector render or PIL default font / shapes
        draw_sp = ImageDraw.Draw(splash)
        
        # Text positioning below icon
        text_y = icon_y + icon_dim + int(min(width, height) * 0.04)
        
        # For universal compatibility across environments without external TTF dependencies,
        # we render clean text
        try:
            font_size_main = max(14, int(min(width, height) * 0.045))
            font_size_sub = max(9, int(font_size_main * 0.45))
            font_main = ImageFont.truetype("arialbd.ttf", font_size_main)
            font_sub = ImageFont.truetype("arial.ttf", font_size_sub)
        except Exception:
            font_main = ImageFont.load_default()
            font_sub = ImageFont.load_default()

        # Title: TMDB STREAMER
        title_text = "TMDB STREAMER"
        sub_text = "CINEMATIC STREAMING CATALOG"
        
        title_bbox = draw_sp.textbbox((0, 0), title_text, font=font_main)
        title_w = title_bbox[2] - title_bbox[0]
        title_x = (width - title_w) // 2
        draw_sp.text((title_x, text_y), title_text, fill=(255, 255, 255, 255), font=font_main)

        sub_bbox = draw_sp.textbbox((0, 0), sub_text, font=font_sub)
        sub_w = sub_bbox[2] - sub_bbox[0]
        sub_x = (width - sub_w) // 2
        sub_y = text_y + (title_bbox[3] - title_bbox[1]) + int(min(width, height) * 0.015)
        draw_sp.text((sub_x, sub_y), sub_text, fill=(0, 210, 255, 220), font=font_sub)

        return splash

    # All splash targets
    splash_configs = [
        ('drawable', 'splash.png', 1920, 1080),
        ('drawable-land-mdpi', 'splash.png', 480, 320),
        ('drawable-land-hdpi', 'splash.png', 800, 480),
        ('drawable-land-xhdpi', 'splash.png', 1280, 720),
        ('drawable-land-xxhdpi', 'splash.png', 1600, 960),
        ('drawable-land-xxxhdpi', 'splash.png', 1920, 1080),
        ('drawable-port-mdpi', 'splash.png', 320, 480),
        ('drawable-port-hdpi', 'splash.png', 480, 800),
        ('drawable-port-xhdpi', 'splash.png', 720, 1280),
        ('drawable-port-xxhdpi', 'splash.png', 960, 1600),
        ('drawable-port-xxxhdpi', 'splash.png', 1080, 1920),
    ]

    for folder, filename, w, h in splash_configs:
        folder_path = os.path.join(res_dir, folder)
        os.makedirs(folder_path, exist_ok=True)
        sp_img = create_splash(w, h)
        sp_img.save(os.path.join(folder_path, filename))

    print('[IconGen] Saved all Android landscape & portrait splash screens!')

    # 5. Generate Android TV Banner (320x180 and 640x360)
    def create_tv_banner(width, height):
        banner = Image.new('RGBA', (width, height), (9, 9, 18, 255))
        
        # Ambient glow
        glow_radius = int(height * 0.7)
        glow = Image.new('RGBA', (glow_radius * 2, glow_radius * 2), (0, 0, 0, 0))
        glow_draw = ImageDraw.Draw(glow)
        for i in range(glow_radius, 0, -4):
            alpha = int(45 * (1 - i / glow_radius)**1.5)
            r_col = int(144 * (1 - i / glow_radius) + 103 * (i / glow_radius))
            g_col = int(85 * (1 - i / glow_radius) + 58 * (i / glow_radius))
            b_col = int(255)
            glow_draw.ellipse(
                (glow_radius - i, glow_radius - i, glow_radius + i, glow_radius + i),
                fill=(r_col, g_col, b_col, alpha)
            )
        glow = glow.filter(ImageFilter.GaussianBlur(15))
        banner.paste(glow, ((width - glow.width) // 2, (height - glow.height) // 2), mask=glow)

        # Icon on left
        icon_sz = int(height * 0.52)
        scaled_icon = master_icon.resize((icon_sz, icon_sz), Image.Resampling.LANCZOS)
        
        icon_x = int(width * 0.08)
        icon_y = (height - icon_sz) // 2
        banner.paste(scaled_icon, (icon_x, icon_y), mask=scaled_icon)

        # Text on right
        draw_bn = ImageDraw.Draw(banner)
        try:
            f_size = max(11, int(height * 0.115))
            f_sub = max(7, int(f_size * 0.42))
            font_b_main = ImageFont.truetype("arialbd.ttf", f_size)
            font_b_sub = ImageFont.truetype("arial.ttf", f_sub)
        except Exception:
            font_b_main = ImageFont.load_default()
            font_b_sub = ImageFont.load_default()

        text_x = icon_x + icon_sz + int(width * 0.045)
        text_y = icon_y + int(icon_sz * 0.22)
        draw_bn.text((text_x, text_y), "TMDB STREAMER", fill=(255, 255, 255, 255), font=font_b_main)
        draw_bn.text((text_x, text_y + int(f_size * 1.35)), "CINEMATIC STREAMING", fill=(0, 210, 255, 220), font=font_b_sub)

        return banner

    tv_drawable_dirs = [
        'drawable',
        'drawable-mdpi',
        'drawable-hdpi',
        'drawable-xhdpi',
        'drawable-xxhdpi',
        'drawable-xxxhdpi',
        'drawable-tvdpi',
        'drawable-nodpi',
    ]

    for d in tv_drawable_dirs:
        dir_path = os.path.join(res_dir, d)
        os.makedirs(dir_path, exist_ok=True)
        # Use 640x360 for high densities, 320x180 for standard
        w, h = (640, 360) if ('xhdpi' in d or 'xxhdpi' in d or 'xxxhdpi' in d or 'nodpi' in d) else (320, 180)
        create_tv_banner(w, h).save(os.path.join(dir_path, 'tv_banner.png'))

    print('[IconGen] Saved Android TV Leanback Banners across all densities!')

if __name__ == '__main__':
    generate_all_icons()

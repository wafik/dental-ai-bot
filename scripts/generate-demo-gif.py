import os
from PIL import Image

def generate_gif():
    screenshot_dir = os.path.join(os.getcwd(), "docs", "screenshots")
    files = [
        "01-ai-chat-portal.png",
        "02-voice-call-widget.png",
        "03-dentist-schedules.png",
        "04-services-catalog.png",
    ]

    target_w, target_h = 1200, 750
    frames = []

    for f in files:
        img_path = os.path.join(screenshot_dir, f)
        if not os.path.exists(img_path):
            print(f"File not found: {img_path}")
            continue

        im = Image.open(img_path).convert("RGBA")
        # Resize to fit within target dimensions preserving aspect ratio
        im.thumbnail((target_w, target_h), Image.Resampling.LANCZOS)

        # Create background canvas
        bg = Image.new("RGBA", (target_w, target_h), (255, 255, 255, 255))
        # Center image
        offset = ((target_w - im.width) // 2, (target_h - im.height) // 2)
        bg.paste(im, offset, im)
        frames.append(bg.convert("RGB"))

    if frames:
        out_path = os.path.join(screenshot_dir, "dental-ai-demo.gif")
        frames[0].save(
            out_path,
            save_all=True,
            append_images=frames[1:],
            duration=2500,  # 2.5 seconds per slide
            loop=0,
            optimize=True,
        )
        print(f"Animated GIF generated successfully at: {out_path} ({os.path.getsize(out_path)} bytes)")

if __name__ == "__main__":
    generate_gif()

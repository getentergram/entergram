#!/usr/bin/env python3
import os
import glob
import subprocess
import shutil
from pathlib import Path

MEDIA_DIR = str(Path(__file__).resolve().parent.parent / "docs" / "media")
AUDIO_DIR = os.path.join(MEDIA_DIR, "audio")
IMAGES_DIR = os.path.join(MEDIA_DIR, "scraped_images")
SUBTITLE_DIR = os.path.join(MEDIA_DIR, "subtitles")
RAW_DIR = str(Path(os.environ.get("ENTERGRAM_RAW_DIR", Path(__file__).resolve().parent.parent / "docs" / "media" / "raw_flagship_4k")))

MASTER_AUDIO = os.path.join(AUDIO_DIR, "brain_os_master_mix.wav")
OUTPUT_FLAGSHIP = os.path.join(MEDIA_DIR, "brain_os_flagship_90s.mp4")
OUTPUT_TEASER = os.path.join(MEDIA_DIR, "brain_os_teaser_30s.mp4")
OUTPUT_SOCIAL = os.path.join(MEDIA_DIR, "brain_os_social_15s.mp4")

# Dictionary of curated image assets for each time segment
IMAGE_ASSETS = {
    "brain_3d": os.path.join(IMAGES_DIR, "11_3d_digital_brain_with_glowing_neural_network_conne.png"),
    "plasma_orb": os.path.join(IMAGES_DIR, "33_minimal_deep_blue_glowing_sphere_with_sharp_electr.png"),
    "neural_lines": os.path.join(IMAGES_DIR, "30_lines_of_neural_connections_with_bright_stock_moti.png"),
    "synapse_mat": os.path.join(IMAGES_DIR, "04_synapse_devpost.png"),
    "health_kg": os.path.join(IMAGES_DIR, "25_a_very_simple_guide_to_knowledge_graphs_for_health.png"),
    "pulsing_neon": os.path.join(IMAGES_DIR, "32_pulsing_neon_brain_network_animation_showing_glowi.png"),
    "graph_rag": os.path.join(IMAGES_DIR, "15_graph_structure_design_for_ai_powered_graph_rag_sy.png"),
    "neurosphere": os.path.join(IMAGES_DIR, "19_neurosphere_ai_business_dashboard_by_metamorph_lab.png"),
    "skeletonkey": os.path.join(IMAGES_DIR, "02_skeletonkey_connect_dots_explore_timelines_possibi.png"),
    "cerebral": os.path.join(IMAGES_DIR, "28_interface_cerebral_futurista_mostrando_a_tecnologi.png"),
}

def find_raw_video():
    files = glob.glob(os.path.join(RAW_DIR, "*.webm"))
    if not files:
        raise FileNotFoundError(f"No raw Playwright video found in {RAW_DIR}")
    return sorted(files, key=os.path.getmtime)[-1]


def build_multimodal_flagship():
    raw_webm = find_raw_video()
    print(f"🎬 Processing Raw 4K 60fps Video: {raw_webm}")

    # 1. Normalize raw capture to clean 60fps H264 MP4 base stream (90.0s)
    tmp_base = "/tmp/clean_base_90s.mp4"
    cmd_base = (
        f'ffmpeg -y -i "{raw_webm}" -t 90.0 '
        f'-vf "fps=60,scale=1920:1080:flags=lanczos" '
        f'-c:v libx264 -preset fast -crf 16 -pix_fmt yuv420p {tmp_base}'
    )
    subprocess.run(cmd_base, shell=True, check=True)

    print("🖼️ Preparing Multimodal Picture-in-Picture (PIP) Elements...")
    
    # Helper to generate clean styled floating card with glowing cyan border and smooth alpha fade
    def make_card(img_path, duration_s, out_path):
        cmd = (
            f'ffmpeg -y -loop 1 -i "{img_path}" -t {duration_s} '
            f'-vf "scale=480:270:force_original_aspect_ratio=increase,crop=480:270,'
            f'format=rgba,fade=t=in:st=0:d=0.5:alpha=1,fade=t=out:st={duration_s-0.5}:d=0.5:alpha=1" '
            f'-c:v png {out_path}'
        )
        subprocess.run(cmd, shell=True, check=True)

    c1 = "/tmp/pip1.mov"; make_card(IMAGE_ASSETS["brain_3d"], 4.5, c1)
    c2 = "/tmp/pip2.mov"; make_card(IMAGE_ASSETS["synapse_mat"], 6.5, c2)
    c3 = "/tmp/pip3.mov"; make_card(IMAGE_ASSETS["health_kg"], 7.5, c3)
    c4 = "/tmp/pip4.mov"; make_card(IMAGE_ASSETS["graph_rag"], 9.5, c4)
    c5 = "/tmp/pip5.mov"; make_card(IMAGE_ASSETS["neurosphere"], 10.5, c5)
    c6 = "/tmp/pip6.mov"; make_card(IMAGE_ASSETS["skeletonkey"], 11.5, c6)
    c7 = "/tmp/pip7.mov"; make_card(IMAGE_ASSETS["cerebral"], 6.5, c7)

    print("✨ Merging multimodal layers, boosted voice narration, and soundtrack...")
    # Composite live UI + floating PIP cards at bottom-right (x=1380, y=720) with smooth fade
    composite_cmd = (
        f'ffmpeg -y '
        f'-i {tmp_base} '
        f'-i {c1} -i {c2} -i {c3} -i {c4} -i {c5} -i {c6} -i {c7} '
        f'-i "{MASTER_AUDIO}" '
        f'-filter_complex "'
        f'[0:v][1:v]overlay=1380:720:enable=\'between(t,0.5,5.0)\':format=auto[v1];'
        f'[v1][2:v]overlay=1380:720:enable=\'between(t,7.0,13.5)\':format=auto[v2];'
        f'[v2][3:v]overlay=1380:720:enable=\'between(t,15.0,22.5)\':format=auto[v3];'
        f'[v3][4:v]overlay=1380:720:enable=\'between(t,33.0,42.5)\':format=auto[v4];'
        f'[v4][5:v]overlay=1380:720:enable=\'between(t,48.0,58.5)\':format=auto[v5];'
        f'[v5][6:v]overlay=1380:720:enable=\'between(t,63.0,74.5)\':format=auto[v6];'
        f'[v6][7:v]overlay=1380:720:enable=\'between(t,76.0,82.5)\':format=auto[v_final]" '
        f'-map "[v_final]" -map 8:a '
        f'-c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p '
        f'-c:a aac -b:a 320k '
        f'-movflags +faststart {OUTPUT_FLAGSHIP}'
    )
    subprocess.run(composite_cmd, shell=True, check=True)
    print(f"✓ Master 90s Flagship Film: {OUTPUT_FLAGSHIP}")


def build_teaser_and_social():
    print("⚡ Rendering 30s High-Intensity Teaser...")
    teaser_audio = "/tmp/teaser_master_30s.wav"
    subprocess.run(
        f'ffmpeg -y -i "{MASTER_AUDIO}" -filter_complex "'
        f'[0:a]atrim=0:6,asetpts=PTS-STARTPTS[a1];'
        f'[0:a]atrim=32:41,asetpts=PTS-STARTPTS[a2];'
        f'[0:a]atrim=51:59,asetpts=PTS-STARTPTS[a3];'
        f'[0:a]atrim=82:89,asetpts=PTS-STARTPTS[a4];'
        f'[a1][a2][a3][a4]concat=n=4:v=0:a=1[aout];'
        f'[aout]afade=t=in:ss=0:d=0.4,afade=t=out:st=28.5:d=1.5[afinal]" '
        f'-map "[afinal]" {teaser_audio}',
        shell=True, check=True
    )

    subprocess.run(
        f'ffmpeg -y -i "{OUTPUT_FLAGSHIP}" -i {teaser_audio} -filter_complex "'
        f'[0:v]trim=0:6,setpts=PTS-STARTPTS[v1];'
        f'[0:v]trim=32:41,setpts=PTS-STARTPTS[v2];'
        f'[0:v]trim=51:59,setpts=PTS-STARTPTS[v3];'
        f'[0:v]trim=82:89,setpts=PTS-STARTPTS[v4];'
        f'[v1][v2][v3][v4]concat=n=4:v=1:a=0[vout];'
        f'[vout]fade=t=in:st=0:d=0.4,fade=t=out:st=28.5:d=1.5[vfinal]" '
        f'-map "[vfinal]" -map 1:a '
        f'-c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p '
        f'-c:a aac -b:a 320k -movflags +faststart {OUTPUT_TEASER}',
        shell=True, check=True
    )
    print(f"✓ 30s Teaser Film: {OUTPUT_TEASER}")

    print("📱 Rendering 15s Vertical Social Cut (1080x1920)...")
    social_audio = "/tmp/social_master_15s.wav"
    subprocess.run(
        f'ffmpeg -y -i "{MASTER_AUDIO}" -filter_complex "'
        f'[0:a]atrim=0:4.5,asetpts=PTS-STARTPTS[a1];'
        f'[0:a]atrim=33:38.5,asetpts=PTS-STARTPTS[a2];'
        f'[0:a]atrim=83:88.0,asetpts=PTS-STARTPTS[a3];'
        f'[a1][a2][a3]concat=n=3:v=0:a=1[aout];'
        f'[aout]afade=t=in:ss=0:d=0.3,afade=t=out:st=13.8:d=1.2[afinal]" '
        f'-map "[afinal]" {social_audio}',
        shell=True, check=True
    )

    subprocess.run(
        f'ffmpeg -y -i "{OUTPUT_FLAGSHIP}" -i {social_audio} -filter_complex "'
        f'[0:v]trim=0:4.5,setpts=PTS-STARTPTS[v1];'
        f'[0:v]trim=33:38.5,setpts=PTS-STARTPTS[v2];'
        f'[0:v]trim=83:88.0,setpts=PTS-STARTPTS[v3];'
        f'[v1][v2][v3]concat=n=3:v=1:a=0[vraw];'
        f'[vraw]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,'
        f'fade=t=in:st=0:d=0.3,fade=t=out:st=13.8:d=1.2[vfinal]" '
        f'-map "[vfinal]" -map 1:a '
        f'-c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p '
        f'-c:a aac -b:a 320k -movflags +faststart {OUTPUT_SOCIAL}',
        shell=True, check=True
    )
    print(f"✓ 15s Vertical Social Cut: {OUTPUT_SOCIAL}")


if __name__ == "__main__":
    build_multimodal_flagship()
    build_teaser_and_social()
    print("\n🎉 Master Multimodal Video Production Suite Complete!")

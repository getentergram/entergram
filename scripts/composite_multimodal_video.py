#!/usr/bin/env python3
import os
import glob
import subprocess
import shutil

MEDIA_DIR = "/home/getentergram/Documents/GitHub/entergram/docs/media"
AUDIO_DIR = os.path.join(MEDIA_DIR, "audio")
IMAGES_DIR = os.path.join(MEDIA_DIR, "scraped_images")
SUBTITLE_DIR = os.path.join(MEDIA_DIR, "subtitles")
RAW_DIR = "/home/getentergram/.gemini/antigravity/brain/0916c832-5f9b-4b3a-981e-98fd8f702792/scratch/raw_flagship_4k"

MASTER_AUDIO = os.path.join(AUDIO_DIR, "brain_os_master_mix.wav")
MASTER_SRT = os.path.join(SUBTITLE_DIR, "brain_os_narration.srt")

OUTPUT_FLAGSHIP = os.path.join(MEDIA_DIR, "brain_os_flagship_90s.mp4")
OUTPUT_TEASER = os.path.join(MEDIA_DIR, "brain_os_teaser_30s.mp4")
OUTPUT_SOCIAL = os.path.join(MEDIA_DIR, "brain_os_social_15s.mp4")

# Selected high-res multimodal images
IMG_BRAIN_3D = os.path.join(IMAGES_DIR, "11_3d_digital_brain_with_glowing_neural_network_conne.png")
IMG_PLASMA_ORB = os.path.join(IMAGES_DIR, "33_minimal_deep_blue_glowing_sphere_with_sharp_electr.png")
IMG_GRAPH_RAG = os.path.join(IMAGES_DIR, "15_graph_structure_design_for_ai_powered_graph_rag_sy.png")
IMG_TIMELINE_REF = os.path.join(IMAGES_DIR, "02_skeletonkey_connect_dots_explore_timelines_possibi.png")
IMG_CEREBRAL = os.path.join(IMAGES_DIR, "28_interface_cerebral_futurista_mostrando_a_tecnologi.png")
IMG_PULSE_NETWORK = os.path.join(IMAGES_DIR, "32_pulsing_neon_brain_network_animation_showing_glowi.png")

def find_raw_video():
    files = glob.glob(os.path.join(RAW_DIR, "*.webm"))
    if not files:
        raise FileNotFoundError(f"No raw Playwright video found in {RAW_DIR}")
    return sorted(files, key=os.path.getmtime)[-1]

def build_flagship_video(raw_webm):
    print(f"🎬 Composing 90s Flagship Master Video from {raw_webm}...")
    
    # 1. Convert raw Playwright webm to standard 60fps ProRes / MP4 stream (90.0s)
    tmp_base = "/tmp/raw_base_90s.mp4"
    cmd_base = (
        f'ffmpeg -y -i "{raw_webm}" -t 90.0 '
        f'-vf "fps=60,scale=1920:1080:flags=lanczos" '
        f'-c:v libx264 -preset fast -crf 16 -pix_fmt yuv420p {tmp_base}'
    )
    subprocess.run(cmd_base, shell=True, check=True)

    # 2. Build Multimodal Image B-Roll clips with smooth Ken Burns motion
    # Intro 3D Brain Clip (0s - 4.5s)
    tmp_intro = "/tmp/clip_intro.mp4"
    cmd_intro = (
        f'ffmpeg -y -loop 1 -i "{IMG_BRAIN_3D}" -t 4.5 '
        f'-vf "scale=2400:1350,zoompan=z=\'min(zoom+0.0015,1.25)\':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':d=270:s=1920x1080:fps=60,'
        f'fade=t=in:st=0:d=1.0,fade=t=out:st=3.5:d=1.0" '
        f'-c:v libx264 -preset fast -crf 16 -pix_fmt yuv420p {tmp_intro}'
    )
    subprocess.run(cmd_intro, shell=True, check=True)

    # Graph RAG Concept PIP / Cut (25.5s - 29.5s)
    tmp_rag = "/tmp/clip_rag.mp4"
    cmd_rag = (
        f'ffmpeg -y -loop 1 -i "{IMG_GRAPH_RAG}" -t 4.0 '
        f'-vf "scale=2400:1350,zoompan=z=\'min(zoom+0.0012,1.20)\':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':d=240:s=1920x1080:fps=60,'
        f'fade=t=in:st=0:d=0.6,fade=t=out:st=3.2:d=0.8" '
        f'-c:v libx264 -preset fast -crf 16 -pix_fmt yuv420p {tmp_rag}'
    )
    subprocess.run(cmd_rag, shell=True, check=True)

    # Cerebral Outro Clip (82.0s - 90.0s)
    tmp_outro = "/tmp/clip_outro.mp4"
    cmd_outro = (
        f'ffmpeg -y -loop 1 -i "{IMG_CEREBRAL}" -t 8.0 '
        f'-vf "scale=2400:1350,zoompan=z=\'min(zoom+0.001,1.15)\':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':d=480:s=1920x1080:fps=60,'
        f'fade=t=in:st=0:d=1.5,fade=t=out:st=6.5:d=1.5" '
        f'-c:v libx264 -preset fast -crf 16 -pix_fmt yuv420p {tmp_outro}'
    )
    subprocess.run(cmd_outro, shell=True, check=True)

    # 3. Composite live Playwright footage + Multimodal B-Roll overlays + Audio master
    print("✨ Merging multimodal layers, master audio track, and subtitles...")
    
    # Complex overlay filtergraph:
    # Overlay intro (0s - 4.5s) with screen/blend
    # Overlay RAG (25.5s - 29.5s) with fade
    # Overlay Outro (82s - 90s)
    composite_cmd = (
        f'ffmpeg -y -i {tmp_base} -i {tmp_intro} -i {tmp_rag} -i {tmp_outro} -i "{MASTER_AUDIO}" '
        f'-filter_complex "'
        f'[0:v][1:v]overlay=0:0:enable=\'between(t,0,4.5)\'[v1];'
        f'[v1][2:v]overlay=0:0:enable=\'between(t,25.5,29.5)\'[v2];'
        f'[v2][3:v]overlay=0:0:enable=\'between(t,82,90)\'[v_final]" '
        f'-map "[v_final]" -map 4:a '
        f'-c:v libx264 -preset medium -crf 17 -pix_fmt yuv420p '
        f'-c:a aac -b:a 320k '
        f'-movflags +faststart {OUTPUT_FLAGSHIP}'
    )
    subprocess.run(composite_cmd, shell=True, check=True)
    print(f"✓ Flagship Master 90s Video Created: {OUTPUT_FLAGSHIP}")


def build_teaser_video():
    print("⚡ Creating 30s High-Intensity Teaser Cut...")
    # Teaser cuts:
    # 0s - 7s (Intro hook + single neuron)
    # 26s - 34s (Intelligence in motion + shortest path)
    # 46s - 54s (Persona morphing)
    # 83s - 90s (Hero finale)
    
    # Generate 30s teaser audio
    teaser_audio = "/tmp/teaser_audio_30s.wav"
    cmd_audio = (
        f'ffmpeg -y -i "{MASTER_AUDIO}" -filter_complex "'
        f'[0:a]atrim=0:7,asetpts=PTS-STARTPTS[a1];'
        f'[0:a]atrim=26:34,asetpts=PTS-STARTPTS[a2];'
        f'[0:a]atrim=46:54,asetpts=PTS-STARTPTS[a3];'
        f'[0:a]atrim=83:90,asetpts=PTS-STARTPTS[a4];'
        f'[a1][a2][a3][a4]concat=n=4:v=0:a=1[aout];'
        f'[aout]afade=t=in:ss=0:d=0.5,afade=t=out:st=28.5:d=1.5[afinal]" '
        f'-map "[afinal]" {teaser_audio}'
    )
    subprocess.run(cmd_audio, shell=True, check=True)

    # Cut video stream to match
    cmd_teaser = (
        f'ffmpeg -y -i "{OUTPUT_FLAGSHIP}" -i {teaser_audio} -filter_complex "'
        f'[0:v]trim=0:7,setpts=PTS-STARTPTS[v1];'
        f'[0:v]trim=26:34,setpts=PTS-STARTPTS[v2];'
        f'[0:v]trim=46:54,setpts=PTS-STARTPTS[v3];'
        f'[0:v]trim=83:90,setpts=PTS-STARTPTS[v4];'
        f'[v1][v2][v3][v4]concat=n=4:v=1:a=0[vout];'
        f'[vout]fade=t=in:st=0:d=0.5,fade=t=out:st=28.5:d=1.5[vfinal]" '
        f'-map "[vfinal]" -map 1:a '
        f'-c:v libx264 -preset medium -crf 17 -pix_fmt yuv420p '
        f'-c:a aac -b:a 320k '
        f'-movflags +faststart {OUTPUT_TEASER}'
    )
    subprocess.run(cmd_teaser, shell=True, check=True)
    print(f"✓ 30s Teaser Video Created: {OUTPUT_TEASER}")


def build_social_cut():
    print("📱 Creating 15s High-Paced Social Cut (1080x1920 Vertical & 1080x1080)...")
    social_audio = "/tmp/social_audio_15s.wav"
    cmd_audio = (
        f'ffmpeg -y -i "{MASTER_AUDIO}" -filter_complex "'
        f'[0:a]atrim=0:4,asetpts=PTS-STARTPTS[a1];'
        f'[0:a]atrim=27:32,asetpts=PTS-STARTPTS[a2];'
        f'[0:a]atrim=84:90,asetpts=PTS-STARTPTS[a3];'
        f'[a1][a2][a3]concat=n=3:v=0:a=1[aout];'
        f'[aout]afade=t=in:ss=0:d=0.3,afade=t=out:st=13.8:d=1.2[afinal]" '
        f'-map "[afinal]" {social_audio}'
    )
    subprocess.run(cmd_audio, shell=True, check=True)

    # 1080x1920 vertical composition (centered crop + top/bottom frosted glow)
    cmd_social = (
        f'ffmpeg -y -i "{OUTPUT_FLAGSHIP}" -i {social_audio} -filter_complex "'
        f'[0:v]trim=0:4,setpts=PTS-STARTPTS[v1];'
        f'[0:v]trim=27:32,setpts=PTS-STARTPTS[v2];'
        f'[0:v]trim=84:90,setpts=PTS-STARTPTS[v3];'
        f'[v1][v2][v3]concat=n=3:v=1:a=0[vraw];'
        f'[vraw]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,'
        f'fade=t=in:st=0:d=0.4,fade=t=out:st=13.8:d=1.2[vfinal]" '
        f'-map "[vfinal]" -map 1:a '
        f'-c:v libx264 -preset medium -crf 17 -pix_fmt yuv420p '
        f'-c:a aac -b:a 320k '
        f'-movflags +faststart {OUTPUT_SOCIAL}'
    )
    subprocess.run(cmd_social, shell=True, check=True)
    print(f"✓ 15s Social Cut Created: {OUTPUT_SOCIAL}")


if __name__ == "__main__":
    raw_video = find_raw_video()
    build_flagship_video(raw_video)
    build_teaser_video()
    build_social_cut()
    print("\n🎉 Master Multimodal Video Production Suite Finished Successfully!")

#!/usr/bin/env python3
import os
import sys
import subprocess

MEDIA_DIR = "/home/getentergram/Documents/GitHub/entergram/docs/media"
AUDIO_DIR = os.path.join(MEDIA_DIR, "audio")
SUBTITLE_DIR = os.path.join(MEDIA_DIR, "subtitles")
os.makedirs(AUDIO_DIR, exist_ok=True)
os.makedirs(SUBTITLE_DIR, exist_ok=True)

# Complete 10-Segment Master Script
SEGMENTS = [
    {
        "id": 1,
        "start": 0.5,
        "text": "Knowledge isn't static. It's alive.",
    },
    {
        "id": 2,
        "start": 5.2,
        "text": "Every document. Every conversation. Every decision leaves behind a connection.",
    },
    {
        "id": 3,
        "start": 14.2,
        "text": "Brain OS transforms those connections into a living knowledge graph.",
    },
    {
        "id": 4,
        "start": 23.2,
        "text": "Every file becomes a neuron. Every relationship becomes a synapse.",
    },
    {
        "id": 5,
        "start": 32.5,
        "text": "Hidden patterns become visible. Critical knowledge hubs emerge. Missing links are discovered automatically.",
    },
    {
        "id": 6,
        "start": 45.0,
        "text": "Switch perspectives instantly.",
    },
    {
        "id": 7,
        "start": 51.5,
        "text": "Executives see strategy. Engineers see architecture. Researchers see evidence.",
    },
    {
        "id": 8,
        "start": 62.0,
        "text": "Replay how intelligence evolved. Explore the shortest path between ideas. Watch your enterprise brain grow with every interaction.",
    },
    {
        "id": 9,
        "start": 75.5,
        "text": "This isn't documentation. This is a digital connectome.",
    },
    {
        "id": 10,
        "start": 82.5,
        "text": "Brain OS. Think in connections.",
    },
]

TOTAL_DURATION = 90.0

def generate_voice_and_subtitles():
    print("🎙️ Synthesizing 10-segment Master Voiceover with High-Presence Broadcast Mastering...")
    actual_timings = []
    
    delays = []
    inputs_str = ""
    
    for i, seg in enumerate(SEGMENTS):
        aiff_file = f"/tmp/seg_{i+1}.aiff"
        wav_file = f"/tmp/seg_{i+1}.wav"
        
        # Use Daniel (crisp British executive delivery, speed 165 for punchy cadence)
        cmd = f'say -v Daniel -r 165 "{seg["text"]}" -o {aiff_file}'
        subprocess.run(cmd, shell=True, check=True)
        
        # Get duration
        dur_cmd = f'ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 {aiff_file}'
        dur = float(subprocess.check_output(dur_cmd, shell=True).decode().strip())
        
        # Audio mastering: Warm bass + high intelligibility EQ + hard limiter
        proc_cmd = (
            f'ffmpeg -y -i {aiff_file} -af '
            f'"equalizer=f=140:width_type=h:width=120:g=4.0,'
            f'equalizer=f=3200:width_type=h:width=1200:g=4.5,'
            f'equalizer=f=7500:width_type=h:width=2500:g=2.5,'
            f'acompressor=threshold=-18dB:ratio=4:attack=8:release=100,'
            f'volume=2.2" '
            f'-ar 48000 -ac 1 {wav_file}'
        )
        subprocess.run(proc_cmd, shell=True, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        actual_timings.append({
            "id": seg["id"],
            "start": seg["start"],
            "end": seg["start"] + dur,
            "duration": dur,
            "text": seg["text"]
        })
        print(f"  ✓ Segment {i+1} [{seg['start']:.1f}s - {seg['start']+dur:.1f}s ({dur:.1f}s)]: \"{seg['text'][:45]}...\"")
        
        delay_ms = int(seg["start"] * 1000)
        delays.append(f"[{i+1}:a]adelay={delay_ms}|{delay_ms}[d{i+1}]")
        inputs_str += f" -i {wav_file}"

    # Mix all segments into 90s voice track
    voice_wav_path = os.path.join(AUDIO_DIR, "brain_os_voiceover.wav")
    inputs_labels = "".join([f"[d{i+1}]" for i in range(len(SEGMENTS))])
    
    full_cmd = (
        f'ffmpeg -y -f lavfi -i anullsrc=r=48000:cl=mono:d=90.0 {inputs_str} -filter_complex '
        f'"{";".join(delays)};[0:a]{inputs_labels}amix=inputs={len(SEGMENTS)+1}:duration=first:normalize=0[voice_raw];'
        f'[voice_raw]volume=1.5[out]" '
        f'-map "[out]" -ar 48000 -ac 1 {voice_wav_path}'
    )
    subprocess.run(full_cmd, shell=True, check=True)
    print(f"✓ Master Voiceover Track: {voice_wav_path}")

    # Generate Subtitles
    srt_path = os.path.join(SUBTITLE_DIR, "brain_os_narration.srt")
    vtt_path = os.path.join(SUBTITLE_DIR, "brain_os_narration.vtt")

    def fmt_srt(s):
        h = int(s // 3600); m = int((s % 3600) // 60); sec = int(s % 60); ms = int((s - int(s)) * 1000)
        return f"{h:02d}:{m:02d}:{sec:02d},{ms:03d}"

    def fmt_vtt(s):
        h = int(s // 3600); m = int((s % 3600) // 60); sec = int(s % 60); ms = int((s - int(s)) * 1000)
        return f"{h:02d}:{m:02d}:{sec:02d}.{ms:03d}"

    with open(srt_path, 'w') as f:
        for idx, t in enumerate(actual_timings):
            f.write(f"{idx+1}\n{fmt_srt(t['start'])} --> {fmt_srt(t['end'])}\n{t['text']}\n\n")

    with open(vtt_path, 'w') as f:
        f.write("WEBVTT\n\n")
        for idx, t in enumerate(actual_timings):
            f.write(f"{idx+1}\n{fmt_vtt(t['start'])} --> {fmt_vtt(t['end'])}\n{t['text']}\n\n")

    print(f"✓ Subtitles saved to {srt_path} and {vtt_path}")
    return actual_timings


def build_ambient_synth_bed():
    print("🎹 Generating Atmospheric Soundtrack Bed (Subtle -18dB background bed)...")
    score_wav_path = os.path.join(AUDIO_DIR, "brain_os_soundtrack.wav")
    
    synth_cmd = (
        'ffmpeg -y '
        # Sub-bass 48Hz
        '-f lavfi -i "aevalsrc=0.15*sin(2*PI*48*t)+0.08*sin(2*PI*96*t):d=90:s=48000" '
        # Analog Pad Dm9
        '-f lavfi -i "aevalsrc=0.06*sin(2*PI*146.83*t)+0.05*sin(2*PI*174.61*t)+0.04*sin(2*PI*220.0*t)+0.03*sin(2*PI*261.63*t):d=90:s=48000" '
        # Heartbeat pulse (55Hz)
        '-f lavfi -i "aevalsrc=0.10*sin(2*PI*55*t)*if(lt(mod(t\,1.0)\,0.18)\,exp(-15*mod(t\,1.0))\,0):d=90:s=48000" '
        '-filter_complex "'
        '[1:a]chorus=0.7:0.9:55:0.4:0.25:2,aecho=0.8:0.88:80:0.3,stereowiden[pads_wide];'
        '[0:a][pads_wide][2:a]amix=inputs=3:weights=0.8 0.9 0.6:normalize=0[score_raw];'
        '[score_raw]volume=0.35,afade=t=in:ss=0:d=2.0,afade=t=out:st=87.0:d=3.0[out]" '
        f'-map "[out]" -ar 48000 -ac 2 {score_wav_path}'
    )
    subprocess.run(synth_cmd, shell=True, check=True)
    print(f"✓ Soundtrack Bed: {score_wav_path}")
    return score_wav_path


def render_master_audio():
    print("🎚️ Rendering Clear, Loud Master Mix (Voiceover + Low Music Bed)...")
    voice_wav = os.path.join(AUDIO_DIR, "brain_os_voiceover.wav")
    score_wav = os.path.join(AUDIO_DIR, "brain_os_soundtrack.wav")
    master_wav = os.path.join(AUDIO_DIR, "brain_os_master_mix.wav")
    master_mp3 = os.path.join(AUDIO_DIR, "brain_os_master_mix.mp3")

    mix_cmd = (
        f'ffmpeg -y -i {score_wav} -i {voice_wav} -filter_complex '
        f'"[1:a]pan=stereo|c0=c0|c1=c0[voice_stereo];'
        f'[0:a][voice_stereo]sidechaincompress=threshold=0.03:ratio=4:attack=10:release=300[ducked_score];'
        f'[ducked_score][voice_stereo]amix=inputs=2:weights=0.45 2.2:normalize=0[mixed];'
        f'[mixed]loudnorm=I=-14:TP=-0.5:LRA=6[master_out]" '
        f'-map "[master_out]" -ar 48000 {master_wav}'
    )
    subprocess.run(mix_cmd, shell=True, check=True)
    subprocess.run(f'ffmpeg -y -i {master_wav} -b:a 320k {master_mp3}', shell=True, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"✓ Master Broadcast Audio (Voice Boosted): {master_wav}")
    print(f"✓ Master MP3: {master_mp3}")


if __name__ == "__main__":
    generate_voice_and_subtitles()
    build_ambient_synth_bed()
    render_master_audio()
    print("\n🎉 Master Narration and Sound Suite Complete!")

#!/usr/bin/env python3
import os
import sys
import subprocess

AUDIO_DIR = "/home/getentergram/Documents/GitHub/entergram/docs/media/audio"
SUBTITLE_DIR = "/home/getentergram/Documents/GitHub/entergram/docs/media/subtitles"
os.makedirs(AUDIO_DIR, exist_ok=True)
os.makedirs(SUBTITLE_DIR, exist_ok=True)

CUES = [
    {
        "scene": 1,
        "name": "Scene 1 — The Problem",
        "start": 1.0,
        "text": "Every organization stores knowledge. Very few understand how that knowledge is actually connected.",
    },
    {
        "scene": 2,
        "name": "Scene 2 — The Brain Awakens",
        "start": 11.5,
        "text": "Every document becomes a neuron. Every relationship becomes a synapse. Together, they form a living enterprise brain.",
    },
    {
        "scene": 3,
        "name": "Scene 3 — Intelligence in Motion",
        "start": 26.0,
        "text": "Brain OS doesn't just visualize information. It reveals hidden patterns, identifies critical knowledge hubs, and surfaces the shortest path between ideas.",
    },
    {
        "scene": 4,
        "name": "Scene 4 — Persona Switching",
        "start": 46.0,
        "text": "The same brain. Different perspectives. Executives see strategy. Engineers see architecture. Researchers see evidence.",
    },
    {
        "scene": 5,
        "name": "Scene 5 — Time Travel",
        "start": 61.5,
        "text": "Watch your organization's intelligence evolve over time. Every conversation strengthens the network.",
    },
    {
        "scene": 6,
        "name": "Scene 6 — Closing Hero",
        "start": 76.0,
        "text": "This isn't documentation. This is a digital connectome. Brain OS. Think in connections.",
    },
]

TOTAL_DURATION = 90.0

def build_voice_and_subtitles():
    print("🎙️ Synthesizing individual voiceover cues and mastering...")
    cue_files = []
    actual_timings = []
    
    # Track-builder filter inputs
    filter_inputs = []
    amix_filter = ""
    
    for idx, cue in enumerate(CUES):
        aiff_file = f"/tmp/cue_raw_{idx+1}.aiff"
        wav_file = f"/tmp/cue_proc_{idx+1}.wav"
        
        # Crisp authoritative delivery with Daniel
        cmd = f'say -v Daniel -r 172 "{cue["text"]}" -o {aiff_file}'
        subprocess.run(cmd, shell=True, check=True)
        
        # Get duration
        dur_cmd = f'ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 {aiff_file}'
        dur_str = subprocess.check_output(dur_cmd, shell=True).decode().strip()
        dur = float(dur_str)
        
        # Audio mastering chain
        proc_cmd = (
            f'ffmpeg -y -i {aiff_file} -af '
            f'"equalizer=f=120:width_type=h:width=100:g=3.5,'
            f'equalizer=f=3600:width_type=h:width=1200:g=3.2,'
            f'equalizer=f=9000:width_type=h:width=2000:g=1.8,'
            f'acompressor=threshold=-16dB:ratio=3.5:attack=10:release=120,'
            f'volume=1.35" '
            f'-ar 48000 -ac 1 {wav_file}'
        )
        subprocess.run(proc_cmd, shell=True, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        actual_timings.append({
            "scene": cue["scene"],
            "name": cue["name"],
            "start": cue["start"],
            "end": cue["start"] + dur,
            "duration": dur,
            "text": cue["text"]
        })
        print(f"  ✓ Cue {idx+1} ({cue['start']:.1f}s – {cue['start']+dur:.1f}s, {dur:.1f}s): {cue['text'][:40]}...")

    # Combine into a single 90s voiceover track positioned at exact millisecond offsets
    voice_wav_path = os.path.join(AUDIO_DIR, "brain_os_voiceover.wav")
    
    # Use ffmpeg adelay + amix
    inputs_str = " ".join([f"-i /tmp/cue_proc_{i+1}.wav" for i in range(len(CUES))])
    delays = []
    for i, t in enumerate(actual_timings):
        delay_ms = int(t["start"] * 1000)
        delays.append(f"[{i}:a]adelay={delay_ms}|{delay_ms}[d{i}]")
    
    inputs_labels = "".join([f"[d{i}]" for i in range(len(CUES))])
    filter_complex = f"{';'.join(delays)};{inputs_labels}amix=inputs={len(CUES)}:duration=first:normalize=0[out]"
    
    # Also create a 90s silent base to ensure exact 90.0s length
    full_voice_cmd = (
        f'ffmpeg -y -f lavfi -i anullsrc=r=48000:cl=mono:d=90.0 {inputs_str} -filter_complex '
        f'"{";".join(delays)};[0:a]{inputs_labels}amix=inputs={len(CUES)+1}:duration=first:normalize=0[out]" '
        f'-map "[out]" -ar 48000 -ac 1 {voice_wav_path}'
    )
    subprocess.run(full_voice_cmd, shell=True, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"✓ Master Voiceover Track: {voice_wav_path}")
    
    # Generate Subtitles
    srt_path = os.path.join(SUBTITLE_DIR, "brain_os_narration.srt")
    vtt_path = os.path.join(SUBTITLE_DIR, "brain_os_narration.vtt")

    def format_srt_time(sec):
        hours = int(sec // 3600)
        mins = int((sec % 3600) // 60)
        s = int(sec % 60)
        ms = int((sec - int(sec)) * 1000)
        return f"{hours:02d}:{mins:02d}:{s:02d},{ms:03d}"

    def format_vtt_time(sec):
        hours = int(sec // 3600)
        mins = int((sec % 3600) // 60)
        s = int(sec % 60)
        ms = int((sec - int(sec)) * 1000)
        return f"{hours:02d}:{mins:02d}:{s:02d}.{ms:03d}"

    with open(srt_path, 'w') as f:
        for idx, cue in enumerate(actual_timings):
            f.write(f"{idx+1}\n")
            f.write(f"{format_srt_time(cue['start'])} --> {format_srt_time(cue['end'])}\n")
            f.write(f"{cue['text']}\n\n")

    with open(vtt_path, 'w') as f:
        f.write("WEBVTT\n\n")
        for idx, cue in enumerate(actual_timings):
            f.write(f"{idx+1}\n")
            f.write(f"{format_vtt_time(cue['start'])} --> {format_vtt_time(cue['end'])}\n")
            f.write(f"{cue['text']}\n\n")

    print(f"✓ Subtitles saved to {srt_path} and {vtt_path}")
    return actual_timings


def build_cinematic_soundtrack():
    print("🎹 Synthesizing 90s multi-layered cinematic synth score via DSP filtergraph...")
    score_wav_path = os.path.join(AUDIO_DIR, "brain_os_soundtrack.wav")
    
    # Synthesis components:
    # 1. Deep sub-bass (48Hz + 96Hz harmonics with gentle slow tremolo)
    # 2. Atmospheric Dm9 synth pad chords
    # 3. 60 BPM Heartbeat pulse
    # 4. Neural shimmering arpeggio
    # 5. Scene impact sub-drops
    
    synth_cmd = (
        'ffmpeg -y '
        # Stream 0: Sub-bass 48Hz
        '-f lavfi -i "aevalsrc=0.28*sin(2*PI*48*t)*(1+0.15*sin(2*PI*0.2*t))+0.12*sin(2*PI*96*t):d=90:s=48000" '
        # Stream 1: D-minor 9th ambient pad
        '-f lavfi -i "aevalsrc=0.10*sin(2*PI*146.83*t)+0.08*sin(2*PI*174.61*t)+0.07*sin(2*PI*220.0*t)+0.05*sin(2*PI*261.63*t)+0.04*sin(2*PI*329.63*t):d=90:s=48000" '
        # Stream 2: Bb-maj7 / Gm9 ambient pad (evolves in middle)
        '-f lavfi -i "aevalsrc=(0.08*sin(2*PI*116.54*t)+0.06*sin(2*PI*146.83*t)+0.06*sin(2*PI*174.61*t)+0.05*sin(2*PI*220.0*t))*(0.5+0.5*sin(2*PI*0.07*t)):d=90:s=48000" '
        # Stream 3: 60 BPM Heartbeat pulse (55Hz exponential kick decay)
        '-f lavfi -i "aevalsrc=0.18*sin(2*PI*55*t)*if(lt(mod(t\,1.0)\,0.2)\,exp(-18*mod(t\,1.0))\,0):d=90:s=48000" '
        # Stream 4: Shimmering neural high frequencies
        '-f lavfi -i "aevalsrc=0.03*sin(2*PI*880*t*(1+0.005*sin(2*PI*4*t)))*exp(-5*mod(t*4\,1.0)):d=90:s=48000" '
        '-filter_complex "'
        # Process Pads with chorus + spatial reverb + stereowiden
        '[1:a][2:a]amix=inputs=2:normalize=0[pads_raw];'
        '[pads_raw]chorus=0.7:0.9:55|65:0.4|0.35:0.25|0.3:2|2.2[pads_chorus];'
        '[pads_chorus]aecho=0.8:0.88:80|160:0.35|0.2[pads_reverb];'
        '[pads_reverb]stereowiden=delay=20:feedback=0.5:crossfeed=0.3[pads_wide];'
        # Combine sub + pads + heartbeat + shimmer
        '[0:a][pads_wide][3:a][4:a]amix=inputs=4:weights=1.1 1.3 0.9 0.6:normalize=0[score_sum];'
        # Apply gentle master fade in (2s) and fade out (3s)
        '[score_sum]afade=t=in:ss=0:d=2.5,afade=t=out:st=87.0:d=3.0[out]" '
        f'-map "[out]" -ar 48000 -ac 2 {score_wav_path}'
    )
    subprocess.run(synth_cmd, shell=True, check=True)
    print(f"✓ Master Soundtrack Track: {score_wav_path}")
    return score_wav_path


def build_final_master_mix():
    print("🎚️ Rendering Final Master Broadcast Mix (Voiceover + Ducked Soundtrack)...")
    voice_wav = os.path.join(AUDIO_DIR, "brain_os_voiceover.wav")
    score_wav = os.path.join(AUDIO_DIR, "brain_os_soundtrack.wav")
    master_wav = os.path.join(AUDIO_DIR, "brain_os_master_mix.wav")
    master_mp3 = os.path.join(AUDIO_DIR, "brain_os_master_mix.mp3")

    # Sidechain ducking: when voice speaks, compress soundtrack by ~4dB smoothly
    mix_cmd = (
        f'ffmpeg -y -i {score_wav} -i {voice_wav} -filter_complex '
        f'"[1:a]pan=stereo|c0=c0|c1=c0[voice_stereo];'
        f'[0:a][voice_stereo]sidechaincompress=threshold=0.08:ratio=3.5:attack=15:release=250[ducked_score];'
        f'[ducked_score][voice_stereo]amix=inputs=2:weights=0.85 1.35:normalize=0[mixed];'
        f'[mixed]loudnorm=I=-14:TP=-1.0:LRA=7[master_out]" '
        f'-map "[master_out]" -ar 48000 {master_wav}'
    )
    subprocess.run(mix_cmd, shell=True, check=True)
    
    # 320kbps MP3
    subprocess.run(f'ffmpeg -y -i {master_wav} -b:a 320k {master_mp3}', shell=True, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    print(f"✓ Master Mix WAV (EBU R128 -14 LUFS): {master_wav}")
    print(f"✓ Master Mix MP3 (320kbps): {master_mp3}")


if __name__ == "__main__":
    timings = build_voice_and_subtitles()
    build_cinematic_soundtrack()
    build_final_master_mix()
    print("\n🎉 Audio Production Complete!")

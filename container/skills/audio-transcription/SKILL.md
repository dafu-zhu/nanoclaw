---
name: audio-transcription
description: Transcribe audio files using local whisper.cpp (no API key needed). Handles lecture recordings, voice notes, meeting audio. Supports large files via Google Drive.
allowed-tools: Bash, Read, Write, Edit
---

# Audio Transcription (Local whisper.cpp)

Transcribe audio files using the locally installed whisper.cpp. No API key required.

## Steps

1. **Get the audio file.** Check `/workspace/group/attachments/` for files sent via chat. For large files, ask for a Google Drive link and use `gdown` to download.

2. **Download model if needed** (cached at `/home/node/.cache/whisper/`):
```bash
MODEL_DIR="/home/node/.cache/whisper"
MODEL="$MODEL_DIR/ggml-base.en.bin"
if [ ! -f "$MODEL" ]; then
  mkdir -p "$MODEL_DIR"
  curl -L -o "$MODEL" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"
fi
```
Models: `ggml-base.en.bin` (~150MB, English-only, fast) or `ggml-small.bin` (~500MB, multilingual, slower).

3. **Transcribe:**
```bash
whisper-cli -m /home/node/.cache/whisper/ggml-base.en.bin -f audio_file.wav -otxt -of /tmp/output
```
Output: `/tmp/output.txt`

If the input is not WAV, convert first:
```bash
ffmpeg -i input.ogg -ar 16000 -ac 1 -c:a pcm_s16le /tmp/audio.wav
whisper-cli -m /home/node/.cache/whisper/ggml-base.en.bin -f /tmp/audio.wav -otxt -of /tmp/output
```

4. **Save transcript** to the requested location, or default to `/workspace/group/outputs/YYYY-MM-DD-transcript.txt`

5. **Summarize** the transcript if requested — key points, decisions, action items.

## Lecture File Organization

When transcribing course lectures, use this structure:
```
/workspace/group/{course-id}/lectures/week-{NN}-{topic-slug}.txt
```
Example: `/workspace/group/busn-41902/lectures/week-01-inference-foundations.txt`

Use the caption or user instructions to determine the week number and topic.

## Large files (Google Drive)

```bash
gdown --id FILE_ID -O /tmp/audio_file.mp3
```

Or use the service account at `/workspace/extra/work/gdrive-sa.json` (if mounted).

## Supported formats

wav (native), mp3, mp4, m4a, ogg, oga, flac, webm (converted via ffmpeg)

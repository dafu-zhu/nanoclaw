---
name: audio-transcription
description: Transcribe audio files using OpenAI Whisper API. Handles meeting recordings, lecture audio, voice notes. Supports large files via Google Drive.
allowed-tools: Bash, Read, Write, Edit
---

# Audio Transcription

Transcribe audio files using OpenAI Whisper API.

## Steps

1. **Get the audio file.** If Dafu sends it directly and it's <20MB, download from the message. If >20MB, ask for a Google Drive link and use `gdown` to download.

2. **Transcribe with Whisper:**
```bash
curl -s https://api.openai.com/v1/audio/transcriptions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F file="@audio_file.ogg" \
  -F model="whisper-1" \
  -F response_format="text"
```
Use `$OPENAI_API_KEY` env var. Never hardcode keys.

3. **Save transcript** to `/workspace/group/outputs/YYYY-MM-DD-transcript.txt`

4. **Summarize** the transcript — key points, decisions, action items. Save to `/workspace/group/outputs/YYYY-MM-DD-summary.md`

## Large files (Google Drive)

For files hosted on Google Drive, use the service account at `/workspace/extra/work/gdrive-sa.json` (if mounted) with the Google Drive API:

```bash
# List files in a folder
curl -s -H "Authorization: Bearer $(python3 -c "
import json, time, base64, hashlib, urllib.request
sa = json.load(open('/workspace/extra/work/gdrive-sa.json'))
# ... service account JWT flow
")" "https://www.googleapis.com/drive/v3/files?q='FOLDER_ID'+in+parents"
```

Or use `gdown` if available: `pip install gdown && gdown --id FILE_ID`

## Supported formats

wav, mp3, mp4, m4a, ogg, oga, flac, webm

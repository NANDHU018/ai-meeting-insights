import os
import subprocess
import tempfile
from flask import Flask, request, jsonify
import whisper

app = Flask(__name__)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Load Whisper model once (IMPORTANT)
model = whisper.load_model("base")  # tiny | base | small | medium | large

def convert_to_wav(input_path: str) -> str:
    """
    Convert any audio/video file (webm, mp4, ogg, etc.) to a clean 16kHz
    mono WAV that Whisper handles reliably.  Returns the path to the wav file.
    Raises subprocess.CalledProcessError on failure.
    """
    wav_path = os.path.splitext(input_path)[0] + "_converted.wav"
    cmd = [
        "ffmpeg", "-y",              # overwrite if exists
        "-i", input_path,            # input
        "-vn",                       # drop video stream (webm can have video)
        "-acodec", "pcm_s16le",      # standard 16-bit PCM
        "-ar", "16000",              # 16 kHz — Whisper's native rate
        "-ac", "1",                  # mono
        wav_path
    ]
    print(f"[whisper-svc] Converting {input_path} → {wav_path}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[whisper-svc] ffmpeg stderr:\n{result.stderr}")
        raise RuntimeError(f"ffmpeg conversion failed: {result.stderr[-500:]}")
    size = os.path.getsize(wav_path)
    print(f"[whisper-svc] Converted successfully. WAV size: {size} bytes")
    return wav_path


@app.route("/transcribe", methods=["POST"])
def transcribe_audio():
    if "audio" not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files["audio"]

    if audio_file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    # Save the uploaded file (keep original extension for ffmpeg detection)
    original_filename = audio_file.filename or "recording.webm"
    file_path = os.path.join(UPLOAD_FOLDER, original_filename)
    audio_file.save(file_path)

    file_size = os.path.getsize(file_path)
    print(f"[whisper-svc] Received: {original_filename} ({file_size} bytes)")

    if file_size < 1000:
        os.remove(file_path)
        return jsonify({"error": f"Uploaded file is too small ({file_size} bytes). Recording may be empty."}), 400

    wav_path = None
    try:
        # Always convert to clean 16kHz WAV for reliable transcription
        wav_path = convert_to_wav(file_path)

        print(f"[whisper-svc] Starting Whisper transcription...")
        result = model.transcribe(wav_path, language=None)  # auto-detect language
        transcript_text = result.get("text", "").strip()
        detected_lang = result.get("language", "unknown")

        print(f"[whisper-svc] Done. Language: {detected_lang} | Length: {len(transcript_text)} chars")
        if not transcript_text:
            print("[whisper-svc] WARNING: Transcript is empty — audio may be silent or too short")

        # Save transcript txt alongside the original
        transcript_path = os.path.splitext(file_path)[0] + ".txt"
        with open(transcript_path, "w", encoding="utf-8") as tf:
            tf.write(transcript_text)

        return jsonify({
            "text": transcript_text,
            "language": detected_lang,
            "transcript_file": transcript_path
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

    finally:
        # Clean up original + converted wav
        if os.path.exists(file_path):
            os.remove(file_path)
        if wav_path and os.path.exists(wav_path):
            os.remove(wav_path)


if __name__ == "__main__":
    # threaded=False is critical to prevent Whisper/PyTorch OOM under concurrent load
    app.run(host="0.0.0.0", port=8001, debug=True, threaded=False)
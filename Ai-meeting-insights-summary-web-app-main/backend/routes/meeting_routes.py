import os
import uuid
import time
import requests as http_requests
import threading

from flask import Blueprint, g, jsonify, request
from werkzeug.utils import secure_filename

from config.db import query
from middleware.auth import verify_token

meeting_bp = Blueprint("meetings", __name__)

UPLOAD_FOLDER  = os.path.join(os.path.dirname(__file__), "..", "uploads")
WHISPER_URL    = "http://localhost:8001/transcribe"
OLLAMA_URL     = "http://localhost:11434/api/generate"
OLLAMA_MODEL   = "qwen2:1.5b"
MAX_FILE_BYTES = 50 * 1024 * 1024   # 50 MB

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

ALLOWED_MIME_PREFIXES = ("audio/",)


def _allowed_audio(file):
    return file.mimetype.startswith(ALLOWED_MIME_PREFIXES)


def _ollama(prompt: str) -> str:
    resp = http_requests.post(
        OLLAMA_URL,
        json={"model": "llama3.1:8b", "prompt": prompt, "stream": False},
        timeout=600,
    )
    resp.raise_for_status()
    return resp.json()["response"]


def _process_meeting_in_background(meeting_id, audio_path, user_id):
    """
    Handles the AI pipeline for transcription and title generation in a background thread.
    """
    try:
        # Update status to transcribing
        query("UPDATE meetings SET status = 'transcribing' WHERE id = %s", (meeting_id,))
        
        # --- Whisper transcription ---
        filename = os.path.basename(audio_path)
        # Whisper svc saves by filename — add a unique prefix so concurrent files don't clash
        unique_name = f"{int(time.time()*1000)}-{uuid.uuid4().hex[:8]}-{filename}"
        with open(audio_path, "rb") as af:
            whisper_resp = http_requests.post(
                WHISPER_URL,
                files={"audio": (unique_name, af)},
                timeout=3600,
            )
        whisper_resp.raise_for_status()
        transcript = whisper_resp.json()["text"]

        # Save transcript
        query(
            "INSERT INTO transcripts (meeting_id, text) VALUES (%s, %s)",
            (meeting_id, transcript),
        )

        # Update status to generating_title
        query("UPDATE meetings SET status = 'generating_title' WHERE id = %s", (meeting_id,))
        
        # --- Generate title via Ollama (lightweight, no summary yet) ---
        raw_title = _ollama(
            "Based on the following meeting transcript, generate a short, concise title "
            "(maximum 5 words) for the meeting. Return ONLY the title text itself without "
            "any quotes, labels, or additional explanation.\n\nTranscript:\n" + transcript
        )
        generated_title = raw_title.strip().strip("\"'")

        # Update meeting status + title
        query(
            "UPDATE meetings SET status = 'transcribed', title = %s WHERE id = %s",
            (generated_title, meeting_id),
        )
        print(f"DEBUG: Meeting {meeting_id} processed successfully. Title: {generated_title}")

    except Exception as e:
    print(f"ERROR: Processing failed for meeting {meeting_id}: {e}")
    import traceback
    traceback.print_exc()
    query(
        "UPDATE meetings SET status = 'failed' WHERE id = %s",
        (meeting_id,)
    )
    finally:
        # Clean up the audio file after processing (or failure)
        if os.path.exists(audio_path):
            os.remove(audio_path)
            print(f"DEBUG: Cleaned up audio file: {audio_path}")


# ── GET ALL MEETINGS ──────────────────────────────────────────────────────────
@meeting_bp.route("/", methods=["GET"])
@verify_token
def get_all_meetings():
    print(f"DEBUG: Fetching meetings for user {g.user['id']}")
    try:
        rows = query(
    """
    SELECT m.id, m.title, m.status,
           TO_CHAR(m.created_at, 'Mon DD, YYYY HH12:MI AM') AS date,
           EXISTS (SELECT 1 FROM summaries s WHERE s.meeting_id = m.id) AS summary
    FROM meetings m
    WHERE m.user_id = %s
    ORDER BY m.created_at DESC
    """,
    (g.user["id"],),
)
        print(f"DEBUG: Found {len(rows)} meetings")
        return jsonify(rows), 200
    except Exception as e:
        print(f"DEBUG: Error in get_all_meetings: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Failed to fetch meetings", "details": str(e)}), 500


# ── GET MEETING BY ID ─────────────────────────────────────────────────────────
@meeting_bp.route("/<meeting_id>", methods=["GET"])
@verify_token
def get_meeting_by_id(meeting_id):
    meeting_rows = query(
        "SELECT id, title, status, TO_CHAR(created_at, 'Mon DD, YYYY') AS date "
        "FROM meetings WHERE id = %s AND user_id = %s",
        (meeting_id, g.user["id"]),
    )
    if not meeting_rows:
        return jsonify({"error": "Meeting not found"}), 404

    transcript_rows = query(
        "SELECT text FROM transcripts WHERE meeting_id = %s", (meeting_id,)
    )
    summary_rows = query(
        "SELECT summary_text FROM summaries WHERE meeting_id = %s", (meeting_id,)
    )

    m = meeting_rows[0]
    return jsonify({
        "id":         m["id"],
        "title":      m["title"],
        "date":       m["date"],
        "status":     m["status"],
        "transcript": transcript_rows[0]["text"] if transcript_rows else None,
        "summary":    summary_rows[0]["summary_text"] if summary_rows else None,
    }), 200


# ── CREATE MEETING (upload audio) — ASYNC ────────────────────────────────────
@meeting_bp.route("/", methods=["POST"])
@verify_token
def create_meeting():
    user_id = g.user["id"]

    if "audio" not in request.files:
        return jsonify({"error": "No audio uploaded"}), 400

    audio_files = request.files.getlist("audio")
    if not audio_files or all(f.filename == "" for f in audio_files):
        return jsonify({"error": "No audio uploaded"}), 400

    results = []
    
    for audio_file in audio_files:
        if audio_file.filename == "":
            continue
        if not _allowed_audio(audio_file):
            results.append({"filename": audio_file.filename, "error": "Only audio files are allowed"})
            continue

        # Build a unique filename and save to disk
        ext        = os.path.splitext(secure_filename(audio_file.filename))[1]
        filename   = f"{int(time.time() * 1000)}-{uuid.uuid4().hex}{ext}"
        audio_path = os.path.join(UPLOAD_FOLDER, filename)
        audio_file.save(audio_path)

        # Insert meeting row immediately with status = 'processing'
        meeting_rows = query(
            "INSERT INTO meetings (user_id, title, audio_url, status) "
            "VALUES (%s, %s, %s, %s) RETURNING id",
            (user_id, "Untitled Meeting", audio_path, "processing"),
        )
        meeting_id = str(meeting_rows[0]["id"])

        # Kick off transcription + title generation in a background thread
        thread = threading.Thread(
            target=_process_meeting_in_background,
            args=(meeting_id, audio_path, user_id),
            daemon=True,
        )
        thread.start()
        print(f"DEBUG: Meeting {meeting_id} queued for async processing.")
        
        results.append({
            "message":    "Audio received. Processing in the background.",
            "meeting_id": meeting_id,
            "status":     "processing",
            "filename":   audio_file.filename
        })

    # Return immediately — frontend will poll /status
    if not any("error" not in r for r in results):
        return jsonify({"error": "No valid files uploaded", "results": results}), 400

    return jsonify({
        "message": f"{len([r for r in results if 'error' not in r])} files queued for processing",
        "results": results
    }), 202


# ── DELETE MEETING ────────────────────────────────────────────────────────────
@meeting_bp.route("/<meeting_id>", methods=["DELETE"])
@verify_token
def delete_meeting(meeting_id):
    user_id = g.user["id"]
    check = query(
        "SELECT id FROM meetings WHERE id = %s AND user_id = %s",
        (meeting_id, user_id),
    )
    if not check:
        return jsonify({"error": "Meeting not found"}), 404

    query("DELETE FROM summaries   WHERE meeting_id = %s", (meeting_id,))
    query("DELETE FROM transcripts WHERE meeting_id = %s", (meeting_id,))
    query("DELETE FROM meetings    WHERE id = %s",         (meeting_id,))
    return jsonify({"message": "Meeting deleted successfully"}), 200


# ── BULK DELETE ───────────────────────────────────────────────────────────────
@meeting_bp.route("/bulk-delete", methods=["POST"])
@verify_token
def bulk_delete_meetings():
    data    = request.get_json() or {}
    ids     = data.get("ids", [])
    user_id = g.user["id"]

    if not ids or not isinstance(ids, list):
        return jsonify({"error": "No meeting IDs provided"}), 400

    # Verify ownership — filter to only IDs the user owns
    placeholders = ",".join(["%s"] * len(ids))
    check = query(
        f"SELECT id FROM meetings WHERE id IN ({placeholders}) AND user_id = %s",
        (*ids, user_id),
    )
    valid_ids = [row["id"] for row in check]
    if not valid_ids:
        return jsonify({"error": "No valid meetings found to delete"}), 404

    ph = ",".join(["%s"] * len(valid_ids))
    query(f"DELETE FROM summaries   WHERE meeting_id IN ({ph})", tuple(valid_ids))
    query(f"DELETE FROM transcripts WHERE meeting_id IN ({ph})", tuple(valid_ids))
    query(f"DELETE FROM meetings    WHERE id IN ({ph})",         tuple(valid_ids))

    return jsonify({"message": "Meetings deleted successfully", "deletedCount": len(valid_ids)}), 200


# ── SUMMARIZE MEETING ─────────────────────────────────────────────────────────
@meeting_bp.route("/summarize", methods=["POST"])
@verify_token
def summarize_meeting():
    data       = request.get_json() or {}
    meeting_id = data.get("meeting_id")
    if not meeting_id:
        return jsonify({"error": "meeting_id is required"}), 400

    transcript_rows = query(
        "SELECT text FROM transcripts WHERE meeting_id = %s", (meeting_id,)
    )
    if not transcript_rows:
        return jsonify({"error": "No transcript found for this meeting"}), 404

    transcript = transcript_rows[0]["text"]
    summary    = _ollama(f"Summarize the following meeting transcript:\n{transcript}")

    existing = query(
        "SELECT id FROM summaries WHERE meeting_id = %s", (meeting_id,)
    )
    if existing:
        query(
            "UPDATE summaries SET summary_text = %s WHERE meeting_id = %s",
            (summary, meeting_id),
        )
    else:
        query(
            "INSERT INTO summaries (meeting_id, summary_text) VALUES (%s, %s)",
            (meeting_id, summary),
        )

    # Mark meeting as fully completed now that summary exists
    query(
        "UPDATE meetings SET status = 'completed' WHERE id = %s",
        (meeting_id,),
    )

    return jsonify({"summary": summary}), 200


# ── QUERY MEETING (AI Chat) ───────────────────────────────────────────────────
@meeting_bp.route("/query", methods=["POST"])
@verify_token
def query_meeting():
    data       = request.get_json() or {}
    question   = data.get("question", "").strip()
    meeting_id = data.get("meeting_id")

    if not question:
        return jsonify({"error": "question is required"}), 400

    context = ""
    if meeting_id:
        t_rows = query(
            "SELECT text FROM transcripts WHERE meeting_id = %s", (meeting_id,)
        )
        if t_rows:
            context = f"Meeting Transcript:\n{t_rows[0]['text']}\n\n"

    answer = _ollama(
        f"{context}Based on the meeting transcript above, answer the following question:\n{question}"
    )
    return jsonify({"answer": answer}), 200


# ── UPDATE MEETING TITLE ──────────────────────────────────────────────────────
@meeting_bp.route("/<meeting_id>/title", methods=["PUT"])
@verify_token
def update_meeting_title(meeting_id):
    data    = request.get_json() or {}
    title   = data.get("title", "").strip()
    user_id = g.user["id"]

    if not title:
        return jsonify({"error": "Title is required"}), 400

    check = query(
        "SELECT id FROM meetings WHERE id = %s AND user_id = %s",
        (meeting_id, user_id),
    )
    if not check:
        return jsonify({"error": "Meeting not found"}), 404

    query("UPDATE meetings SET title = %s WHERE id = %s", (title, meeting_id))
    return jsonify({"message": "Title updated successfully", "title": title}), 200

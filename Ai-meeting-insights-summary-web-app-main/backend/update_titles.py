import psycopg2
import requests

DB_SETTINGS = dict(
    user="postgres",
    host="localhost",
    database="ai_meeting",
    password="password",
    port=8000,
)

OLLAMA_URL   = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "qwen2:1.5b"


def generate_title(transcript: str) -> str:
    resp = requests.post(
        OLLAMA_URL,
        json={
            "model": OLLAMA_MODEL,
            "prompt": (
                "Based on the following meeting transcript, generate a short, concise title "
                "(maximum 5 words) for the meeting. Return ONLY the title text itself without "
                "any quotes, labels, or additional explanation.\n\nTranscript:\n" + transcript
            ),
            "stream": False,
        },
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()["response"].strip().strip("\"'")


def main():
    print("Starting script to update past meetings...")

    conn = psycopg2.connect(**DB_SETTINGS)
    cur  = conn.cursor()

    cur.execute("""
        SELECT m.id, t.text AS transcript
        FROM meetings m
        JOIN transcripts t ON m.id = t.meeting_id
        WHERE m.title = 'Untitled Meeting' OR m.title IS NULL
    """)
    meetings = cur.fetchall()
    print(f"Found {len(meetings)} meetings to update.")

    for meeting_id, transcript in meetings:
        print(f"Processing meeting ID: {meeting_id}")
        try:
            title = generate_title(transcript)
            print(f'Generated title: "{title}"')
            cur.execute(
                "UPDATE meetings SET title = %s WHERE id = %s",
                (title, meeting_id),
            )
            conn.commit()
            print(f"Updated meeting ID {meeting_id} successfully.")
        except Exception as e:
            print(f"Failed to process meeting ID {meeting_id}: {e}")

    cur.close()
    conn.close()
    print("Finished updating past meetings.")


if __name__ == "__main__":
    main()

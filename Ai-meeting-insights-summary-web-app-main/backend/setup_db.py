import psycopg2
from psycopg2 import sql

# ── Connection settings ───────────────────────────────────────────────────────
PG_SETTINGS = dict(
    user="postgres",
    host="localhost",
    password="password",
    port=8000,
)

AI_MEETING_DB = dict(**PG_SETTINGS, database="ai_meeting")


def run():
    # Step 1: Connect to default "postgres" database to create ai_meeting
    conn = psycopg2.connect(**PG_SETTINGS, database="postgres")
    conn.autocommit = True
    cur = conn.cursor()

    cur.execute("SELECT 1 FROM pg_database WHERE datname = 'ai_meeting'")
    if cur.fetchone():
        print("Database ai_meeting already exists.")
    else:
        cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier("ai_meeting")))
        print("Database ai_meeting created.")

    cur.close()
    conn.close()

    # Step 2: Connect to ai_meeting and create tables
    conn2 = psycopg2.connect(**AI_MEETING_DB)
    conn2.autocommit = True
    cur2 = conn2.cursor()

    cur2.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id                    SERIAL PRIMARY KEY,
            full_name             VARCHAR(255) NOT NULL,
            email                 VARCHAR(255) UNIQUE NOT NULL,
            password_hash         VARCHAR(255) NOT NULL,
            reset_password_token  VARCHAR(255),
            reset_password_expires TIMESTAMP,
            created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    print("Created users table.")

    cur2.execute("""
        CREATE TABLE IF NOT EXISTS meetings (
            id         SERIAL PRIMARY KEY,
            user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
            title      VARCHAR(255) NOT NULL,
            audio_url  TEXT,
            status     VARCHAR(50) DEFAULT 'Processing',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    print("Created meetings table.")

    cur2.execute("""
        CREATE TABLE IF NOT EXISTS transcripts (
            id         SERIAL PRIMARY KEY,
            meeting_id INTEGER REFERENCES meetings(id) ON DELETE CASCADE,
            text       TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    print("Created transcripts table.")

    cur2.execute("""
        CREATE TABLE IF NOT EXISTS summaries (
            id           SERIAL PRIMARY KEY,
            meeting_id   INTEGER REFERENCES meetings(id) ON DELETE CASCADE,
            summary_text TEXT NOT NULL,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    print("Created summaries table.")

    cur2.close()
    conn2.close()
    print("Database setup complete.")


if __name__ == "__main__":
    run()

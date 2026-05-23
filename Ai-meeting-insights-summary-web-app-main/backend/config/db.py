import os
import psycopg2
from psycopg2 import pool
from dotenv import load_dotenv

load_dotenv()

connection_pool = pool.ThreadedConnectionPool(
    minconn=1,
    maxconn=10,
    user=os.getenv("DB_USER", "postgres"),
    host=os.getenv("DB_HOST", "localhost"),
    database=os.getenv("DB_NAME", "ai_meeting"),
    password=os.getenv("DB_PASSWORD", "2063$8069"),
    port=int(os.getenv("DB_PORT", 8000)),
)


def get_conn():
    """Get a connection from the pool."""
    return connection_pool.getconn()


def release_conn(conn):
    """Return a connection to the pool."""
    connection_pool.putconn(conn)


def query(sql: str, params=None):
    """
    Execute a query and return a list of dicts (like pg's result.rows).
    For INSERT/UPDATE/DELETE with RETURNING, also returns rows.
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            conn.commit()
            try:
                columns = [desc[0] for desc in cur.description]
                rows = [dict(zip(columns, row)) for row in cur.fetchall()]
                return rows
            except Exception:
                return []
    except Exception:
        conn.rollback()
        raise
    finally:
        release_conn(conn)

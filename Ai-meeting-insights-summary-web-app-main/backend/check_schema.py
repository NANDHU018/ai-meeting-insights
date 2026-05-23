import psycopg2

def check_schema():
    conn = psycopg2.connect(user='postgres', host='localhost', database='ai_meeting', password='password', port=8000)
    cur = conn.cursor()
    
    tables = ['transcripts', 'summaries']
    for table in tables:
        print(f"\n--- {table.upper()} ---")
        cur.execute(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '{table}'")
        cols = cur.fetchall()
        for col in cols:
            print(f"{col[0]}: {col[1]}")
            
    cur.close()
    conn.close()

if __name__ == "__main__":
    check_schema()

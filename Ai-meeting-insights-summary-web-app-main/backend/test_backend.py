import requests

def test_backend():
    base_url = "http://127.0.0.1:5000"
    
    # Login
    print("Testing Login...")
    login_data = {"email": "aimeetsummary@gmail.com", "password": "password"}
    login_resp = requests.post(f"{base_url}/api/auth/login", json=login_data)
    print(f"Login Status: {login_resp.status_code}")
    if login_resp.status_code != 200:
        print(f"Login Response: {login_resp.text}")
        return
        
    token = login_resp.json().get("token")
    print(f"Token received. Fetching meetings...")
    
    # Fetch Meetings
    headers = {"Authorization": f"Bearer {token}"}
    meetings_resp = requests.get(f"{base_url}/api/meetings", headers=headers)
    print(f"Meetings Status: {meetings_resp.status_code}")
    print(f"Meetings Response: {meetings_resp.text}")

if __name__ == "__main__":
    test_backend()

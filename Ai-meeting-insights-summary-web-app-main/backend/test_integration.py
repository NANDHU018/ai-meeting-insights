import requests
import uuid

def test_full_cycle():
    base_url = "http://127.0.0.1:5000"
    unique_email = f"test_{uuid.uuid4().hex[:6]}@example.com"
    password = "testpassword123"
    
    # 1. Register
    print(f"Registering user: {unique_email}")
    reg_data = {"full_name": "Test User", "email": unique_email, "password": password}
    reg_resp = requests.post(f"{base_url}/api/auth/register", json=reg_data)
    print(f"Register Status: {reg_resp.status_code}")
    if reg_resp.status_code != 201:
        print(reg_resp.text)
        return

    # 2. Login
    print("Logging in...")
    login_data = {"email": unique_email, "password": password}
    login_resp = requests.post(f"{base_url}/api/auth/login", json=login_data)
    print(f"Login Status: {login_resp.status_code}")
    if login_resp.status_code != 200:
        print(login_resp.text)
        return
        
    token = login_resp.json()["token"]
    print("Login successful. Fetching meetings...")
    
    # 3. Fetch Meetings
    headers = {"Authorization": f"Bearer {token}"}
    meetings_resp = requests.get(f"{base_url}/api/meetings", headers=headers)
    print(f"Meetings Status: {meetings_resp.status_code}")
    print(f"Meetings Response: {meetings_resp.text}")

if __name__ == "__main__":
    test_full_cycle()

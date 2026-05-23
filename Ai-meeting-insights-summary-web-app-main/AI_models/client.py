import os
import requests
import ollama
url = "http://127.0.0.1:8000/transcribe"
audio_path = "output.wav"  # Path to your audio file

with open(audio_path, "rb") as f:
	files = {"file": f}
	response = requests.post(url, files=files)

response.raise_for_status()
data = response.json()

transcript_text = data.get("text", "")
# If server returned a transcript file path, use it; otherwise name after the audio file
transcript_path = data.get("transcript_file")
if not transcript_path:
	transcript_path = os.path.splitext(audio_path)[0] + ".txt"

with open(transcript_path, "w", encoding="utf-8") as out:
	out.write(transcript_text)

print(f"Wrote transcript to {transcript_path}")





with open("uploads/output.txt", "r") as file:
    text = file.read()

summary = ollama.chat(
    model="llama3.1:8b",
    messages=[
        {"role": "user", "content": f"this is a meeting transcript:\n{text}\n summarize it and dont use any past prompt information,and it should only include topics discussed in the meeting also, if same querry is asked twice, give the previous answer"}
    ]
)

print("SUMMARY:\n", summary["message"]["content"])



# Question Answering
qa = ollama.chat(
    model="llama3.1:8b",
    messages=[
        {
            "role": "user",
            "content": f"Based only on this text:\n{text}\nwhat is meeting"
        }
    ]
)

print("\nANSWER:\n", qa["message"]["content"])

import json
import datetime
import os

JSON_FILE = 'data/checkpoint.json'

def load_data():
    if not os.path.exists(JSON_FILE):
        return []
    with open(JSON_FILE, 'r') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []

def save_data(data):
    with open(JSON_FILE, 'w') as f:
        json.dump(data, f, indent=4)
    print(f"\nAdded new checkpoint successfully")

def main():
    print("----New Checkpoint Entry----")
    song_title = input("Song Title - Artist").strip()
    song_url = input("Song URL: ").strip()
    data = load_data()

    new_id = "01"
    if len(data) > 0:
        last_id = data[0].get('id', "00")
        try:
            new_id = f"{int(last_id) + 1:02d}"
        except ValueError:
            new_id = "01"
    
    today = datetime.datetime.now().strftime("%d %b %Y").upper()

    new_entry = {
        "id": new_id,
        "date": today,
        "songTitle": song_title,
        "songFile": song_url
    }

    data.insert(0, new_entry)
    save_data(data)
    print(f"Added: NO.{new_id} | {song_title}")

if __name__ == "__main__":
    main()
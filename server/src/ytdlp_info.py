import yt_dlp
import sys
import json

if len(sys.argv) < 2:
    print(json.dumps({"error": "No URL provided"}))
    sys.exit(1)

url = sys.argv[1]

ydl_opts = {
    'quiet': True,
    'no_warnings': True,
}
try:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        print(json.dumps(info))
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)

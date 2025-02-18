from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import numpy as np
import scipy.io.wavfile as wav
import io
import yt_dlp
import os

app = Flask(__name__)
CORS(app)

@app.route('/api/yo', methods=['GET'])
def hello():
    return jsonify({'message': 'yo'})

@app.route('/api/echo', methods=['POST'])
def echo():
    data = request.json
    return jsonify({'received': data})

@app.route("/upload-audio", methods=["POST"])
def upload_audio():
    if "audio" not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files["audio"]
    raw_audio = file.read()

    audio_array = np.frombuffer(raw_audio, dtype=np.float32)
    wav.write("received_audio.wav", 44100, audio_array)
    return jsonify({"message": "Audio received and saved"}), 200

@app.route("/download-youtube", methods=["POST"])
def download_youtube():
    data = request.json
    if not data or "url" not in data:
        return jsonify({"error": "No URL provided"}), 400
    
    url = data["url"]
    output_path = "downloads"
    os.makedirs(output_path, exist_ok=True)
    output_file = os.path.join(output_path, "audio.mp3")

    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'outtmpl': output_file,
        'quiet': True
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        return send_file(output_file, as_attachment=True)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=6969)

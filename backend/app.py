from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import numpy as np
import scipy.io.wavfile as wav
import io
import yt_dlp
import os
import glob

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

    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'outtmpl': os.path.join(output_path, '%(title)s.%(ext)s'),
        'quiet': True
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info_dict = ydl.extract_info(url, download=False)  # Get metadata
            file_path = ydl.prepare_filename(info_dict)  # Predict the filename
            file_path = os.path.splitext(file_path)[0] + ".mp3"  # Ensure .mp3 extension

            ydl.download([url])  # Download

        return send_file(file_path, as_attachment=True, mimetype="audio/mpeg")

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=6969)

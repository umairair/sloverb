from flask import Flask, jsonify, request, send_file, after_this_request
from flask_cors import CORS
import numpy as np
import scipy.io.wavfile as wav
import io, os, yt_dlp

app = Flask(__name__)
CORS(app)
  
@app.route("/upload-audio", methods=["POST"])
def upload_audio():
    if "audio" not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files["audio"]
    raw_audio = file.read()

    audio_array = np.frombuffer(raw_audio, dtype=np.float32)
    
    sample_rate = 44100
    audio_io = io.BytesIO()
    wav.write(audio_io, sample_rate, audio_array)
    audio_io.seek(0)
    
    return send_file(audio_io, mimetype="audio/wav", as_attachment=True, download_name="audio.wav")

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
        'outtmpl': os.path.join(output_path, '%(id)s.%(ext)s'),
        'quiet': True,
        
    }


    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info_dict = ydl.extract_info(url, download=False)  
            file_path = ydl.prepare_filename(info_dict)  
            file_path = os.path.splitext(file_path)[0] + ".mp3"  

            ydl.download([url]) 

        return send_file(file_path, as_attachment=True, mimetype="audio/mpeg")

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=6969)  
    
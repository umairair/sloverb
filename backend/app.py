from flask import Flask, jsonify, request
from flask_cors import CORS
import numpy as np
import scipy.io.wavfile as wav
import io


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
    raw_audio = file.read()  # Read binary data

    # Convert binary to NumPy array
    audio_array = np.frombuffer(raw_audio, dtype=np.float32)

    # Save as WAV file (optional, for debugging)
    wav.write("received_audio.wav", 44100, audio_array)  # Assuming 44.1kHz sample rate

    return jsonify({"message": "Audio received and saved"}), 200


if __name__ == '__main__':

    app.run(debug=True, port=6969)  

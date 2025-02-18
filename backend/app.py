from flask import Flask, jsonify, request
from flask_cors import CORS


app = Flask(__name__)
CORS(app) 

@app.route('/api/yo', methods=['GET'])
def hello():
    return jsonify({'message': 'yo'})

@app.route('/api/echo', methods=['POST'])
def echo():
    data = request.json
    return jsonify({'received': data})
if __name__ == '__main__':

    app.run(debug=True, port=6969)  

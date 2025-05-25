# Multimodal Live API Demo
- `backend/main.py`: The Python backend code
- `backend/requirements.txt`: Lists the required Python dependencies

- `frontend/index.html`: The frontend HTML app
- `frontend/script.js`: Main frontend JavaScript code
- `frontend/gemini-live-api.js`: Script for interacting with the Gemini API
- `frontend/live-media-manager.js`: Script for handling media input and output
- `frontend/pcm-processor.js`: Script for processing PCM audio
- `frontend/cookieJar.js`: Script for managing cookies


python -m venv env
source env/bin/activate

pip3 install -r backend/requirements.txt

python backend/main.py

Start the frontend

cd frontend
python -m http.server

Google Cloud access token
gcloud components update
gcloud components install beta
gcloud config set project YOUR-PROJECT-ID
gcloud auth print-access-token


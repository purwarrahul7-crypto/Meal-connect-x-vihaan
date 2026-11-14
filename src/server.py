
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import io
import soundfile as sf
from run import Mithi

print("Loading Mithi Hindi voice model...")
tts = Mithi(device="cpu")
print("Voice model ready!")

class VoiceHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "http://localhost:5173")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        if self.path != "/tts":
            self.send_error(404)
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length))
            text = data.get("text", "").strip()

            if not text:
                self.send_error(400, "Text is required")
                return

            audio = tts.synthesize(text, lang="hi", voice="nakul")

            buffer = io.BytesIO()
            sf.write(buffer, audio, 24000, format="WAV")
            wav = buffer.getvalue()

            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "http://localhost:5173")
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(wav)))
            self.end_headers()
            self.wfile.write(wav)

        except Exception as error:
            print("TTS error:", error)
            self.send_error(500, str(error))

    def log_message(self, format, *args):
        print(*args)

server = HTTPServer(("127.0.0.1", 8000), VoiceHandler)
print("MealConnect voice server running at http://127.0.0.1:8000")
server.serve_forever()

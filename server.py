import http.server
import socketserver
import os
import sys

PORT = 8000

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS and Cross-Origin Isolation headers for FFmpeg.wasm
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

if __name__ == "__main__":
    # Change directory to the directory of the script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    # Use ThreadingHTTPServer if available (Python 3.7+), otherwise standard TCPServer
    if sys.version_info >= (3, 7):
        server_class = http.server.ThreadingHTTPServer
    else:
        server_class = socketserver.TCPServer
        
    server_class.allow_reuse_address = True
    
    with server_class(("", PORT), MyHTTPRequestHandler) as httpd:
        print(f"Server successfully started on http://localhost:{PORT}")
        print("COOP/COEP headers enabled. FFmpeg.wasm is ready.")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopping server...")

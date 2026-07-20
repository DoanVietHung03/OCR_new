from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path


def main() -> None:
    web_root = Path(__file__).resolve().parents[2] / "web"
    handler = lambda *args, **kwargs: SimpleHTTPRequestHandler(*args, directory=web_root, **kwargs)
    print("Serving http://localhost:8000")
    ThreadingHTTPServer(("", 8000), handler).serve_forever()


if __name__ == "__main__":
    main()


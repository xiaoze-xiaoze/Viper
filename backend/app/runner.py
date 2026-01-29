import argparse
import socket
import sys
import threading
import time
import webbrowser

import uvicorn


def _pick_free_port(host: str) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((host, 0))
        return int(s.getsockname()[1])


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="viper")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--open", dest="open_browser", action="store_true")
    parser.add_argument("--no-open", dest="open_browser", action="store_false")
    parser.set_defaults(open_browser=True)
    args = parser.parse_args(argv)

    host = str(args.host)
    port = int(args.port)
    if port == 0:
        port = _pick_free_port(host)

    url = f"http://{host}:{port}/"

    if args.open_browser:
        def _open():
            time.sleep(0.8)
            try:
                webbrowser.open(url, new=1, autoraise=True)
            except Exception:
                pass

        threading.Thread(target=_open, daemon=True).start()

    uvicorn.run("backend.app.main:app", host=host, port=port, log_level="info")


if __name__ == "__main__":
    main(sys.argv[1:])

import asyncio
import os
from fastapi import FastAPI
import uvicorn
from argparse import ArgumentParser
from ell.studio.config import Config
from ell.studio.logger import setup_logging
from ell.studio.server import create_app
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import time


def main():
    setup_logging()
    parser = ArgumentParser(description="ELL Studio Data Server")
    parser.add_argument("--storage-dir", default=None,
                        help="Directory for filesystem serializer storage (default: current directory)")
    parser.add_argument("--pg-connection-string", default=None,
                        help="PostgreSQL connection string (default: None)")
    parser.add_argument("--mqtt-connection-string", default=None,
                        help="MQTT connection string (default: None)")
    parser.add_argument("--host", default="0.0.0.0",
                        help="Host to run the server on")
    parser.add_argument("--port", type=int, default=8080,
                        help="Port to run the server on")
    parser.add_argument("--dev", action="store_true",
                        help="Run in development mode")
    args = parser.parse_args()

    config = Config(
        storage_dir=args.storage_dir,
        pg_connection_string=args.pg_connection_string,
        mqtt_connection_string=args.mqtt_connection_string
    )

    app = create_app(config)

    if not args.dev:
        # In production mode, serve the built React app
        static_dir = os.path.join(os.path.dirname(__file__), "static")
        app.mount("/", StaticFiles(directory=static_dir,
                  html=True), name="static")

        @app.get("/{full_path:path}")
        async def serve_react_app(full_path: str):
            return FileResponse(os.path.join(static_dir, "index.html"))

    db_path = os.path.join(
        args.storage_dir, "ell.db") if args.storage_dir else None

    async def db_watcher(db_path: str, app: FastAPI):
        last_stat = None

        while True:
            await asyncio.sleep(0.1)  # Fixed interval of 0.1 seconds
            try:
                current_stat = os.stat(db_path)

                if last_stat is None:
                    print(f"Database file found: {db_path}")
                    await app.notify_clients("database_updated")
                else:
                    # Use a threshold for time comparison to account for filesystem differences
                    time_threshold = 1  # 1 second threshold
                    time_changed = abs(
                        current_stat.st_mtime - last_stat.st_mtime) > time_threshold
                    size_changed = current_stat.st_size != last_stat.st_size
                    inode_changed = current_stat.st_ino != last_stat.st_ino

                    if time_changed or size_changed or inode_changed:
                        print(f"Database changed: mtime {time.ctime(last_stat.st_mtime)} -> {time.ctime(current_stat.st_mtime)}, "
                              f"size {
                                  last_stat.st_size} -> {current_stat.st_size}, "
                              f"inode {last_stat.st_ino} -> {current_stat.st_ino}")
                        await app.notify_clients("database_updated")

                last_stat = current_stat
            except FileNotFoundError:
                if last_stat is not None:
                    print(f"Database file deleted: {db_path}")
                    await app.notify_clients("database_updated")
                last_stat = None
                # Wait a bit longer if the file is missing
                await asyncio.sleep(1)
            except Exception as e:
                print(f"Error checking database file: {e}")
                await asyncio.sleep(1)  # Wait a bit longer on errors

    # Start the database watcher
    loop = asyncio.new_event_loop()

    config = uvicorn.Config(app=app, host=args.host, port=args.port, loop=loop)
    server = uvicorn.Server(config)

    tasks = []
    tasks.append(loop.create_task(server.serve()))

    if db_path:
        tasks.append(loop.create_task(db_watcher(db_path, app)))

    loop.run_forever()


if __name__ == "__main__":
    main()

from fastapi import FastAPI, WebSocket
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles

from qr_file_sender import read_blocks

app = FastAPI()

origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    data = await websocket.receive_bytes()

    delimiter = b"@@"
    name_i = data.find(delimiter)
    name = data[:name_i]
    file_data = data[name_i + len(delimiter):]
    name = name.decode("utf-8")
    blocker = read_blocks(name, file_data)

    for i, block in enumerate(blocker):
        await websocket.send_text(block)
        if i > 0 and i % 100 == 0:
            print(f"Sending block {i}")
            await websocket.send_text("NEXT?")
            message = await websocket.receive_text()
            if message != "NEXT":
                print("Client didn't respond with NEXT")
                break

    await websocket.close()


app.mount("/", StaticFiles(directory="./gui", html=True), name="gui")


if __name__ == '__main__':
    uvicorn.run(app, host="0.0.0.0", port=8000)

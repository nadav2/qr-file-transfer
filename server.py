import base64
import math
import os
import tempfile
from typing import List

import lt
from fastapi import FastAPI, WebSocket, File, Form, UploadFile
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import airport.decode as decoder
import airport.encode as encoder
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

class FileReq(BaseModel):
    name: str


@app.websocket("/ws/send_file")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    data = await websocket.receive_bytes()

    delimiter = b"@@"
    split_data = data.split(delimiter)
    name = split_data[0].decode("utf-8")
    resolution = int(split_data[1].decode("utf-8"))
    file_data = delimiter.join(split_data[2:])

    blocker = read_blocks(name, file_data, block_size=resolution)

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


@app.websocket("/ws/receive_file")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    decoder = lt.decode.LtDecoder()

    while True:
        qr_data = await websocket.receive_text()
        bytes_data = base64.b64decode(qr_data)
        block = lt.decode.block_from_bytes(bytes_data)
        decoder.consume_block(block)

        num_block = decoder.block_graph.num_blocks
        eliminated = len(decoder.block_graph.eliminated)
        progress_val = math.log(eliminated + 1, num_block + 1)

        await websocket.send_text(str(progress_val))
        if decoder.is_done():
            file_bytes = decoder.bytes_dump()

            splitter = b"@@"
            file_name_i = file_bytes.find(splitter)
            file_name = file_bytes[:file_name_i]
            file_data_bytes = file_bytes[file_name_i + len(splitter):]

            await websocket.send_text("FILE_NAME:" + file_name.decode("utf-8"))
            await websocket.send_bytes(file_data_bytes)


@app.post("/encode_chunks")
def encode_chunks_action(file: UploadFile = File(...), chunk_size_mb: str = Form(...), ext: str = Form(...)):
    print(f"Encoding chunks with size: {file.size} bytes")
    chunk_size_bytes = int(float(chunk_size_mb) * 1_000_000)
    file_bytes = file.file.read()

    return StreamingResponse(
        encoder.encode_chunks_from_io(file_bytes, chunk_size_bytes, ext),
        media_type="text/plain"
    )



@app.post("/decode_chunks")
def decode_chunks_action(files: List[UploadFile] = File(...), ext: str = Form(...)):
    decoder.decode_chunks
    return {}


@app.get("/")
async def root():
    return RedirectResponse(url="/sender")


os.makedirs("output", exist_ok=True)
app.mount("/output", StaticFiles(directory="./output"), name="output")
app.mount("/", StaticFiles(directory="./gui", html=True), name="gui")


if __name__ == '__main__':
    port = os.environ.get("PORT", 8000)
    uvicorn.run(app, host="localhost", port=int(port))

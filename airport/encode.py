import base64
import hashlib
import json
import math
import os
import string
from typing import BinaryIO, Generator

import tqdm
import pandas as pd


def stream_to_base64_chunks(file_obj: BinaryIO, chunk_size: int) -> Generator[str, None, None]:
    """Stream file contents and yield base64 encoded chunks"""
    b64_encoder = base64.b64encode
    input_hash = hashlib.sha1()
    while True:
        chunk = file_obj.read(chunk_size)
        if not chunk:
            break
        input_hash.update(chunk)
        yield b64_encoder(chunk).decode('utf-8')

    yield "hash", input_hash.hexdigest()


def distribute_to_letters(b64_chunk: str) -> dict:
    """Distribute base64 chunk across lowercase letters"""
    abc = string.ascii_lowercase
    sm_chunk_size = math.ceil(len(b64_chunk) / len(abc))
    json_chunk = {}

    for j, letter in enumerate(abc):
        start = j * sm_chunk_size
        end = start + sm_chunk_size
        json_chunk[letter] = b64_chunk[start:end]

    return json_chunk

EXCEL_CHUNK_SIZE = 20_000

def stream_chunk_to_excel(json_chunk: dict, path: str):
    """Write chunk to Excel file using chunks to minimize memory usage"""
    # Calculate number of parts needed
    df_chunk = {}
    num_of_parts = math.ceil(len(json_chunk["a"]) / EXCEL_CHUNK_SIZE)
    for k, v in json_chunk.items():
        if k == "idx":
            continue
        parts = []
        for i in range(num_of_parts):
            start = i * EXCEL_CHUNK_SIZE
            end = start + EXCEL_CHUNK_SIZE
            parts.append(v[start:end])
        df_chunk[k] = parts

    df = pd.DataFrame(df_chunk)
    df["idx"] = json_chunk["idx"]
    df.to_excel(path, index=False)


def encode_chunks(input_path: str, out: str, chunk_size: int = 50_000_000, ext: str = "json"):
    """Create chunks from input file using streaming"""
    os.makedirs(out, exist_ok=True)
    n_iter = math.ceil(os.path.getsize(input_path) / chunk_size)

    with open(input_path, 'rb') as f:
        for idx, b64_chunk in enumerate(tqdm.tqdm(
                stream_to_base64_chunks(f, chunk_size), desc="Creating chunks", total=n_iter)
        ):
            if type(b64_chunk) == tuple and b64_chunk[0] == "hash":
                return b64_chunk[1]

            json_chunk = distribute_to_letters(b64_chunk)
            json_chunk['idx'] = idx

            f_name = f"{out}/chunk_{idx}"
            if ext == "json":
                with open(f"{f_name}.json", "w") as chunk_file:
                    chunk_file.write(json.dumps(json_chunk))
            elif ext == "xlsx":
                stream_chunk_to_excel(json_chunk, f"{f_name}.xlsx")



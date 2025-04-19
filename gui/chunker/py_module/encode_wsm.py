import base64
import hashlib
import json
import math
import os
import shutil
import string
from pathlib import Path
from typing import BinaryIO, Generator
from uuid import uuid4
import zipfile

import tqdm
import pandas as pd

EXCEL_CHUNK_SIZE = 20_000


def zip_directory(directory_path: str, output_path: str = None):
    directory = Path(directory_path)

    if output_path is None:
        output_path = directory.parent / f"{directory.name}.zip"

    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(directory):
            for file in files:
                if file.endswith(".txt"):
                    continue

                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, directory)
                zipf.write(file_path, rel_path)

    return str(output_path)


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


def encode_chunks(input_path: str, out: str, chunk_size: int = 50_000_000, ext: str = "json", chunk_name: str = "chunk",
                  seek_n: int = 0):
    """Create chunks from input file using streaming"""
    n_iter = math.ceil(os.path.getsize(input_path) / chunk_size)
    b64_chunk_name = chunk_name if chunk_name == "chunk" else base64.b64encode(chunk_name.encode()).decode('utf-8')

    with open(input_path, 'rb') as f:
        f.seek(chunk_size * seek_n, os.SEEK_SET)

        for idx, b64_chunk in enumerate(tqdm.tqdm(
                stream_to_base64_chunks(f, chunk_size), desc="Creating chunks", total=n_iter)
        ):
            idx_n = idx + seek_n
            if type(b64_chunk) == tuple and b64_chunk[0] == "hash":
                return b64_chunk[1]

            json_chunk = distribute_to_letters(b64_chunk)
            json_chunk['idx'] = idx_n

            f_name = f"{out}/{b64_chunk_name}_{idx_n}"
            if ext == "json":
                with open(f"{f_name}.json", "w") as chunk_file:
                    chunk_file.write(json.dumps(json_chunk))
            elif ext == "xlsx":
                stream_chunk_to_excel(json_chunk, f"{f_name}.xlsx")

            yield {"idx": idx_n + 1, "n": n_iter}


def encode_chunks_from_io(file_name: str, chunk_size_mb: int, ext: str) -> Generator:
    output_dir = "/output_chunks"
    output_zips = "/output_zips"

    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)

    if os.path.exists(output_zips):
        shutil.rmtree(output_zips)

    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(output_zips, exist_ok=True)
    chunk_size = int(float(chunk_size_mb) * 1_000_000)

    for val in encode_chunks(input_path=file_name, out=output_dir, ext=ext, chunk_name=file_name,
                             chunk_size=chunk_size):
        yield val

    zip_file = zip_directory(output_dir, os.path.join(output_zips, f"{uuid4().hex}.zip"))
    shutil.rmtree(output_dir)
    yield {"path": zip_file}

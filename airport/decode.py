import base64
import hashlib
import json
import os
import string
import tempfile
from typing import List
import tqdm
import pandas as pd


def stream_decode_chunk(chunk_data: dict) -> bytes:
    """Decode a single chunk to bytes"""
    chunk_parts = []
    for letter in string.ascii_lowercase:
        lt = chunk_data[letter]
        if lt and not pd.isnull(lt):
            chunk_parts.append(lt)

    return base64.b64decode("".join(chunk_parts))


def excel_to_chunk(path: str) -> dict:
    """Read Excel chunk with minimal memory usage"""
    df = pd.read_excel(path)
    json_chunk = {}
    for letter in string.ascii_lowercase:
        json_chunk[letter] = df[letter].dropna().sum()
    json_chunk["idx"] = df["idx"].iloc[0]
    return json_chunk


def decode_chunks(src: str, output_path: str, ext: str = "json"):
    """Decode chunks and stream to output file"""
    files = os.listdir(src)
    sorted_files = sorted(files, key=lambda x: int(x.split("_")[1].split(".")[0]))

    with open(output_path, 'wb') as out_file:
        hash_obj = hashlib.sha1()

        for idx, file in tqdm.tqdm(enumerate(sorted_files), desc="Decoding chunks"):
            if ext in ["xlsx", "auto"] and file.endswith(".xlsx"):
                chunk_data = excel_to_chunk(f"{src}/{file}")
            elif ext in ["json", "auto"] and file.endswith(".json"):
                with open(f"{src}/{file}", "r") as f:
                    chunk_data = json.load(f)
            else:
                print(f"Unknown file format: {file}")
                continue

            chunk_bytes = stream_decode_chunk(chunk_data)
            out_file.write(chunk_bytes)
            hash_obj.update(chunk_bytes)
            yield {"idx": idx + 1, "n": len(sorted_files)}

    return hash_obj.hexdigest()


def decode_chunks_from_io(src: str, output_path: str, ext: str, temp_dir: tempfile.TemporaryDirectory):
    for val in decode_chunks(src, output_path, ext):
        yield json.dumps(val)

    temp_dir.cleanup()
    yield json.dumps({"path": output_path})


if __name__ == '__main__':
    decode_chunks("wiki_en", "he.zim", "xlsx")

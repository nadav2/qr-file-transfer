import base64
import hashlib
import json
import os
import shutil
import string
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


def decode_chunks_from_io(src: str, ext: str = "json"):
    """Decode chunks and stream to output file"""
    output_dir = "/output_source"
    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)
    os.makedirs(output_dir, exist_ok=True)

    files = os.listdir(src)
    sorted_files = sorted(files, key=lambda x: int(x.split("_")[1].split(".")[0]))

    org_chunk_name = sorted_files[0].split("_")[0]
    b64_chunk_name = base64.b64decode(org_chunk_name).decode('utf-8')
    output_path = f"{output_dir}/{b64_chunk_name}"
    yield {"path": output_path}

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

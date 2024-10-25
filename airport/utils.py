import zipfile
from pathlib import Path
import os


def zip_directory(directory_path: str, output_path: str = None):
    """
    Create a ZIP file from a directory.

    Args:
        directory_path (str): Path to the directory to zip
        output_path (str, optional): Path where to save the ZIP file.
            If not provided, creates ZIP in the same location as directory

    Returns:
        str: Path to the created ZIP file
    """
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

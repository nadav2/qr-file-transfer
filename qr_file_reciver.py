import base64
import hashlib
import math
import sys
import cv2
import lt
from tqdm import tqdm


def draw_qr_bbox(frame: cv2.UMat, bbox) -> cv2.UMat:
    bbox = bbox.astype(int)
    frame = cv2.rectangle(frame, bbox[0][0], bbox[0][2], (255, 0, 0), 2)
    return frame


def draw_qr_text(frame: cv2.UMat, text: str) -> cv2.UMat:
    frame = cv2.putText(
        img=frame,
        text=hashlib.md5(text.encode()).hexdigest()[-10:],
        org=(50, 50),
        fontFace=cv2.FONT_HERSHEY_SIMPLEX,
        fontScale=1,
        color=(0, 0, 255),
        thickness=2,
        lineType=cv2.LINE_AA
    )
    return frame

def read_file():
    camera_id = 0
    delay = 1
    window_name = 'QR File Receiver'

    if sys.platform == "win32":
        cap = cv2.VideoCapture(camera_id, cv2.CAP_DSHOW)
    else:
        cap = cv2.VideoCapture(camera_id)
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    decoder = lt.decode.LtDecoder()
    decoder.done = False
    bar = tqdm(unit="blocks", desc="Receiving file")
    bar_val = 0
    qr_detector = cv2.QRCodeDetector()

    while True:
        try:
            ret, frame = cap.read()

            if not ret:
                print("Can't receive frame (stream end?). Exiting ...")
                break

            qr_data, bbox, _ = qr_detector.detectAndDecode(frame)
            if bbox is not None:
                frame = draw_qr_bbox(frame, bbox)

            if qr_data:
                frame = draw_qr_text(frame, qr_data)
                bytes_data = base64.b64decode(qr_data)
                block = lt.decode.block_from_bytes(bytes_data)
                decoder.consume_block(block)

                num_block = decoder.block_graph.num_blocks
                eliminated = len(decoder.block_graph.eliminated)
                bar.total = num_block
                new_bar_val = round(math.log(eliminated + 1, num_block + 1) * num_block, 3)
                bar.update(new_bar_val - bar_val)
                bar_val = new_bar_val

                if decoder.is_done():
                    file_bytes = decoder.bytes_dump()
                    splitter = b"@@"
                    file_name_i = file_bytes.find(splitter)
                    file_name = file_bytes[:file_name_i]
                    file_data_bytes = file_bytes[file_name_i + len(splitter):]

                    with open(file_name, 'wb') as f:
                        f.write(file_data_bytes)

            cv2.imshow(window_name, frame)

            if (cv2.waitKey(delay) & 0xFF == ord('q')) or decoder.is_done():
                break
        except Exception as e:
            print(e)

    cv2.destroyWindow(window_name)


if __name__ == '__main__':
    read_file()

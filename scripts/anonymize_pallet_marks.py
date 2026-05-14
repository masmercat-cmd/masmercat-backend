from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import cv2
import numpy as np


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


@dataclass
class Region:
    x: int
    y: int
    w: int
    h: int
    score: float

    @property
    def area(self) -> int:
        return self.w * self.h


def iter_images(path: Path) -> Iterable[Path]:
    if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
        yield path
        return

    for file_path in sorted(path.iterdir()):
        if file_path.is_file() and file_path.suffix.lower() in IMAGE_EXTENSIONS:
            yield file_path


def resize_for_detection(image: np.ndarray, max_side: int = 1600) -> tuple[np.ndarray, float]:
    height, width = image.shape[:2]
    longest = max(height, width)
    if longest <= max_side:
        return image.copy(), 1.0

    scale = max_side / float(longest)
    resized = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    return resized, scale


def find_mark_regions(image: np.ndarray) -> list[Region]:
    detect_image, scale = resize_for_detection(image)
    gray = cv2.cvtColor(detect_image, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(detect_image, cv2.COLOR_BGR2HSV)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)

    # Dark text / logos on bright carton.
    blackhat = cv2.morphologyEx(
        gray,
        cv2.MORPH_BLACKHAT,
        cv2.getStructuringElement(cv2.MORPH_RECT, (21, 7)),
    )
    # Denser logo blocks.
    square_blackhat = cv2.morphologyEx(
        gray,
        cv2.MORPH_BLACKHAT,
        cv2.getStructuringElement(cv2.MORPH_RECT, (11, 11)),
    )
    combined = cv2.max(blackhat, square_blackhat)

    grad_x = cv2.Sobel(combined, ddepth=cv2.CV_32F, dx=1, dy=0, ksize=3)
    grad_x = np.absolute(grad_x)
    grad_x = cv2.normalize(grad_x, None, 0, 255, cv2.NORM_MINMAX).astype("uint8")

    thresh = cv2.threshold(
        grad_x, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU
    )[1]
    thresh = cv2.morphologyEx(
        thresh,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (19, 5)),
        iterations=2,
    )
    thresh = cv2.dilate(
        thresh,
        cv2.getStructuringElement(cv2.MORPH_RECT, (5, 3)),
        iterations=1,
    )

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(thresh, connectivity=8)
    height, width = detect_image.shape[:2]
    min_area = max(120, int(height * width * 0.00008))
    max_area = int(height * width * 0.22)

    regions: list[Region] = []
    for label in range(1, num_labels):
        x, y, w, h, area = stats[label]
        if area < min_area or area > max_area:
            continue
        aspect_ratio = w / float(max(h, 1))
        if aspect_ratio < 0.3 or aspect_ratio > 18:
            continue

        component_mask = (labels[y : y + h, x : x + w] == label).astype("uint8")
        fill_ratio = float(component_mask.sum()) / float(max(w * h, 1))
        if fill_ratio < 0.1:
            continue

        pad_x = max(4, int(w * 0.12))
        pad_y = max(4, int(h * 0.18))
        rx = max(0, x - pad_x)
        ry = max(0, y - pad_y)
        rw = min(width - rx, w + 2 * pad_x)
        rh = min(height - ry, h + 2 * pad_y)
        score = fill_ratio * min(aspect_ratio, 6.0)
        regions.append(Region(rx, ry, rw, rh, score))

    # Smaller text/logo clusters.
    mser = cv2.MSER_create(delta=4, min_area=60, max_area=max(8000, int(height * width * 0.01)))
    mser_regions, _ = mser.detectRegions(gray)
    for points in mser_regions:
        x, y, w, h = cv2.boundingRect(points.reshape(-1, 1, 2))
        area = w * h
        if area < 150 or area > max_area:
            continue
        aspect_ratio = w / float(max(h, 1))
        if aspect_ratio < 0.4 or aspect_ratio > 12:
            continue
        pad_x = max(3, int(w * 0.18))
        pad_y = max(3, int(h * 0.18))
        rx = max(0, x - pad_x)
        ry = max(0, y - pad_y)
        rw = min(width - rx, w + 2 * pad_x)
        rh = min(height - ry, h + 2 * pad_y)
        regions.append(Region(rx, ry, rw, rh, 1.0))

    # Colored printed logos/stickers that do not look like plain carton.
    sat_mask = cv2.inRange(hsv, (20, 35, 30), (170, 255, 255))
    sat_mask = cv2.morphologyEx(
        sat_mask,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (9, 5)),
        iterations=1,
    )
    sat_mask = cv2.dilate(
        sat_mask,
        cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)),
        iterations=1,
    )
    contours, _ = cv2.findContours(sat_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        area = w * h
        if area < min_area or area > max_area:
            continue
        aspect_ratio = w / float(max(h, 1))
        if aspect_ratio < 0.3 or aspect_ratio > 20:
            continue
        pad_x = max(4, int(w * 0.15))
        pad_y = max(4, int(h * 0.15))
        rx = max(0, x - pad_x)
        ry = max(0, y - pad_y)
        rw = min(width - rx, w + 2 * pad_x)
        rh = min(height - ry, h + 2 * pad_y)
        regions.append(Region(rx, ry, rw, rh, 1.0))

    merged = merge_regions(regions, width, height)
    if scale != 1.0:
        inv_scale = 1.0 / scale
        return [
            Region(
                x=int(region.x * inv_scale),
                y=int(region.y * inv_scale),
                w=int(region.w * inv_scale),
                h=int(region.h * inv_scale),
                score=region.score,
            )
            for region in merged
        ]
    return merged


def merge_regions(regions: list[Region], width: int, height: int) -> list[Region]:
    if not regions:
        return []

    mask = np.zeros((height, width), dtype=np.uint8)
    for region in regions:
        cv2.rectangle(mask, (region.x, region.y), (region.x + region.w, region.y + region.h), 255, -1)

    mask = cv2.morphologyEx(
        mask,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (25, 9)),
        iterations=1,
    )
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    merged: list[Region] = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        area = w * h
        if area < 100:
            continue
        merged.append(Region(x, y, w, h, float(area)))
    return merged


def pixelate_region(image: np.ndarray, region: Region, pixel_size: int = 18) -> None:
    x, y, w, h = region.x, region.y, region.w, region.h
    roi = image[y : y + h, x : x + w]
    if roi.size == 0:
        return

    small_w = max(1, w // pixel_size)
    small_h = max(1, h // pixel_size)
    small = cv2.resize(roi, (small_w, small_h), interpolation=cv2.INTER_LINEAR)
    mosaic = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)
    image[y : y + h, x : x + w] = mosaic


def draw_debug_mask(image: np.ndarray, regions: list[Region]) -> np.ndarray:
    debug = image.copy()
    for region in regions:
        cv2.rectangle(debug, (region.x, region.y), (region.x + region.w, region.y + region.h), (0, 140, 255), 3)
    return debug


def process_image(input_path: Path, output_path: Path, debug_path: Path | None = None) -> int:
    image = cv2.imread(str(input_path))
    if image is None:
        raise ValueError(f"No se pudo leer la imagen: {input_path}")

    regions = find_mark_regions(image)
    for region in regions:
        pixelate_region(image, region)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), image)

    if debug_path is not None:
        debug_path.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(debug_path), draw_debug_mask(cv2.imread(str(input_path)), regions))

    return len(regions)


def main() -> None:
    parser = argparse.ArgumentParser(description="Anonimiza marcas/logotipos en cajas de palets.")
    parser.add_argument("input", type=Path, help="Imagen o carpeta de imágenes.")
    parser.add_argument("output", type=Path, help="Carpeta de salida.")
    parser.add_argument("--debug-dir", type=Path, default=None, help="Carpeta opcional para guardar máscaras debug.")
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"No existe la ruta de entrada: {args.input}")

    total_images = 0
    total_regions = 0
    for image_path in iter_images(args.input):
        relative_name = image_path.name
        output_path = args.output / relative_name
        debug_path = args.debug_dir / relative_name if args.debug_dir else None
        regions = process_image(image_path, output_path, debug_path)
        total_images += 1
        total_regions += regions
        print(f"{image_path.name}: {regions} regiones anonimizada(s)")

    print(f"Procesadas {total_images} imagen(es), {total_regions} regiones totales.")


if __name__ == "__main__":
    main()

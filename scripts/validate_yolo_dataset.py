from __future__ import annotations

import argparse
from pathlib import Path


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
CLASS_NAMES = {
    0: "pallet_base",
    1: "front_face_box",
    2: "side_face_box",
    3: "pallet_bin_front",
}


def iter_images(directory: Path) -> list[Path]:
    if not directory.exists():
        return []
    return sorted(
        [path for path in directory.iterdir() if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS]
    )


def validate_label_file(path: Path) -> list[str]:
    errors: list[str] = []
    if not path.exists():
        return [f"Falta label para {path.stem}"]

    lines = path.read_text(encoding="utf-8").splitlines()
    for index, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not stripped:
            continue

        parts = stripped.split()
        if len(parts) != 5:
            errors.append(f"{path.name}:{index} debe tener 5 columnas YOLO, tiene {len(parts)}")
            continue

        try:
            class_id = int(parts[0])
            x_center = float(parts[1])
            y_center = float(parts[2])
            width = float(parts[3])
            height = float(parts[4])
        except ValueError:
            errors.append(f"{path.name}:{index} contiene valores no numericos")
            continue

        if class_id not in CLASS_NAMES:
            errors.append(f"{path.name}:{index} usa class_id desconocido {class_id}")

        for value_name, value in {
            "x_center": x_center,
            "y_center": y_center,
            "width": width,
            "height": height,
        }.items():
            if not 0 <= value <= 1:
                errors.append(f"{path.name}:{index} {value_name} debe estar entre 0 y 1")

        if width <= 0 or height <= 0:
            errors.append(f"{path.name}:{index} width/height deben ser mayores que 0")

    return errors


def validate_split(dataset_dir: Path, split: str) -> list[str]:
    errors: list[str] = []
    image_dir = dataset_dir / "images" / split
    label_dir = dataset_dir / "labels" / split
    images = iter_images(image_dir)

    if not images:
        errors.append(f"No hay imagenes en images/{split}")
        return errors

    for image_path in images:
        label_path = label_dir / f"{image_path.stem}.txt"
        errors.extend(validate_label_file(label_path))

    return errors


def main() -> None:
    parser = argparse.ArgumentParser(description="Valida el dataset YOLO de palets y cajas.")
    parser.add_argument(
        "--dataset-dir",
        type=Path,
        default=Path("vision-dataset"),
        help="Ruta al dataset YOLO",
    )
    args = parser.parse_args()

    all_errors: list[str] = []
    for split in ("train", "val", "test"):
        all_errors.extend(validate_split(args.dataset_dir, split))

    if all_errors:
        print("[validate-yolo] Problemas detectados:")
        for error in all_errors:
            print(f"- {error}")
        raise SystemExit(1)

    print("[validate-yolo] Dataset YOLO valido.")


if __name__ == "__main__":
    main()

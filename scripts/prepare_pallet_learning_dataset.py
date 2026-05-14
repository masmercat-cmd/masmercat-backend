from __future__ import annotations

import argparse
import csv
import hashlib
import shutil
from pathlib import Path


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def iter_images(input_dir: Path) -> list[Path]:
    return sorted(
        [
            path
            for path in input_dir.iterdir()
            if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
        ]
    )


def stable_scene_type(filename: str) -> str:
    lower = filename.lower()
    if "12.24.57" in lower:
        return "single_corner"
    if "12.25.01" in lower:
        return "single_front"
    if "12.25.11" in lower:
        return "pallet_bin_or_single"
    return "unknown"


def stable_split(filename: str) -> str:
    digest = hashlib.md5(filename.encode("utf-8")).hexdigest()
    bucket = int(digest[:2], 16)
    if bucket < 26:
        return "val"
    if bucket < 39:
        return "test"
    return "train"


def ensure_dirs(base_dir: Path) -> dict[str, Path]:
    paths = {
        "raw": base_dir / "images" / "raw",
        "train": base_dir / "images" / "train",
        "val": base_dir / "images" / "val",
        "test": base_dir / "images" / "test",
        "labels_train": base_dir / "labels" / "train",
        "labels_val": base_dir / "labels" / "val",
        "labels_test": base_dir / "labels" / "test",
    }
    for path in paths.values():
        path.mkdir(parents=True, exist_ok=True)
    return paths


def copy_image(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def write_ground_truth_csv(csv_path: Path, rows: list[dict[str, str]]) -> None:
    fieldnames = [
        "image_name",
        "split",
        "scene_type",
        "real_pallets",
        "real_boxes",
        "pieces_per_box",
        "gross_weight_kg",
        "product",
        "packaging",
        "view",
        "notes",
    ]
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_dataset_readme(readme_path: Path) -> None:
    readme_path.write_text(
        "\n".join(
            [
                "# Pallet Vision Learning Dataset",
                "",
                "Este dataset se ha preparado a partir de fotos anonimizadas para entrenar/mejorar el conteo de palets y cajas.",
                "",
                "## Pasos siguientes",
                "1. Rellenar `ground_truth.csv` con palets reales, cajas reales y piezas por caja.",
                "2. Etiquetar bounding boxes sobre `images/train`, `images/val` y `images/test`.",
                "3. Entrenar un detector de `pallet_base`, `front_face_box` y `side_face_box`.",
                "4. Evaluar el conteo reconstruido frente a `ground_truth.csv`.",
                "",
                "## Clases recomendadas",
                "- pallet_base",
                "- front_face_box",
                "- side_face_box",
                "- pallet_bin_front",
                "",
                "## Importante",
                "- Estas imágenes ya no muestran marca comercial visible, pero el ground truth debe rellenarse con datos reales del proveedor.",
                "- Sin `ground_truth` correcto no podremos enseñar a Nara a contar mejor.",
            ]
        ),
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepara imágenes anonimizadas como dataset base para aprendizaje.")
    parser.add_argument("input_dir", type=Path, help="Carpeta con imágenes anonimizadas.")
    parser.add_argument(
        "--dataset-dir",
        type=Path,
        default=Path("vision-dataset"),
        help="Directorio de dataset dentro del proyecto.",
    )
    args = parser.parse_args()

    if not args.input_dir.exists():
        raise SystemExit(f"No existe la carpeta de entrada: {args.input_dir}")

    images = iter_images(args.input_dir)
    if not images:
        raise SystemExit("No se encontraron imágenes compatibles en la carpeta de entrada.")

    dirs = ensure_dirs(args.dataset_dir)
    gt_rows: list[dict[str, str]] = []

    for image_path in images:
        split = stable_split(image_path.name)
        raw_target = dirs["raw"] / image_path.name
        split_target = dirs[split] / image_path.name
        copy_image(image_path, raw_target)
        copy_image(image_path, split_target)

        gt_rows.append(
            {
                "image_name": image_path.name,
                "split": split,
                "scene_type": stable_scene_type(image_path.name),
                "real_pallets": "",
                "real_boxes": "",
                "pieces_per_box": "",
                "gross_weight_kg": "",
                "product": "",
                "packaging": "",
                "view": "",
                "notes": "",
            }
        )

    write_ground_truth_csv(args.dataset_dir / "ground_truth.csv", gt_rows)
    write_dataset_readme(args.dataset_dir / "README.md")
    print(f"Preparadas {len(images)} imágenes en {args.dataset_dir}")


if __name__ == "__main__":
    main()

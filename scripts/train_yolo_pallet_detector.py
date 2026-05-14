from __future__ import annotations

import argparse
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Entrena un detector YOLO para palets y cajas.")
    parser.add_argument(
        "--data",
        type=Path,
        default=Path("vision-dataset/data.yaml"),
        help="Ruta al data.yaml del dataset",
    )
    parser.add_argument(
        "--model",
        default="yolov8n.pt",
        help="Checkpoint base de Ultralytics",
    )
    parser.add_argument("--epochs", type=int, default=80, help="Numero de epochs")
    parser.add_argument("--imgsz", type=int, default=1280, help="Tamano de imagen")
    parser.add_argument("--batch", type=int, default=8, help="Batch size")
    parser.add_argument("--device", default="cpu", help="cpu, 0, 0,1, etc.")
    parser.add_argument(
        "--project",
        default="vision-service/runs",
        help="Directorio donde Ultralytics guardara el entrenamiento",
    )
    parser.add_argument(
        "--name",
        default="pallet_detector",
        help="Nombre de la corrida",
    )
    parser.add_argument(
        "--export-dir",
        type=Path,
        default=Path("vision-service/models"),
        help="Carpeta donde copiar el best.pt final",
    )
    args = parser.parse_args()

    from ultralytics import YOLO

    data_path = args.data.resolve()
    export_dir = args.export_dir.resolve()
    export_dir.mkdir(parents=True, exist_ok=True)

    model = YOLO(args.model)
    results = model.train(
        data=str(data_path),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        project=args.project,
        name=args.name,
        exist_ok=True,
        pretrained=True,
        patience=20,
        degrees=3.0,
        scale=0.1,
        hsv_h=0.01,
        hsv_s=0.25,
        hsv_v=0.15,
        fliplr=0.0,
        mosaic=0.0,
    )

    best_path = Path(results.save_dir) / "weights" / "best.pt"
    if not best_path.exists():
        raise SystemExit(f"No se encontro best.pt en {best_path}")

    target_path = export_dir / "pallet-yolo.pt"
    target_path.write_bytes(best_path.read_bytes())
    print(f"[train-yolo] Modelo exportado a {target_path}")


if __name__ == "__main__":
    main()

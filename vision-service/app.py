import base64
import io
import json
import os
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel

try:
    from ultralytics import YOLO
except ImportError:  # pragma: no cover
    YOLO = None


DEFAULT_CLASS_MAP = {
    "pallet": "pallet",
    "pallet_base": "pallet",
    "palet": "pallet",
    "palet_base": "pallet",
    "pallet_block": "pallet",
    "pallet_footprint": "pallet",
    "front_face_box": "box",
    "side_face_box": "box",
    "box": "box",
    "boxes": "box",
    "caja": "box",
    "cajas": "box",
    "crate": "box",
}


class DetectRequest(BaseModel):
    image: str
    mime_type: str | None = "image/jpeg"
    image_hash: str | None = None
    task: str | None = "pallet_box_count"


class VisionService:
    def __init__(self) -> None:
        self.model_path = os.getenv("YOLO_MODEL_PATH", "./models/pallet-yolo.pt")
        self.conf_threshold = float(os.getenv("YOLO_CONFIDENCE", "0.25"))
        self.iou_threshold = float(os.getenv("YOLO_IOU", "0.45"))
        self.max_det = int(os.getenv("YOLO_MAX_DET", "400"))
        self.device = os.getenv("YOLO_DEVICE", "cpu")
        self.class_map = self._load_class_map()
        self._model = None

    def _load_class_map(self) -> dict[str, str]:
        raw = os.getenv("YOLO_CLASS_MAP", "").strip()
        if not raw:
            return dict(DEFAULT_CLASS_MAP)

        try:
            loaded = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError("YOLO_CLASS_MAP is not valid JSON") from exc

        normalized = dict(DEFAULT_CLASS_MAP)
        for key, value in loaded.items():
            normalized[str(key).strip().lower()] = str(value).strip().lower()
        return normalized

    def _get_model(self) -> Any:
        if self._model is not None:
            return self._model

        if YOLO is None:
            raise RuntimeError(
                "ultralytics no esta instalado. Ejecuta: pip install -r requirements.txt",
            )

        if not os.path.exists(self.model_path):
            raise RuntimeError(
                f"No se encontro el modelo YOLO en {self.model_path}. "
                "Configura YOLO_MODEL_PATH con tu weights .pt",
            )

        self._model = YOLO(self.model_path)
        return self._model

    def _decode_image(self, image_value: str) -> np.ndarray:
        if not image_value:
            raise ValueError("La imagen base64 esta vacia")

        raw = image_value.strip()
        if raw.startswith("data:"):
            raw = raw.split(",", 1)[1]

        image_bytes = base64.b64decode(raw)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        return np.array(image)

    def _normalize_label(self, label: str) -> str:
        normalized = str(label or "").strip().lower().replace("-", "_").replace(" ", "_")
        return self.class_map.get(normalized, normalized)

    def _cluster_centers(self, values: list[float], tolerance: float) -> int:
        if not values:
            return 0

        ordered = sorted(values)
        clusters = [ordered[0]]
        for value in ordered[1:]:
            if abs(value - clusters[-1]) > tolerance:
                clusters.append(value)
        return len(clusters)

    def _build_summary(self, detections: list[dict[str, Any]]) -> dict[str, Any]:
        pallet_detections = [item for item in detections if item["label"] == "pallet"]
        box_detections = [item for item in detections if item["label"] == "box"]

        avg_width = (
            sum(item["bbox"]["width"] for item in box_detections) / len(box_detections)
            if box_detections
            else 0
        )
        avg_height = (
            sum(item["bbox"]["height"] for item in box_detections) / len(box_detections)
            if box_detections
            else 0
        )

        visible_columns = self._cluster_centers(
            [item["bbox"]["x"] + item["bbox"]["width"] / 2 for item in box_detections],
            max(12.0, avg_width * 0.55),
        )
        visible_rows = self._cluster_centers(
            [item["bbox"]["y"] + item["bbox"]["height"] / 2 for item in box_detections],
            max(12.0, avg_height * 0.55),
        )

        confidence_values = [item["confidence"] for item in detections if item["confidence"] > 0]
        confidence = sum(confidence_values) / len(confidence_values) if confidence_values else 0.0

        estimated_depth = 1
        if visible_columns > 0 and visible_rows > 0:
            visible_face = visible_columns * visible_rows
            if visible_face > 0 and len(box_detections) > visible_face:
                estimated_depth = max(1, round(len(box_detections) / visible_face))

        return {
            "provider": "ultralytics-yolo",
            "pallet_count": len(pallet_detections),
            "box_count": len(box_detections),
            "visible_columns": visible_columns,
            "visible_rows": visible_rows,
            "estimated_depth": estimated_depth,
            "top_boxes": visible_columns,
            "confidence": round(confidence, 4),
        }

    def detect(self, payload: DetectRequest) -> dict[str, Any]:
        model = self._get_model()
        image = self._decode_image(payload.image)
        results = model.predict(
            source=image,
            conf=self.conf_threshold,
            iou=self.iou_threshold,
            max_det=self.max_det,
            device=self.device,
            verbose=False,
        )

        if not results:
            return {
                "provider": "ultralytics-yolo",
                "summary": {
                    "provider": "ultralytics-yolo",
                    "pallet_count": 0,
                    "box_count": 0,
                    "visible_columns": 0,
                    "visible_rows": 0,
                    "estimated_depth": 0,
                    "top_boxes": 0,
                    "confidence": 0,
                },
                "detections": [],
            }

        result = results[0]
        names = result.names
        detections: list[dict[str, Any]] = []

        for box in result.boxes:
            cls_id = int(box.cls[0].item())
            label = self._normalize_label(names.get(cls_id, str(cls_id)))
            x1, y1, x2, y2 = [float(value) for value in box.xyxy[0].tolist()]
            detections.append(
                {
                    "label": label,
                    "class_name": names.get(cls_id, str(cls_id)),
                    "confidence": round(float(box.conf[0].item()), 4),
                    "bbox": {
                        "x": round(x1, 2),
                        "y": round(y1, 2),
                        "width": round(max(0.0, x2 - x1), 2),
                        "height": round(max(0.0, y2 - y1), 2),
                        "x2": round(x2, 2),
                        "y2": round(y2, 2),
                    },
                }
            )

        return {
            "provider": "ultralytics-yolo",
            "summary": self._build_summary(detections),
            "detections": detections,
            "image_hash": payload.image_hash,
        }


app = FastAPI(title="MasMercat Vision Service", version="0.1.0")
service = VisionService()


@app.get("/health")
def health() -> dict[str, Any]:
    model_exists = os.path.exists(service.model_path)
    return {
        "ok": True,
        "provider": "ultralytics-yolo",
        "model_path": service.model_path,
        "model_exists": model_exists,
        "device": service.device,
    }


@app.post("/detect")
def detect(payload: DetectRequest) -> dict[str, Any]:
    if payload.task and payload.task != "pallet_box_count":
        raise HTTPException(status_code=400, detail="task no soportada")

    try:
        return service.detect(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Error interno: {exc}") from exc

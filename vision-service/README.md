# Vision Service

Microservicio base para deteccion de palets y cajas con YOLOv8/Ultralytics.

## Contrato

Expone:

- `GET /health`
- `POST /detect`

`POST /detect` espera este JSON:

```json
{
  "image": "<base64 o data-url>",
  "mime_type": "image/jpeg",
  "image_hash": "optional",
  "task": "pallet_box_count"
}
```

Y responde con:

```json
{
  "provider": "ultralytics-yolo",
  "summary": {
    "provider": "ultralytics-yolo",
    "pallet_count": 1,
    "box_count": 144,
    "visible_columns": 3,
    "visible_rows": 12,
    "estimated_depth": 4,
    "top_boxes": 3,
    "confidence": 0.91
  },
  "detections": [
    {
      "label": "pallet",
      "class_name": "pallet_base",
      "confidence": 0.98,
      "bbox": {
        "x": 10,
        "y": 20,
        "width": 200,
        "height": 80,
        "x2": 210,
        "y2": 100
      }
    }
  ]
}
```

## Clases recomendadas

Para que el backend saque mejor provecho, conviene entrenar el modelo con estas clases:

- `pallet_base`
- `front_face_box`
- `side_face_box`

Si usas otros nombres, puedes remapearlos con `YOLO_CLASS_MAP`.

## Arranque local

```bash
cd vision-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set YOLO_MODEL_PATH=C:\ruta\tu-modelo.pt
uvicorn app:app --host 0.0.0.0 --port 8010
```

## Docker

```bash
cd vision-service
docker build -t masmercat-vision .
docker run --rm -p 8010:8010 -e YOLO_MODEL_PATH=/models/pallet-yolo.pt -v C:\ruta\models:/models masmercat-vision
```

## Variables

- `YOLO_MODEL_PATH`: ruta al `.pt`
- `YOLO_CONFIDENCE`: umbral de confianza, por defecto `0.25`
- `YOLO_IOU`: umbral de NMS, por defecto `0.45`
- `YOLO_MAX_DET`: maximo de detecciones
- `YOLO_DEVICE`: `cpu`, `0`, `0,1`, etc.
- `YOLO_CLASS_MAP`: JSON opcional para remapear clases

Ejemplo:

```bash
set YOLO_CLASS_MAP={"pallet_base":"pallet","front_face_box":"box","side_face_box":"box"}
```

## Backend

En el backend NestJS configura:

```env
ML_VISION_ENDPOINT=http://localhost:8010/detect
ML_VISION_MIN_CONFIDENCE=0.45
ML_VISION_PREFER_DETECTOR=true
ML_VISION_TIMEOUT_MS=8000
```

## Entrenar el modelo

Desde `backend/`:

```bash
python scripts/validate_yolo_dataset.py
python scripts/train_yolo_pallet_detector.py --device cpu
```

Al terminar, el script copia el mejor checkpoint a:

```bash
vision-service/models/pallet-yolo.pt
```

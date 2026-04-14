# Pallet Vision Learning Dataset

Este dataset se ha preparado a partir de fotos anonimizadas para entrenar/mejorar el conteo de palets y cajas.

## Pasos siguientes
1. Rellenar `ground_truth.csv` con palets reales, cajas reales y piezas por caja.
2. Etiquetar bounding boxes sobre `images/train`, `images/val` y `images/test`.
3. Entrenar un detector de `pallet_base`, `front_face_box` y `side_face_box`.
4. Evaluar el conteo reconstruido frente a `ground_truth.csv`.

## Clases recomendadas
- pallet_base
- front_face_box
- side_face_box
- pallet_bin_front

## Importante
- Estas imagenes ya no muestran marca comercial visible, pero el ground truth debe rellenarse con datos reales del proveedor.
- Sin `ground_truth` correcto no podremos enseñar a Nara a contar mejor.
- Los casos reales recibidos por chat y todavia no enlazados a un archivo del dataset se guardan en `validated_reference_cases.csv`.

## Flujo recomendado ahora
1. Rellenar `capture_template.csv` con 10-20 casos reales.
2. Cuando una foto ya exista en `images/raw` o `images/train|val|test`, copiar su nombre real en `image_name_or_chat_ref`.
3. Cuando un caso venga solo del chat, usar un id tipo `chat_case_*`.
4. Una vez validados varios casos, fusionarlos en `ground_truth.csv` para evaluacion y entrenamiento.

## Regresion local
- Ejecuta `npm run vision:regression` desde `backend/` para comprobar que los casos validados y las heuristicas base siguen devolviendo los conteos esperados.
- Hoy la regresion cubre:
- casos reales validados por chat para `184` y `144` cajas
- normalizacion de producto (`melocoton calanda`, `granadas`)
- deteccion de palet unico en esquina
- conteo alto de escenas densas de almacen
- Cada nuevo caso real confirmado deberia añadirse a `validated_reference_cases.csv` y, si es representativo, tambien al script de regresion.

## Datos parciales tambien valen
- No hace falta conocer peso y piezas por caja en todas las fotos.
- Para mejorar el conteo de cajas, ya sirve mucho una foto con:
- `product`
- `real_boxes`
- `real_pallets` si se sabe
- Usa `known_data_level` para indicar que informacion conoces de verdad.
- Usa `boxes_exact`, `pallets_exact` y `weight_exact` para marcar que campos son exactos y cuales no.

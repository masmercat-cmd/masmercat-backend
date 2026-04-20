import { readFileSync } from 'fs';
import { join } from 'path';
import { AiService } from '../src/ai/ai.service';

type RegressionScenario = {
  parsed: Record<string, any>;
  expectedBoxes: number;
  expectedPallets: number;
  expectedProduct?: string;
  expectedPiecesPerBox?: number;
};

type HelperRegressionCase = {
  description: string;
  run: (service: any) => { actual: string | number | boolean; expected: string | number | boolean };
};

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function loadValidatedCases(csvPath: string): Record<string, Record<string, string>> {
  const content = readFileSync(csvPath, 'utf8');
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const [headerLine, ...rowLines] = lines;
  const headers = parseCsvLine(headerLine);
  const rows: Record<string, Record<string, string>> = {};

  for (const line of rowLines) {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    rows[row.reference_id] = row;
  }

  return rows;
}

function buildScenarios(validated: Record<string, Record<string, string>>): Record<string, RegressionScenario> {
  return {
    chat_case_melocoton_calanda_001: {
      expectedBoxes: Number(validated.chat_case_melocoton_calanda_001?.real_boxes ?? 184),
      expectedPallets: Number(validated.chat_case_melocoton_calanda_001?.real_pallets ?? 1),
      parsed: {
        producto: validated.chat_case_melocoton_calanda_001?.product ?? 'melocoton calanda',
        envase: 'palet con cajas',
        vista: 'corner',
        material_caja: 'carton',
        medidas_caja: '60x40 cm aprox',
        columnas_visibles: 4,
        filas_visibles: 12,
        profundidad_estimada: 1,
        cajas_por_capa: 4,
        capas_estimadas: 12,
        cajas_superiores: 4,
        cajas_estimadas: 72,
        cajas_aprox: 72,
        numero_palets: 1,
        bloques_palets_visibles: 1,
        columnas_palets_visibles: 1,
        filas_palets_visibles: 1,
      },
    },
    chat_case_granadas_001: {
      expectedBoxes: Number(validated.chat_case_granadas_001?.real_boxes ?? 144),
      expectedPallets: Number(validated.chat_case_granadas_001?.real_pallets ?? 1),
      parsed: {
        producto: validated.chat_case_granadas_001?.product ?? 'granadas',
        envase: 'palet con cajas',
        vista: 'corner',
        material_caja: 'plastico',
        medidas_caja: '60x40 cm aprox',
        columnas_visibles: 3,
        filas_visibles: 12,
        profundidad_estimada: 1,
        cajas_por_capa: 3,
        capas_estimadas: 12,
        cajas_superiores: 3,
        cajas_estimadas: 54,
        cajas_aprox: 54,
        numero_palets: 1,
        bloques_palets_visibles: 1,
        columnas_palets_visibles: 1,
        filas_palets_visibles: 1,
      },
    },
    synthetic_unknown_stonefruit_corner_001: {
      expectedBoxes: 184,
      expectedPallets: 1,
      parsed: {
        producto: '',
        envase: 'palet con cajas',
        vista: 'corner',
        material_caja: 'carton',
        medidas_caja: '60x40 cm aprox',
        columnas_visibles: 4,
        filas_visibles: 12,
        profundidad_estimada: 1,
        cajas_por_capa: 4,
        capas_estimadas: 12,
        cajas_superiores: 4,
        cajas_estimadas: 72,
        cajas_aprox: 72,
        numero_palets: 1,
        bloques_palets_visibles: 1,
        columnas_palets_visibles: 1,
        filas_palets_visibles: 1,
      },
    },
    synthetic_top_visible_single_pallet_001: {
      expectedBoxes: 120,
      expectedPallets: 1,
      parsed: {
        producto: 'zapote',
        envase: 'palet con cajas',
        vista: 'frontal superior',
        material_caja: 'carton',
        medidas_caja: '60x40 cm aprox',
        columnas_visibles: 5,
        filas_visibles: 8,
        profundidad_estimada: 1,
        cajas_por_capa: 5,
        capas_estimadas: 8,
        cajas_superiores: 5,
        cajas_estimadas: 40,
        cajas_aprox: 40,
        numero_palets: 1,
        bloques_palets_visibles: 1,
        columnas_palets_visibles: 1,
        filas_palets_visibles: 1,
      },
    },
    synthetic_misclassified_loose_but_structured_pallet_001: {
      expectedBoxes: 120,
      expectedPallets: 1,
      parsed: {
        producto: 'zapote',
        envase: 'sin caja',
        vista: 'frontal superior',
        hay_palet: true,
        hay_cajas: true,
        material_caja: 'carton',
        medidas_caja: '60x40 cm aprox',
        columnas_visibles: 5,
        filas_visibles: 8,
        profundidad_estimada: 1,
        cajas_por_capa: 5,
        capas_estimadas: 8,
        cajas_superiores: 5,
        cajas_estimadas: 40,
        cajas_aprox: 40,
        numero_palets: 1,
        numero_palets_visibles_base: 1,
        bloques_palets_visibles: 1,
        columnas_palets_visibles: 1,
        filas_palets_visibles: 1,
      },
    },
    synthetic_top_visible_partial_rows_001: {
      expectedBoxes: 120,
      expectedPallets: 1,
      parsed: {
        producto: 'zapote',
        envase: 'palet con cajas',
        vista: 'frontal superior',
        hay_palet: true,
        hay_cajas: true,
        material_caja: 'carton',
        medidas_caja: '60x40 cm aprox',
        columnas_visibles: 5,
        filas_visibles: 4,
        profundidad_estimada: 1,
        cajas_por_capa: 5,
        capas_estimadas: 4,
        cajas_superiores: 5,
        cajas_estimadas: 60,
        cajas_aprox: 60,
        numero_palets: 1,
        numero_palets_visibles_base: 1,
        bloques_palets_visibles: 1,
        columnas_palets_visibles: 1,
        filas_palets_visibles: 1,
      },
    },
    synthetic_open_top_large_fruit_partial_front_001: {
      expectedBoxes: 120,
      expectedPallets: 1,
      expectedProduct: 'melon',
      expectedPiecesPerBox: 5,
      parsed: {
        producto: '',
        envase: 'palet con cajas',
        vista: 'frontal superior',
        hay_palet: true,
        hay_cajas: true,
        material_caja: 'carton',
        columnas_visibles: 4,
        filas_visibles: 5,
        profundidad_estimada: 2,
        cajas_por_capa: 8,
        capas_estimadas: 5,
        cajas_superiores: 4,
        cajas_estimadas: 40,
        cajas_aprox: 40,
        numero_palets: 1,
        numero_palets_visibles_base: 1,
        bloques_palets_visibles: 1,
        columnas_palets_visibles: 1,
        filas_palets_visibles: 1,
      },
    },
  };
}

function buildHelperCases(): HelperRegressionCase[] {
  return [
    {
      description: 'normalizeProducto maps melocoton calanda to melocoton',
      run: (service) => ({
        actual: service.normalizeProducto('melocoton calanda'),
        expected: 'melocoton',
      }),
    },
    {
      description: 'normalizeProducto maps granadas to granada',
      run: (service) => ({
        actual: service.normalizeProducto('granadas'),
        expected: 'granada',
      }),
    },
    {
      description: 'isSingleCornerPalletView accepts corner scenes after depth correction',
      run: (service) => ({
        actual: service.isSingleCornerPalletView(
          {
            vista: 'corner',
            columnas_visibles: 4,
            filas_visibles: 12,
            profundidad_estimada: 4,
            cajas_superiores: 4,
            numero_palets: 1,
            bloques_palets_visibles: 1,
            columnas_palets_visibles: 1,
            filas_palets_visibles: 1,
            cajas_estimadas: 96,
          },
          'palet con cajas',
        ),
        expected: true,
      }),
    },
    {
      description: 'inferPalletCount keeps dense warehouse scenes in high multi-pallet range',
      run: (service) => ({
        actual: service.inferPalletCount(
          {
            envase: 'palet con cajas',
            vista: 'warehouse',
            scan_mode: 'multi',
            columnas_palets_visibles: 5,
            filas_palets_visibles: 2,
            bloques_palets_visibles: 10,
            filas_visibles: 2,
            cajas_superiores: 20,
            cajas_estimadas: 180,
            cajas_aprox: 180,
            medidas_caja: '60x40 cm aprox',
          },
          'palet con cajas',
        ),
        expected: 24,
      }),
    },
    {
      description: 'isSingleTopVisiblePalletView recognizes elevated single pallet fronts',
      run: (service) => ({
        actual: service.isSingleTopVisiblePalletView(
          {
            vista: 'frontal superior',
            columnas_visibles: 5,
            filas_visibles: 8,
            profundidad_estimada: 1,
            cajas_superiores: 5,
            numero_palets: 1,
            bloques_palets_visibles: 1,
            columnas_palets_visibles: 1,
            filas_palets_visibles: 1,
            cajas_estimadas: 40,
          },
          'palet con cajas',
        ),
        expected: true,
      }),
    },
    {
      description: 'shouldForcePalletWithBoxes rescues structured pallets misread as loose fruit',
      run: (service) => ({
        actual: service.shouldForcePalletWithBoxes({
          envase: 'sin caja',
          hay_palet: true,
          hay_cajas: true,
          vista: 'frontal superior',
          columnas_visibles: 5,
          filas_visibles: 8,
          profundidad_estimada: 1,
          cajas_superiores: 5,
          cajas_estimadas: 40,
          numero_palets: 1,
          numero_palets_visibles_base: 1,
        }),
        expected: true,
      }),
    },
    {
      description: 'inferPiecesPerBox falls back to 5 for open-top large fruit displays with missing product',
      run: (service) => ({
        actual: service.inferPiecesPerBox(
          {
            envase: 'palet con cajas',
            material_caja: 'carton',
            columnas_visibles: 4,
            filas_visibles: 5,
            cajas_superiores: 4,
          },
          '',
        ),
        expected: 5,
      }),
    },
    {
      description: 'inferScenePipeline upgrades top warehouse scenes to multi when preliminary pallet count sees more than one base',
      run: (service) => ({
        actual: service.inferScenePipeline(
          {
            vista: 'superior almacen',
            numero_palets_visibles_base: 1,
          },
          'single',
          {
            numero_palets: 3,
            bases_independientes_visibles: 3,
          },
        ),
        expected: 'multi',
      }),
    },
    {
      description: 'mergeExternalVisionSummary applies detector counts when confidence is solid',
      run: (service) => ({
        actual: service.mergeExternalVisionSummary(
          {
            envase: 'palet con cajas',
            numero_palets: 1,
            pallet_count: 1,
            cajas_estimadas: 54,
            cajas_aprox: 54,
            columnas_visibles: 3,
            filas_visibles: 12,
          },
          {
            provider: 'mock-detector',
            confidence: 0.91,
            palletCount: 1,
            boxCount: 144,
            visibleColumns: 3,
            visibleRows: 12,
            estimatedDepth: 4,
            topBoxes: 3,
            detections: [],
            raw: {},
          },
        ).cajas_estimadas,
        expected: 144,
      }),
    },
    {
      description: 'mergeStagedVisionResult keeps non-empty producto/envase from stage1 when stage3 sends blanks',
      run: (service) => ({
        actual: JSON.stringify(
          ((merged: any) => ({
            producto: merged.producto,
            envase: merged.envase,
          }))(
            service.mergeStagedVisionResult(
              {
                producto: 'granadas',
                envase: 'palet con cajas',
                material_caja: 'plastico',
                numero_palets_visibles_base: 1,
              },
              {
                columnas_visibles: 3,
                filas_visibles: 12,
                profundidad_estimada: 4,
                cajas_estimadas: 144,
              },
              {
                producto: '',
                envase: '',
                cajas_estimadas: 144,
              },
              { numero_palets: 1 },
              'single',
              'single',
            ),
          ),
        ),
        expected: JSON.stringify({
          producto: 'granadas',
          envase: 'palet con cajas',
        }),
      }),
    },
  ];
}

function main(): void {
  const csvPath = join(process.cwd(), 'vision-dataset', 'validated_reference_cases.csv');
  const validated = loadValidatedCases(csvPath);
  const scenarios = buildScenarios(validated);
  const helperCases = buildHelperCases();
  const service = Object.create(AiService.prototype) as any;
  service.weightAdjustmentAudit = [];
  service.stagedVisionAudit = [];
  service.imageAnalysisCache = new Map();
  service.configService = {
    get(key: string) {
      if (key === 'ML_VISION_MIN_CONFIDENCE') return '0.45';
      if (key === 'ML_VISION_PREFER_DETECTOR') return 'true';
      return '';
    },
  };
  const failures: string[] = [];

  for (const [referenceId, scenario] of Object.entries(scenarios)) {
    const result = service.finalizeVisionResult({ ...scenario.parsed });
    const gotBoxes = Number(result?.cajas_estimadas ?? 0);
    const gotPallets = Number(result?.numero_palets ?? 0);
    const gotProduct = `${result?.producto ?? ''}`.trim().toLowerCase();
    const gotPiecesPerBox = Number(result?.piezas_por_caja ?? 0);

    if (gotBoxes !== scenario.expectedBoxes) {
      failures.push(
        `${referenceId}: cajas_estimadas=${gotBoxes}, esperado=${scenario.expectedBoxes}`,
      );
    }

    if (gotPallets !== scenario.expectedPallets) {
      failures.push(
        `${referenceId}: numero_palets=${gotPallets}, esperado=${scenario.expectedPallets}`,
      );
    }

    if (
      typeof scenario.expectedProduct === 'string' &&
      gotProduct !== scenario.expectedProduct
    ) {
      failures.push(
        `${referenceId}: producto=${gotProduct}, esperado=${scenario.expectedProduct}`,
      );
    }

    if (
      typeof scenario.expectedPiecesPerBox === 'number' &&
      gotPiecesPerBox !== scenario.expectedPiecesPerBox
    ) {
      failures.push(
        `${referenceId}: piezas_por_caja=${gotPiecesPerBox}, esperado=${scenario.expectedPiecesPerBox}`,
      );
    }

    console.log(
      `[vision-regression] ${referenceId} -> cajas=${gotBoxes}, palets=${gotPallets}, producto=${gotProduct}, piezas=${gotPiecesPerBox}`,
    );
  }

  for (const helperCase of helperCases) {
    const { actual, expected } = helperCase.run(service);
    if (actual !== expected) {
      failures.push(
        `${helperCase.description}: actual=${String(actual)}, esperado=${String(expected)}`,
      );
    }

    console.log(
      `[vision-regression] helper -> ${helperCase.description}: ${String(actual)}`,
    );
  }

  if (failures.length > 0) {
    console.error('[vision-regression] Fallos detectados:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('[vision-regression] Todos los casos validados pasaron.');
}

main();

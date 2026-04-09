// CAMBIO FORZADO DEPLOY
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import OpenAI from 'openai';
import { PDFParse } from 'pdf-parse';
import { Repository } from 'typeorm';
import { AiScanResult, User } from '../entities';

export class ChatMessageDto {
  message: string;
  language?: string;
  image?: string;
  imageMimeType?: string;
  imageName?: string;
}

export class TransportTariffDto {
  document: string;
  mimeType?: string;
  language?: string;
  origin?: string;
  destination?: string;
  palletCount?: number;
  palletType?: string;
}

@Injectable()
export class AiService {
  private openai: OpenAI;

  private logVisionSnapshot(label: string, payload: any): void {
    try {
      console.log(`📦 ${label}:`, JSON.stringify(payload, null, 2));
    } catch {
      console.log(`📦 ${label}:`, payload);
    }
  }

  private toNumber(value: any): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === 'string') {
      const normalized = value.replace(',', '.').trim();
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private normalizeEnvase(value: any): string {
    return `${value ?? ''}`.trim().toLowerCase();
  }

  private normalizeProducto(value: any): string {
    return `${value ?? ''}`.trim().toLowerCase();
  }

  private normalizeMeasure(value: any): string {
    return `${value ?? ''}`
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/aproximado|aprox\.?/g, 'aprox')
      .trim();
  }

  private normalizeStringArray(value: any): string[] {
    const rawValues = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[\n,;|/]+/g)
        : [];

    return rawValues
      .map((entry) => `${entry ?? ''}`.trim())
      .filter((entry, index, list) => entry.length > 0 && list.indexOf(entry) === index);
  }

  private buildRouteOptions(
    primaryValue: any,
    explicitOptions: any,
    postalCodes: any,
  ): string[] {
    return [
      ...this.normalizeStringArray(primaryValue),
      ...this.normalizeStringArray(explicitOptions),
      ...this.normalizeStringArray(postalCodes),
    ].filter((entry, index, list) => entry.length > 0 && list.indexOf(entry) === index);
  }

  private isCastilloGermanyTariff(raw: string): boolean {
    const normalized = `${raw ?? ''}`.toLowerCase();
    return normalized.includes('alemania') && normalized.includes('castillo');
  }

  private extractGermanPostalCityEntries(raw: string): Array<{ start: number; end: number; city: string }> {
    const entries: Array<{ start: number; end: number; city: string }> = [];
    const regex = /(\d{2})(?:\s*-\s*(\d{2}))?[.\s…-]+([A-Za-z\u00C0-\u017F\/\-\s]+?)(?=\s+\d{2}(?:\s*-\s*\d{2})?[.\s…-]+|$)/g;
    const compact = raw
      .replace(/\r/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ');

    for (const match of compact.matchAll(regex)) {
      const start = parseInt(match[1], 10);
      const end = parseInt(match[2] || match[1], 10);
      const city = `${match[3] ?? ''}`.trim();
      if (!Number.isFinite(start) || !Number.isFinite(end) || !city) {
        continue;
      }
      entries.push({ start, end, city });
    }

    return entries.filter(
      (entry, index, list) =>
        list.findIndex(
          (candidate) =>
            candidate.start === entry.start &&
            candidate.end === entry.end &&
            candidate.city === entry.city,
        ) === index,
    );
  }

  private inferGermanyZoneFromPostalPrefix(prefix: number): 'Norte' | 'Centro' | 'Sur' {
    if (prefix >= 60) {
      return 'Sur';
    }
    if (prefix >= 40) {
      return 'Centro';
    }
    return 'Norte';
  }

  private resolveGermanPostalDestination(
    raw: string,
    value: string,
  ): { city: string; postalRange: string; zone: 'Norte' | 'Centro' | 'Sur' } | null {
    const digits = `${value ?? ''}`.replace(/\D/g, '');
    if (digits.length < 2) {
      return null;
    }

    const prefix = parseInt(digits.slice(0, 2), 10);
    if (!Number.isFinite(prefix)) {
      return null;
    }

    const entries = this.extractGermanPostalCityEntries(raw);
    const match = entries.find((entry) => prefix >= entry.start && prefix <= entry.end);
    if (!match) {
      return {
        city: '',
        postalRange: digits.slice(0, 2),
        zone: this.inferGermanyZoneFromPostalPrefix(prefix),
      };
    }

    return {
      city: match.city,
      postalRange:
        match.start === match.end
          ? `${match.start}`.padStart(2, '0')
          : `${`${match.start}`.padStart(2, '0')}-${`${match.end}`.padStart(2, '0')}`,
      zone: this.inferGermanyZoneFromPostalPrefix(prefix),
    };
  }

  private normalizePriceTiers(value: any): Array<Record<string, any>> {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }

        const min = Math.max(1, Math.round(this.toNumber((entry as any).min_palets ?? (entry as any).min ?? 0)));
        const maxRaw = this.toNumber((entry as any).max_palets ?? (entry as any).max ?? 0);
        const max = maxRaw > 0 ? Math.round(maxRaw) : null;
        const price = this.toNumber((entry as any).price_per_pallet ?? (entry as any).price ?? 0);
        const label = `${(entry as any).label ?? ''}`.trim();

        if (price <= 0) {
          return null;
        }

        return {
          min_palets: min,
          max_palets: max,
          price_per_pallet: Number(price.toFixed(2)),
          label,
        };
      })
      .filter((entry) => !!entry);
  }

  private resolvePricePerPallet(parsed: any, palletCount: number): number {
    const tiers = this.normalizePriceTiers(parsed.price_tiers);
    const pallets = Math.max(1, this.toNumber(palletCount));

    for (const tier of tiers) {
      const min = this.toNumber(tier.min_palets);
      const max = tier.max_palets == null ? Number.POSITIVE_INFINITY : this.toNumber(tier.max_palets);
      if (pallets >= min && pallets <= max) {
        return this.toNumber(tier.price_per_pallet);
      }
    }

    return this.toNumber(parsed.price_per_pallet ?? parsed.transport_cost);
  }

  private async extractPdfText(document: string): Promise<string> {
    const buffer = Buffer.from(document, 'base64');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const parsed = await parser.getText();
      return `${parsed.text ?? ''}`.trim();
    } finally {
      await parser.destroy();
    }
  }

  private finalizeTransportTariffResult(
    parsed: any,
    raw: string,
    origin: string,
    destination: string,
    palletCount: number,
    palletType: string,
    lang: string,
  ): Record<string, any> {
    const rawLower = raw.toLowerCase();
    const parsedCarrier = `${parsed.carrier ?? parsed.transportista ?? parsed.company ?? ''}`.trim();
    const parsedNotes = `${parsed.notes ?? ''}`.trim();
    const combinedTariffText = `${parsedCarrier} ${parsedNotes} ${raw}`.toLowerCase();
    const inferredCarrier =
      parsedCarrier ||
      (combinedTariffText.includes('castillo') || rawLower.includes('castillo')
        ? 'Castillo'
        : '');

    const priceTiers = this.normalizePriceTiers(parsed.price_tiers);
    const basePrice = this.resolvePricePerPallet(parsed, palletCount);
    const pallets = Math.max(1, this.toNumber(palletCount));
    const isIndustrial = `${palletType ?? ''}`.toLowerCase().includes('120x100') ||
      `${palletType ?? ''}`.toLowerCase().includes('industrial');
    const parsedIndustrialMultiplier = this.toNumber(parsed.industrial_multiplier);
    const inferredIndustrialMultiplier =
      inferredCarrier.toLowerCase().includes('castillo') &&
      parsedIndustrialMultiplier <= 1
        ? 1.27
        : parsedIndustrialMultiplier;
    const multiplier = isIndustrial
      ? Math.max(1, inferredIndustrialMultiplier || 1)
      : 1;
    const fuelIncrease = this.toNumber(parsed.fuel_increase_percent);
    const transportCost = Number(
      (
        basePrice *
        pallets *
        multiplier *
        (1 + fuelIncrease / 100)
      ).toFixed(2),
    );

    const originOptions = this.buildRouteOptions(
      parsed.origin,
      parsed.origin_options,
      parsed.origin_postal_codes,
    );
    const destinationOptions = this.buildRouteOptions(
      parsed.destination,
      parsed.destination_options,
      parsed.destination_postal_codes,
    );

    const requestedDestination = `${destination ?? ''}`.trim();
    const rawDestination = /\d{2,}/.test(requestedDestination)
      ? requestedDestination
      : `${parsed.destination ?? requestedDestination ?? ''}`.trim();
    const resolvedGermanPostal =
      this.isCastilloGermanyTariff(raw) && /\d{2,}/.test(rawDestination)
        ? this.resolveGermanPostalDestination(raw, rawDestination)
        : null;

    if (resolvedGermanPostal) {
      parsed.destination =
        resolvedGermanPostal.city || `${parsed.destination ?? ''}`.trim() || rawDestination;
      if (resolvedGermanPostal.city) {
        destinationOptions.unshift(resolvedGermanPostal.city);
      }
      destinationOptions.unshift(resolvedGermanPostal.zone);
      parsed.destination_postal_codes = [
        ...(Array.isArray(parsed.destination_postal_codes) ? parsed.destination_postal_codes : []),
        resolvedGermanPostal.postalRange,
      ];
      parsed.notes = `${`${parsed.notes ?? ''}`.trim()} ${
        resolvedGermanPostal.city
          ? `Destino detectado por CP: ${resolvedGermanPostal.city} (${resolvedGermanPostal.postalRange}), zona estimada ${resolvedGermanPostal.zone}.`
          : `Zona estimada por CP: ${resolvedGermanPostal.zone}.`
      }`.trim();
    }

    return {
      carrier: inferredCarrier,
      origin: `${parsed.origin ?? origin ?? ''}`.trim(),
      destination: `${parsed.destination ?? destination ?? ''}`.trim(),
      origin_options: originOptions,
      destination_options: destinationOptions,
      origin_postal_codes: this.normalizeStringArray(parsed.origin_postal_codes),
      destination_postal_codes: this.normalizeStringArray(
        parsed.destination_postal_codes,
      ),
      currency: `${parsed.currency ?? 'EUR'}`.trim() || 'EUR',
      price_per_pallet: Number(basePrice.toFixed(2)),
      price_tiers: priceTiers,
      industrial_multiplier: Number(multiplier.toFixed(2)),
      fuel_increase_percent: Number(fuelIncrease.toFixed(2)),
      vat_percent: Number((this.toNumber(parsed.vat_percent) || 21).toFixed(2)),
      notes: `${parsed.notes ?? ''}`.trim(),
      pallet_count: pallets,
      transport_cost: transportCost,
      parsed_language: lang,
    };
  }

  private buildImageHash(base64Image: string): string {
    return createHash('sha256').update(base64Image).digest('hex');
  }

  private mapSavedScanResult(saved: AiScanResult): Record<string, any> {
    return {
      image_path: saved.imagePath,
      image_hash: saved.imageHash,
      categoria: saved.categoria,
      producto: saved.producto,
      envase: saved.envase,
      cajas_aprox: saved.cajasAprox,
      cajas_estimadas: saved.cajasAprox,
      piezas_por_caja: saved.piezasPorCaja,
      cantidad_aprox: saved.cantidadAprox,
      cantidad_total_piezas: saved.cantidadAprox,
      tara_kg: saved.taraKg,
      peso_bruto_kg: saved.pesoBrutoKg,
      peso_estimado_kg: saved.pesoBrutoKg,
      peso_neto_kg: saved.pesoNetoKg,
      resultado_ai: saved.resultadoAi,
      result: saved.resultadoAi,
      corregido_usuario: true,
      updatedAt: saved.updatedAt,
      ...(saved.resultadoAi ?? {}),
    };
  }

  private extractPatternSource(scan: any): Record<string, any> {
    const result =
      scan?.resultadoAi && typeof scan.resultadoAi === 'object'
        ? scan.resultadoAi
        : scan?.result && typeof scan.result === 'object'
          ? scan.result
          : scan;

    return result && typeof result === 'object' ? result : {};
  }

  private buildPatternFeatures(scan: any): Record<string, any> {
    const source = this.extractPatternSource(scan);
    const producto = this.normalizeProducto(scan?.producto ?? source.producto);
    const envase = this.normalizeEnvase(scan?.envase ?? source.envase);
    const medidasCaja = this.normalizeMeasure(
      source.medidas_caja ?? scan?.medidasCaja,
    );
    const medidasPalet = this.normalizeMeasure(
      source.medidas_palet ?? scan?.medidasPalet,
    );
    const columnas = this.toNumber(source.columnas_visibles);
    const filas = this.toNumber(source.filas_visibles);
    const profundidad = this.toNumber(source.profundidad_estimada);
    const porCapa = this.toNumber(source.cajas_por_capa);
    const superiores = this.toNumber(source.cajas_superiores);

    return {
      producto,
      envase,
      medidasCaja,
      medidasPalet,
      columnas,
      filas,
      profundidad,
      porCapa,
      superiores,
      cajas: this.toNumber(scan?.cajasAprox ?? source.cajas_estimadas ?? source.cajas_aprox),
      piezasPorCaja: this.toNumber(
        scan?.piezasPorCaja ?? source.piezas_por_caja,
      ),
      pesoBruto: this.toNumber(
        scan?.pesoBrutoKg ?? source.peso_bruto_kg ?? source.peso_estimado_kg,
      ),
      tara: this.toNumber(scan?.taraKg ?? source.tara_kg),
    };
  }

  private computePatternScore(
    baseline: Record<string, any>,
    candidate: Record<string, any>,
  ): number {
    let score = 0;

    if (!baseline.envase || baseline.envase !== candidate.envase) {
      return 0;
    }

    if (!baseline.producto || !candidate.producto) {
      return 0;
    }

    if (baseline.producto !== candidate.producto) {
      return 0;
    }

    score += 6;

    if (
      baseline.medidasPalet &&
      candidate.medidasPalet &&
      baseline.medidasPalet !== candidate.medidasPalet
    ) {
      return 0;
    }

    if (
      baseline.medidasCaja &&
      candidate.medidasCaja &&
      baseline.medidasCaja !== candidate.medidasCaja
    ) {
      return 0;
    }

    if (
      baseline.medidasCaja &&
      candidate.medidasCaja &&
      baseline.medidasCaja === candidate.medidasCaja
    ) {
      score += 3;
    }

    if (
      baseline.medidasPalet &&
      candidate.medidasPalet &&
      baseline.medidasPalet === candidate.medidasPalet
    ) {
      score += 3;
    }

    const numericPairs: Array<[number, number, number]> = [
      [baseline.columnas, candidate.columnas, 3],
      [baseline.filas, candidate.filas, 3],
      [baseline.profundidad, candidate.profundidad, 3],
      [baseline.porCapa, candidate.porCapa, 3],
      [baseline.superiores, candidate.superiores, 1],
    ];

    for (const [a, b, weight] of numericPairs) {
      if (a > 0 && b > 0) {
        const diff = Math.abs(a - b);
        if (diff === 0) score += weight;
        else if (diff === 1) score += weight * 0.4;
        else if (diff >= 3 && weight >= 3) return 0;
      }
    }

    if (
      baseline.piezasPorCaja > 0 &&
      candidate.piezasPorCaja > 0 &&
      baseline.piezasPorCaja === candidate.piezasPorCaja
    ) {
      score += 2;
    }

    return score;
  }

  private async findPatternCorrection(
    result: Record<string, any>,
    imageHash: string,
  ): Promise<AiScanResult | null> {
    const baseline = this.buildPatternFeatures(result);

    if (!baseline.envase.includes('palet')) {
      return null;
    }

    const candidates = await this.aiScanResultRepository.find({
      where: { envase: result.envase ?? baseline.envase },
      order: { updatedAt: 'DESC' },
      take: 25,
    });

    let best: AiScanResult | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      if (candidate.imageHash && candidate.imageHash === imageHash) {
        continue;
      }

      const score = this.computePatternScore(
        baseline,
        this.buildPatternFeatures(candidate),
      );

      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return bestScore >= 18 ? best : null;
  }

  private applyPatternCorrection(
    result: Record<string, any>,
    learned: AiScanResult,
  ): Record<string, any> {
    const corrected = { ...result };
    const learnedPattern = this.buildPatternFeatures(learned);

    if (learnedPattern.cajas > 0) {
      corrected.cajas_estimadas = learnedPattern.cajas;
      corrected.cajas_aprox = learnedPattern.cajas;
    }

    if (learnedPattern.piezasPorCaja > 0) {
      corrected.piezas_por_caja = learnedPattern.piezasPorCaja;
      corrected.cantidad_total_piezas =
        learnedPattern.cajas > 0
          ? learnedPattern.cajas * learnedPattern.piezasPorCaja
          : this.toNumber(corrected.cantidad_total_piezas);
      corrected.cantidad_aprox = corrected.cantidad_total_piezas;
    }

    if (learnedPattern.pesoBruto > 0) {
      corrected.peso_bruto_kg = learnedPattern.pesoBruto;
      corrected.peso_estimado_kg = learnedPattern.pesoBruto;
    }

    if (learnedPattern.tara > 0) {
      corrected.tara_kg = learnedPattern.tara;
    }

    if (
      this.toNumber(corrected.peso_bruto_kg) > 0 ||
      this.toNumber(corrected.tara_kg) > 0
    ) {
      corrected.peso_neto_kg = Number(
        Math.max(
          0,
          this.toNumber(corrected.peso_bruto_kg) -
            this.toNumber(corrected.tara_kg),
        ).toFixed(2),
      );
    }

    corrected.aprendido_por_patron = true;
    corrected.patron_referencia_id = learned.id;

    return corrected;
  }

  private async findSavedCorrection(
    imageHash: string,
    imagePath?: string,
  ): Promise<AiScanResult | null> {
    if (imageHash) {
      const byHash = await this.aiScanResultRepository.findOne({
        where: { imageHash },
        order: { updatedAt: 'DESC' },
      });

      if (byHash) {
        return byHash;
      }
    }

    const normalizedPath = `${imagePath ?? ''}`.trim();
    if (!normalizedPath) {
      return null;
    }

    return this.aiScanResultRepository.findOne({
      where: { imagePath: normalizedPath },
      order: { updatedAt: 'DESC' },
    });
  }

  private estimateBoxes(parsed: any, envase: string): number {
    if (envase.includes('palot')) {
      return 0;
    }

    const existingBoxes = this.toNumber(
      parsed.cajas_estimadas ?? parsed.cajas_aprox,
    );
    const visibleColumns = this.toNumber(parsed.columnas_visibles);
    const visibleRows = this.toNumber(parsed.filas_visibles);
    const estimatedDepth = this.toNumber(parsed.profundidad_estimada);
    const boxesPerLayer = this.toNumber(parsed.cajas_por_capa);
    const estimatedLayers = this.toNumber(parsed.capas_estimadas);
    const topBoxes = this.toNumber(parsed.cajas_superiores);

    const frontVisible =
      visibleColumns > 0 && visibleRows > 0 ? visibleColumns * visibleRows : 0;
    const normalizedBoxesPerLayer = Math.max(
      boxesPerLayer,
      visibleColumns > 0 && estimatedDepth > 0
        ? visibleColumns * estimatedDepth
        : 0,
      topBoxes,
      frontVisible,
    );
    const normalizedLayers = Math.max(
      estimatedLayers,
      envase.includes('palet') ? 1 : 0,
    );

    const byFrontAndDepth =
      visibleColumns > 0 && visibleRows > 0 && estimatedDepth > 0
        ? visibleColumns * visibleRows * estimatedDepth
        : 0;
    const byTopAndRows =
      topBoxes > 0 && visibleRows > 0 ? topBoxes * visibleRows : 0;
    const structuralTotal =
      normalizedBoxesPerLayer > 0
        ? normalizedBoxesPerLayer * Math.max(normalizedLayers, 1)
        : 0;
    const preferredStructuralBase = Math.max(byFrontAndDepth, byTopAndRows);
    const fallbackStructuralBase = Math.max(structuralTotal, frontVisible);
    const structuralBase =
      preferredStructuralBase > 0
        ? preferredStructuralBase
        : fallbackStructuralBase;

    let estimated = structuralBase > 0 ? structuralBase : existingBoxes;

    if (existingBoxes > 0 && structuralBase > 0) {
      if (existingBoxes <= structuralBase * 1.2) {
        estimated = Math.round((existingBoxes + structuralBase) / 2);
      } else if (existingBoxes > structuralBase * 1.5) {
        estimated = structuralBase;
      }
    }

    if (envase.includes('palet') && estimated === 0 && frontVisible > 0) {
      estimated = frontVisible;
    }

    if (envase.includes('palet')) {
      const palletMeasures = `${parsed.medidas_palet ?? ''}`.toLowerCase();
      const boxMeasures = `${parsed.medidas_caja ?? ''}`.toLowerCase();
      const likelyIndustrial =
        palletMeasures.includes('120x100') || boxMeasures.includes('60x40');
      const palletCount = Math.max(1, this.inferPalletCount(parsed, envase));
      const frontOnlyView =
        visibleColumns > 0 &&
        visibleRows > 0 &&
        estimatedDepth <= 1 &&
        topBoxes <= 0 &&
        boxesPerLayer <= 0;

      if (frontOnlyView) {
        estimated = Math.min(
          estimated > 0 ? estimated : frontVisible,
          Math.max(frontVisible, frontVisible + Math.ceil(visibleColumns / 3)),
        );
      }

      if (
        likelyIndustrial &&
        visibleColumns > 0 &&
        visibleRows > 0 &&
        estimatedDepth > 0
      ) {
        estimated = Math.min(
          Math.max(
            estimated,
            visibleColumns * visibleRows * estimatedDepth,
          ),
          boxMeasures.includes('60x40') ? 180 : 220,
        );
      } else if (!likelyIndustrial) {
        estimated = Math.min(
          estimated,
          boxMeasures.includes('60x40') ? 140 : 180,
        );
      }

      if (
        boxMeasures.includes('60x40') &&
        visibleRows >= 8 &&
        palletCount >= 1
      ) {
        const candidateLayerCounts = likelyIndustrial ? [4, 5, 6] : [3, 4, 5];
        const perPalletEstimate = estimated > 0 ? estimated / palletCount : 0;
        const nearestCommercialPerPallet = candidateLayerCounts
          .map((boxesPerLayer) => boxesPerLayer * visibleRows)
          .reduce((best, candidate) => {
            if (best === 0) return candidate;
            return Math.abs(candidate - perPalletEstimate) <
              Math.abs(best - perPalletEstimate)
              ? candidate
              : best;
          }, 0);

        if (
          nearestCommercialPerPallet > 0 &&
          perPalletEstimate > 0 &&
          (perPalletEstimate > nearestCommercialPerPallet * 1.35 ||
            perPalletEstimate < nearestCommercialPerPallet * 0.65)
        ) {
          estimated = nearestCommercialPerPallet * palletCount;
        }
      }
    }

    return Math.round(this.clamp(estimated, 0, 400));
  }

  private inferBoxWeightKg(parsed: any, producto: string): number {
    const piecesPerBox = this.toNumber(parsed.piezas_por_caja);
    const envase = this.normalizeEnvase(parsed?.envase);
    const isCommercialBox = envase.includes('palet') || envase.includes('caja');

    const defaultWeights: Record<string, number> = {
      aguacate: 4,
      berenjena: 5,
      cereza: 2.5,
      fresa: 2,
      kiwi: 3.2,
      limon: 6,
      mandarina: 7,
      manzana: 8,
      melocoton: 7,
      melon: 10,
      naranja: 8,
      nectarina: 7,
      paraguayo: 6,
      pera: 8,
      pimiento: 5,
      platano: 18,
      sandia: 18,
      tomate: 6,
      uva: 4.5,
    };

    const avgPieceWeights: Record<string, number> = {
      aguacate: 0.22,
      albaricoque: 0.06,
      berenjena: 0.3,
      cereza: 0.012,
      ciruela: 0.055,
      fresa: 0.025,
      frambuesa: 0.005,
      granada: 0.35,
      kiwi: 0.09,
      limon: 0.12,
      mandarina: 0.1,
      manzana: 0.18,
      melocoton: 0.17,
      melon: 1.4,
      naranja: 0.2,
      nectarina: 0.16,
      paraguayo: 0.14,
      pera: 0.19,
      pimiento: 0.18,
      platano: 0.18,
      sandia: 6.5,
      tomate: 0.12,
      uva: 0.007,
    };

    if (piecesPerBox > 0 && avgPieceWeights[producto]) {
      const estimatedByPieces = this.clamp(
        piecesPerBox * avgPieceWeights[producto],
        2.5,
        22,
      );
      if (isCommercialBox) {
        const defaultCommercial = defaultWeights[producto] ?? 6.5;
        return Math.max(estimatedByPieces, defaultCommercial, 7.5);
      }
      return estimatedByPieces;
    }

    const inferred = defaultWeights[producto] ?? 6.5;

    if (isCommercialBox) {
      return Math.max(inferred, 7.5);
    }

    return inferred;
  }

  private inferTarePerBoxKg(parsed: any): number {
    const material = `${parsed.material_caja ?? ''}`.toLowerCase();

    if (material.includes('madera')) return 1.2;
    if (material.includes('plast')) return 0.8;
    if (material.includes('cart')) return 0.45;

    return 0.6;
  }

  private inferPalletTareKg(parsed: any, envase: string, boxes: number): number {
    if (envase.includes('palot')) {
      return Math.max(this.toNumber(parsed.tara_kg), 35);
    }

    if (!envase.includes('palet')) {
      return 0;
    }

    const palletMeasures = `${parsed.medidas_palet ?? ''}`.toLowerCase();
    if (palletMeasures.includes('120x100') || boxes >= 140) {
      return 22;
    }

    return 18;
  }

  private inferPalletCount(parsed: any, envase: string): number {
    if (!envase.includes('palet') && !envase.includes('palot')) {
      return 0;
    }

    const explicitCount = Math.max(
      this.toNumber(parsed.numero_palets),
      this.toNumber(parsed.pallet_count),
      this.toNumber(parsed.palets_visibles),
      this.toNumber(parsed.pallets_visible),
      this.toNumber(parsed.palets_estimados),
      this.toNumber(parsed.pallets_estimated),
      this.toNumber(parsed.palets_detectados),
      this.toNumber(parsed.pallets_detected),
      this.toNumber(parsed.grupos_palets),
      this.toNumber(parsed.bloques_palets),
      this.toNumber(parsed.bloques_palets_visibles),
    );
    const palletGridCount =
      Math.max(1, this.toNumber(parsed.columnas_palets_visibles)) *
      Math.max(1, this.toNumber(parsed.filas_palets_visibles));

    const totalBoxes = Math.max(
      this.toNumber(parsed.cajas_estimadas),
      this.toNumber(parsed.cajas_aprox),
    );
    const visibleRows = this.toNumber(parsed.filas_visibles);
    const visibleColumns = this.toNumber(parsed.columnas_visibles);
    const topBoxes = this.toNumber(parsed.cajas_superiores);
    const boxMeasures = `${parsed.medidas_caja ?? ''}`.toLowerCase();
    const palletMeasures = `${parsed.medidas_palet ?? ''}`.toLowerCase();
    const likelyIndustrial =
      palletMeasures.includes('120x100') || boxMeasures.includes('60x40');

    const likelyTopView =
      visibleRows > 0 &&
      visibleRows <= 3 &&
      topBoxes > 0 &&
      totalBoxes >= 90;
    const likelyWarehouseMultiPallet =
      likelyTopView ||
      (visibleRows <= 2 && visibleColumns <= 4 && totalBoxes >= 140) ||
      (topBoxes >= 18 && totalBoxes >= 120);

    const explicitOrGridCount = Math.max(explicitCount, palletGridCount);

    if (explicitOrGridCount > 0 && !likelyWarehouseMultiPallet) {
      return Math.max(1, Math.round(explicitOrGridCount));
    }

    if (likelyWarehouseMultiPallet) {
      const conservativeSinglePalletCapacity = likelyIndustrial ? 100 : 80;
      const inferredByBoxes = Math.max(
        1,
        Math.ceil(totalBoxes / conservativeSinglePalletCapacity),
      );
      const likelyHalfGridUndercount =
        explicitOrGridCount >= 6 &&
        explicitOrGridCount <= 12 &&
        totalBoxes >= 100 &&
        (visibleRows <= 3 || topBoxes >= 18);
      const likelyDoubleBlockWarehouse =
        explicitOrGridCount >= 10 &&
        explicitOrGridCount <= 14 &&
        topBoxes >= 20;
      const inferred = Math.max(
        explicitOrGridCount,
        inferredByBoxes,
        likelyHalfGridUndercount ? explicitOrGridCount * 2 : 0,
        likelyDoubleBlockWarehouse ? explicitOrGridCount * 2 : 0,
      );
      return this.clamp(inferred, 1, 24);
    }

    return explicitOrGridCount > 0 ? Math.max(1, Math.round(explicitOrGridCount)) : 1;
  }

  private finalizeVisionResult(parsed: any): any {
    let envase = this.normalizeEnvase(parsed.envase);
    const producto = this.normalizeProducto(parsed.producto || parsed.fruta);
    const looseTerms = ['sin caja', 'suelto', 'suelta', 'loose', 'a granel'];
    const looksLoose =
      looseTerms.some((term) => envase.includes(term)) ||
      (!envase.includes('caja') &&
        !envase.includes('palet') &&
        !envase.includes('palot'));

    if (looksLoose) {
      envase = 'sin caja';
      parsed.envase = 'sin caja';
    }

    let boxes = looksLoose ? 0 : this.estimateBoxes(parsed, envase);
    const isPalot = envase.includes('palot');
    const palletCount = this.inferPalletCount(parsed, envase);
    const boxWeightKg = this.inferBoxWeightKg(parsed, producto);
    const tarePerBoxKg = this.inferTarePerBoxKg(parsed);
    const palletTareKg = this.inferPalletTareKg(parsed, envase, boxes);
    const aiGrossWeight = this.toNumber(
      parsed.peso_bruto_kg ?? parsed.peso_estimado_kg,
    );

    if (envase.includes('palet') && palletCount >= 8) {
      const boxMeasures = `${parsed.medidas_caja ?? ''}`.toLowerCase();
      const palletMeasures = `${parsed.medidas_palet ?? ''}`.toLowerCase();
      const likelyIndustrial =
        palletMeasures.includes('120x100') || boxMeasures.includes('60x40');
      const minimumBoxesPerPallet = likelyIndustrial ? 10 : 8;
      boxes = Math.max(boxes, palletCount * minimumBoxesPerPallet);
    }

    parsed.cajas_estimadas = boxes;
    parsed.cajas_aprox = boxes;

    const piecesPerBox = this.toNumber(parsed.piezas_por_caja);
    if (looksLoose) {
      const visiblePieces = Math.max(
        this.toNumber(parsed.cantidad_total_piezas),
        this.toNumber(parsed.cantidad_aprox),
        this.toNumber(parsed.piezas_visibles),
        1,
      );
      parsed.cajas_estimadas = 0;
      parsed.cajas_aprox = 0;
      parsed.piezas_por_caja = 0;
      parsed.cantidad_total_piezas = Math.round(visiblePieces);
      parsed.cantidad_aprox = Math.round(visiblePieces);
    } else if (boxes > 0 && piecesPerBox > 0) {
      const totalPieces = Math.round(boxes * piecesPerBox);
      parsed.cantidad_total_piezas = totalPieces;
      parsed.cantidad_aprox = totalPieces;
    }

    let grossWeight = aiGrossWeight;
    if (isPalot) {
      grossWeight = Math.max(aiGrossWeight, 280);
    } else if (boxes > 0) {
      const estimatedGross = boxes * boxWeightKg;
      if (aiGrossWeight > 0) {
        const ratio = estimatedGross > 0 ? aiGrossWeight / estimatedGross : 1;
        grossWeight =
          ratio < 0.6 || ratio > 1.4
            ? Number(estimatedGross.toFixed(2))
            : Number(((aiGrossWeight + estimatedGross) / 2).toFixed(2));
      } else {
        grossWeight = Number(estimatedGross.toFixed(2));
      }
    }

    const tareWeight = isPalot
      ? palletTareKg * Math.max(1, palletCount)
      : envase.includes('palet')
        ? palletTareKg * Math.max(1, palletCount)
        : Number((boxes * tarePerBoxKg).toFixed(2));

    parsed.peso_bruto_kg = Number(grossWeight.toFixed(2));
    parsed.peso_estimado_kg = Number(grossWeight.toFixed(2));
    parsed.tara_kg = Number(tareWeight.toFixed(2));
    parsed.peso_neto_kg = Number(Math.max(0, grossWeight - tareWeight).toFixed(2));

    if (!parsed.medidas_caja || parsed.medidas_caja === 'por confirmar') {
      if (envase.includes('caja') || envase.includes('palet')) {
        parsed.medidas_caja = '60x40 cm aprox';
      }
    }

    if (!parsed.medidas_palet || parsed.medidas_palet === 'por confirmar') {
      if (envase.includes('palet')) {
        parsed.medidas_palet =
          palletTareKg >= 22
            ? 'Palet industrial (120x100 cm aprox)'
            : 'Europalet (120x80 cm aprox)';
      }

      if (envase.includes('palot')) {
        parsed.medidas_palet = 'Palot estandar (120x100x75 cm aprox)';
      }
    }

    parsed.numero_palets = palletCount;

    if (
      envase.includes('palet') &&
      (`${parsed.medidas_palet ?? ''}`.toLowerCase().includes('120x100') ||
          boxes >= 140)
    ) {
      parsed.medidas_palet = 'Palet industrial (120x100 cm aprox)';
    }

    return parsed;
  }

  private async refinePalletEstimate(
    img: string,
    parsed: any,
    language: string,
  ): Promise<any> {
    const lang = 'en';
    const prompt =
      lang === 'en'
        ? `You are reviewing a fruit pallet image because the first estimate may be undercounting boxes.

Return ONLY valid JSON with:
{
  "numero_palets": 1,
  "columnas_visibles": 0,
  "filas_visibles": 0,
  "profundidad_estimada": 0,
  "cajas_por_capa": 0,
  "capas_estimadas": 0,
  "cajas_superiores": 0,
  "cajas_estimadas": 0,
  "medidas_caja": "60x40 cm approx",
  "medidas_palet": "Industrial pallet (120x100 cm approx) / Europallet (120x80 cm approx)",
  "confianza_estimacion": "alta/media/baja"
}

Rules:
- First count how many pallets are visible.
- Count the number of full front columns.
- Count the number of full front rows in height.
- Estimate depth from the visible side and top faces.
- Use the top face to infer how many boxes fit in one full layer.
- Compute cajas_por_capa = columnas_visibles x profundidad_estimada.
- Compute cajas_estimadas = columnas_visibles x filas_visibles x profundidad_estimada.
- Prioritize the front face and the visible side over generic volume guesses.
- If the top suggests 3 columns by 5 deep and the front is 6 high, the total should be close to 90.
- Do NOT return only front-visible boxes.
- In a dense commercial pallet, assume hidden rear boxes exist.
- Prefer a coherent 3D pallet structure over a low visual-only count.
- Avoid unrealistic totals such as 300-400 boxes for one normal fruit pallet unless that amount is clearly visible and structurally possible.
- Distinguish industrial pallet vs europallet from footprint and boxes per layer.`
        : `Estás revisando una imagen de palet de fruta porque la primera estimación puede estar contando pocas cajas.

Devuelve SOLO JSON válido con:
{
  "numero_palets": 1,
  "columnas_visibles": 0,
  "filas_visibles": 0,
  "profundidad_estimada": 0,
  "cajas_por_capa": 0,
  "capas_estimadas": 0,
  "cajas_superiores": 0,
  "cajas_estimadas": 0,
  "medidas_caja": "60x40 cm aprox",
  "medidas_palet": "Palet industrial (120x100 cm aprox) / Europalet (120x80 cm aprox)",
  "confianza_estimacion": "alta/media/baja"
}

Reglas:
- Cuenta primero cuántos palets hay visibles.
- Cuenta primero la cara frontal visible.
- Infiere la profundidad total del palet usando lo que se vea en el lateral y arriba.
- Prioriza la cara frontal y el lateral visible por encima de estimaciones genéricas de volumen.
- NO devuelvas solo las cajas visibles de frente.
- Si el palet es alto y está muy lleno, prioriza el total comercial completo.
- Distingue europalet y palet industrial por huella y cajas por capa.
- Si ves un palet alto de caja 60x40 con frontal grande, evita respuestas como 64 si el total del volumen es mayor.`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `${prompt}\n\nPrimera lectura previa:\n${JSON.stringify(parsed)}`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${img}`,
              },
            },
          ],
        },
      ],
      max_tokens: 250,
      temperature: 0,
    });

    const response = completion.choices[0]?.message?.content || '{}';
    const refined = JSON.parse(response);
    this.logVisionSnapshot('OpenAI refine pallet raw JSON', refined);

    return {
      ...parsed,
      ...refined,
      columnas_visibles:
        refined.columnas_visibles ?? parsed.columnas_visibles,
      filas_visibles: refined.filas_visibles ?? parsed.filas_visibles,
      profundidad_estimada:
        refined.profundidad_estimada ?? parsed.profundidad_estimada,
      cajas_por_capa: refined.cajas_por_capa ?? parsed.cajas_por_capa,
      capas_estimadas: refined.capas_estimadas ?? parsed.capas_estimadas,
      cajas_superiores: refined.cajas_superiores ?? parsed.cajas_superiores,
      cajas_estimadas: this.toNumber(refined.cajas_estimadas),
    };
  }

  private shouldRefinePalletEstimate(parsed: any): boolean {
    const envase = this.normalizeEnvase(parsed?.envase);
    if (!envase.includes('palet')) {
      return false;
    }

    const cajas = this.toNumber(parsed?.cajas_estimadas ?? parsed?.cajas_aprox);
    const confianza = `${parsed?.confianza_estimacion ?? ''}`.trim().toLowerCase();
    const profundidad = this.toNumber(parsed?.profundidad_estimada);
    const capas = this.toNumber(parsed?.capas_estimadas);
    const cajasPorCapa = this.toNumber(parsed?.cajas_por_capa);
    const columnas = this.toNumber(parsed?.columnas_visibles);
    const filas = this.toNumber(parsed?.filas_visibles);
    const frontal = columnas > 0 && filas > 0 ? columnas * filas : 0;

    if (confianza.includes('baja') || confianza.includes('low')) {
      return true;
    }

    if (cajas <= 72) {
      return true;
    }

    if (cajas <= 96 && (profundidad <= 1 || capas <= 1 || cajasPorCapa <= 0)) {
      return true;
    }

    if (frontal > 0 && cajas > 0) {
      const ratio = cajas / frontal;
      if (ratio >= 3.5 || ratio <= 1) {
        return true;
      }
    }

    return false;
  }

  async saveScanResult(userId: string, payload: any): Promise<AiScanResult> {
    const imageHash =
      `${payload?.image_hash ?? payload?.imageHash ?? payload?.resultado_ai?.image_hash ?? payload?.result?.image_hash ?? ''}`.trim() ||
      null;
    const imagePath =
      `${payload?.image_path ?? payload?.imagePath ?? payload?.resultado_ai?.image_path ?? payload?.result?.image_path ?? ''}`.trim() ||
      null;
    const existing = await this.aiScanResultRepository.findOne({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });

    const entity = existing ?? this.aiScanResultRepository.create({ userId });
    entity.imagePath = imagePath;
    entity.imageHash = imageHash;
    entity.categoria = payload?.categoria ?? null;
    entity.producto = payload?.producto ?? null;
    entity.envase = payload?.envase ?? null;
    entity.cajasAprox = Math.round(this.toNumber(payload?.cajas_aprox));
    entity.piezasPorCaja = Math.round(this.toNumber(payload?.piezas_por_caja));
    entity.cantidadAprox = Math.round(this.toNumber(payload?.cantidad_aprox));
    entity.taraKg = this.toNumber(payload?.tara_kg);
    entity.pesoBrutoKg = this.toNumber(payload?.peso_bruto_kg);
    entity.pesoNetoKg = this.toNumber(payload?.peso_neto_kg);
    entity.resultadoAi =
      payload?.resultado_ai && typeof payload.resultado_ai === 'object'
        ? payload.resultado_ai
        : payload?.result && typeof payload.result === 'object'
            ? payload.result
            : null;

    return this.aiScanResultRepository.save(entity);
  }

  async getLatestScanResult(userId: string): Promise<Record<string, any> | null> {
    const saved = await this.aiScanResultRepository.findOne({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });

    if (!saved) {
      return null;
    }

    return {
      id: saved.id,
      image_path: saved.imagePath,
      image_hash: saved.imageHash,
      categoria: saved.categoria,
      producto: saved.producto,
      envase: saved.envase,
      cajas_aprox: saved.cajasAprox,
      cajas_estimadas: saved.cajasAprox,
      piezas_por_caja: saved.piezasPorCaja,
      cantidad_aprox: saved.cantidadAprox,
      cantidad_total_piezas: saved.cantidadAprox,
      tara_kg: saved.taraKg,
      peso_bruto_kg: saved.pesoBrutoKg,
      peso_neto_kg: saved.pesoNetoKg,
      result: saved.resultadoAi,
      resultado_ai: saved.resultadoAi,
      updatedAt: saved.updatedAt,
    };
  }

  async deleteSavedScanResults(userId: string): Promise<number> {
    const results = await this.aiScanResultRepository.find({
      where: { userId },
      select: ['id'],
    });

    if (!results.length) {
      return 0;
    }

    await this.aiScanResultRepository.delete({ userId });
    return results.length;
  }

  private systemPrompts: Record<string, string> = {
    es: `Eres Nara, el asistente virtual de MasMercat, una plataforma mayorista de comercio de frutas. 
Tu objetivo es ayudar a usuarios (compradores y vendedores) a usar la aplicación y responder preguntas sobre frutas, mercados y temporadas.

Capacidades:
- Explicar cómo usar la app (publicar lotes, buscar frutas, contactar vendedores)
- Información sobre frutas: temporada, origen, características
- Información sobre mercados mayoristas en Europa
- Consejos sobre precios y tendencias de mercado

Responde de manera amigable, concisa y profesional en español.`,

    en: `You are Nara, the virtual assistant for MasMercat, a wholesale fruit trading platform.
Your goal is to help users (buyers and sellers) use the application and answer questions about fruits, markets and seasons.

Capabilities:
- Explain how to use the app (post lots, search fruits, contact sellers)
- Information about fruits: season, origin, characteristics
- Information about wholesale markets in Europe
- Advice on prices and market trends

Respond in a friendly, concise and professional manner in English.`,

    fr: `Tu es Nara, l'assistant virtuel de MasMercat, une plateforme de commerce de fruits en gros.
Ton objectif est d'aider les utilisateurs (acheteurs et vendeurs) à utiliser l'application et à répondre aux questions sur les fruits, les marchés et les saisons.

Capacités:
- Expliquer comment utiliser l'application (publier des lots, rechercher des fruits, contacter des vendeurs)
- Informations sur les fruits: saison, origine, caractéristiques
- Informations sur les marchés de gros en Europe
- Conseils sur les prix et les tendances du marché

Réponds de manière amicale, concise et professionnelle en français.`,

    de: `Du bist Nara, der virtuelle Assistent von MasMercat, einer Großhandelsplattform für Obst.
Dein Ziel ist es, Benutzern (Käufern und Verkäufern) bei der Nutzung der Anwendung zu helfen und Fragen zu Früchten, Märkten und Jahreszeiten zu beantworten.

Fähigkeiten:
- Erklären, wie man die App benutzt (Lose veröffentlichen, Früchte suchen, Verkäufer kontaktieren)
- Informationen über Früchte: Saison, Herkunft, Eigenschaften
- Informationen über Großhandelsmärkte in Europa
- Ratschläge zu Preisen und Markttrends

Antworte freundlich, prägnant und professionell auf Deutsch.`,

    pt: `Você é Nara, a assistente virtual da MasMercat, uma plataforma de comércio atacadista de frutas.
Seu objetivo é ajudar os usuários (compradores e vendedores) a usar o aplicativo e responder perguntas sobre frutas, mercados e temporadas.

Capacidades:
- Explicar como usar o aplicativo (publicar lotes, buscar frutas, contatar vendedores)
- Informações sobre frutas: temporada, origem, características
- Informações sobre mercados atacadistas na Europa
- Conselhos sobre preços e tendências de mercado

Responda de maneira amigável, concisa e profissional em português.`,

    ar: `أنت نارا، المساعد الافتراضي لـ MasMercat، منصة تجارة الفواكه بالجملة.
هدفك هو مساعدة المستخدمين (المشترين والبائعين) على استخدام التطبيق والإجابة على الأسئلة حول الفواكه والأسواق والمواسم.

القدرات:
- شرح كيفية استخدام التطبيق (نشر الدفعات، البحث عن الفواكه، الاتصال بالبائعين)
- معلومات عن الفواكه: الموسم، الأصل، الخصائص
- معلومات عن أسواق الجملة في أوروبا
- نصائح حول الأسعار واتجاهات السوق

استجب بطريقة ودية وموجزة ومهنية بالعربية.`,

    zh: `你是 Nara，MasMercat 的虚拟助手，一个批发水果贸易平台。
你的目标是帮助用户（买家和卖家）使用应用程序并回答有关水果、市场和季节的问题。

能力：
- 解释如何使用应用程序（发布批次、搜索水果、联系卖家）
- 水果信息：季节、产地、特点
- 欧洲批发市场信息
- 价格和市场趋势建议

以友好、简洁和专业的方式用中文回应。`,

    hi: `आप नारा हैं, MasMercat की वर्चुअल असिस्टेंट, एक थोक फल व्यापार प्लेटफॉर्म।
आपका लक्ष्य उपयोगकर्ताओं (खरीदारों और विक्रेताओं) को एप्लिकेशन का उपयोग करने में मदद करना और फलों, बाजारों और मौसमों के बारे में सवालों के जवाब देना है।

क्षमताएं:
- ऐप का उपयोग कैसे करें समझाएं (लॉट पोस्ट करें, फल खोजें, विक्रेताओं से संपर्क करें)
- फलों के बारे में जानकारी: मौसम, मूल, विशेषताएं
- यूरोप में थोक बाजारों के बारे में जानकारी
- कीमतों और बाजार के रुझानों पर सलाह

हिंदी में मित्रवत, संक्षिप्त और पेशेवर तरीके से जवाब दें।`,
  };

  private buildNaraSystemPrompt(basePrompt: string, language: string): string {
    const responseLanguage: Record<string, string> = {
      es: 'Spanish',
      en: 'English',
      fr: 'French',
      de: 'German',
      pt: 'Portuguese',
      ar: 'Arabic',
      zh: 'Chinese',
      hi: 'Hindi',
    };

    const finalLanguage = responseLanguage[language] || responseLanguage.es;

    return `${basePrompt}

Extra role for this conversation:
- You are not a generic chatbot. You are Nara, a practical expert for fruit, quality, lots, pricing and commercial decisions.
- Help the user work better, sell better, buy better and detect mistakes before they cost money.
- Be brief, clear and operational.

Priority tasks:
- Analyze fruit or lot photos as an expert eye
- Help with pricing, margin and transport decisions
- Read lot data and detect inconsistencies
- Give simple market guidance when relevant
- Turn operational details into a clear commercial summary

If the user shares a lot photo or lot data, prefer this response structure when relevant:
1. Visual condition or estimated quality
2. Detected signs, risks or possible damage
3. Consistency check for boxes, weight, caliber, format or price
4. Indicative selling comment, margin comment or market comment
5. Recommended action

Rules:
- Do not invent facts that are not visible or not supported
- If something is uncertain, say it clearly and mention confidence
- If data looks inconsistent, say it clearly
- Focus on decision support, control and business value

Respond always in ${finalLanguage}.`;
  }

  private buildNaraImageInstruction(language: string): string {
    const responseLanguage: Record<string, string> = {
      es: 'Spanish',
      en: 'English',
      fr: 'French',
      de: 'German',
      pt: 'Portuguese',
      ar: 'Arabic',
      zh: 'Chinese',
      hi: 'Hindi',
    };

    const finalLanguage = responseLanguage[language] || responseLanguage.es;

    return `This request includes an image.

For image-based answers:
- Start from what is actually visible in the image, not from generic assumptions.
- Mention visible structure, pallet format, stacking, packaging, labels and external condition when relevant.
- Do not claim internal fruit quality, exact caliber, exact weight or market demand unless the image or provided data truly support it.
- If the exact product is not fully clear from the image, say it is probable or not fully confirmed.
- Do not add market-price commentary unless the user provided price, market data or calculator context.
- If the user asks about inconsistencies, point to specific visible clues.
- Prefer concrete observations over generic advice.

Respond always in ${finalLanguage}.`;
  }

  constructor(
    private configService: ConfigService,
    @InjectRepository(AiScanResult)
    private aiScanResultRepository: Repository<AiScanResult>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    const apiKey =
      this.configService.get<string>('OPENAI_API_KEY') ||
      process.env.OPENAI_API_KEY;

    if (!apiKey) {
      // Así te enteras al instante si falta la key
      console.error('❌ Falta OPENAI_API_KEY en .env / variables de entorno');
    }

this.openai = new OpenAI({ apiKey: apiKey || '', timeout: 60000 });
  }

  async chat(chatMessageDto: ChatMessageDto): Promise<string> {
    const {
      message,
      language = 'es',
      image,
      imageMimeType = 'image/jpeg',
      imageName = 'image.jpg',
    } = chatMessageDto;
    const systemPrompt = this.buildNaraSystemPrompt(
      this.systemPrompts[language] || this.systemPrompts.es,
      language,
    );

    try {
      const effectiveSystemPrompt = image
        ? `${systemPrompt}\n\n${this.buildNaraImageInstruction(language)}`
        : systemPrompt;

      const userContent = image
        ? [
            {
              type: 'text' as const,
              text: `${message}\n\nImagen adjunta: ${imageName}`,
            },
            {
              type: 'image_url' as const,
              image_url: {
                url: `data:${imageMimeType};base64,${image}`,
              },
            },
          ]
        : message;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o', // más estable y actual para chat
        messages: [
          { role: 'system', content: effectiveSystemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: image ? 0.2 : 0.7,
        max_tokens: 500,
      });

      return completion.choices[0]?.message?.content || '';
    } catch (error: any) {
      console.error('❌ OpenAI chat error:', error?.message || error);
      console.error('❌ details:', error?.response?.data || error?.response || error);

      const fallbackMessages: Record<string, string> = {
        es: 'Lo siento, estoy teniendo un problema técnico ahora mismo. Intenta de nuevo en un momento.',
        en: 'Sorry, I am having a technical issue right now. Please try again in a moment.',
        fr: "Désolé, j'ai un problème technique pour le moment. Réessaie dans un instant.",
        de: 'Entschuldigung, ich habe gerade ein technisches Problem. Bitte versuche es gleich nochmal.',
        pt: 'Desculpe, estou com um problema técnico agora. Tente novamente em instantes.',
        ar: 'عذرًا، لدي مشكلة تقنية الآن. حاول مرة أخرى بعد لحظة.',
        zh: '抱歉，我现在遇到技术问题。请稍后再试。',
        hi: 'माफ़ कीजिए, मुझे अभी तकनीकी समस्या हो रही है। कृपया थोड़ी देर बाद फिर कोशिश करें।',
      };

      return fallbackMessages[language] || fallbackMessages.es;
    }
  }

  async analyzeTransportTariff(
    tariffDto: TransportTariffDto,
  ): Promise<Record<string, any>> {
    const {
      document,
      mimeType = 'image/jpeg',
      language = 'es',
      origin = '',
      destination = '',
      palletCount = 1,
      palletType = '',
    } = tariffDto;

    if (!document) {
      throw new Error('Falta document');
    }

    const lang = (language || 'es').substring(0, 2);
    const prompt = `Analyze this transport tariff for fruit logistics.

		Return ONLY valid JSON with:
		{
		  "carrier": "",
		  "origin": "",
		  "destination": "",
		  "origin_options": [],
		  "destination_options": [],
		  "origin_postal_codes": [],
		  "destination_postal_codes": [],
		  "currency": "EUR",
		  "price_per_pallet": 0,
		  "price_tiers": [
		    { "min_palets": 1, "max_palets": 3, "price_per_pallet": 248, "label": "1-3" }
		  ],
		  "industrial_multiplier": 1,
	  "fuel_increase_percent": 0,
	  "vat_percent": 21,
	  "notes": "",
  "transport_cost": 0
}

Rules:
- Extract visible carrier, route, currency and pallet pricing.
- Return the carrier company name exactly as printed on the tariff when visible.
- If the tariff belongs to a company like Castillo, return "Castillo" in carrier.
		- Use these context values if helpful:
		  origin: ${origin || 'not provided'}
		  destination: ${destination || 'not provided'}
		  pallet_count: ${palletCount || 1}
		  pallet_type: ${palletType || 'not provided'}
		- If the tariff shows multiple origin or destination zones, return them in origin_options and destination_options.
		- If postal codes or postal code ranges are visible, return them in origin_postal_codes and destination_postal_codes.
		- If the tariff shows price brackets by number of pallets (for example 1-3, 5-9, 10-19, 20-27), return them in price_tiers.
		- For each tier, use min_palets, max_palets, price_per_pallet, and label.
		- Set price_per_pallet to the tier that matches the current pallet_count when tiers exist.
		- If the tariff mentions a multiplier for industrial pallet, return it in industrial_multiplier as a decimal number, for example 1.27.
	- If there is a surcharge increase in percent, return it in fuel_increase_percent.
	- Compute transport_cost using:
	  price_per_pallet x pallet_count x industrial_multiplier x (1 + fuel_increase_percent/100)
	- If the pallet is not industrial, use multiplier 1.
	- If VAT is not visible, default to 21.
	- Be conservative and choose the clearest visible price.
	`;

    let raw = '{}';
    let parsed: any = {};

    if (mimeType === 'application/pdf') {
      const pdfText = await this.extractPdfText(document);
      if (!pdfText) {
        throw new Error('No se pudo leer texto del PDF de tarifa');
      }

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: `Tariff PDF extracted text:\n\n${pdfText.slice(0, 12000)}\n\n${prompt}`,
          },
        ],
        max_tokens: 500,
        temperature: 0,
      });

      raw = completion.choices[0]?.message?.content || '{}';
      parsed = JSON.parse(raw);
      this.logVisionSnapshot('OpenAI transport tariff PDF JSON', parsed);
    } else if (mimeType.startsWith('image/')) {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${document}`,
                },
              },
            ],
          },
        ],
        max_tokens: 350,
        temperature: 0,
      });

      raw = completion.choices[0]?.message?.content || '{}';
      parsed = JSON.parse(raw);
      this.logVisionSnapshot('OpenAI transport tariff JSON', parsed);
    } else {
      throw new Error('Formato de tarifa no compatible');
    }

    return this.finalizeTransportTariffResult(
      parsed,
      raw,
      origin,
      destination,
      palletCount,
      palletType,
      lang,
    );
  }

  async analyzeFruitImage(
    base64Image: string,
    language: string = 'es',
    options?: { imagePath?: string; fastMode?: boolean },
  ): Promise<any> {
  // Limpieza y normalización
  let img = (base64Image || '').trim();

  // Si viene como data URL, lo convertimos a base64 puro
  img = img.replace(/^data:image\/\w+;base64,/, '');
  const imageHash = this.buildImageHash(img);
  const savedCorrection = await this.findSavedCorrection(
    imageHash,
    options?.imagePath,
  );

  if (savedCorrection) {
    const restored = this.mapSavedScanResult(savedCorrection);
    this.logVisionSnapshot('Reused saved scan correction', restored);
    return restored;
  }

  const prompts: any = {
    es: `Analiza esta imagen de frutas o verduras.

Usa terminología agrícola de España para los nombres de frutas.

IMPORTANTE:
Distingue correctamente entre estos productos:
- melocotón = fruta redonda con piel aterciopelada
- paraguayo = melocotón plano
- nectarina = fruta redonda con piel lisa

Si identificas "durazno", debes devolver "melocotón".

Objetivo:
Debes analizar el lote de forma visual y estructurada. No des una cifra simple sin justificarla visualmente.

Identifica:

1. Categoría del producto:
   - fruta
   - verdura
   - hongo

2. Producto específico:
   - melocotón
   - paraguayo
   - nectarina
   - kiwi
   - berenjena
   - trufa
   - etc.

	3. Tipo de envase detectado:
	   - sin caja
	   - caja
	   - varias cajas
	   - palet con cajas
	   - palot

	Si solo ves fruta suelta o una sola fruta sin caja, devuelve:
	- "envase": "sin caja"
	- "cajas_estimadas": 0
	- "piezas_por_caja": 0
	- "cantidad_total_piezas": el numero visible de frutas en la foto

4. Material del envase o caja si se aprecia:
   - cartón
   - madera
   - plástico
   - desconocido4

5. Si el envase es "palet con cajas", analiza así:
- SIEMPRE estima el total del palet completo, no solo lo visible de frente
- Cuenta como lo haría una persona mirando la foto:
  1) columnas visibles delante
  2) filas visibles en altura
  3) profundidad visible en el lateral
  4) multiplica frente x profundidad
- Si en la foto aparecen varios palets, cuenta cuántos palets completos o casi completos hay
- En ese caso, "numero_palets" debe ser el total de palets visibles y "cajas_estimadas" debe ser la suma de todos los palets, no solo uno
- Si la foto es desde arriba, diagonal o de almacén, cuenta huellas o bloques de palet visibles en el suelo
- En esas vistas, estima también:
  - "columnas_palets_visibles" = cuántos palets o bloques ves a lo ancho
  - "filas_palets_visibles" = cuántos palets o bloques ves hacia el fondo
  - "bloques_palets_visibles" = total de palets visibles si la cuadrícula no es perfecta
- No agrupes varios palets cercanos como si fueran un solo palet
- Si hay varias capas en profundidad, multiplícalas
- Si hay cajas encima, súmalas aparte
- Si dudas entre varios valores, elige el MAYOR coherente
- NUNCA devuelvas solo la cara frontal

El valor de "cajas_estimadas" debe representar el TOTAL REAL del palet completo.
Ejemplo: si ves 6x4 cajas delante y estimas 3 capas → devuelve ~72, no 24.

- cuenta columnas visibles en la cara frontal
- cuenta filas visibles en altura (niveles)
- identifica si hay profundidad (segunda fila o cara lateral visible)
- asume profundidad mínima de 1, pero aumenta si se ve lateral o volumen

Debes calcular SIEMPRE con fórmula:

- cajas_frente = columnas × filas
- profundidad = número de filas hacia atrás (mínimo 1)
- cajas_totales = cajas_frente × profundidad

Ejemplo humano:
- si delante ves 8 columnas x 5 filas = 40
- y en el lateral se aprecian 4 cajas de profundidad
- el total debe quedar cerca de 160, no 300 ni 400

IMPORTANTE:
- NO devuelvas solo las cajas visibles de frente
- SIEMPRE estima volumen completo del palet
- Si se ve lateral o parte superior, aumenta profundidad
- Si el palet es alto, aumenta filas
- Si parece lleno, evita números bajos
- Es mejor aproximar alto que quedarse corto

6. Si es palot:
   - estima el peso aproximado del palot lleno

7. Calibre aproximado:
   - 1, 2, 3, 4, 5, 6, A, B si aplica

8. Piezas por caja:
   - estima piezas_por_caja si se puede
   - si no se puede, usa un valor razonable según el tamaño visual del fruto

9. Cantidad total:
   - calcula cantidad_total_piezas = cajas_estimadas × piezas_por_caja cuando aplique

10. Peso estimado total en kg basado en:
   - tipo de envase
   - número estimado de cajas o palots
   - peso típico por caja
   - tamaño visual del producto

11. Calidad visual aproximada:
   - extra
   - primera
   - segunda

12. Medidas de caja:
   - si pueden inferirse con bastante seguridad, devuelve algo como "60x40 cm aprox"
   - si no es fiable, devuelve "por confirmar"

13. Confianza de la estimación:
   - alta
   - media
   - baja

Ejemplos:
- durazno = melocotón
- frutilla = fresa
- palta = aguacate
- ananá = piña

Responde SOLO en JSON válido, sin texto adicional, con estas claves exactas:
{
  "categoria": "fruta/verdura/hongo",
  "producto": "melocoton/paraguayo/nectarina/kiwi/berenjena/etc",
	  "envase": "sin caja/caja/varias cajas/palet con cajas/palot",
  "material_caja": "carton/madera/plastico/desconocido",
  "columnas_visibles": 0,
  "filas_visibles": 0,
  "cajas_por_capa": 0,
  "capas_estimadas": 0,
  "cajas_aprox": 0,
  "cajas_superiores": 0,
  "cajas_estimadas": 0,
  "columnas_palets_visibles": 0,
  "filas_palets_visibles": 0,
  "bloques_palets_visibles": 0,
  "piezas_por_caja": 0,
  "cantidad_total_piezas": 0,
  "cantidad_aprox": 0,
  "calibre": "1/2/3/4/5/6/A/B",
  "peso_estimado_kg": 0,
  "tara_kg": 0,
  "peso_neto_kg": 0,
  "numero_palets": 0,
  "calidad": "extra/primera/segunda",
  "medidas_caja": "por confirmar",
  "medidas_palet": "por confirmar",
  "confianza_estimacion": "alta/media/baja"
}`,

en: `Analyze this fruit or vegetable image.

Identify:
1. Fruit type
2. Approximate size (caliber)
3. Estimate the total number of boxes on the whole pallet using structural counting:
 - count visible boxes on the front face
 - count visible boxes on the side face
 - estimate boxes per layer
 - estimate number of layers in height
 - infer hidden boxes from pallet depth and width
 - determine whether it is half pallet, europallet (120x80), or industrial pallet (120x100)
 - if the pallet is full and densely stacked, prefer a realistic commercial total instead of a low visual-only count
- if several pallets are visible, count them and return the total box count for all visible pallets
- if the image is top-down, diagonal, or warehouse-style, count pallet footprints or distinct pallet blocks on the floor
- in those views also estimate:
  - "columnas_palets_visibles" = pallets across
  - "filas_palets_visibles" = pallets deep
  - "bloques_palets_visibles" = total visible pallet blocks when the grid is irregular
- do not merge nearby pallets into one pallet
4. Estimate pieces per box
5. Estimated total weight in kg
6. Quality (extra, first, second)
	7. Packaging type (without box, box, pallet with boxes, loose)
8. Box dimensions (e.g. "60x40 cm approx")
9. Pallet dimensions if present (e.g. "120x100 cm approx")

Respond ONLY in JSON with these keys:
{
   "fruta": "orange/lemon/etc",
  "calibre": "1/2/3/A/B",
  "cajas_estimadas": 184,
  "columnas_palets_visibles": 0,
  "filas_palets_visibles": 0,
  "bloques_palets_visibles": 0,
  "piezas_por_caja": 20,
  "cantidad_total_piezas": 3680,
  "peso_estimado_kg": 920,
  "calidad": "extra/first/second",
  "envase": "box / pallet with boxes",
  "medidas_caja": "60x40 cm approx",
  "medidas_palet": "120x100 cm approx",
  "numero_palets": 1
}

IMPORTANT:
- If a pallet is visible, ALWAYS estimate pallet dimensions.
- If boxes are visible, ALWAYS estimate box dimensions.
- Never return "por confirmar".
- Always give an approximate value even if uncertain.
- Estimate box count structurally, not loosely.
- Count as a human operator would:
  1) front columns
  2) front rows in height
  3) side depth
  4) total = front face x depth
- If more than one pallet is visible, count the pallets first and then return the total number of boxes across all pallets.
- For top-down or warehouse views, count pallet footprints on the floor before estimating boxes.
- Use visible rows and columns on the front and side faces to infer total boxes.
- Infer hidden boxes that are not directly visible when the pallet depth suggests more boxes.
- If the pallet is full height and densely stacked, avoid low counts.
- Prefer realistic commercial pallet counts for fruit boxes.
- If the visible structure suggests around 160 boxes, do not jump to 300-400 without clear visual proof.
	- If the image only shows loose fruit or a single fruit without packaging, return packaging as "without box", set cajas_estimadas to 0 and set cantidad_total_piezas to the visible fruit count.
	- Return cajas_estimadas as the total estimated number of boxes on the whole pallet.
- Do not count only the front-visible boxes.
- For full pallets, prioritize total pallet structure over partial face visibility.
`,
};

  const lang = (language || 'es').substring(0, 2);
  const prompt = prompts[lang] || prompts.es;

  console.log('🧠 analyzeFruitImage lang:', lang);
  console.log('🧠 analyzeFruitImage base64 length:', img.length);
  console.log('🧠 analyzeFruitImage first chars:', img.slice(0, 20));

  // Intento A: data URL (lo más común)
  try {
    console.log('➡️ Llamando a OpenAI (attempt A)...');
    console.time('openai_attempt_A');

    const completion = await this.openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${img}`,
          },
        },
      ],
    },
  ],
  max_tokens: 300,
  temperature: 0,
});
    console.timeEnd('openai_attempt_A');
    console.log('✅ OpenAI respondió (attempt A)');

    const response = completion.choices[0]?.message?.content || '{}';
    console.log('📨 OpenAI content (attempt A):', response);
    console.log('📨 OpenAI parsed JSON:', JSON.parse(response));
    
    let parsed = JSON.parse(response);
    this.logVisionSnapshot('OpenAI attempt A raw JSON', parsed);
    if (!(options?.fastMode == true) && this.shouldRefinePalletEstimate(parsed)) {
      parsed = await this.refinePalletEstimate(img, parsed, lang);
    }

    let finalized = this.finalizeVisionResult(parsed);
    const learnedPattern = await this.findPatternCorrection(finalized, imageHash);
    if (learnedPattern) {
      finalized = this.applyPatternCorrection(finalized, learnedPattern);
      this.logVisionSnapshot('Applied pallet pattern correction', {
        learnedFromId: learnedPattern.id,
        cajas_estimadas: finalized.cajas_estimadas,
      });
    }

    finalized.image_hash = imageHash;
    finalized.image_path = options?.imagePath ?? null;
    this.logVisionSnapshot('Final pallet result attempt A', finalized);
    return finalized;
  } catch (error: any) {
    console.error('❌ Vision attempt A (data URL) error:', error?.message || error);
    console.error('❌ details:', error?.response?.data || error?.response || error);
  }

  // Intento B: base64 “puro” (por si el data URL falla en tu entorno)
  
try {
  const completionResponse = await this.openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: img } },
        ],
      },
    ],
    max_tokens: 500,
    temperature: 0,
  });

  const response = completionResponse.choices[0]?.message?.content || '{}';
  console.log('📄 OpenAI content (attempt B):', response);
  console.log('📄 OpenAI parsed JSON:', JSON.parse(response));

  let parsed = JSON.parse(response);
  this.logVisionSnapshot('OpenAI attempt B raw JSON', parsed);
  if (!(options?.fastMode == true) && this.shouldRefinePalletEstimate(parsed)) {
    parsed = await this.refinePalletEstimate(img, parsed, lang);
  }

  let finalized = this.finalizeVisionResult(parsed);
  const learnedPattern = await this.findPatternCorrection(finalized, imageHash);
  if (learnedPattern) {
    finalized = this.applyPatternCorrection(finalized, learnedPattern);
    this.logVisionSnapshot('Applied pallet pattern correction', {
      learnedFromId: learnedPattern.id,
      cajas_estimadas: finalized.cajas_estimadas,
    });
  }

  finalized.image_hash = imageHash;
  finalized.image_path = options?.imagePath ?? null;
  this.logVisionSnapshot('Final pallet result attempt B', finalized);
  return finalized;

  } catch (error: any) {
    console.error('❌ Vision attempt B (raw base64) error:', error?.message || error);
    console.error('❌ details:', error?.response?.data || error?.response || error);
    throw error;
  }
}
}

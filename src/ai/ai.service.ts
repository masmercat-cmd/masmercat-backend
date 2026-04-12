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
  private readonly imageAnalysisCache = new Map<
    string,
    { result: any; expiresAt: number }
  >();
  private readonly weightAdjustmentAudit: Array<Record<string, any>> = [];
  private readonly stagedVisionAudit: Array<Record<string, any>> = [];

  private logVisionSnapshot(label: string, payload: any): void {
    try {
      console.log(`📦 ${label}:`, JSON.stringify(payload, null, 2));
    } catch {
      console.log(`📦 ${label}:`, payload);
    }
  }

  private pushWeightAdjustmentAudit(entry: Record<string, any>): void {
    this.weightAdjustmentAudit.unshift({
      createdAt: new Date().toISOString(),
      ...entry,
    });

    if (this.weightAdjustmentAudit.length > 100) {
      this.weightAdjustmentAudit.length = 100;
    }
  }

  private pushStagedVisionAudit(entry: Record<string, any>): void {
    this.stagedVisionAudit.unshift({
      createdAt: new Date().toISOString(),
      ...entry,
    });

    if (this.stagedVisionAudit.length > 100) {
      this.stagedVisionAudit.length = 100;
    }
  }

  getRecentWeightAdjustmentAudit(limit: number = 20): Array<Record<string, any>> {
    const normalizedLimit = this.clamp(Math.round(this.toNumber(limit) || 20), 1, 100);
    return this.weightAdjustmentAudit.slice(0, normalizedLimit);
  }

  getRecentStagedVisionAudit(limit: number = 20): Array<Record<string, any>> {
    const normalizedLimit = this.clamp(Math.round(this.toNumber(limit) || 20), 1, 100);
    return this.stagedVisionAudit.slice(0, normalizedLimit);
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

  private resolveVisionPromptLanguage(
    language: string,
  ): 'es' | 'en' | 'fr' | 'de' | 'pt' | 'ar' | 'zh' | 'hi' {
    const code = `${language ?? 'es'}`.trim().toLowerCase().substring(0, 2);
    if (['es', 'en', 'fr', 'de', 'pt', 'ar', 'zh', 'hi'].includes(code)) {
      return code as 'es' | 'en' | 'fr' | 'de' | 'pt' | 'ar' | 'zh' | 'hi';
    }

    return 'es';
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

  private getCachedImageAnalysis(imageHash: string): any | null {
    const cached = this.imageAnalysisCache.get(imageHash);
    if (!cached) {
      return null;
    }

    if (cached.expiresAt < Date.now()) {
      this.imageAnalysisCache.delete(imageHash);
      return null;
    }

    return { ...cached.result };
  }

  private cacheImageAnalysis(imageHash: string, result: any): void {
    if (!imageHash) {
      return;
    }

    this.imageAnalysisCache.set(imageHash, {
      result: { ...result },
      expiresAt: Date.now() + 1000 * 60 * 30,
    });

    if (this.imageAnalysisCache.size > 200) {
      const oldestKey = this.imageAnalysisCache.keys().next().value;
      if (oldestKey) {
        this.imageAnalysisCache.delete(oldestKey);
      }
    }
  }

  private mapSavedScanResult(saved: AiScanResult): Record<string, any> {
    const resultado = saved.resultadoAi ?? {};
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
      numero_palets:
        this.toNumber(resultado.numero_palets ?? resultado.pallet_count) || 1,
      pallet_count:
        this.toNumber(resultado.pallet_count ?? resultado.numero_palets) || 1,
      resultado_ai: resultado,
      result: resultado,
      corregido_usuario: true,
      updatedAt: saved.updatedAt,
      ...resultado,
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
    const palletCount = this.toNumber(
      source.numero_palets ?? source.pallet_count ?? scan?.palletCount,
    );

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
      palletCount,
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
      [baseline.palletCount, candidate.palletCount, 4],
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

    if (learnedPattern.palletCount > 0) {
      corrected.numero_palets = Math.round(learnedPattern.palletCount);
      corrected.pallet_count = Math.round(learnedPattern.palletCount);
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

  private clampCommercialGrossWeightKg(
    aiGrossWeight: number,
    estimatedNetWeight: number,
    tareWeight: number,
    options?: { isPalot?: boolean; likelyWarehouseBatch?: boolean },
  ): { grossWeight: number; corrected: boolean; estimatedGross: number } {
    const estimatedGross = Math.max(0, estimatedNetWeight + tareWeight);
    if (aiGrossWeight <= 0) {
      return {
        grossWeight: Number(estimatedGross.toFixed(2)),
        corrected: estimatedGross > 0,
        estimatedGross: Number(estimatedGross.toFixed(2)),
      };
    }

    const lowerRatio = options?.likelyWarehouseBatch ? 0.82 : 0.7;
    const upperRatio = options?.likelyWarehouseBatch ? 1.18 : 1.35;
    const lowerBound = options?.isPalot
      ? Math.max(estimatedGross * 0.75, estimatedGross - 140)
      : estimatedGross * lowerRatio;
    const upperBound = options?.isPalot
      ? Math.max(estimatedGross * 1.2, estimatedGross + 140)
      : estimatedGross * upperRatio;

    if (aiGrossWeight < lowerBound || aiGrossWeight > upperBound) {
      return {
        grossWeight: Number(estimatedGross.toFixed(2)),
        corrected: true,
        estimatedGross: Number(estimatedGross.toFixed(2)),
      };
    }

    return {
      grossWeight: Number(aiGrossWeight.toFixed(2)),
      corrected: false,
      estimatedGross: Number(estimatedGross.toFixed(2)),
    };
  }

  private isWarehouseStyleView(
    parsed: any,
    envase: string,
    totalBoxes: number,
  ): boolean {
    if (!envase.includes('palet')) {
      return false;
    }

    if (`${parsed?.scan_mode ?? ''}`.trim().toLowerCase() == 'multi') {
      return true;
    }

    const visibleRows = this.toNumber(parsed.filas_visibles);
    const visibleColumns = this.toNumber(parsed.columnas_visibles);
    const topBoxes = this.toNumber(parsed.cajas_superiores);
    const explicitGridCount =
      Math.max(1, this.toNumber(parsed.columnas_palets_visibles)) *
      Math.max(1, this.toNumber(parsed.filas_palets_visibles));
    const blockCount = Math.max(
      this.toNumber(parsed.bloques_palets_visibles),
      this.toNumber(parsed.grupos_palets),
      explicitGridCount,
    );

    return (
      (visibleRows > 0 && visibleRows <= 3 && topBoxes > 0 && totalBoxes >= 90) ||
      (visibleRows <= 2 && visibleColumns <= 4 && totalBoxes >= 140) ||
      (topBoxes >= 12 && totalBoxes >= 120) ||
      (blockCount >= 4 && visibleRows <= 3) ||
      (blockCount >= 6) ||
      totalBoxes >= 160
    );
  }

  private isSingleCornerPalletView(parsed: any, envase: string): boolean {
    if (!envase.includes('palet')) {
      return false;
    }

    if (`${parsed?.scan_mode ?? ''}`.trim().toLowerCase() === 'multi') {
      return false;
    }

    const view = `${parsed?.vista ?? ''}`.trim().toLowerCase();
    const visibleRows = this.toNumber(parsed?.filas_visibles);
    const visibleColumns = this.toNumber(parsed?.columnas_visibles);
    const estimatedDepth = this.toNumber(parsed?.profundidad_estimada);
    const topBoxes = this.toNumber(parsed?.cajas_superiores);
    const explicitCount = Math.max(
      this.toNumber(parsed?.numero_palets),
      this.toNumber(parsed?.pallet_count),
      this.toNumber(parsed?.bloques_palets_visibles),
      this.toNumber(parsed?.columnas_palets_visibles) *
        this.toNumber(parsed?.filas_palets_visibles),
    );
    const totalBoxes = Math.max(
      this.toNumber(parsed?.cajas_estimadas),
      this.toNumber(parsed?.cajas_aprox),
    );

    return (
      ['diagonal', 'lateral', 'frontal', 'side', 'front'].some((term) =>
        view.includes(term),
      ) &&
      visibleRows >= 10 &&
      visibleColumns > 0 &&
      visibleColumns <= 3 &&
      estimatedDepth <= 2 &&
      topBoxes <= 8 &&
      explicitCount >= 2 &&
      explicitCount <= 2 &&
      totalBoxes <= 120
    );
  }

  private applyPalletSceneCorrections(parsed: any, envase: string): any {
    if (!envase.includes('palet')) {
      return parsed;
    }

    const totalBoxes = Math.max(
      this.toNumber(parsed?.cajas_estimadas),
      this.toNumber(parsed?.cajas_aprox),
    );
    const explicitCount = Math.max(
      this.toNumber(parsed?.numero_palets),
      this.toNumber(parsed?.pallet_count),
      this.toNumber(parsed?.bloques_palets_visibles),
      this.toNumber(parsed?.columnas_palets_visibles) *
        this.toNumber(parsed?.filas_palets_visibles),
    );
    const visibleRows = this.toNumber(parsed?.filas_visibles);
    const topBoxes = this.toNumber(parsed?.cajas_superiores);
    const view = `${parsed?.vista ?? ''}`.trim().toLowerCase();
    const warehouseLike =
      this.isWarehouseStyleView(parsed, envase, totalBoxes) ||
      view.includes('almacen') ||
      view.includes('warehouse') ||
      view.includes('superior') ||
      view.includes('top');

    if (this.isSingleCornerPalletView(parsed, envase)) {
      parsed.numero_palets = 1;
      parsed.pallet_count = 1;
      parsed.bloques_palets_visibles = 1;
      parsed.columnas_palets_visibles = 1;
      parsed.filas_palets_visibles = 1;
    }

    const likelyHalfWarehouseGrid =
      warehouseLike &&
      explicitCount >= 10 &&
      explicitCount <= 14 &&
      (visibleRows <= 4 || topBoxes >= 10 || `${parsed?.scan_mode ?? ''}`.trim().toLowerCase() === 'multi');

    if (likelyHalfWarehouseGrid) {
      const doubledCount = Math.min(24, explicitCount * 2);
      parsed.numero_palets = Math.max(this.toNumber(parsed.numero_palets), doubledCount);
      parsed.pallet_count = Math.max(this.toNumber(parsed.pallet_count), doubledCount);
      parsed.bloques_palets_visibles = Math.max(
        this.toNumber(parsed.bloques_palets_visibles),
        doubledCount,
      );
    }

    return parsed;
  }

  private applySingleCornerBoxCorrection(
    parsed: any,
    envase: string,
    estimatedBoxes: number,
    palletCount: number,
  ): number {
    if (!envase.includes('palet') || palletCount !== 1) {
      return estimatedBoxes;
    }

    if (!this.isSingleCornerPalletView(parsed, envase)) {
      return estimatedBoxes;
    }

    const visibleColumns = this.toNumber(parsed?.columnas_visibles);
    const visibleRows = this.toNumber(parsed?.filas_visibles);
    const estimatedDepth = this.toNumber(parsed?.profundidad_estimada);
    const palletMeasures = `${parsed?.medidas_palet ?? ''}`.toLowerCase();
    const boxMeasures = `${parsed?.medidas_caja ?? ''}`.toLowerCase();
    const likelyIndustrial =
      palletMeasures.includes('120x100') || boxMeasures.includes('60x40');
    const minimumCommercialDepth = likelyIndustrial
      ? visibleColumns <= 2
        ? 4
        : 3
      : visibleColumns <= 2
        ? 3
        : 2;
    const correctedDepth = Math.max(estimatedDepth, minimumCommercialDepth);
    const correctedBoxes =
      visibleColumns > 0 && visibleRows > 0
        ? visibleColumns * visibleRows * correctedDepth
        : estimatedBoxes;

    parsed.profundidad_estimada = correctedDepth;
    parsed.cajas_por_capa = Math.max(
      this.toNumber(parsed?.cajas_por_capa),
      visibleColumns * correctedDepth,
    );
    parsed.capas_estimadas = Math.max(
      this.toNumber(parsed?.capas_estimadas),
      visibleRows,
    );

    return Math.max(estimatedBoxes, correctedBoxes);
  }

  private applySingleCornerCommercialPattern(
    parsed: any,
    envase: string,
    estimatedBoxes: number,
    palletCount: number,
  ): number {
    if (!envase.includes('palet') || palletCount !== 1) {
      return estimatedBoxes;
    }

    if (!this.isSingleCornerPalletView(parsed, envase)) {
      return estimatedBoxes;
    }

    const palletMeasures = `${parsed?.medidas_palet ?? ''}`.toLowerCase();
    const boxMeasures = `${parsed?.medidas_caja ?? ''}`.toLowerCase();
    const likelyIndustrial =
      palletMeasures.includes('120x100') || boxMeasures.includes('60x40');
    const visibleColumns = this.toNumber(parsed?.columnas_visibles);
    const visibleRows = this.toNumber(parsed?.filas_visibles);
    const estimatedDepth = this.toNumber(parsed?.profundidad_estimada);
    const topBoxes = this.toNumber(parsed?.cajas_superiores);

    if (!likelyIndustrial || visibleColumns <= 0) {
      return estimatedBoxes;
    }

    const likelyTallUnderCount =
      estimatedBoxes >= 60 &&
      estimatedBoxes <= 120 &&
      visibleRows >= 8 &&
      visibleRows <= 14 &&
      estimatedDepth >= 3 &&
      estimatedDepth <= 5 &&
      topBoxes <= 8;

    if (!likelyTallUnderCount) {
      return estimatedBoxes;
    }

    const candidateTotals =
      visibleColumns <= 2
        ? [160, 168, 176, 184, 192]
        : [144, 160, 168, 180];
    const correctedBoxes = candidateTotals.reduce((best, candidate) => {
      if (best === 0) return candidate;
      return Math.abs(candidate - estimatedBoxes) < Math.abs(best - estimatedBoxes)
        ? candidate
        : best;
    }, 0);

    parsed.cajas_por_capa = Math.max(
      this.toNumber(parsed?.cajas_por_capa),
      visibleColumns * Math.max(estimatedDepth, 4),
      visibleColumns <= 2 ? 8 : 12,
    );
    parsed.capas_estimadas = Math.max(
      this.toNumber(parsed?.capas_estimadas),
      Math.round(correctedBoxes / Math.max(1, this.toNumber(parsed.cajas_por_capa))),
    );

    return Math.max(estimatedBoxes, correctedBoxes);
  }

  private applyStoneFruitCornerPattern(
    parsed: any,
    envase: string,
    producto: string,
    estimatedBoxes: number,
    palletCount: number,
  ): number {
    if (!envase.includes('palet') || palletCount !== 1) {
      return estimatedBoxes;
    }

    if (!this.isSingleCornerPalletView(parsed, envase)) {
      return estimatedBoxes;
    }

    const isStoneFruit = ['melocoton', 'nectarina', 'paraguayo'].includes(
      producto,
    );
    if (!isStoneFruit) {
      return estimatedBoxes;
    }

    const palletMeasures = `${parsed?.medidas_palet ?? ''}`.toLowerCase();
    const boxMeasures = `${parsed?.medidas_caja ?? ''}`.toLowerCase();
    const likelyIndustrial =
      palletMeasures.includes('120x100') || boxMeasures.includes('60x40');
    const visibleColumns = this.toNumber(parsed?.columnas_visibles);
    const visibleRows = this.toNumber(parsed?.filas_visibles);
    const estimatedDepth = this.toNumber(parsed?.profundidad_estimada);
    const topBoxes = this.toNumber(parsed?.cajas_superiores);

    const likelySummerTrayPallet =
      likelyIndustrial &&
      visibleColumns <= 2 &&
      visibleRows >= 8 &&
      visibleRows <= 14 &&
      estimatedDepth >= 3 &&
      estimatedDepth <= 5 &&
      topBoxes <= 8 &&
      estimatedBoxes >= 72 &&
      estimatedBoxes <= 110;

    if (!likelySummerTrayPallet) {
      return estimatedBoxes;
    }

    parsed.medidas_palet = 'Palet industrial (120x100 cm aprox)';
    parsed.medidas_caja = '60x40 cm aprox';
    parsed.profundidad_estimada = Math.max(estimatedDepth, 4);
    parsed.cajas_por_capa = Math.max(this.toNumber(parsed?.cajas_por_capa), 8);
    parsed.capas_estimadas = Math.max(this.toNumber(parsed?.capas_estimadas), 23);

    return Math.max(estimatedBoxes, 184);
  }

  private inferPalletCount(parsed: any, envase: string): number {
    if (!envase.includes('palet') && !envase.includes('palot')) {
      return 0;
    }

    const zoneHalfCount = Math.max(
      this.toNumber(parsed.palets_mitad_superior) +
        this.toNumber(parsed.palets_mitad_inferior),
      this.toNumber(parsed.palets_mitad_izquierda) +
        this.toNumber(parsed.palets_mitad_derecha),
    );
    const zoneQuadrantCount =
      this.toNumber(parsed.palets_cuadrante_superior_izquierdo) +
      this.toNumber(parsed.palets_cuadrante_superior_derecho) +
      this.toNumber(parsed.palets_cuadrante_inferior_izquierdo) +
      this.toNumber(parsed.palets_cuadrante_inferior_derecho);
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
      zoneHalfCount,
      zoneQuadrantCount,
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
    const explicitOrGridCount = Math.max(explicitCount, palletGridCount);
    const likelyWarehouseMultiPallet = this.isWarehouseStyleView(
      parsed,
      envase,
      totalBoxes,
    );

    if (explicitOrGridCount > 0 && !likelyWarehouseMultiPallet) {
      return Math.max(1, Math.round(explicitOrGridCount));
    }

    if (likelyWarehouseMultiPallet) {
      const conservativeSinglePalletCapacity = likelyIndustrial ? 100 : 80;
      const inferredByBoxes = Math.max(
        1,
        Math.ceil(totalBoxes / conservativeSinglePalletCapacity),
      );
      const warehouseCommercialPalletFloor = likelyIndustrial
        ? Math.ceil(totalBoxes / 7)
        : Math.ceil(totalBoxes / 6);
      const likelyHalfGridUndercount =
        explicitOrGridCount >= 6 &&
        explicitOrGridCount <= 12 &&
        totalBoxes >= 100 &&
        (visibleRows <= 3 || topBoxes >= 18);
      const likelyDoubleBlockWarehouse =
        explicitOrGridCount >= 10 &&
        explicitOrGridCount <= 14 &&
        topBoxes >= 20;
      const likelyQuarteredWarehouseView =
        explicitOrGridCount >= 7 &&
        explicitOrGridCount <= 14 &&
        topBoxes >= 12 &&
        visibleRows <= 3;
      const likelyHalfVisibleGrid =
        explicitOrGridCount >= 8 &&
        explicitOrGridCount <= 12 &&
        visibleRows <= 3;
      const likelyQuarterVisibleGrid =
        explicitOrGridCount >= 5 &&
        explicitOrGridCount <= 8 &&
        visibleRows <= 3 &&
        totalBoxes >= 90;
      const likelyDenseWarehouseBatch =
        totalBoxes >= 160 &&
        (topBoxes >= 12 || visibleRows <= 3) &&
        explicitOrGridCount <= 12;
      const inferred = Math.max(
        explicitOrGridCount,
        inferredByBoxes,
        likelyDenseWarehouseBatch ? warehouseCommercialPalletFloor : 0,
        likelyHalfGridUndercount ? explicitOrGridCount * 2 : 0,
        likelyDoubleBlockWarehouse ? explicitOrGridCount * 2 : 0,
        likelyQuarteredWarehouseView ? explicitOrGridCount * 2 : 0,
        likelyHalfVisibleGrid ? explicitOrGridCount * 2 : 0,
        likelyQuarterVisibleGrid ? explicitOrGridCount * 4 : 0,
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

    parsed = this.applyPalletSceneCorrections(parsed, envase);

    let boxes = looksLoose ? 0 : this.estimateBoxes(parsed, envase);
    const isPalot = envase.includes('palot');
    const palletCount = this.inferPalletCount(parsed, envase);
    boxes = this.applySingleCornerBoxCorrection(parsed, envase, boxes, palletCount);
    boxes = this.applySingleCornerCommercialPattern(
      parsed,
      envase,
      boxes,
      palletCount,
    );
    boxes = this.applyStoneFruitCornerPattern(
      parsed,
      envase,
      producto,
      boxes,
      palletCount,
    );
    const boxWeightKg = this.inferBoxWeightKg(parsed, producto);
    const tarePerBoxKg = this.inferTarePerBoxKg(parsed);
    const palletTareKg = this.inferPalletTareKg(parsed, envase, boxes);
    const boxMeasures = `${parsed.medidas_caja ?? ''}`.toLowerCase();
    const palletMeasures = `${parsed.medidas_palet ?? ''}`.toLowerCase();
    const likelyIndustrial =
      palletMeasures.includes('120x100') || boxMeasures.includes('60x40');
    const topBoxes = this.toNumber(parsed.cajas_superiores);
    const visibleRows = this.toNumber(parsed.filas_visibles);
    const aiGrossWeight = this.toNumber(
      parsed.peso_bruto_kg ?? parsed.peso_estimado_kg,
    );

    if (envase.includes('palet') && palletCount >= 8) {
      const minimumBoxesPerPallet =
        palletCount >= 12
          ? likelyIndustrial
            ? 12
            : 10
          : likelyIndustrial
            ? 10
            : 8;
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

    const tareWeight = isPalot
      ? palletTareKg * Math.max(1, palletCount)
      : envase.includes('palet')
        ? palletTareKg * Math.max(1, palletCount)
        : Number((boxes * tarePerBoxKg).toFixed(2));
    const likelyWarehouseBatch =
      palletCount >= 8 && this.isWarehouseStyleView(parsed, envase, boxes);

    let netProductWeight = aiGrossWeight;
    let structuralNetWeight = 0;
    if (isPalot) {
      structuralNetWeight = Math.max(aiGrossWeight, 280);
      netProductWeight = structuralNetWeight;
    } else if (boxes > 0) {
      const estimatedNet = boxes * boxWeightKg;
      structuralNetWeight = Number(estimatedNet.toFixed(2));
      if (aiGrossWeight > 0) {
        const estimatedGrossWithTare = estimatedNet + tareWeight;
        const ratio =
          estimatedGrossWithTare > 0 ? aiGrossWeight / estimatedGrossWithTare : 1;
        netProductWeight =
          ratio < 0.6 || ratio > 1.4
            ? Number(estimatedNet.toFixed(2))
            : Number(
                Math.max(
                  estimatedNet,
                  aiGrossWeight - tareWeight,
                ).toFixed(2),
              );
      } else {
        netProductWeight = Number(estimatedNet.toFixed(2));
      }
    }

    if (likelyWarehouseBatch) {
      const minimumNetPerPallet = likelyIndustrial ? 900 : 750;
      netProductWeight = Math.max(
        netProductWeight,
        palletCount * minimumNetPerPallet,
      );
    }

    const commercialReferenceNet = Math.max(netProductWeight, structuralNetWeight);
    const grossWeightDecision = this.clampCommercialGrossWeightKg(
      aiGrossWeight,
      commercialReferenceNet,
      tareWeight,
      { isPalot, likelyWarehouseBatch },
    );
    const grossWeight = Number(grossWeightDecision.grossWeight.toFixed(2));

    if (grossWeightDecision.corrected) {
      const auditEntry = {
        producto,
        envase,
        numero_palets: palletCount,
        cajas_estimadas: boxes,
        ai_peso_bruto_kg: Number(aiGrossWeight.toFixed(2)),
        peso_bruto_estructural_kg: grossWeightDecision.estimatedGross,
        peso_bruto_final_kg: grossWeight,
        peso_neto_referencia_kg: Number(commercialReferenceNet.toFixed(2)),
        tara_kg: Number(tareWeight.toFixed(2)),
        likelyWarehouseBatch,
        isPalot,
      };
      this.pushWeightAdjustmentAudit(auditEntry);
      this.logVisionSnapshot('Adjusted inconsistent gross weight', auditEntry);
    }

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
    parsed.modo_conteo = likelyWarehouseBatch ? 'warehouse' : 'single_pallet';

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

  private shouldRunZoneRecount(parsed: any): boolean {
    const envase = this.normalizeEnvase(parsed?.envase);
    if (!envase.includes('palet')) {
      return false;
    }

    const totalBoxes = Math.max(
      this.toNumber(parsed?.cajas_estimadas),
      this.toNumber(parsed?.cajas_aprox),
    );
    const visibleRows = this.toNumber(parsed?.filas_visibles);
    const topBoxes = this.toNumber(parsed?.cajas_superiores);
    const explicitPallets = Math.max(
      this.toNumber(parsed?.numero_palets),
      this.toNumber(parsed?.pallet_count),
      this.toNumber(parsed?.bloques_palets_visibles),
      this.toNumber(parsed?.columnas_palets_visibles) *
          this.toNumber(parsed?.filas_palets_visibles),
    );

    return (
      totalBoxes >= 90 &&
      (topBoxes >= 12 || visibleRows <= 3 || explicitPallets >= 4)
    );
  }

  private async zoneRecountPallets(img: string, parsed: any): Promise<any> {
    const prompt = `You are reviewing a warehouse or top-view fruit pallet image.

Count pallet footprints by scanning the image in zones:
- upper half
- lower half
- left half
- right half
- top-left quadrant
- top-right quadrant
- bottom-left quadrant
- bottom-right quadrant

Return ONLY valid JSON:
{
  "palets_mitad_superior": 0,
  "palets_mitad_inferior": 0,
  "palets_mitad_izquierda": 0,
  "palets_mitad_derecha": 0,
  "palets_cuadrante_superior_izquierdo": 0,
  "palets_cuadrante_superior_derecho": 0,
  "palets_cuadrante_inferior_izquierdo": 0,
  "palets_cuadrante_inferior_derecho": 0,
  "columnas_palets_visibles": 0,
  "filas_palets_visibles": 0,
  "bloques_palets_visibles": 0,
  "numero_palets": 0,
  "confianza_estimacion": "alta/media/baja"
}

Rules:
- Focus on pallet footprints or pallet blocks on the floor, not on fruit pieces.
- Do not merge adjacent pallets into one.
- If pallets are partially cropped, still count them if more than half of the footprint is visible.
- Use the quadrant counts to infer the TOTAL number of distinct pallets in the whole image.
- Avoid undercounting warehouse grids.
- Prefer the highest coherent total if the image clearly shows repeated pallet blocks.

Previous reading:
${JSON.stringify(parsed)}`;

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

    const response = completion.choices[0]?.message?.content || '{}';
    const zoned = JSON.parse(response);
    this.logVisionSnapshot('OpenAI zone recount raw JSON', zoned);

    const zonedTotal = Math.max(
      this.toNumber(zoned.numero_palets),
      this.toNumber(zoned.bloques_palets_visibles),
      Math.max(1, this.toNumber(zoned.columnas_palets_visibles)) *
          Math.max(1, this.toNumber(zoned.filas_palets_visibles)),
      this.toNumber(zoned.palets_mitad_superior) +
          this.toNumber(zoned.palets_mitad_inferior),
      this.toNumber(zoned.palets_mitad_izquierda) +
          this.toNumber(zoned.palets_mitad_derecha),
      this.toNumber(zoned.palets_cuadrante_superior_izquierdo) +
          this.toNumber(zoned.palets_cuadrante_superior_derecho) +
          this.toNumber(zoned.palets_cuadrante_inferior_izquierdo) +
          this.toNumber(zoned.palets_cuadrante_inferior_derecho),
    );

    return {
      ...parsed,
      ...zoned,
      numero_palets: Math.max(this.toNumber(parsed.numero_palets), zonedTotal),
      bloques_palets_visibles: Math.max(
        this.toNumber(parsed.bloques_palets_visibles),
        this.toNumber(zoned.bloques_palets_visibles),
        zonedTotal,
      ),
      columnas_palets_visibles: Math.max(
        this.toNumber(parsed.columnas_palets_visibles),
        this.toNumber(zoned.columnas_palets_visibles),
      ),
      filas_palets_visibles: Math.max(
        this.toNumber(parsed.filas_palets_visibles),
        this.toNumber(zoned.filas_palets_visibles),
      ),
    };
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
    options?: { imagePath?: string; fastMode?: boolean; scanMode?: 'single' | 'multi' },
  ): Promise<any> {
    let img = (base64Image || '').trim();
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

    const cachedAnalysis = this.getCachedImageAnalysis(imageHash);
    if (cachedAnalysis) {
      cachedAnalysis.image_hash = imageHash;
      cachedAnalysis.image_path = options?.imagePath ?? cachedAnalysis.image_path ?? null;
      this.logVisionSnapshot('Reused cached image analysis', cachedAnalysis);
      return cachedAnalysis;
    }

    const lang = this.resolveVisionPromptLanguage(language || 'es');
    const requestedScanMode =
      options?.scanMode === 'multi' ? 'multi' : 'single';

    console.log('analyzeFruitImage staged lang:', lang);
    console.log('analyzeFruitImage base64 length:', img.length);
    console.log('analyzeFruitImage first chars:', img.slice(0, 20));

    try {
      console.log('Calling OpenAI (attempt A, staged vision)...');
      console.time('openai_attempt_A');
      let parsed = await this.runStagedFruitVisionAnalysis(
        'data:image/jpeg;base64,' + img,
        lang,
        requestedScanMode,
      );
      console.timeEnd('openai_attempt_A');
      console.log('OpenAI responded (attempt A)');

      if (!(options?.fastMode == true) && this.shouldRefinePalletEstimate(parsed)) {
        parsed = await this.refinePalletEstimate(img, parsed, lang);
      }
      if (!(options?.fastMode == true) && this.shouldRunZoneRecount(parsed)) {
        parsed = await this.zoneRecountPallets(img, parsed);
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
      this.cacheImageAnalysis(imageHash, finalized);
      this.logVisionSnapshot('Final pallet result attempt A', finalized);
      return finalized;
    } catch (error: any) {
      console.error('Vision attempt A (data URL) error:', error?.message || error);
      console.error('details:', error?.response?.data || error?.response || error);
    }

    try {
      console.log('Calling OpenAI (attempt B, staged vision)...');
      console.time('openai_attempt_B');
      let parsed = await this.runStagedFruitVisionAnalysis(
        img,
        lang,
        requestedScanMode,
      );
      console.timeEnd('openai_attempt_B');
      console.log('OpenAI responded (attempt B)');

      if (!(options?.fastMode == true) && this.shouldRefinePalletEstimate(parsed)) {
        parsed = await this.refinePalletEstimate(img, parsed, lang);
      }
      if (!(options?.fastMode == true) && this.shouldRunZoneRecount(parsed)) {
        parsed = await this.zoneRecountPallets(img, parsed);
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
      this.cacheImageAnalysis(imageHash, finalized);
      this.logVisionSnapshot('Final pallet result attempt B', finalized);
      return finalized;
    } catch (error: any) {
      console.error('Vision attempt B (raw base64) error:', error?.message || error);
      console.error('details:', error?.response?.data || error?.response || error);
      throw error;
    }
  }

  private async requestVisionJson(
    imageUrl: string,
    prompt: string,
    label: string,
    maxTokens: number,
  ): Promise<any> {
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: maxTokens,
      temperature: 0,
    });

    const response = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(response);
    this.logVisionSnapshot(label, parsed);
    return parsed;
  }

  private buildStagedVisionPrompts(
    language: 'es' | 'en' | 'fr' | 'de' | 'pt' | 'ar' | 'zh' | 'hi',
    scanMode: 'single' | 'multi',
  ): { stage1: string; stage2: string; stage3: string } {
    switch (language) {
      case 'en':
        return this.buildEnglishVisionPrompts(scanMode);
      case 'fr':
        return this.buildFrenchVisionPrompts(scanMode);
      case 'de':
        return this.buildGermanVisionPrompts(scanMode);
      case 'pt':
        return this.buildPortugueseVisionPrompts(scanMode);
      case 'ar':
        return this.buildArabicVisionPrompts(scanMode);
      case 'zh':
        return this.buildChineseVisionPrompts(scanMode);
      case 'hi':
        return this.buildHindiVisionPrompts(scanMode);
      case 'es':
      default:
        return this.buildSpanishVisionPrompts(scanMode);
    }
  }

  private buildEnglishVisionPrompts(
    scanMode: 'single' | 'multi',
  ): { stage1: string; stage2: string; stage3: string } {
    return {
      stage1: [
        'Analyze this fruit or vegetable image.',
        '',
        'Step 1 only: identify the scene and visible packaging before estimating totals.',
        '',
        'Return ONLY valid JSON:',
        '{',
        '  "categoria": "fruit/vegetable/mushroom",',
        '  "producto": "peach/flat peach/nectarine/kiwi/eggplant/truffle/etc",',
        '  "envase": "without box/box/multiple boxes/pallet with boxes/palox",',
        '  "material_caja": "cardboard/wood/plastic/unknown",',
        '  "vista": "closeup/front/side/top/diagonal/warehouse",',
        '  "hay_palet": true,',
        '  "hay_cajas": true,',
        '  "numero_palets_visibles_base": 0,',
        '  "fruta_suelta_visible": 0,',
        '  "confianza_base": "high/medium/low"',
        '}',
        '',
        'Rules:',
        '- Use agricultural naming.',
        '- Map "durazno" to peach.',
        '- Distinguish peach, flat peach and nectarine carefully.',
        '- Do not estimate total boxes or weight yet.',
        '- If the image shows loose fruit only, set envase to "without box".',
      ].join('\n'),
      stage2: [
        'Analyze this fruit or vegetable image.',
        '',
        'Step 2 only: count the visible structure step by step, without commercial weight guesses.',
        'Scan mode requested: ' + scanMode + '.',
        '',
        'Return ONLY valid JSON:',
        '{',
        '  "numero_palets": 0,',
        '  "columnas_visibles": 0,',
        '  "filas_visibles": 0,',
        '  "profundidad_estimada": 0,',
        '  "cajas_por_capa": 0,',
        '  "capas_estimadas": 0,',
        '  "cajas_superiores": 0,',
        '  "cajas_estimadas": 0,',
        '  "columnas_palets_visibles": 0,',
        '  "filas_palets_visibles": 0,',
        '  "bloques_palets_visibles": 0,',
        '  "medidas_caja": "60x40 cm approx",',
        '  "medidas_palet": "120x80 cm approx",',
        '  "confianza_estructura": "high/medium/low"',
        '}',
        '',
        'Rules:',
        '- First count pallets or pallet blocks.',
        '- Then count front columns.',
        '- Then front rows in height.',
        '- Then estimate depth from side/top visibility.',
        '- Compute cajas_por_capa from the layer footprint.',
        '- Compute cajas_estimadas as the whole structure, not only the front face.',
        '- If several pallets are visible, return the total estimated boxes across all visible pallets.',
        '- For warehouse or top views, count pallet footprints before box totals.',
      ].join('\n'),
      stage3: [
        'Analyze this fruit or vegetable image.',
        '',
        'Step 3 only: estimate commercial totals using the prior scene reading and structural count.',
        '',
        'Return ONLY valid JSON:',
        '{',
        '  "categoria": "fruit/vegetable/mushroom",',
        '  "producto": "peach/flat peach/nectarine/kiwi/eggplant/truffle/etc",',
        '  "envase": "without box/box/multiple boxes/pallet with boxes/palox",',
        '  "material_caja": "cardboard/wood/plastic/unknown",',
        '  "columnas_visibles": 0,',
        '  "filas_visibles": 0,',
        '  "profundidad_estimada": 0,',
        '  "cajas_por_capa": 0,',
        '  "capas_estimadas": 0,',
        '  "cajas_aprox": 0,',
        '  "cajas_superiores": 0,',
        '  "cajas_estimadas": 0,',
        '  "columnas_palets_visibles": 0,',
        '  "filas_palets_visibles": 0,',
        '  "bloques_palets_visibles": 0,',
        '  "piezas_por_caja": 0,',
        '  "cantidad_total_piezas": 0,',
        '  "cantidad_aprox": 0,',
        '  "calibre": "1/2/3/4/5/6/A/B",',
        '  "peso_estimado_kg": 0,',
        '  "tara_kg": 0,',
        '  "peso_neto_kg": 0,',
        '  "numero_palets": 0,',
        '  "calidad": "extra/first/second",',
        '  "medidas_caja": "60x40 cm approx",',
        '  "medidas_palet": "120x80 cm approx",',
        '  "confianza_estimacion": "high/medium/low"',
        '}',
        '',
        'Rules:',
        '- Base your answer on the previous scene classification and structural count.',
        '- Do not restart from scratch.',
        '- If fruit is loose, set cajas_estimadas and piezas_por_caja to 0 and count visible pieces.',
        '- If pallets are visible, keep the total consistent with the counted structure.',
        '- If the counted structure suggests a commercial box total, the weight must stay close to that structure and not jump far above or below it.',
        '- Reject impossible gross weights when they do not fit the counted boxes, pallet count and packaging.',
        '- Prefer coherent totals over broad guesses.',
        '- Keep box count, pieces and weight internally consistent.',
      ].join('\n'),
    };
  }

  private buildSpanishVisionPrompts(
    scanMode: 'single' | 'multi',
  ): { stage1: string; stage2: string; stage3: string } {
    return {
      stage1: [
        'Analiza esta imagen de frutas o verduras.',
        '',
        'Paso 1 solamente: identifica el contexto visual antes de calcular cantidades.',
        '',
        'Devuelve SOLO JSON valido:',
        '{',
        '  "categoria": "fruta/verdura/hongo",',
        '  "producto": "melocoton/paraguayo/nectarina/kiwi/berenjena/trufa/etc",',
        '  "envase": "sin caja/caja/varias cajas/palet con cajas/palot",',
        '  "material_caja": "carton/madera/plastico/desconocido",',
        '  "vista": "detalle/frontal/lateral/superior/diagonal/almacen",',
        '  "hay_palet": true,',
        '  "hay_cajas": true,',
        '  "numero_palets_visibles_base": 0,',
        '  "fruta_suelta_visible": 0,',
        '  "confianza_base": "alta/media/baja"',
        '}',
        '',
        'Reglas:',
        '- Usa terminologia agricola de Espana.',
        '- Si identificas "durazno", devuelve "melocoton".',
        '- Distingue bien melocoton, paraguayo y nectarina.',
        '- Todavia no calcules cajas totales ni peso.',
        '- Si solo ves fruta suelta, devuelve envase "sin caja".',
      ].join('\n'),
      stage2: [
        'Analiza esta imagen de frutas o verduras.',
        '',
        'Paso 2 solamente: cuenta la estructura visible paso a paso, sin estimar todavia el peso comercial.',
        'Modo solicitado: ' + scanMode + '.',
        '',
        'Devuelve SOLO JSON valido:',
        '{',
        '  "numero_palets": 0,',
        '  "columnas_visibles": 0,',
        '  "filas_visibles": 0,',
        '  "profundidad_estimada": 0,',
        '  "cajas_por_capa": 0,',
        '  "capas_estimadas": 0,',
        '  "cajas_superiores": 0,',
        '  "cajas_estimadas": 0,',
        '  "columnas_palets_visibles": 0,',
        '  "filas_palets_visibles": 0,',
        '  "bloques_palets_visibles": 0,',
        '  "medidas_caja": "60x40 cm aprox",',
        '  "medidas_palet": "120x80 cm aprox",',
        '  "confianza_estructura": "alta/media/baja"',
        '}',
        '',
        'Reglas:',
        '- Primero cuenta cuantos palets o bloques de palet hay.',
        '- Luego cuenta columnas visibles en la cara frontal.',
        '- Luego filas visibles en altura.',
        '- Luego estima profundidad usando lateral y parte superior.',
        '- Calcula cajas_por_capa con la huella de una capa.',
        '- Calcula cajas_estimadas del volumen completo, no solo la cara frontal.',
        '- Si hay varios palets, devuelve la suma de cajas estimadas de todos los palets visibles.',
        '- En vistas de almacen o superiores, cuenta primero huellas de palet antes de estimar cajas.',
      ].join('\n'),
      stage3: [
        'Analiza esta imagen de frutas o verduras.',
        '',
        'Paso 3 solamente: estima cantidades comerciales usando la lectura previa del contexto y del conteo estructural.',
        '',
        'Devuelve SOLO JSON valido:',
        '{',
        '  "categoria": "fruta/verdura/hongo",',
        '  "producto": "melocoton/paraguayo/nectarina/kiwi/berenjena/etc",',
        '  "envase": "sin caja/caja/varias cajas/palet con cajas/palot",',
        '  "material_caja": "carton/madera/plastico/desconocido",',
        '  "columnas_visibles": 0,',
        '  "filas_visibles": 0,',
        '  "profundidad_estimada": 0,',
        '  "cajas_por_capa": 0,',
        '  "capas_estimadas": 0,',
        '  "cajas_aprox": 0,',
        '  "cajas_superiores": 0,',
        '  "cajas_estimadas": 0,',
        '  "columnas_palets_visibles": 0,',
        '  "filas_palets_visibles": 0,',
        '  "bloques_palets_visibles": 0,',
        '  "piezas_por_caja": 0,',
        '  "cantidad_total_piezas": 0,',
        '  "cantidad_aprox": 0,',
        '  "calibre": "1/2/3/4/5/6/A/B",',
        '  "peso_estimado_kg": 0,',
        '  "tara_kg": 0,',
        '  "peso_neto_kg": 0,',
        '  "numero_palets": 0,',
        '  "calidad": "extra/primera/segunda",',
        '  "medidas_caja": "60x40 cm aprox",',
        '  "medidas_palet": "120x80 cm aprox",',
        '  "confianza_estimacion": "alta/media/baja"',
        '}',
        '',
        'Reglas:',
        '- Basa la respuesta en la identificacion previa y en el conteo estructural previo.',
        '- No reinicies el analisis desde cero.',
        '- Si la fruta esta suelta, pon cajas_estimadas y piezas_por_caja a 0 y cuenta solo las piezas visibles.',
        '- Si hay palets, manten la coherencia con la estructura contada.',
        '- Si la estructura contada sugiere un total comercial de cajas, el peso debe quedarse cerca de esa estructura y no dispararse por encima o por debajo.',
        '- Descarta pesos brutos imposibles cuando no cuadren con las cajas contadas, el numero de palets y el envase.',
        '- Prioriza cifras coherentes frente a estimaciones vagas.',
        '- Manten consistencia interna entre cajas, piezas y peso.',
      ].join('\n'),
    };
  }

  private buildFrenchVisionPrompts(
    scanMode: 'single' | 'multi',
  ): { stage1: string; stage2: string; stage3: string } {
    const prompts = this.buildEnglishVisionPrompts(scanMode);
    return {
      stage1: "Analyse cette image de fruits ou legumes.\n\nEtape 1 seulement : identifie la scene et l'emballage visible avant d'estimer les totaux.\n\n" + prompts.stage1.split('\n\n').slice(2).join('\n\n'),
      stage2: "Analyse cette image de fruits ou legumes.\n\nEtape 2 seulement : compte la structure visible pas a pas, sans estimation commerciale du poids.\nMode demande : " + scanMode + ".\n\n" + prompts.stage2.split('\n\n').slice(2).join('\n\n'),
      stage3: "Analyse cette image de fruits ou legumes.\n\nEtape 3 seulement : estime les totaux commerciaux en utilisant la lecture precedente de la scene et du comptage structurel.\n\n" + prompts.stage3.split('\n\n').slice(2).join('\n\n'),
    };
  }

  private buildGermanVisionPrompts(
    scanMode: 'single' | 'multi',
  ): { stage1: string; stage2: string; stage3: string } {
    const prompts = this.buildEnglishVisionPrompts(scanMode);
    return {
      stage1: "Analysiere dieses Obst- oder Gemuesebild.\n\nSchritt 1: Erkenne zuerst Szene und sichtbare Verpackung, bevor du Gesamtsummen schaetzt.\n\n" + prompts.stage1.split('\n\n').slice(2).join('\n\n'),
      stage2: "Analysiere dieses Obst- oder Gemuesebild.\n\nSchritt 2: Zaehle die sichtbare Struktur Schritt fuer Schritt, ohne kommerzielle Gewichtsschaetzung.\nAngeforderter Modus: " + scanMode + ".\n\n" + prompts.stage2.split('\n\n').slice(2).join('\n\n'),
      stage3: "Analysiere dieses Obst- oder Gemuesebild.\n\nSchritt 3: Schaetze die kommerziellen Gesamtwerte anhand der vorherigen Szenen- und Strukturlesung.\n\n" + prompts.stage3.split('\n\n').slice(2).join('\n\n'),
    };
  }

  private buildPortugueseVisionPrompts(
    scanMode: 'single' | 'multi',
  ): { stage1: string; stage2: string; stage3: string } {
    const prompts = this.buildSpanishVisionPrompts(scanMode);
    return {
      stage1: "Analisa esta imagem de frutas ou legumes.\n\nPasso 1 apenas: identifica o contexto visual antes de calcular quantidades.\n\n" + prompts.stage1.split('\n\n').slice(2).join('\n\n'),
      stage2: "Analisa esta imagem de frutas ou legumes.\n\nPasso 2 apenas: conta a estrutura visivel passo a passo, sem estimar ainda o peso comercial.\nModo solicitado: " + scanMode + ".\n\n" + prompts.stage2.split('\n\n').slice(2).join('\n\n'),
      stage3: "Analisa esta imagem de frutas ou legumes.\n\nPasso 3 apenas: estima quantidades comerciais usando a leitura previa do contexto e da estrutura.\n\n" + prompts.stage3.split('\n\n').slice(2).join('\n\n'),
    };
  }

  private buildArabicVisionPrompts(
    scanMode: 'single' | 'multi',
  ): { stage1: string; stage2: string; stage3: string } {
    const prompts = this.buildEnglishVisionPrompts(scanMode);
    return {
      stage1: "حلل هذه الصورة للفواكه او الخضروات.\n\nالخطوة 1 فقط: حدد المشهد ونوع التغليف الظاهر قبل تقدير الاجماليات.\n\n" + prompts.stage1.split('\n\n').slice(2).join('\n\n'),
      stage2: "حلل هذه الصورة للفواكه او الخضروات.\n\nالخطوة 2 فقط: عد البنية الظاهرة خطوة بخطوة بدون تقدير وزني تجاري.\nالوضع المطلوب: " + scanMode + ".\n\n" + prompts.stage2.split('\n\n').slice(2).join('\n\n'),
      stage3: "حلل هذه الصورة للفواكه او الخضروات.\n\nالخطوة 3 فقط: قدر الاجماليات التجارية اعتمادا على قراءة المشهد والبنية السابقة.\n\n" + prompts.stage3.split('\n\n').slice(2).join('\n\n'),
    };
  }

  private buildChineseVisionPrompts(
    scanMode: 'single' | 'multi',
  ): { stage1: string; stage2: string; stage3: string } {
    const prompts = this.buildEnglishVisionPrompts(scanMode);
    return {
      stage1: "分析这张水果或蔬菜图片。\n\n仅步骤1：先识别场景和可见包装，再估算总量。\n\n" + prompts.stage1.split('\n\n').slice(2).join('\n\n'),
      stage2: "分析这张水果或蔬菜图片。\n\n仅步骤2：逐步统计可见结构，不要先做商业重量估算。\n请求模式：" + scanMode + "。\n\n" + prompts.stage2.split('\n\n').slice(2).join('\n\n'),
      stage3: "分析这张水果或蔬菜图片。\n\n仅步骤3：基于前面的场景识别和结构计数来估算商业总量。\n\n" + prompts.stage3.split('\n\n').slice(2).join('\n\n'),
    };
  }

  private buildHindiVisionPrompts(
    scanMode: 'single' | 'multi',
  ): { stage1: string; stage2: string; stage3: string } {
    const prompts = this.buildEnglishVisionPrompts(scanMode);
    return {
      stage1:
        'Is phal ya sabzi ki tasveer ka vishleshan karo.\n\nKadam 1 sirf: kul andaza lagane se pehle drishya aur dikhne wali packaging pehchano.\n\n' +
        prompts.stage1.split('\n\n').slice(2).join('\n\n'),
      stage2:
        'Is phal ya sabzi ki tasveer ka vishleshan karo.\n\nKadam 2 sirf: bina vyaparik vajan andaze ke dikhne wali sanrachna ko step by step gino.\nMangaa gaya mode: ' +
        scanMode +
        '.\n\n' +
        prompts.stage2.split('\n\n').slice(2).join('\n\n'),
      stage3:
        'Is phal ya sabzi ki tasveer ka vishleshan karo.\n\nKadam 3 sirf: pehle ke scene reading aur structural count ka upyog karke vyaparik totals ka andaza lagao.\n\n' +
        prompts.stage3.split('\n\n').slice(2).join('\n\n'),
    };
  }

  private shouldRunCornerPalletFlow(
    parsed: any,
    scanMode: 'single' | 'multi',
  ): boolean {
    if (scanMode !== 'single') {
      return false;
    }

    const envase = this.normalizeEnvase(parsed?.envase);
    if (!envase.includes('palet')) {
      return false;
    }

    const view = `${parsed?.vista ?? ''}`.trim().toLowerCase();
    const palletCount = Math.max(
      this.toNumber(parsed?.numero_palets),
      this.toNumber(parsed?.pallet_count),
      this.toNumber(parsed?.numero_palets_visibles_base),
    );
    const totalBoxes = Math.max(
      this.toNumber(parsed?.cajas_estimadas),
      this.toNumber(parsed?.cajas_aprox),
    );
    const visibleRows = this.toNumber(parsed?.filas_visibles);
    const topBoxes = this.toNumber(parsed?.cajas_superiores);

    return (
      ['diagonal', 'lateral', 'frontal', 'side', 'front'].some((term) =>
        view.includes(term),
      ) &&
      palletCount >= 1 &&
      palletCount <= 2 &&
      totalBoxes <= 120 &&
      visibleRows >= 6 &&
      topBoxes <= 10
    );
  }

  private shouldRunTopWarehouseFlow(
    parsed: any,
    scanMode: 'single' | 'multi',
  ): boolean {
    const envase = this.normalizeEnvase(parsed?.envase);
    if (!envase.includes('palet')) {
      return false;
    }

    const view = `${parsed?.vista ?? ''}`.trim().toLowerCase();
    const totalBoxes = Math.max(
      this.toNumber(parsed?.cajas_estimadas),
      this.toNumber(parsed?.cajas_aprox),
    );
    const visibleRows = this.toNumber(parsed?.filas_visibles);
    const topBoxes = this.toNumber(parsed?.cajas_superiores);
    const palletCount = Math.max(
      this.toNumber(parsed?.numero_palets),
      this.toNumber(parsed?.pallet_count),
      this.toNumber(parsed?.bloques_palets_visibles),
    );

    return (
      scanMode === 'multi' ||
      view.includes('almacen') ||
      view.includes('warehouse') ||
      view.includes('superior') ||
      view.includes('top') ||
      this.isWarehouseStyleView(parsed, envase, totalBoxes) ||
      (palletCount >= 4 && (visibleRows <= 3 || topBoxes >= 10))
    );
  }

  private buildCornerPalletPrompts(
    language: 'es' | 'en' | 'fr' | 'de' | 'pt' | 'ar' | 'zh' | 'hi',
  ): { front: string; side: string; final: string } {
    const english = {
      front: [
        'Analyze this pallet corner image.',
        '',
        'Corner pallet mode, front step only.',
        'Count ONLY the front face of the SAME pallet block.',
        'Do not count the side face as a second pallet.',
        '',
        'Return ONLY valid JSON:',
        '{',
        '  "numero_palets": 1,',
        '  "columnas_visibles": 0,',
        '  "filas_visibles": 0,',
        '  "frontal_visible_cajas": 0,',
        '  "confianza_frontal": "high/medium/low"',
        '}',
        '',
        'Rules:',
        '- This is a corner view of one pallet unless a second base is clearly separate.',
        '- Count full front columns only.',
        '- Count full front rows in height only.',
        '- Ignore side-depth in this step.',
      ].join('\n'),
      side: [
        'Analyze this pallet corner image.',
        '',
        'Corner pallet mode, side step only.',
        'Estimate ONLY side depth and full-layer footprint for the SAME pallet block.',
        '',
        'Return ONLY valid JSON:',
        '{',
        '  "numero_palets": 1,',
        '  "profundidad_estimada": 0,',
        '  "cajas_por_capa": 0,',
        '  "cajas_superiores": 0,',
        '  "medidas_caja": "60x40 cm approx",',
        '  "medidas_palet": "Industrial pallet (120x100 cm approx) / Europallet (120x80 cm approx)",',
        '  "confianza_lateral": "high/medium/low"',
        '}',
        '',
        'Rules:',
        '- Do not recount front rows here.',
        '- Use side and top visibility to estimate real depth.',
        '- If this looks like a dense commercial pallet, prefer commercial layer footprints over shallow guesses.',
      ].join('\n'),
      final: [
        'Analyze this pallet corner image.',
        '',
        'Corner pallet mode, final consolidation.',
        'Use the front count and side depth to estimate the full commercial pallet total.',
        '',
        'Return ONLY valid JSON:',
        '{',
        '  "numero_palets": 1,',
        '  "columnas_visibles": 0,',
        '  "filas_visibles": 0,',
        '  "profundidad_estimada": 0,',
        '  "cajas_por_capa": 0,',
        '  "capas_estimadas": 0,',
        '  "cajas_estimadas": 0,',
        '  "cajas_aprox": 0,',
        '  "peso_estimado_kg": 0,',
        '  "tara_kg": 0,',
        '  "peso_neto_kg": 0,',
        '  "medidas_caja": "60x40 cm approx",',
        '  "medidas_palet": "Industrial pallet (120x100 cm approx) / Europallet (120x80 cm approx)",',
        '  "confianza_estimacion": "high/medium/low"',
        '}',
        '',
        'Rules:',
        '- Keep numero_palets at 1 unless a second pallet base is clearly independent.',
        '- Combine front rows with side depth for the same pallet.',
        '- Do not collapse a tall commercial pallet into only the front-visible boxes.',
        '- Prefer realistic commercial totals over low visual-only counts.',
      ].join('\n'),
    };

    if (language === 'es') {
      return {
        front: [
          'Analiza esta imagen de palet en esquina.',
          '',
          'Modo palet en esquina, paso frontal solamente.',
          'Cuenta SOLO la cara frontal del MISMO bloque de palet.',
          'No cuentes la cara lateral como si fuera un segundo palet.',
          '',
          'Devuelve SOLO JSON valido:',
          '{',
          '  "numero_palets": 1,',
          '  "columnas_visibles": 0,',
          '  "filas_visibles": 0,',
          '  "frontal_visible_cajas": 0,',
          '  "confianza_frontal": "alta/media/baja"',
          '}',
          '',
          'Reglas:',
          '- Esto es una vista en esquina de un solo palet salvo que se vea claramente otra base separada.',
          '- Cuenta solo columnas completas de la cara frontal.',
          '- Cuenta solo filas frontales completas en altura.',
          '- En este paso ignora la profundidad lateral.',
        ].join('\n'),
        side: [
          'Analiza esta imagen de palet en esquina.',
          '',
          'Modo palet en esquina, paso lateral solamente.',
          'Estima SOLO la profundidad lateral y la huella completa por capa del MISMO bloque de palet.',
          '',
          'Devuelve SOLO JSON valido:',
          '{',
          '  "numero_palets": 1,',
          '  "profundidad_estimada": 0,',
          '  "cajas_por_capa": 0,',
          '  "cajas_superiores": 0,',
          '  "medidas_caja": "60x40 cm aprox",',
          '  "medidas_palet": "Palet industrial (120x100 cm aprox) / Europalet (120x80 cm aprox)",',
          '  "confianza_lateral": "alta/media/baja"',
          '}',
          '',
          'Reglas:',
          '- No vuelvas a contar las filas frontales aqui.',
          '- Usa lateral y parte superior para estimar la profundidad real.',
          '- Si parece un palet comercial denso, prioriza huellas comerciales realistas frente a estimaciones poco profundas.',
        ].join('\n'),
        final: [
          'Analiza esta imagen de palet en esquina.',
          '',
          'Modo palet en esquina, consolidacion final.',
          'Usa el conteo frontal y la profundidad lateral para estimar el total comercial completo del palet.',
          '',
          'Devuelve SOLO JSON valido:',
          '{',
          '  "numero_palets": 1,',
          '  "columnas_visibles": 0,',
          '  "filas_visibles": 0,',
          '  "profundidad_estimada": 0,',
          '  "cajas_por_capa": 0,',
          '  "capas_estimadas": 0,',
          '  "cajas_estimadas": 0,',
          '  "cajas_aprox": 0,',
          '  "peso_estimado_kg": 0,',
          '  "tara_kg": 0,',
          '  "peso_neto_kg": 0,',
          '  "medidas_caja": "60x40 cm aprox",',
          '  "medidas_palet": "Palet industrial (120x100 cm aprox) / Europalet (120x80 cm aprox)",',
          '  "confianza_estimacion": "alta/media/baja"',
          '}',
          '',
          'Reglas:',
          '- Mantén numero_palets en 1 salvo que se vea claramente otra base de palet independiente.',
          '- Combina filas frontales y profundidad lateral del mismo palet.',
          '- No reduzcas un palet comercial alto solo a las cajas visibles de frente.',
          '- Prioriza totales comerciales realistas frente a conteos visuales demasiado bajos.',
        ].join('\n'),
      };
    }

    return english;
  }

  private async runCornerPalletVisionAnalysis(
    imageUrl: string,
    language: 'es' | 'en' | 'fr' | 'de' | 'pt' | 'ar' | 'zh' | 'hi',
    base: any,
  ): Promise<any> {
    const prompts = this.buildCornerPalletPrompts(language);
    const front = await this.requestVisionJson(
      imageUrl,
      prompts.front + '\n\nBase reading:\n' + JSON.stringify(base),
      'OpenAI corner pallet front step',
      220,
    );
    const side = await this.requestVisionJson(
      imageUrl,
      prompts.side +
        '\n\nBase reading:\n' +
        JSON.stringify(base) +
        '\n\nFront reading:\n' +
        JSON.stringify(front),
      'OpenAI corner pallet side step',
      220,
    );
    const final = await this.requestVisionJson(
      imageUrl,
      prompts.final +
        '\n\nBase reading:\n' +
        JSON.stringify(base) +
        '\n\nFront reading:\n' +
        JSON.stringify(front) +
        '\n\nSide reading:\n' +
        JSON.stringify(side),
      'OpenAI corner pallet final step',
      280,
    );

    const frontColumns = this.toNumber(front?.columnas_visibles);
    const frontRows = this.toNumber(front?.filas_visibles);
    const sideDepth = this.toNumber(side?.profundidad_estimada);
    const structuralBoxes =
      frontColumns > 0 && frontRows > 0 && sideDepth > 0
        ? frontColumns * frontRows * sideDepth
        : 0;

    const merged = {
      ...base,
      ...front,
      ...side,
      ...final,
      numero_palets: 1,
      columnas_visibles:
        frontColumns ||
        this.toNumber(final?.columnas_visibles) ||
        this.toNumber(base?.columnas_visibles),
      filas_visibles:
        frontRows ||
        this.toNumber(final?.filas_visibles) ||
        this.toNumber(base?.filas_visibles),
      profundidad_estimada:
        sideDepth ||
        this.toNumber(final?.profundidad_estimada) ||
        this.toNumber(base?.profundidad_estimada),
      cajas_por_capa:
        this.toNumber(side?.cajas_por_capa) ||
        this.toNumber(final?.cajas_por_capa) ||
        this.toNumber(base?.cajas_por_capa),
      capas_estimadas:
        this.toNumber(final?.capas_estimadas) ||
        frontRows ||
        this.toNumber(base?.capas_estimadas),
      cajas_estimadas:
        this.toNumber(final?.cajas_estimadas) ||
        structuralBoxes ||
        this.toNumber(base?.cajas_estimadas),
      cajas_aprox:
        this.toNumber(final?.cajas_aprox) ||
        this.toNumber(final?.cajas_estimadas) ||
        structuralBoxes ||
        this.toNumber(base?.cajas_aprox),
      scan_mode: base?.scan_mode ?? 'single',
    };

    const auditEntry = {
      language,
      scan_mode: merged.scan_mode,
      mode: 'corner_pallet',
      base: {
        numero_palets: this.toNumber(base?.numero_palets),
        cajas_estimadas: this.toNumber(base?.cajas_estimadas),
        vista: base?.vista,
      },
      front: {
        columnas_visibles: frontColumns,
        filas_visibles: frontRows,
      },
      side: {
        profundidad_estimada: sideDepth,
        cajas_por_capa: this.toNumber(side?.cajas_por_capa),
      },
      final: {
        numero_palets: this.toNumber(merged?.numero_palets),
        cajas_estimadas: this.toNumber(merged?.cajas_estimadas),
        cajas_aprox: this.toNumber(merged?.cajas_aprox),
      },
    };
    this.pushStagedVisionAudit(auditEntry);
    this.logVisionSnapshot('OpenAI corner pallet audit summary', auditEntry);

    return merged;
  }

  private buildTopWarehousePrompts(
    language: 'es' | 'en' | 'fr' | 'de' | 'pt' | 'ar' | 'zh' | 'hi',
  ): { footprints: string; grid: string; final: string } {
    const english = {
      footprints: [
        'Analyze this top-view or warehouse pallet image.',
        '',
        'Top warehouse mode, footprint step only.',
        'Count pallet footprints or pallet blocks on the floor before any box estimate.',
        '',
        'Return ONLY valid JSON:',
        '{',
        '  "numero_palets": 0,',
        '  "columnas_palets_visibles": 0,',
        '  "filas_palets_visibles": 0,',
        '  "bloques_palets_visibles": 0,',
        '  "confianza_huellas": "high/medium/low"',
        '}',
        '',
        'Rules:',
        '- Focus on pallet bases or repeated pallet tops.',
        '- Do not merge adjacent pallets.',
        '- Prefer the total visible grid, not one partial row.',
      ].join('\n'),
      grid: [
        'Analyze this top-view or warehouse pallet image.',
        '',
        'Top warehouse mode, box-grid step only.',
        'Estimate boxes per pallet or per visible block using the top pattern, without reducing the pallet count.',
        '',
        'Return ONLY valid JSON:',
        '{',
        '  "cajas_por_capa": 0,',
        '  "cajas_superiores": 0,',
        '  "cajas_estimadas": 0,',
        '  "medidas_caja": "60x40 cm approx",',
        '  "medidas_palet": "120x100 cm approx",',
        '  "confianza_rejilla": "high/medium/low"',
        '}',
        '',
        'Rules:',
        '- Use top repetition to estimate commercial pallet structure.',
        '- Do not divide the scene total by mistake.',
        '- If repeated blocks form a clear warehouse grid, keep the total grid coherent.',
      ].join('\n'),
      final: [
        'Analyze this top-view or warehouse pallet image.',
        '',
        'Top warehouse mode, final consolidation.',
        'Use pallet footprints and top-grid structure to estimate the full scene total.',
        '',
        'Return ONLY valid JSON:',
        '{',
        '  "numero_palets": 0,',
        '  "columnas_palets_visibles": 0,',
        '  "filas_palets_visibles": 0,',
        '  "bloques_palets_visibles": 0,',
        '  "cajas_estimadas": 0,',
        '  "cajas_aprox": 0,',
        '  "peso_estimado_kg": 0,',
        '  "tara_kg": 0,',
        '  "peso_neto_kg": 0,',
        '  "confianza_estimacion": "high/medium/low"',
        '}',
        '',
        'Rules:',
        '- Count the whole warehouse grid, not only one side or one lane.',
        '- Prefer the total visible pallet matrix when repeated pallet blocks are clear.',
        '- Keep pallet count and boxes internally consistent.',
      ].join('\n'),
    };

    if (language === 'es') {
      return {
        footprints: [
          'Analiza esta imagen de vista superior o de almacen con palets.',
          '',
          'Modo vista superior/almacen, paso de huellas solamente.',
          'Cuenta huellas de palet o bloques de palets en el suelo antes de estimar cajas.',
          '',
          'Devuelve SOLO JSON valido:',
          '{',
          '  "numero_palets": 0,',
          '  "columnas_palets_visibles": 0,',
          '  "filas_palets_visibles": 0,',
          '  "bloques_palets_visibles": 0,',
          '  "confianza_huellas": "alta/media/baja"',
          '}',
          '',
          'Reglas:',
          '- Fijate en bases de palet o tapas repetidas de palets.',
          '- No unas palets contiguos como si fueran uno solo.',
          '- Prioriza la rejilla total visible, no una sola fila parcial.',
        ].join('\n'),
        grid: [
          'Analiza esta imagen de vista superior o de almacen con palets.',
          '',
          'Modo vista superior/almacen, paso de rejilla de cajas solamente.',
          'Estima cajas por palet o por bloque visible usando el patron superior, sin reducir el numero de palets.',
          '',
          'Devuelve SOLO JSON valido:',
          '{',
          '  "cajas_por_capa": 0,',
          '  "cajas_superiores": 0,',
          '  "cajas_estimadas": 0,',
          '  "medidas_caja": "60x40 cm aprox",',
          '  "medidas_palet": "120x100 cm aprox",',
          '  "confianza_rejilla": "alta/media/baja"',
          '}',
          '',
          'Reglas:',
          '- Usa la repeticion superior para estimar estructura comercial por palet.',
          '- No dividas por error el total de la escena.',
          '- Si los bloques repetidos forman una rejilla clara de almacen, mantén coherencia con esa matriz completa.',
        ].join('\n'),
        final: [
          'Analiza esta imagen de vista superior o de almacen con palets.',
          '',
          'Modo vista superior/almacen, consolidacion final.',
          'Usa huellas de palet y estructura superior para estimar el total completo de la escena.',
          '',
          'Devuelve SOLO JSON valido:',
          '{',
          '  "numero_palets": 0,',
          '  "columnas_palets_visibles": 0,',
          '  "filas_palets_visibles": 0,',
          '  "bloques_palets_visibles": 0,',
          '  "cajas_estimadas": 0,',
          '  "cajas_aprox": 0,',
          '  "peso_estimado_kg": 0,',
          '  "tara_kg": 0,',
          '  "peso_neto_kg": 0,',
          '  "confianza_estimacion": "alta/media/baja"',
          '}',
          '',
          'Reglas:',
          '- Cuenta toda la matriz visible de almacen, no solo un lateral o un pasillo.',
          '- Prioriza la matriz total visible de palets cuando los bloques repetidos sean claros.',
          '- Mantén coherencia interna entre palets y cajas.',
        ].join('\n'),
      };
    }

    return english;
  }

  private async runTopWarehouseVisionAnalysis(
    imageUrl: string,
    language: 'es' | 'en' | 'fr' | 'de' | 'pt' | 'ar' | 'zh' | 'hi',
    base: any,
  ): Promise<any> {
    const prompts = this.buildTopWarehousePrompts(language);
    const footprints = await this.requestVisionJson(
      imageUrl,
      prompts.footprints + '\n\nBase reading:\n' + JSON.stringify(base),
      'OpenAI top warehouse footprints step',
      220,
    );
    const grid = await this.requestVisionJson(
      imageUrl,
      prompts.grid +
        '\n\nBase reading:\n' +
        JSON.stringify(base) +
        '\n\nFootprint reading:\n' +
        JSON.stringify(footprints),
      'OpenAI top warehouse grid step',
      220,
    );
    const final = await this.requestVisionJson(
      imageUrl,
      prompts.final +
        '\n\nBase reading:\n' +
        JSON.stringify(base) +
        '\n\nFootprint reading:\n' +
        JSON.stringify(footprints) +
        '\n\nGrid reading:\n' +
        JSON.stringify(grid),
      'OpenAI top warehouse final step',
      280,
    );

    const footprintCount = Math.max(
      this.toNumber(footprints?.numero_palets),
      this.toNumber(footprints?.bloques_palets_visibles),
      Math.max(1, this.toNumber(footprints?.columnas_palets_visibles)) *
        Math.max(1, this.toNumber(footprints?.filas_palets_visibles)),
    );

    const merged = {
      ...base,
      ...footprints,
      ...grid,
      ...final,
      numero_palets:
        this.toNumber(final?.numero_palets) ||
        footprintCount ||
        this.toNumber(base?.numero_palets),
      columnas_palets_visibles:
        this.toNumber(final?.columnas_palets_visibles) ||
        this.toNumber(footprints?.columnas_palets_visibles) ||
        this.toNumber(base?.columnas_palets_visibles),
      filas_palets_visibles:
        this.toNumber(final?.filas_palets_visibles) ||
        this.toNumber(footprints?.filas_palets_visibles) ||
        this.toNumber(base?.filas_palets_visibles),
      bloques_palets_visibles:
        this.toNumber(final?.bloques_palets_visibles) ||
        this.toNumber(footprints?.bloques_palets_visibles) ||
        footprintCount,
      cajas_por_capa:
        this.toNumber(grid?.cajas_por_capa) ||
        this.toNumber(base?.cajas_por_capa),
      cajas_superiores:
        this.toNumber(grid?.cajas_superiores) ||
        this.toNumber(base?.cajas_superiores),
      cajas_estimadas:
        this.toNumber(final?.cajas_estimadas) ||
        this.toNumber(grid?.cajas_estimadas) ||
        this.toNumber(base?.cajas_estimadas),
      cajas_aprox:
        this.toNumber(final?.cajas_aprox) ||
        this.toNumber(final?.cajas_estimadas) ||
        this.toNumber(grid?.cajas_estimadas) ||
        this.toNumber(base?.cajas_aprox),
      scan_mode: base?.scan_mode ?? 'multi',
    };

    const auditEntry = {
      language,
      scan_mode: merged.scan_mode,
      mode: 'top_warehouse',
      base: {
        numero_palets: this.toNumber(base?.numero_palets),
        cajas_estimadas: this.toNumber(base?.cajas_estimadas),
        vista: base?.vista,
      },
      footprints: {
        numero_palets: this.toNumber(footprints?.numero_palets),
        columnas_palets_visibles: this.toNumber(
          footprints?.columnas_palets_visibles,
        ),
        filas_palets_visibles: this.toNumber(
          footprints?.filas_palets_visibles,
        ),
        bloques_palets_visibles: this.toNumber(
          footprints?.bloques_palets_visibles,
        ),
      },
      grid: {
        cajas_por_capa: this.toNumber(grid?.cajas_por_capa),
        cajas_superiores: this.toNumber(grid?.cajas_superiores),
        cajas_estimadas: this.toNumber(grid?.cajas_estimadas),
      },
      final: {
        numero_palets: this.toNumber(merged?.numero_palets),
        cajas_estimadas: this.toNumber(merged?.cajas_estimadas),
        cajas_aprox: this.toNumber(merged?.cajas_aprox),
      },
    };
    this.pushStagedVisionAudit(auditEntry);
    this.logVisionSnapshot('OpenAI top warehouse audit summary', auditEntry);

    return merged;
  }

  private async runStagedFruitVisionAnalysis(
    imageUrl: string,
    language: 'es' | 'en' | 'fr' | 'de' | 'pt' | 'ar' | 'zh' | 'hi',
    scanMode: 'single' | 'multi',
  ): Promise<any> {
    const prompts = this.buildStagedVisionPrompts(language, scanMode);
    const stage1 = await this.requestVisionJson(
      imageUrl,
      prompts.stage1,
      'OpenAI staged vision step 1',
      220,
    );
    const stage2 = await this.requestVisionJson(
      imageUrl,
      prompts.stage2 + '\n\nLectura previa del paso 1:\n' + JSON.stringify(stage1),
      'OpenAI staged vision step 2',
      260,
    );
    const stage3 = await this.requestVisionJson(
      imageUrl,
      prompts.stage3 +
        '\n\nLectura previa del paso 1:\n' +
        JSON.stringify(stage1) +
        '\n\nLectura previa del paso 2:\n' +
        JSON.stringify(stage2),
      'OpenAI staged vision step 3',
      320,
    );

    const structuralColumns = this.toNumber(stage2?.columnas_visibles);
    const structuralRows = this.toNumber(stage2?.filas_visibles);
    const structuralDepth = this.toNumber(stage2?.profundidad_estimada);
    const frontVisible = structuralColumns > 0 && structuralRows > 0
      ? structuralColumns * structuralRows
      : 0;
    const structuralBoxes =
      structuralColumns > 0 && structuralRows > 0 && structuralDepth > 0
        ? structuralColumns * structuralRows * structuralDepth
        : 0;
    const boxesPerLayer =
      structuralColumns > 0 && structuralDepth > 0
        ? structuralColumns * structuralDepth
        : 0;

    const merged = {
      ...stage1,
      ...stage2,
      ...stage3,
      categoria: stage3?.categoria ?? stage1?.categoria,
      producto: stage3?.producto ?? stage1?.producto ?? stage3?.fruta,
      envase: stage3?.envase ?? stage1?.envase,
      material_caja: stage3?.material_caja ?? stage1?.material_caja,
      numero_palets:
        this.toNumber(stage3?.numero_palets) ||
        this.toNumber(stage2?.numero_palets) ||
        this.toNumber(stage1?.numero_palets_visibles_base),
      cajas_estimadas:
        this.toNumber(stage3?.cajas_estimadas) ||
        this.toNumber(stage2?.cajas_estimadas),
      cajas_aprox:
        this.toNumber(stage3?.cajas_aprox) ||
        this.toNumber(stage3?.cajas_estimadas) ||
        this.toNumber(stage2?.cajas_estimadas),
      scan_mode: scanMode,
    };

    const stagedAuditEntry = {
      language,
      scan_mode: scanMode,
      stage1: {
        vista: stage1?.vista,
        producto: stage1?.producto,
        envase: stage1?.envase,
        numero_palets_visibles_base: this.toNumber(
          stage1?.numero_palets_visibles_base,
        ),
      },
      stage2: {
        numero_palets: this.toNumber(stage2?.numero_palets),
        columnas_visibles: structuralColumns,
        filas_visibles: structuralRows,
        profundidad_estimada: structuralDepth,
        cajas_por_capa: this.toNumber(stage2?.cajas_por_capa),
        cajas_superiores: this.toNumber(stage2?.cajas_superiores),
        cajas_estimadas: this.toNumber(stage2?.cajas_estimadas),
      },
      stage3: {
        numero_palets: this.toNumber(stage3?.numero_palets),
        cajas_estimadas: this.toNumber(stage3?.cajas_estimadas),
        cajas_aprox: this.toNumber(stage3?.cajas_aprox),
        peso_estimado_kg: this.toNumber(stage3?.peso_estimado_kg),
        peso_neto_kg: this.toNumber(stage3?.peso_neto_kg),
      },
      combined_structure: {
        front_visible: frontVisible,
        structural_boxes: structuralBoxes,
        cajas_por_capa: boxesPerLayer,
      },
      final: {
        numero_palets: this.toNumber(merged.numero_palets),
        cajas_estimadas: this.toNumber(merged.cajas_estimadas),
        cajas_aprox: this.toNumber(merged.cajas_aprox),
        profundidad_estimada: this.toNumber(
          merged.profundidad_estimada ?? stage2?.profundidad_estimada,
        ),
      },
    };
    this.pushStagedVisionAudit(stagedAuditEntry);
    this.logVisionSnapshot('OpenAI staged vision audit summary', stagedAuditEntry);

    if (this.shouldRunTopWarehouseFlow(merged, scanMode)) {
      return this.runTopWarehouseVisionAnalysis(imageUrl, language, merged);
    }

    if (this.shouldRunCornerPalletFlow(merged, scanMode)) {
      return this.runCornerPalletVisionAnalysis(imageUrl, language, merged);
    }

    this.logVisionSnapshot('OpenAI staged vision merged JSON', merged);
    return merged;
  }

}

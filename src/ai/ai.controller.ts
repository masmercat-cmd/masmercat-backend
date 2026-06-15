import { Controller, Post, Body, Get, Req, UseGuards, Delete, Query } from '@nestjs/common';
import type { Request } from 'express';
import {
  AiService,
  ChatMessageDto,
  ScanAndWeighDto,
  TransportTariffDto,
} from './ai.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('ai')
export class AiController {
  constructor(private aiService: AiService) {}

  private toNumber(value: any): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === 'string') {
      const parsed = Number(value.replace(',', '.').trim());
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private forceMultiPalletResponse(result: any, scanMode: 'single' | 'multi'): any {
    if (!result || typeof result !== 'object' || scanMode !== 'multi') {
      return result;
    }

    const pallets = Math.max(
      this.toNumber(result?.numero_palets),
      this.toNumber(result?.pallet_count),
    );
    const forced = { ...result };
    forced.scan_mode = 'multi';
    forced.requested_scan_mode = 'multi';
    forced.scene_pipeline = `${forced.scene_pipeline ?? ''}`.trim() || 'multi';
    const effectivePallets = Math.max(
      pallets,
      this.toNumber(forced?.numero_palets_visibles_base),
      this.toNumber(forced?.bloques_palets_visibles),
      this.toNumber(forced?.bases_independientes_visibles),
    );
    if (effectivePallets <= 0) {
      return forced;
    }

    forced.numero_palets = effectivePallets;
    forced.pallet_count = effectivePallets;
    forced.numero_palets_visibles_base = Math.max(
      this.toNumber(forced?.numero_palets_visibles_base),
      effectivePallets,
    );
    forced.bases_independientes_visibles = Math.max(
      this.toNumber(forced?.bases_independientes_visibles),
      effectivePallets,
    );
    forced.bloques_palets_visibles = Math.max(
      this.toNumber(forced?.bloques_palets_visibles),
      effectivePallets,
    );
    forced.columnas_palets_visibles = Math.max(
      this.toNumber(forced?.columnas_palets_visibles),
      effectivePallets,
    );
    forced.filas_palets_visibles = Math.max(
      this.toNumber(forced?.filas_palets_visibles),
      1,
    );
    forced.debug_summary =
      `controller-enrich multi pallets:${effectivePallets} raw:${pallets}` +
      ` pipe:${forced.scene_pipeline}`;

    if (!`${forced.envase ?? ''}`.trim()) {
      forced.envase = 'palet con cajas';
    }
    forced.hay_palet = true;
    forced.hay_cajas = true;

    const existingBoxes = Math.max(
      this.toNumber(forced?.cajas_estimadas),
      this.toNumber(forced?.cajas_aprox),
    );
    const forcedBoxes = existingBoxes;
    forced.cajas_estimadas = forcedBoxes;
    forced.cajas_aprox = forcedBoxes;

    const taraKg = Math.max(this.toNumber(forced?.tara_kg), 60);
    const grossKg = Math.max(
      this.toNumber(forced?.peso_bruto_kg),
      this.toNumber(forced?.peso_estimado_kg),
      forcedBoxes > 0 ? forcedBoxes * 7.5 + taraKg : 0,
    );
    forced.tara_kg = taraKg;
    forced.peso_bruto_kg = grossKg;
    forced.peso_estimado_kg = grossKg;
    forced.peso_neto_kg = Math.max(
      this.toNumber(forced?.peso_neto_kg),
      grossKg - taraKg,
    );

    if (!`${forced.categoria ?? ''}`.trim()) {
      forced.categoria = 'fruta';
    }
    if (!`${forced.producto ?? forced.fruta ?? ''}`.trim()) {
      forced.producto = 'por confirmar';
    }
    forced.calibre =
      `${forced.calibre ?? ''}`.trim() ||
      'multi forzado';
    forced.calidad =
      `${forced.calidad ?? ''}`.trim() ||
      `revision manual | ${forced.debug_summary}`;
    if (!`${forced.medidas_caja ?? ''}`.trim()) {
      forced.medidas_caja = '60x40 cm aprox';
    }
    if (!`${forced.medidas_palet ?? ''}`.trim()) {
      forced.medidas_palet = 'Palet industrial (120x100 cm aprox)';
    }

    if (forced?.debug_vision && typeof forced.debug_vision === 'object') {
      forced.debug_vision = {
        ...forced.debug_vision,
        scene_pipeline: forced.scene_pipeline,
        scan_mode: 'multi',
        requested_scan_mode: 'multi',
        numero_palets: effectivePallets,
        numero_palets_visibles_base: Math.max(
          this.toNumber(forced.debug_vision?.numero_palets_visibles_base),
          effectivePallets,
        ),
        bloques_palets_visibles: Math.max(
          this.toNumber(forced.debug_vision?.bloques_palets_visibles),
          effectivePallets,
        ),
        columnas_palets_visibles: Math.max(
          this.toNumber(forced.debug_vision?.columnas_palets_visibles),
          effectivePallets,
        ),
        filas_palets_visibles: Math.max(
          this.toNumber(forced.debug_vision?.filas_palets_visibles),
          1,
        ),
        cajas_estimadas: forcedBoxes,
        cajas_aprox: forcedBoxes,
      };
    }

    return forced;
  }

  @Get('debug-version')
  getDebugVersion() {
    return {
      ok: true,
      service: 'ai',
      build_marker: '2026-05-05-ai-pallet-debug-v1',
      expected_commit: '74ba731f',
    };
  }

  @Post('chat')
  async chat(@Req() req: Request, @Body() body: any) {
    console.log('✅ ENTRO A /ai/chat');
    console.log('Content-Type:', req.headers['content-type']);
    console.log('📦 BODY (raw):', body);

    let payload: any = body;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch {}
    }
    const normalized = payload?.data ?? payload;

    const message =
      normalized?.message ??
      normalized?.prompt ??
      normalized?.text ??
      normalized?.query;

    if (!message) {
      console.log('❌ FALTA message/prompt/text/query. Payload:', normalized);
      return { ok: false, error: 'Falta message (o prompt/text/query) en el body' };
    }

    const chatMessageDto: ChatMessageDto = { ...normalized, message };

    try {
      const response = await this.aiService.chat(chatMessageDto);
      return { ok: true, response };
    } catch (err: any) {
      console.log('❌ ERROR aiService.chat:', err?.message || err);
      console.log('❌ ERROR details:', err?.response?.data || err?.response || err);
      return { ok: false, error: err?.message || 'Error interno en chat' };
    }
  }

  @Post('analyze-fruit')
  async analyzeFruit(@Req() req: Request, @Body() body: any) {
    console.log('🍊 ENTRO A /ai/analyze-fruit');
    console.log('Content-Type:', req.headers['content-type']);
    console.log('📦 BODY keys:', body ? Object.keys(body) : body);

    // Normaliza por si llega como string o envuelto en { data: ... }
    let payload: any = body;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch {}
    }
    const normalized = payload?.data ?? payload;
    const imagePath =
      normalized?.image_path ??
      normalized?.imagePath ??
      normalized?.path ??
      null;
console.log('🌍 language recibido:', normalized?.language);

let image =
  normalized?.image ??
  normalized?.imageBase64 ??
  normalized?.base64 ??
  normalized?.photo ??
  normalized?.photoBase64 ??
  normalized?.file;
    const fastMode = normalized?.fast_mode === true || normalized?.fastMode === true;
    const scanMode =
      normalized?.scan_mode === 'multi' || normalized?.scanMode === 'multi'
        ? 'multi'
        : 'single';

if (image && typeof image === 'object') {
  image = image.base64 ?? image.data ?? image.uri ?? null;
}

if (!image) {
  console.log('❌ FALTA image. Payload:', normalized);
  return { ok: false, error: 'Falta image en el body' };
}

    console.log('🧾 image type:', typeof image);
    console.log('📏 image length:', image.length);
    console.log('🔎 image first 30 chars:', String(image).slice(0, 30));

   try {
  const rawResult = await this.aiService.analyzeFruitImage(
  image,
  normalized?.language || 'es',
  { imagePath, fastMode, scanMode }
);
  const result = this.forceMultiPalletResponse(rawResult, scanMode);

  const payload = {
    ok: true,
    result,        // por si la app espera result.fruta
    data: result,  // por si espera data.fruta
    ...result,     // por si espera fruta directamente
  };

  console.log('✅ RESPUESTA AL FRONTEND:', payload);
  return payload;

} catch (err: any) {
  console.log('❌ ERROR analyzeFruitImage:', err?.message || err);
  console.log('❌ ERROR details:', err?.response?.data || err?.response || err);

  return { ok: false, error: err?.message || 'Error interno analizando imagen' };
}
}

  @Post('scan-and-weigh')
  async scanAndWeigh(@Req() req: Request, @Body() body: any) {
    console.log('ENTRO A /ai/scan-and-weigh');
    console.log('Content-Type:', req.headers['content-type']);

    let payload: any = body;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch {}
    }
    const normalized = payload?.data ?? payload ?? {};

    let image =
      normalized?.image ??
      normalized?.imageBase64 ??
      normalized?.base64 ??
      normalized?.photo ??
      normalized?.photoBase64 ??
      normalized?.file;

    if (image && typeof image === 'object') {
      image = image.base64 ?? image.data ?? image.uri ?? null;
    }

    if (!image) {
      return { ok: false, error: 'Falta image en el body' };
    }

    const dto: ScanAndWeighDto = {
      image,
      imageMimeType:
        normalized?.imageMimeType ??
        normalized?.image_mime_type ??
        normalized?.mime_type ??
        normalized?.mimeType,
      imageName:
        normalized?.imageName ??
        normalized?.image_name ??
        normalized?.fileName ??
        normalized?.filename,
      imagePath:
        normalized?.imagePath ??
        normalized?.image_path ??
        normalized?.path,
      language: normalized?.language ?? 'es',
      fastMode: normalized?.fastMode === true || normalized?.fast_mode === true,
      scanMode:
        normalized?.scanMode === 'multi' || normalized?.scan_mode === 'multi'
          ? 'multi'
          : 'single',
      context:
        normalized?.context && typeof normalized.context === 'object'
          ? normalized.context
          : {},
    };

    try {
      return await this.aiService.scanAndWeigh(dto);
    } catch (err: any) {
      console.log('ERROR scanAndWeigh:', err?.message || err);
      console.log('ERROR details:', err?.response?.data || err?.response || err);
      return {
        ok: false,
        error: err?.message || 'Error interno en scan-and-weigh',
      };
    }
  }

  @Post('analyze-transport-tariff')
  async analyzeTransportTariff(@Req() req: Request, @Body() body: any) {
    console.log('🚚 ENTRO A /ai/analyze-transport-tariff');
    console.log('Content-Type:', req.headers['content-type']);

    let payload: any = body;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch {}
    }
    const normalized = payload?.data ?? payload;

    const document =
      normalized?.document ??
      normalized?.image ??
      normalized?.base64 ??
      normalized?.file;

    if (!document) {
      return { ok: false, error: 'Falta document en el body' };
    }

    const dto: TransportTariffDto = {
      document,
      mimeType: normalized?.mime_type ?? normalized?.mimeType,
      language: normalized?.language ?? 'es',
      origin: normalized?.origin ?? '',
      destination: normalized?.destination ?? '',
      palletCount: Number(normalized?.pallet_count ?? normalized?.palletCount ?? 1),
      palletType: normalized?.pallet_type ?? normalized?.palletType ?? '',
    };

    try {
      const result = await this.aiService.analyzeTransportTariff(dto);
      return { ok: true, result };
    } catch (err: any) {
      console.log('❌ ERROR analyzeTransportTariff:', err?.message || err);
      return {
        ok: false,
        error: err?.message || 'Error interno analizando tarifa',
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('guardar-cambios')
  async saveScanChanges(@Req() req: Request, @Body() body: any) {
    try {
      const user = req.user as any;
      const saved = await this.aiService.saveScanResult(user.id, body ?? {});
      return { ok: true, id: saved.id, updatedAt: saved.updatedAt };
    } catch (err: any) {
      console.log('❌ ERROR saveScanChanges:', err?.message || err);
      return { ok: false, error: err?.message || 'Error interno guardando cambios' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('guardar-cambios')
  async getLatestSavedScan(@Req() req: Request) {
    try {
      const user = req.user as any;
      const result = await this.aiService.getLatestScanResult(user.id);
      return { ok: true, result };
    } catch (err: any) {
      console.log('❌ ERROR getLatestSavedScan:', err?.message || err);
      return { ok: false, error: err?.message || 'Error interno cargando cambios' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Delete('guardar-cambios')
  async deleteSavedScan(@Req() req: Request) {
    try {
      const user = req.user as any;
      const deleted = await this.aiService.deleteSavedScanResults(user.id);
      return { ok: true, deleted };
    } catch (err: any) {
      console.log('❌ ERROR deleteSavedScan:', err?.message || err);
      return { ok: false, error: err?.message || 'Error interno borrando cambios' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('audit/weight-adjustments')
  async getWeightAdjustmentAudit(@Query('limit') limit?: string) {
    try {
      const results = this.aiService.getRecentWeightAdjustmentAudit(Number(limit ?? 20));
      return { ok: true, count: results.length, results };
    } catch (err: any) {
      console.log('âŒ ERROR getWeightAdjustmentAudit:', err?.message || err);
      return { ok: false, error: err?.message || 'Error interno cargando auditoria' };
    }
  }

  @Get('audit/staged-vision')
  async getStagedVisionAudit(@Query('limit') limit?: string) {
    try {
      const results = this.aiService.getRecentStagedVisionAudit(
        Number(limit ?? 20),
      );
      return { ok: true, count: results.length, results };
    } catch (err: any) {
      console.log('ERROR getStagedVisionAudit:', err?.message || err);
      return {
        ok: false,
        error: err?.message || 'Error interno cargando auditoria escalonada',
      };
    }
  }
}

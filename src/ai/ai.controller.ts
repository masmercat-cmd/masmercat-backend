import { Controller, Post, Body, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AiService, ChatMessageDto, TransportTariffDto } from './ai.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('ai')
export class AiController {
  constructor(private aiService: AiService) {}

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
  const result = await this.aiService.analyzeFruitImage(
  image,
  normalized?.language || 'es',
  { imagePath }
);

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
}

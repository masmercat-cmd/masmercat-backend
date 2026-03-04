"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiController = void 0;
const common_1 = require("@nestjs/common");
const ai_service_1 = require("./ai.service");
let AiController = class AiController {
    constructor(aiService) {
        this.aiService = aiService;
    }
    async chat(req, body) {
        console.log('✅ ENTRO A /ai/chat');
        console.log('Content-Type:', req.headers['content-type']);
        console.log('📦 BODY (raw):', body);
        let payload = body;
        if (typeof payload === 'string') {
            try {
                payload = JSON.parse(payload);
            }
            catch { }
        }
        const normalized = payload?.data ?? payload;
        const message = normalized?.message ??
            normalized?.prompt ??
            normalized?.text ??
            normalized?.query;
        if (!message) {
            console.log('❌ FALTA message/prompt/text/query. Payload:', normalized);
            return { ok: false, error: 'Falta message (o prompt/text/query) en el body' };
        }
        const chatMessageDto = { ...normalized, message };
        try {
            const response = await this.aiService.chat(chatMessageDto);
            return { ok: true, response };
        }
        catch (err) {
            console.log('❌ ERROR aiService.chat:', err?.message || err);
            console.log('❌ ERROR details:', err?.response?.data || err?.response || err);
            return { ok: false, error: err?.message || 'Error interno en chat' };
        }
    }
    async analyzeFruit(req, body) {
        console.log('🍊 ENTRO A /ai/analyze-fruit');
        console.log('Content-Type:', req.headers['content-type']);
        console.log('📦 BODY keys:', body ? Object.keys(body) : body);
        let payload = body;
        if (typeof payload === 'string') {
            try {
                payload = JSON.parse(payload);
            }
            catch { }
        }
        const normalized = payload?.data ?? payload;
        console.log('🌍 language recibido:', normalized?.language);
        let image = normalized?.image ??
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
            const result = await this.aiService.analyzeFruitImage(image, normalized?.language || 'es');
            const payload = {
                ok: true,
                result,
                data: result,
                ...result,
            };
            console.log('✅ RESPUESTA AL FRONTEND:', payload);
            return payload;
        }
        catch (err) {
            console.log('❌ ERROR analyzeFruitImage:', err?.message || err);
            console.log('❌ ERROR details:', err?.response?.data || err?.response || err);
            return { ok: false, error: err?.message || 'Error interno analizando imagen' };
        }
    }
};
exports.AiController = AiController;
__decorate([
    (0, common_1.Post)('chat'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "chat", null);
__decorate([
    (0, common_1.Post)('analyze-fruit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "analyzeFruit", null);
exports.AiController = AiController = __decorate([
    (0, common_1.Controller)('ai'),
    __metadata("design:paramtypes", [ai_service_1.AiService])
], AiController);
//# sourceMappingURL=ai.controller.js.map
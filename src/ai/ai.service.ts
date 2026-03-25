// CAMBIO FORZADO DEPLOY
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import OpenAI from 'openai';
import { Repository } from 'typeorm';
import { AiScanResult, User } from '../entities';

export class ChatMessageDto {
  message: string;
  language?: string;
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

  private estimateBoxes(parsed: any, envase: string): number {
    if (envase.includes('palot')) {
      return 0;
    }

    const existingBoxes = this.toNumber(
      parsed.cajas_estimadas ?? parsed.cajas_aprox,
    );
    const visibleColumns = this.toNumber(parsed.columnas_visibles);
    const visibleRows = this.toNumber(parsed.filas_visibles);
    const boxesPerLayer = this.toNumber(parsed.cajas_por_capa);
    const estimatedLayers = this.toNumber(parsed.capas_estimadas);
    const topBoxes = this.toNumber(parsed.cajas_superiores);

    const frontVisible =
      visibleColumns > 0 && visibleRows > 0 ? visibleColumns * visibleRows : 0;
    const normalizedBoxesPerLayer = Math.max(boxesPerLayer, frontVisible);
    const normalizedLayers = Math.max(
      estimatedLayers,
      envase.includes('palet') ? 1 : 0,
    );

    const structuralTotal =
      normalizedBoxesPerLayer > 0
        ? normalizedBoxesPerLayer * Math.max(normalizedLayers, 1) + topBoxes
        : 0;

    let estimated = Math.max(existingBoxes, structuralTotal);

    if (envase.includes('palet') && estimated === 0 && frontVisible > 0) {
      estimated = frontVisible;
    }

    if (envase.includes('palet')) {
      const palletMeasures = `${parsed.medidas_palet ?? ''}`.toLowerCase();
      const boxMeasures = `${parsed.medidas_caja ?? ''}`.toLowerCase();
      const normalizedEnvase = `${parsed.envase ?? ''}`.toLowerCase();
      const likelyIndustrial =
        palletMeasures.includes('120x100') ||
        boxMeasures.includes('60x40') ||
        normalizedBoxesPerLayer >= 28;

      const looksLikeFullFrontFaceOnly =
        frontVisible >= 56 &&
        frontVisible <= 72 &&
        estimated <= frontVisible + 8;

      const looksLikeUnderCountedIndustrialPallet =
        boxMeasures.includes('60x40') &&
        estimated >= 72 &&
        estimated <= 110;

      // Full-height industrial pallets with 60x40 fruit boxes often land
      // around 184 total boxes; this prevents returning only the visible face.
      if (
        (likelyIndustrial && looksLikeFullFrontFaceOnly) ||
        looksLikeUnderCountedIndustrialPallet
      ) {
        estimated = Math.max(estimated, 184);
      }

      if (
        normalizedEnvase.includes('palet con cajas') &&
        ((frontVisible >= 56 && frontVisible <= 72) ||
            (existingBoxes >= 56 && existingBoxes <= 80) ||
            boxMeasures.includes('60x40')) &&
        estimated <= 120
      ) {
        estimated = 184;
      }
    }

    return Math.round(this.clamp(estimated, 0, 400));
  }

  private inferBoxWeightKg(parsed: any, producto: string): number {
    const piecesPerBox = this.toNumber(parsed.piezas_por_caja);

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
      return this.clamp(piecesPerBox * avgPieceWeights[producto], 2.5, 22);
    }

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

    return defaultWeights[producto] ?? 6.5;
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

  private finalizeVisionResult(parsed: any): any {
    const envase = this.normalizeEnvase(parsed.envase);
    const producto = this.normalizeProducto(parsed.producto || parsed.fruta);
    const boxes = this.estimateBoxes(parsed, envase);
    const isPalot = envase.includes('palot');
    const boxWeightKg = this.inferBoxWeightKg(parsed, producto);
    const tarePerBoxKg = this.inferTarePerBoxKg(parsed);
    const palletTareKg = this.inferPalletTareKg(parsed, envase, boxes);
    const aiGrossWeight = this.toNumber(
      parsed.peso_bruto_kg ?? parsed.peso_estimado_kg,
    );

    parsed.cajas_estimadas = boxes;
    parsed.cajas_aprox = boxes;

    const piecesPerBox = this.toNumber(parsed.piezas_por_caja);
    if (boxes > 0 && piecesPerBox > 0) {
      const totalPieces = Math.round(boxes * piecesPerBox);
      parsed.cantidad_total_piezas = totalPieces;
      parsed.cantidad_aprox = totalPieces;
    }

    let grossWeight = aiGrossWeight;
    if (isPalot) {
      grossWeight = Math.max(aiGrossWeight, 280);
    } else if (boxes > 0) {
      const estimatedGross = boxes * boxWeightKg;
      grossWeight =
        aiGrossWeight > 0
          ? Number(((aiGrossWeight + estimatedGross) / 2).toFixed(2))
          : Number(estimatedGross.toFixed(2));
    }

    const tareWeight = isPalot
      ? palletTareKg
      : Number((boxes * tarePerBoxKg + palletTareKg).toFixed(2));

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

    parsed.numero_palets =
      envase.includes('palet') || envase.includes('palot') ? 1 : 0;

    if (envase.includes('palet') && boxes >= 184) {
      parsed.medidas_palet = 'Palet industrial (120x100 cm aprox)';
    }

    return parsed;
  }

  private async refinePalletEstimate(
    img: string,
    parsed: any,
    language: string,
  ): Promise<any> {
    const lang = (language || 'es').substring(0, 2);
    const prompt =
      lang === 'en'
        ? `You are reviewing a fruit pallet image because the first estimate may be undercounting boxes.

Return ONLY valid JSON with:
{
  "columnas_visibles": 0,
  "filas_visibles": 0,
  "cajas_por_capa": 0,
  "capas_estimadas": 0,
  "cajas_superiores": 0,
  "cajas_estimadas": 0,
  "medidas_caja": "60x40 cm approx",
  "medidas_palet": "Industrial pallet (120x100 cm approx) / Europallet (120x80 cm approx)",
  "confianza_estimacion": "alta/media/baja"
}

Rules:
- Count the visible front face first.
- Infer the full pallet depth and total layers.
- Do NOT return only the visible front boxes.
- If the pallet is tall and densely packed, prefer the full commercial pallet total.
- Distinguish europallet vs industrial pallet from footprint and number of boxes per layer.`
        : `Estás revisando una imagen de palet de fruta porque la primera estimación puede estar contando pocas cajas.

Devuelve SOLO JSON válido con:
{
  "columnas_visibles": 0,
  "filas_visibles": 0,
  "cajas_por_capa": 0,
  "capas_estimadas": 0,
  "cajas_superiores": 0,
  "cajas_estimadas": 0,
  "medidas_caja": "60x40 cm aprox",
  "medidas_palet": "Palet industrial (120x100 cm aprox) / Europalet (120x80 cm aprox)",
  "confianza_estimacion": "alta/media/baja"
}

Reglas:
- Cuenta primero la cara frontal visible.
- Infiere la profundidad total del palet y las capas completas.
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
      cajas_por_capa: refined.cajas_por_capa ?? parsed.cajas_por_capa,
      capas_estimadas: refined.capas_estimadas ?? parsed.capas_estimadas,
      cajas_superiores: refined.cajas_superiores ?? parsed.cajas_superiores,
      cajas_estimadas: Math.max(
        this.toNumber(parsed.cajas_estimadas ?? parsed.cajas_aprox),
        this.toNumber(refined.cajas_estimadas),
      ),
    };
  }

  async saveScanResult(userId: string, payload: any): Promise<AiScanResult> {
    const existing = await this.aiScanResultRepository.findOne({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });

    const entity = existing ?? this.aiScanResultRepository.create({ userId });
    entity.imagePath = payload?.image_path ?? payload?.imagePath ?? null;
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
    const { message, language = 'es' } = chatMessageDto;
    const systemPrompt = this.systemPrompts[language] || this.systemPrompts.es;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o', // más estable y actual para chat
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      
 completion.choices[0]?.message?.content || '';
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

  async analyzeFruitImage(base64Image: string, language: string = 'es'): Promise<any> {
  // Limpieza y normalización
  let img = (base64Image || '').trim();

  // Si viene como data URL, lo convertimos a base64 puro
  img = img.replace(/^data:image\/\w+;base64,/, '');

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
   - caja
   - varias cajas
   - palet con cajas
   - palot

4. Material del envase o caja si se aprecia:
   - cartón
   - madera
   - plástico
   - desconocido4

5. Si el envase es "palet con cajas", analiza así:
- SIEMPRE estima el total del palet completo, no solo lo visible de frente
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
  "envase": "caja/varias cajas/palet con cajas/palot",
  "material_caja": "carton/madera/plastico/desconocido",
  "columnas_visibles": 0,
  "filas_visibles": 0,
  "cajas_por_capa": 0,
  "capas_estimadas": 0,
  "cajas_aprox": 0,
  "cajas_superiores": 0,
  "cajas_estimadas": 0,
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
4. Estimate pieces per box
5. Estimated total weight in kg
6. Quality (extra, first, second)
7. Packaging type (box, pallet with boxes, loose)
8. Box dimensions (e.g. "60x40 cm approx")
9. Pallet dimensions if present (e.g. "120x100 cm approx")

Respond ONLY in JSON with these keys:
{
   "fruta": "orange/lemon/etc",
  "calibre": "1/2/3/A/B",
  "cajas_estimadas": 184,
  "piezas_por_caja": 20,
  "cantidad_total_piezas": 3680,
  "peso_estimado_kg": 920,
  "calidad": "extra/first/second",
  "envase": "box / pallet with boxes",
  "medidas_caja": "60x40 cm approx",
  "medidas_palet": "120x100 cm approx"
}

IMPORTANT:
- If a pallet is visible, ALWAYS estimate pallet dimensions.
- If boxes are visible, ALWAYS estimate box dimensions.
- Never return "por confirmar".
- Always give an approximate value even if uncertain.
- Estimate box count structurally, not loosely.
- Use visible rows and columns on the front and side faces to infer total boxes.
- Infer hidden boxes that are not directly visible when the pallet depth suggests more boxes.
- If the pallet is full height and densely stacked, avoid low counts.
- Prefer realistic commercial pallet counts for fruit boxes.
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
    const envaseInicial = this.normalizeEnvase(parsed.envase);
    const cajasIniciales = this.toNumber(
      parsed.cajas_estimadas ?? parsed.cajas_aprox,
    );

    if (envaseInicial.includes('palet') && cajasIniciales <= 120) {
      parsed = await this.refinePalletEstimate(img, parsed, lang);
    }

    const finalized = this.finalizeVisionResult(parsed);
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
  const envaseInicial = this.normalizeEnvase(parsed.envase);
  const cajasIniciales = this.toNumber(
    parsed.cajas_estimadas ?? parsed.cajas_aprox,
  );

  if (envaseInicial.includes('palet') && cajasIniciales <= 120) {
    parsed = await this.refinePalletEstimate(img, parsed, lang);
  }

  const finalized = this.finalizeVisionResult(parsed);
  this.logVisionSnapshot('Final pallet result attempt B', finalized);
  return finalized;

  } catch (error: any) {
    console.error('❌ Vision attempt B (raw base64) error:', error?.message || error);
    console.error('❌ details:', error?.response?.data || error?.response || error);
    throw error;
  }
}
}

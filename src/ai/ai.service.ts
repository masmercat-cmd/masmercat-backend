import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export class ChatMessageDto {
  message: string;
  language?: string;
}

@Injectable()
export class AiService {
  private openai: OpenAI;

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

  constructor(private configService: ConfigService) {
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
2. Approximate size (1, 2, 3, A, B)
3. Approximate quantity
4. Estimated total weight in kg
5. Quality (extra, first, second)

Respond ONLY in JSON with these keys:
{
  "fruta": "orange/lemon/etc",
  "calibre": "1/2/3/A/B",
  "cantidad_total_piezas": 80,
  "peso_estimado_kg": 18,
  "calidad": "extra/first/second"
}`
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
    
    const parsed = JSON.parse(response);

let cajas =
  parsed.cajas_estimadas ??
  parsed.cajas_aprox ??
  0;

if (parsed.envase === 'palet con cajas' && cajas < 50) {
  cajas = cajas * 4;
}

if (parsed.envase === 'palet con cajas' && cajas < 50) {
  cajas = 80;
}

parsed.cajas_estimadas = cajas;
parsed.cajas_aprox = cajas;

if (parsed.piezas_por_caja) {
  parsed.cantidad_total_piezas = cajas * parsed.piezas_por_caja;
  parsed.cantidad_aprox = cajas * parsed.piezas_por_caja;
}

const pesoPorCaja = 5;
const taraPorCaja = 0.5;

let taraPalet = 0;
if (parsed.envase === 'palet con cajas') {
  taraPalet = 20;
}

const pesoBruto = cajas * pesoPorCaja;
const tara = cajas * taraPorCaja + taraPalet;
const pesoNeto = pesoBruto - tara;

parsed.peso_estimado_kg = pesoBruto;
parsed.tara_kg = tara;
parsed.peso_neto_kg = pesoNeto;

parsed.numero_palets =
  parsed.envase === 'palet con cajas' ? 1 : 0;

return parsed;
  } catch (error: any) {
    console.error('❌ Vision attempt A (data URL) error:', error?.message || error);
    console.error('❌ details:', error?.response?.data || error?.response || error);
  }

  // Intento B: base64 “puro” (por si el data URL falla en tu entorno)
  try {
    const completion = await this.openai.chat.completions.create({
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

    const response = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(response);

    let cajas =
      parsed.cajas_estimadas ??
      parsed.cajas_aprox ??
      0;

    if (parsed.envase === 'palet con cajas' && cajas < 50) {
      cajas = cajas * 4;
    }

    if (parsed.envase === 'palet con cajas' && cajas < 50) {
      cajas = 80;
    }

    parsed.cajas_estimadas = cajas;
    parsed.cajas_aprox = cajas;

    if (parsed.piezas_por_caja) {
  parsed.cantidad_total_piezas = cajas * parsed.piezas_por_caja;
  parsed.cantidad_aprox = cajas * parsed.piezas_por_caja;
}

const pesoPorCaja = 5;
const taraPorCaja = 0.5;

let taraPalet = 0;

const envase = (parsed.envase || '').toLowerCase();

// Número de palets
parsed.numero_palets = envase.includes('palet') ? 1 : 0;

// MEDIDAS CAJA
if (envase.includes('caja')) {
  parsed.medidas_caja = '60x40 cm aprox';
} else {
  parsed.medidas_caja = 'por confirmar';
}

// MEDIDAS PALET
if (envase.includes('palet')) {

  if (envase.includes('industrial') || cajas >= 80) {
    parsed.medidas_palet = 'Palet industrial (120x100 cm aprox)';
  } else {
    parsed.medidas_palet = 'Europalet (120x80 cm aprox)';
  }

} else {
  parsed.medidas_palet = 'no aplica';
}
const pesoBruto = cajas * pesoPorCaja;
const tara = cajas * taraPorCaja + taraPalet;
const pesoNeto = pesoBruto - tara;

parsed.peso_estimado_kg = pesoBruto;
parsed.tara_kg = tara;
parsed.peso_neto_kg = pesoNeto;

return parsed;		
  } catch (error: any) {
    console.error('❌ Vision attempt B (raw base64) error:', error?.message || error);
    console.error('❌ details:', error?.response?.data || error?.response || error);
    throw error;
  }
}
}
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiService = exports.ChatMessageDto = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const openai_1 = __importDefault(require("openai"));
class ChatMessageDto {
}
exports.ChatMessageDto = ChatMessageDto;
let AiService = class AiService {
    constructor(configService) {
        this.configService = configService;
        this.systemPrompts = {
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
        const apiKey = this.configService.get('OPENAI_API_KEY') ||
            process.env.OPENAI_API_KEY;
        if (!apiKey) {
            console.error('❌ Falta OPENAI_API_KEY en .env / variables de entorno');
        }
        this.openai = new openai_1.default({ apiKey: apiKey || '', timeout: 60000 });
    }
    async chat(chatMessageDto) {
        const { message, language = 'es' } = chatMessageDto;
        const systemPrompt = this.systemPrompts[language] || this.systemPrompts.es;
        try {
            const completion = await this.openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: message },
                ],
                temperature: 0.7,
                max_tokens: 500,
            });
            return completion.choices[0]?.message?.content || '';
        }
        catch (error) {
            console.error('❌ OpenAI chat error:', error?.message || error);
            console.error('❌ details:', error?.response?.data || error?.response || error);
            const fallbackMessages = {
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
    async analyzeFruitImage(base64Image, language = 'es') {
        let img = (base64Image || '').trim();
        img = img.replace(/^data:image\/\w+;base64,/, '');
        const prompts = {
            es: `Analiza esta imagen de frutas. Identifica:
1. Tipo de fruta
2. Calibre aproximado (1, 2, 3, A, B)
3. Cantidad aproximada de frutas
4. Peso estimado total en kg
5. Calidad (extra, primera, segunda)

Responde SOLO en JSON con estas claves:
{
  "fruta": "naranja/limón/etc",
  "calibre": "1/2/3/A/B",
  "cantidad_aprox": 80,
  "peso_estimado_kg": 18,
  "calidad": "extra/primera/segunda"
}`,
            en: `Analyze this fruit image. Identify:
1. Fruit type
2. Approximate size (1, 2, 3, A, B)
3. Approximate quantity
4. Estimated total weight in kg
5. Quality (extra, first, second)

Respond ONLY in JSON with these keys:
{
  "fruta": "orange/lemon/etc",
  "calibre": "1/2/3/A/B",
  "cantidad_aprox": 80,
  "peso_estimado_kg": 18,
  "calidad": "extra/first/second"
}`,
        };
        const lang = (language || 'es').substring(0, 2);
        const prompt = prompts[lang] || prompts.es;
        console.log('🧠 analyzeFruitImage lang:', lang);
        console.log('🧠 analyzeFruitImage base64 length:', img.length);
        console.log('🧠 analyzeFruitImage first chars:', img.slice(0, 20));
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
                            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } },
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
            return JSON.parse(response);
        }
        catch (error) {
            console.error('❌ Vision attempt A (data URL) error:', error?.message || error);
            console.error('❌ details:', error?.response?.data || error?.response || error);
        }
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
            return JSON.parse(response);
        }
        catch (error) {
            console.error('❌ Vision attempt B (raw base64) error:', error?.message || error);
            console.error('❌ details:', error?.response?.data || error?.response || error);
            throw error;
        }
    }
};
exports.AiService = AiService;
exports.AiService = AiService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AiService);
//# sourceMappingURL=ai.service.js.map
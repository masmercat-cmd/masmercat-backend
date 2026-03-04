 
const axios = require('axios');

const API_URL = 'http://localhost:3000/api';

const EMAIL = 'test@test.com';
const PASSWORD = 'Test1234!';

let token = '';

const login = async () => {
  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: EMAIL,
      password: PASSWORD
    });
    token = response.data.token;
    console.log('✅ Login exitoso');
  } catch (error) {
    console.error('❌ Error login:', error.response?.data || error.message);
  }
};

const createFruits = async () => {
  const fruits = [
    { nameEs: 'Naranjas', nameEn: 'Oranges', nameFr: 'Oranges', nameDe: 'Orangen', namePt: 'Laranjas', nameAr: 'برتقال', nameZh: '橙子', nameHi: 'संतरे' },
    { nameEs: 'Limones', nameEn: 'Lemons', nameFr: 'Citrons', nameDe: 'Zitronen', namePt: 'Limões', nameAr: 'ليمون', nameZh: '柠檬', nameHi: 'नींबू' },
    { nameEs: 'Mandarinas', nameEn: 'Mandarins', nameFr: 'Mandarines', nameDe: 'Mandarinen', namePt: 'Tangerinas', nameAr: 'يوسفي', nameZh: '橘子', nameHi: 'संतरा' },
    { nameEs: 'Pomelos', nameEn: 'Grapefruits', nameFr: 'Pamplemousses', nameDe: 'Grapefruits', namePt: 'Toranjas', nameAr: 'جريب فروت', nameZh: '柚子', nameHi: 'चकोतरा' },
    { nameEs: 'Nectarinas', nameEn: 'Nectarines', nameFr: 'Nectarines', nameDe: 'Nektarinen', namePt: 'Nectarinas', nameAr: 'نكتارين', nameZh: '油桃', nameHi: 'नेक्टेरिन' },
    { nameEs: 'Melocotones', nameEn: 'Peaches', nameFr: 'Pêches', nameDe: 'Pfirsiche', namePt: 'Pêssegos', nameAr: 'خوخ', nameZh: '桃子', nameHi: 'आड़ू' },
    { nameEs: 'Mangos', nameEn: 'Mangoes', nameFr: 'Mangues', nameDe: 'Mangos', namePt: 'Mangas', nameAr: 'مانجو', nameZh: '芒果', nameHi: 'आम' },
    { nameEs: 'Kakis', nameEn: 'Persimmons', nameFr: 'Kakis', nameDe: 'Kakis', namePt: 'Caquis', nameAr: 'كاكي', nameZh: '柿子', nameHi: 'ख़ुरमा' }
  ];

  console.log('\n📦 Creando frutas...');
  for (const fruit of fruits) {
    try {
      await axios.post(`${API_URL}/fruits`, fruit, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log(`✅ ${fruit.nameEs} creada`);
    } catch (error) {
      console.log(`⚠️  ${fruit.nameEs} - ya existe o error`);
    }
  }
};

const createMarkets = async () => {
  const markets = [
    { name: 'Mercabarna', country: 'Spain', city: 'Barcelona', continent: 'Europe', latitude: 41.3522, longitude: 2.1287 },
    { name: 'Mercamadrid', country: 'Spain', city: 'Madrid', continent: 'Europe', latitude: 40.3701, longitude: -3.6756 },
    { name: 'Mercavalencia', country: 'Spain', city: 'Valencia', continent: 'Europe', latitude: 39.4445, longitude: -0.3987 },
    { name: 'Großmarkt Hamburg', country: 'Germany', city: 'Hamburg', continent: 'Europe', latitude: 53.5511, longitude: 9.9937 },
    { name: 'Berliner Großmarkt', country: 'Germany', city: 'Berlin', continent: 'Europe', latitude: 52.5200, longitude: 13.4050 },
    { name: 'Münchner Großmarkt', country: 'Germany', city: 'Munich', continent: 'Europe', latitude: 48.1351, longitude: 11.5820 },
    { name: 'Großmarkt Frankfurt', country: 'Germany', city: 'Frankfurt', continent: 'Europe', latitude: 50.1109, longitude: 8.6821 },
    { name: 'APMC Mumbai', country: 'India', city: 'Mumbai', continent: 'Asia', latitude: 19.0760, longitude: 72.8777 },
    { name: 'Azadpur Mandi', country: 'India', city: 'Delhi', continent: 'Asia', latitude: 28.7041, longitude: 77.1025 },
    { name: 'CEAGESP', country: 'Brazil', city: 'São Paulo', continent: 'South America', latitude: -23.5505, longitude: -46.6333 },
    { name: 'Mercado Central Buenos Aires', country: 'Argentina', city: 'Buenos Aires', continent: 'South America', latitude: -34.6037, longitude: -58.3816 },
    { name: 'Mercado Modelo', country: 'Uruguay', city: 'Montevideo', continent: 'South America', latitude: -34.9011, longitude: -56.1645 },
    { name: 'Mercado de Abasto', country: 'Paraguay', city: 'Asunción', continent: 'South America', latitude: -25.2637, longitude: -57.5759 }
  ];

  console.log('\n🌍 Creando mercados...');
  for (const market of markets) {
    try {
      await axios.post(`${API_URL}/markets`, market, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log(`✅ ${market.name} (${market.country}) creado`);
    } catch (error) {
      console.log(`⚠️  ${market.name} - ya existe o error`);
    }
  }
};

const run = async () => {
  console.log('🚀 Iniciando población de datos...\n');
  await login();
  if (token) {
    await createFruits();
    await createMarkets();
    console.log('\n✅ ¡Datos poblados exitosamente!');
  } else {
    console.log('❌ No se pudo hacer login');
  }
};

run();
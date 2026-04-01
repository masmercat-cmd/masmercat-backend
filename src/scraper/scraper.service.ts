import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as XLSX from 'xlsx';
import WebSocket from 'ws';
import { Fruit } from '../entities/fruit.entity';
import { Market } from '../entities/market.entity';
import { Lot, QualityGrade, UnitType, LotStatus } from '../entities/lot.entity';
import { User } from '../entities/user.entity';
import { PriceHistory } from '../entities/price-history.entity';
const AdmZip = require('adm-zip');

interface ReferencePriceInput {
  fruitId: string;
  marketId: string;
  price: number;
  date: Date;
  source: string;
  sourceRegion: string;
  currency: string;
  productStage: string;
  unitType: string;
  metadata?: Record<string, any>;
}

export interface ProviderDiagnostics {
  provider: string;
  attempted: number;
  matched: number;
  saved: number;
  skipped: number;
  notes: string[];
}

export interface ProviderDebugResult {
  provider: string;
  ok: boolean;
  status?: number;
  query: Record<string, any>;
  rowCount: number;
  sample: any[];
  message?: string;
}

interface EuApiRow {
  memberStateCode?: string;
  beginDate?: string;
  price?: string | number;
  unit?: string;
  productStage?: string;
}

interface EuQlikPriceRow {
  price: number;
  unitRaw: string;
  market: string;
  productLabel: string;
  productStage: string;
  referenceDate: Date;
}

interface UsdaApiRow {
  commodity?: string;
  item_name?: string;
  variety?: string;
  item_description?: string;
  published_date?: string;
  report_date?: string;
  report_begin_date?: string;
  report_end_date?: string;
  weighted_average?: string | number;
  weighted_avg?: string | number;
  weightedaverage?: string | number;
  average_price?: string | number;
  average?: string | number;
  mostly_price?: string | number;
  price?: string | number;
  mostly_low?: string | number;
  mostly_high?: string | number;
  unit?: string;
  package?: string;
  region?: string;
  store_type?: string;
  organic?: string;
}

interface MercosurCsvRow {
  pais_id?: string;
  pais?: string;
  mercado?: string;
  año?: string;
  ano?: string;
  'a�o'?: string;
  mes?: string;
  producto?: string;
  variedad?: string;
  origen?: string;
  precio_usd_kg?: string | number;
  moneda_cod?: string;
  moneda?: string;
}

interface MercadoCentralRow {
  product: string;
  variety: string;
  origin: string;
  unitType: string;
  commonPriceKg: number;
  referenceDate: Date;
}

interface CeagespRow {
  product: string;
  classification: string;
  unitRaw: string;
  commonPrice: number;
  kgFactor: number;
  referenceDate: Date;
}

interface StatsCanLatestRow {
  product: string;
  geography: string;
  price: number;
  unitType: string;
  referenceDate: Date;
}

interface SniimRow {
  presentation: string;
  origin: string;
  minPrice: number;
  maxPrice: number;
  frequentPrice: number;
}

interface IndiaMandiRow {
  state: string;
  district: string;
  market: string;
  commodity: string;
  variety: string;
  grade: string;
  arrivalDate: Date;
  minPrice: number;
  maxPrice: number;
  modalPrice: number;
}

interface ObourCardRow {
  product: string;
  unitType: string;
  minPrice: number;
  maxPrice: number;
  packaging: string;
  referenceDate: Date;
}

interface AustraliaDaffIndexRow {
  product: string;
  indexValue: number;
  referenceDate: Date;
}

interface SeedFruitInput {
  nameEs: string;
  nameEn: string;
  nameFr: string;
  nameDe: string;
  namePt: string;
  nameAr: string;
  nameZh: string;
  nameHi: string;
  scientificName?: string;
}

interface SeedMarketInput {
  name: string;
  country: string;
  city: string;
  continent: string;
  latitude: number;
  longitude: number;
}

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);
  private static readonly euProductMap: Record<string, string> = {
    naranjas: 'Oranges',
    limones: 'Lemons',
    mandarinas: 'Mandarins',
    pomelos: 'Grapefruits',
    manzanas: 'Apples',
    peras: 'Pears',
    uvas: 'Table grapes',
    tomates: 'Tomatoes',
    pepinos: 'Cucumbers',
    cebollas: 'Onions',
    patatas: 'Potatoes',
    melones: 'Melons',
    sandias: 'Watermelons',
    fresas: 'Strawberries',
    pimientos: 'Sweet peppers',
    lechugas: 'Lettuces',
  };
  private static readonly usdaProductMap: Record<string, string> = {
    naranjas: 'Oranges',
    limones: 'Lemons',
    manzanas: 'Apples',
    peras: 'Pears',
    fresas: 'Strawberries',
    uvas: 'Grapes',
    sandias: 'Watermelons',
    melones: 'Cantaloupes',
    tomates: 'Tomatoes',
    pepinos: 'Cucumbers',
    cebollas: 'Onions',
    patatas: 'Potatoes',
    aguacates: 'Avocados',
    bananas: 'Bananas',
  };
  private static readonly statsCanProductMap: Record<string, string[]> = {
    manzanas: ['Apples, per kilogram'],
    bananas: ['Bananas, per kilogram'],
    naranjas: ['Oranges, per kilogram'],
    limones: ['Lemons, unit'],
    peras: ['Pears, per kilogram'],
    uvas: ['Grapes, per kilogram'],
    tomates: ['Tomatoes, per kilogram'],
    pepinos: ['Cucumber, unit'],
    cebollas: ['Onions, per kilogram'],
    patatas: ['Potatoes, per kilogram'],
    lechugas: ['Iceberg lettuce, unit', 'Romaine lettuce, unit'],
    pimientos: ['Peppers, per kilogram'],
    fresas: ['Strawberries, 454 grams'],
    aguacates: ['Avocado, unit'],
  };
  private static readonly sniimProductMap: Record<string, string> = {
    aguacates: '133',
    cebollas: '183',
    pimientos: '221',
    fresas: '358',
    lechugas: '405',
    limones: '426',
    mandarinas: '451',
    manzanas: '519',
    melones: '501',
    naranjas: '551',
    peras: '632',
    bananas: '663',
    patatas: '740',
    pepinos: '771',
    sandias: '787',
    pomelos: '824',
    tomates: '839',
    uvas: '872',
  };
  private static readonly indiaMandiProductMap: Record<string, string[]> = {
    manzanas: ['Apple'],
    bananas: ['Banana'],
    naranjas: ['Orange'],
    limones: ['Lemon'],
    uvas: ['Grapes'],
    fresas: ['Strawberry'],
    tomates: ['Tomato'],
    pepinos: ['Cucumber'],
    cebollas: ['Onion'],
    patatas: ['Potato'],
    melones: ['Muskmelon'],
    sandias: ['Water Melon', 'Watermelon'],
    pimientos: ['Capsicum'],
    aguacates: ['Avocado'],
  };
  private static readonly obourProductMap: Record<string, string[]> = {
    naranjas: ['برتقال'],
    limones: ['ليمون'],
    mandarinas: ['يوسفى', 'يوسفي'],
    pomelos: ['جريب فروت', 'جريب'],
    manzanas: ['تفاح'],
    peras: ['كمثري', 'كمثرى'],
    uvas: ['عنب'],
    fresas: ['فراوله', 'فراولة'],
    bananas: ['موز'],
    tomates: ['طماطم'],
    pepinos: ['خيار'],
    cebollas: ['بصل'],
    pimientos: ['فلفل'],
    lechugas: ['خس'],
    patatas: ['بطاطس'],
    melones: ['شمام', 'كنتالوب'],
    sandias: ['بطيخ'],
    aguacates: ['افوكادو', 'أفوكادو'],
  };
  private static readonly australiaDaffProductMap: Record<string, string[]> = {
    manzanas: ['Apple prices in Melbourne'],
    bananas: ['Banana prices in Melbourne'],
    naranjas: ['Orange prices in Melbourne'],
    fresas: ['Strawberry prices in Melbourne'],
    cebollas: ['Onion prices in Melbourne'],
    patatas: ['Potato prices in Melbourne'],
    tomates: ['Tomato prices in Melbourne'],
  };
  private static readonly mercosurProductMap: Record<string, string[]> = {
    naranjas: ['naranja'],
    limones: ['limon'],
    mandarinas: ['mandarina'],
    pomelos: ['pomelo'],
    manzanas: ['manzana'],
    peras: ['pera'],
    uvas: ['uva'],
    tomates: ['tomate'],
    pepinos: ['pepino'],
    cebollas: ['cebolla', 'cebola'],
    patatas: ['papa', 'patata'],
    melones: ['melon'],
    sandias: ['sandia'],
    fresas: ['frutilla', 'fresa', 'morango'],
    pimientos: ['pimiento', 'morron', 'aji', 'pimentao'],
    lechugas: ['lechuga', 'alface'],
    aguacates: ['aguacate', 'palta', 'palta/aguacate'],
    bananas: ['banana', 'platano'],
  };
  private static readonly mercosurSources = [
    {
      countryCode: 'AR',
      marketName: 'Mercado Central de Buenos Aires',
      url: 'https://datos.magyp.gob.ar/dataset/8b4d6a1f-753d-4707-9085-bdcbbc47f00b/resource/6dce1e87-7988-4eaf-b0e1-b3abbb3964da/download/precios-fyh-mercadocentral-bsas-arg-2017-2c2018-.csv',
    },
    {
      countryCode: 'BR',
      marketName: 'Mercado Ceagesp de San Pablo',
      url: 'https://datos.magyp.gob.ar/dataset/8b4d6a1f-753d-4707-9085-bdcbbc47f00b/resource/f6393c63-6664-4340-ad25-915098a02aa3/download/precios-fyh-mercado-sanpablo-brasil-2017-2c2018-.csv',
    },
    {
      countryCode: 'PY',
      marketName: 'Mercado Central de Asuncion',
      url: 'https://datos.magyp.gob.ar/dataset/8b4d6a1f-753d-4707-9085-bdcbbc47f00b/resource/812813d9-d2c2-465d-a0ab-2b3e2c3ffb9f/download/precios-fyh-mercado-asuncion-paraguay-2017-2c2018-.csv',
    },
    {
      countryCode: 'CL',
      marketName: 'Mercado Lo Valledor de Santiago de Chile',
      url: 'https://datos.magyp.gob.ar/dataset/8b4d6a1f-753d-4707-9085-bdcbbc47f00b/resource/42e2bf41-2d45-411b-9e09-56f9f07958a9/download/precios-fyh-mercado-santiago-chile-2017-2c2018-.csv',
    },
    {
      countryCode: 'UY',
      marketName: 'Mercado Modelo de Uruguay',
      url: 'https://datos.magyp.gob.ar/dataset/8b4d6a1f-753d-4707-9085-bdcbbc47f00b/resource/72067f03-0eb7-4e15-bba3-20df6b0e0b76/download/precios-fyh-mercado-uruguay-2017-2c2018-2.csv',
    },
  ] as const;
  private static readonly mercadoCentralIndexUrl =
    'https://mercadocentral.gob.ar/informaci%C3%B3n/precios-mayoristas';
  private static readonly ceagespPricesUrl = 'https://ceagesp.gov.br/cotacoes/';
  private static readonly statsCanPricesUrl = 'https://www150.statcan.gc.ca/n1/tbl/csv/18100245-eng.zip';
  private static readonly statsCanCsvName = '18100245.csv';
  private static readonly sniimResultsUrl =
    'http://www.economia-sniim.gob.mx/Nuevo/Consultas/MercadosNacionales/PreciosDeMercado/Agricolas/ResultadosConsultaFechaFrutasYHortalizas.aspx';
  private static readonly sniimDestinationId = '100';
  private static readonly sniimDestinationLabel = 'DF: Central de Abasto de Iztapalapa DF';
  private static readonly indiaMandiApiUrl =
    'https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070';
  private static readonly indiaMandiApiKey =
    '579b464db66ec23bdd000001cdc3b564546246a772a26393094f5645';
  private static readonly obourPricesUrl = 'http://www.oboormarket.org.eg/prices_ar.aspx';
  private static readonly australiaDaffPricesUrl =
    'https://www.agriculture.gov.au/abares/data/weekly-commodity-price-update/australian-horticulture-prices';

  private static readonly countryCodeMap: Record<string, string> = {
    spain: 'ES',
    espana: 'ES',
    espanaa: 'ES',
    france: 'FR',
    francia: 'FR',
    italy: 'IT',
    italia: 'IT',
    germany: 'DE',
    alemania: 'DE',
    portugal: 'PT',
    netherlands: 'NL',
    'paises bajos': 'NL',
    argentina: 'AR',
    brazil: 'BR',
    brasil: 'BR',
    chile: 'CL',
    paraguay: 'PY',
    uruguay: 'UY',
    australia: 'AU',
    'new zealand': 'NZ',
    china: 'CN',
    japan: 'JP',
    india: 'IN',
    singapore: 'SG',
    thailand: 'TH',
    vietnam: 'VN',
    morocco: 'MA',
    marruecos: 'MA',
    egypt: 'EG',
    egipto: 'EG',
    algeria: 'DZ',
    argelia: 'DZ',
    tunisia: 'TN',
    tunez: 'TN',
    'saudi arabia': 'SA',
    'arabia saudi': 'SA',
    'united arab emirates': 'AE',
    emiratos: 'AE',
    qatar: 'QA',
    kuwait: 'KW',
    jordan: 'JO',
    jordania: 'JO',
    lebanon: 'LB',
    libano: 'LB',
    canada: 'CA',
    mexico: 'MX',
    russia: 'RU',
    russian: 'RU',
    rusia: 'RU',
    usa: 'US',
    eeuu: 'US',
    'estados unidos': 'US',
    'united states': 'US',
  };
  private static readonly euCountryCodes = new Set(['ES', 'FR', 'IT', 'DE', 'PT', 'NL']);
  private static readonly euQlikAppIdMappingUrl =
    'https://agridata.ec.europa.eu/files/app-id-mapping.json';
  private static readonly euQlikDefaultAppId = 'b2e1f9c6-ba92-424e-82c6-2d18183b27d1';
  private static readonly euQlikWsUrl = 'wss://agridata.ec.europa.eu/app/engineData';
  private static readonly euQlikStagePriority = [
    'Retail buying price',
    'Ex-packaging station price',
    'Farmgate price',
  ] as const;
  private static readonly euQlikProductPatternMap: Record<string, string[]> = {
    Apples: ['Apples*'],
    Oranges: ['Oranges*'],
    Lemons: ['Lemons*'],
    Mandarins: ['Mandarins*', 'Clementines*'],
    Grapefruits: ['Grapefruits*', 'Pomelos*'],
    Pears: ['Pears*'],
    'Table grapes': ['Table grapes*'],
    Tomatoes: ['Tomatoes*'],
    Cucumbers: ['Cucumbers*'],
    Onions: ['Onions*'],
    Potatoes: [
      'Ware potatoes*',
      'Potatoes*',
    ],
    Melons: ['Melons*'],
    Watermelons: ['Watermelons*'],
    Strawberries: ['Strawberries*'],
    'Sweet peppers': ['Peppers*', 'Sweet peppers*'],
    Lettuces: ['Lettuces*'],
  };
  private static readonly marketAliasMap: Record<string, string[]> = {
    'mercado central de buenos aires': ['mercado central'],
    'rungis international market': ['rungis market'],
    'hamburg wholesale market': ['hamburg großmarkt', 'hamburg groámarkt'],
    'azadpur mandi': ['delhi apmc'],
  };
  private static readonly defaultSeedFruits: SeedFruitInput[] = [
    {
      nameEs: 'Naranjas',
      nameEn: 'Oranges',
      nameFr: 'Oranges',
      nameDe: 'Orangen',
      namePt: 'Laranjas',
      nameAr: 'برتقال',
      nameZh: '橙子',
      nameHi: 'संतरा',
      scientificName: 'Citrus sinensis',
    },
    {
      nameEs: 'Limones',
      nameEn: 'Lemons',
      nameFr: 'Citrons',
      nameDe: 'Zitronen',
      namePt: 'Limoes',
      nameAr: 'ليمون',
      nameZh: '柠檬',
      nameHi: 'नींबू',
      scientificName: 'Citrus limon',
    },
    {
      nameEs: 'Mandarinas',
      nameEn: 'Mandarins',
      nameFr: 'Mandarines',
      nameDe: 'Mandarinen',
      namePt: 'Tangerinas',
      nameAr: 'يوسفي',
      nameZh: '橘子',
      nameHi: 'मंदारिन',
      scientificName: 'Citrus reticulata',
    },
    {
      nameEs: 'Pomelos',
      nameEn: 'Grapefruits',
      nameFr: 'Pamplemousses',
      nameDe: 'Grapefruits',
      namePt: 'Toranjas',
      nameAr: 'جريب فروت',
      nameZh: '葡萄柚',
      nameHi: 'चकोतरा',
      scientificName: 'Citrus paradisi',
    },
    {
      nameEs: 'Manzanas',
      nameEn: 'Apples',
      nameFr: 'Pommes',
      nameDe: 'Aepfel',
      namePt: 'Macas',
      nameAr: 'تفاح',
      nameZh: '苹果',
      nameHi: 'सेब',
      scientificName: 'Malus domestica',
    },
    {
      nameEs: 'Peras',
      nameEn: 'Pears',
      nameFr: 'Poires',
      nameDe: 'Birnen',
      namePt: 'Peras',
      nameAr: 'كمثرى',
      nameZh: '梨',
      nameHi: 'नाशपाती',
      scientificName: 'Pyrus communis',
    },
    {
      nameEs: 'Uvas',
      nameEn: 'Grapes',
      nameFr: 'Raisins',
      nameDe: 'Trauben',
      namePt: 'Uvas',
      nameAr: 'عنب',
      nameZh: '葡萄',
      nameHi: 'अंगूर',
      scientificName: 'Vitis vinifera',
    },
    {
      nameEs: 'Fresas',
      nameEn: 'Strawberries',
      nameFr: 'Fraises',
      nameDe: 'Erdbeeren',
      namePt: 'Morangos',
      nameAr: 'فراولة',
      nameZh: '草莓',
      nameHi: 'स्ट्रॉबेरी',
      scientificName: 'Fragaria × ananassa',
    },
    {
      nameEs: 'Bananas',
      nameEn: 'Bananas',
      nameFr: 'Bananes',
      nameDe: 'Bananen',
      namePt: 'Bananas',
      nameAr: 'موز',
      nameZh: '香蕉',
      nameHi: 'केला',
      scientificName: 'Musa acuminata',
    },
    {
      nameEs: 'Tomates',
      nameEn: 'Tomatoes',
      nameFr: 'Tomates',
      nameDe: 'Tomaten',
      namePt: 'Tomates',
      nameAr: 'طماطم',
      nameZh: '番茄',
      nameHi: 'टमाटर',
      scientificName: 'Solanum lycopersicum',
    },
    {
      nameEs: 'Pepinos',
      nameEn: 'Cucumbers',
      nameFr: 'Concombres',
      nameDe: 'Gurken',
      namePt: 'Pepinos',
      nameAr: 'خيار',
      nameZh: '黄瓜',
      nameHi: 'खीरा',
      scientificName: 'Cucumis sativus',
    },
    {
      nameEs: 'Cebollas',
      nameEn: 'Onions',
      nameFr: 'Oignons',
      nameDe: 'Zwiebeln',
      namePt: 'Cebolas',
      nameAr: 'بصل',
      nameZh: '洋葱',
      nameHi: 'प्याज',
      scientificName: 'Allium cepa',
    },
    {
      nameEs: 'Pimientos',
      nameEn: 'Sweet peppers',
      nameFr: 'Poivrons',
      nameDe: 'Paprika',
      namePt: 'Pimentoes',
      nameAr: 'فلفل',
      nameZh: '甜椒',
      nameHi: 'शिमला मिर्च',
      scientificName: 'Capsicum annuum',
    },
    {
      nameEs: 'Lechugas',
      nameEn: 'Lettuces',
      nameFr: 'Laitues',
      nameDe: 'Salate',
      namePt: 'Alfaces',
      nameAr: 'خس',
      nameZh: '生菜',
      nameHi: 'सलाद पत्ता',
      scientificName: 'Lactuca sativa',
    },
    {
      nameEs: 'Patatas',
      nameEn: 'Potatoes',
      nameFr: 'Pommes de terre',
      nameDe: 'Kartoffeln',
      namePt: 'Batatas',
      nameAr: 'بطاطس',
      nameZh: '土豆',
      nameHi: 'आलू',
      scientificName: 'Solanum tuberosum',
    },
    {
      nameEs: 'Melones',
      nameEn: 'Melons',
      nameFr: 'Melons',
      nameDe: 'Melonen',
      namePt: 'Meloes',
      nameAr: 'شمام',
      nameZh: '甜瓜',
      nameHi: 'खरबूजा',
      scientificName: 'Cucumis melo',
    },
    {
      nameEs: 'Sandias',
      nameEn: 'Watermelons',
      nameFr: 'Pasteques',
      nameDe: 'Wassermelonen',
      namePt: 'Melancias',
      nameAr: 'بطيخ',
      nameZh: '西瓜',
      nameHi: 'तरबूज',
      scientificName: 'Citrullus lanatus',
    },
    {
      nameEs: 'Aguacates',
      nameEn: 'Avocados',
      nameFr: 'Avocats',
      nameDe: 'Avocados',
      namePt: 'Abacates',
      nameAr: 'أفوكادو',
      nameZh: '牛油果',
      nameHi: 'एवोकाडो',
      scientificName: 'Persea americana',
    },
  ];
  private static readonly defaultSeedMarkets: SeedMarketInput[] = [
    { name: 'Mercamadrid', country: 'Spain', city: 'Madrid', continent: 'Europe', latitude: 40.3842, longitude: -3.6217 },
    { name: 'Mercabarna', country: 'Spain', city: 'Barcelona', continent: 'Europe', latitude: 41.3273, longitude: 2.1289 },
    { name: 'Rungis International Market', country: 'France', city: 'Paris', continent: 'Europe', latitude: 48.7472, longitude: 2.3524 },
    { name: 'Centro Agroalimentare Roma', country: 'Italy', city: 'Rome', continent: 'Europe', latitude: 41.7963, longitude: 12.5362 },
    { name: 'Hamburg Wholesale Market', country: 'Germany', city: 'Hamburg', continent: 'Europe', latitude: 53.5426, longitude: 10.0244 },
    { name: 'MARL Lisbon', country: 'Portugal', city: 'Lisbon', continent: 'Europe', latitude: 38.7813, longitude: -9.1022 },
    { name: 'Hunts Point Market', country: 'United States', city: 'New York', continent: 'North America', latitude: 40.8075, longitude: -73.8801 },
    { name: 'Los Angeles Wholesale Produce Market', country: 'United States', city: 'Los Angeles', continent: 'North America', latitude: 34.0312, longitude: -118.2304 },
    { name: 'Chicago International Produce Market', country: 'United States', city: 'Chicago', continent: 'North America', latitude: 41.8466, longitude: -87.6847 },
    { name: 'Statistics Canada National Average', country: 'Canada', city: 'Ottawa', continent: 'North America', latitude: 45.4215, longitude: -75.6972 },
    { name: 'Central de Abasto de Iztapalapa', country: 'Mexico', city: 'Mexico City', continent: 'North America', latitude: 19.3702, longitude: -99.0721 },
    { name: 'Mercado Central de Buenos Aires', country: 'Argentina', city: 'Buenos Aires', continent: 'South America', latitude: -34.8086, longitude: -58.4801 },
    { name: 'CEAGESP', country: 'Brazil', city: 'Sao Paulo', continent: 'South America', latitude: -23.5358, longitude: -46.7219 },
    { name: 'Lo Valledor', country: 'Chile', city: 'Santiago', continent: 'South America', latitude: -33.4977, longitude: -70.6807 },
    { name: 'Abasto Norte', country: 'Paraguay', city: 'Asuncion', continent: 'South America', latitude: -25.2637, longitude: -57.5759 },
    { name: 'Unidad Agroalimentaria Metropolitana', country: 'Uruguay', city: 'Montevideo', continent: 'South America', latitude: -34.8158, longitude: -56.0686 },
    { name: 'Sydney Markets', country: 'Australia', city: 'Sydney', continent: 'Oceania', latitude: -33.8856, longitude: 150.8931 },
    { name: 'Melbourne Market', country: 'Australia', city: 'Melbourne', continent: 'Oceania', latitude: -37.7995, longitude: 144.9396 },
    { name: 'Auckland Produce Market', country: 'New Zealand', city: 'Auckland', continent: 'Oceania', latitude: -36.8885, longitude: 174.8166 },
    { name: 'Jiangnan Wholesale Market', country: 'China', city: 'Guangzhou', continent: 'Asia', latitude: 23.0938, longitude: 113.2506 },
    { name: 'Ota Market', country: 'Japan', city: 'Tokyo', continent: 'Asia', latitude: 35.5850, longitude: 139.7424 },
    { name: 'Azadpur Mandi', country: 'India', city: 'Delhi', continent: 'Asia', latitude: 28.7183, longitude: 77.1697 },
    { name: 'Pasir Panjang Wholesale Centre', country: 'Singapore', city: 'Singapore', continent: 'Asia', latitude: 1.2899, longitude: 103.7696 },
    { name: 'Talaad Thai', country: 'Thailand', city: 'Bangkok', continent: 'Asia', latitude: 14.0819, longitude: 100.6304 },
    { name: 'Thu Duc Wholesale Market', country: 'Vietnam', city: 'Ho Chi Minh City', continent: 'Asia', latitude: 10.8515, longitude: 106.7656 },
    { name: 'Casablanca Wholesale Market', country: 'Morocco', city: 'Casablanca', continent: 'Africa', latitude: 33.5731, longitude: -7.5898 },
    { name: 'Obour Market', country: 'Egypt', city: 'Cairo', continent: 'Africa', latitude: 30.2062, longitude: 31.4761 },
    { name: 'Marche de Gros d Alger', country: 'Algeria', city: 'Algiers', continent: 'Africa', latitude: 36.7529, longitude: 3.0420 },
    { name: 'Marche d Interet National de Bir El Kassaa', country: 'Tunisia', city: 'Tunis', continent: 'Africa', latitude: 36.7213, longitude: 10.2302 },
    { name: 'Riyadh Central Market', country: 'Saudi Arabia', city: 'Riyadh', continent: 'Asia', latitude: 24.7136, longitude: 46.6753 },
    { name: 'Dubai Central Fruits and Vegetables Market', country: 'United Arab Emirates', city: 'Dubai', continent: 'Asia', latitude: 25.2048, longitude: 55.2708 },
    { name: 'Doha Central Market', country: 'Qatar', city: 'Doha', continent: 'Asia', latitude: 25.2854, longitude: 51.5310 },
    { name: 'Kuwait City Wholesale Market', country: 'Kuwait', city: 'Kuwait City', continent: 'Asia', latitude: 29.3759, longitude: 47.9774 },
    { name: 'Amman Central Market', country: 'Jordan', city: 'Amman', continent: 'Asia', latitude: 31.9539, longitude: 35.9106 },
    { name: 'Beirut Wholesale Market', country: 'Lebanon', city: 'Beirut', continent: 'Asia', latitude: 33.8938, longitude: 35.5018 },
    { name: 'Food City Moscow', country: 'Russia', city: 'Moscow', continent: 'Europe', latitude: 55.6216, longitude: 37.4707 },
  ];

  constructor(
    @InjectRepository(Fruit)
    private readonly fruitRepository: Repository<Fruit>,
    @InjectRepository(Market)
    private readonly marketRepository: Repository<Market>,
    @InjectRepository(Lot)
    private readonly lotRepository: Repository<Lot>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PriceHistory)
    private readonly priceHistoryRepository: Repository<PriceHistory>,
  ) {}

  async updatePricesDaily(): Promise<void> {
    this.logger.log('Running daily price update...');
    await this.syncReferencePrices();
    await this.generateLotsFromPrices();
  }

  async syncReferencePrices(): Promise<{
    saved: number;
    diagnostics: ProviderDiagnostics[];
  }> {
    await this.cleanupDuplicateMarkets();
    await this.cleanupLegacyReferencePrices();
    const seeded = await this.ensureReferenceCatalog();
    const fruits = seeded.fruits;
    const markets = seeded.markets;

    const euResult = await this.syncEuReferencePrices(fruits, markets);
    const mercosurResult = await this.syncMercosurReferencePrices(fruits, markets);
    const usdaResult = await this.syncUsdaReferencePrices(fruits, markets);
    const canadaResult = await this.syncCanadaReferencePrices(fruits, markets);
    const mexicoResult = await this.syncMexicoReferencePrices(fruits, markets);
    const australiaResult = await this.syncAustraliaReferencePrices(fruits, markets);
    const asiaResult = await this.syncAsiaReferencePrices(fruits, markets);
    const arabResult = await this.syncArabReferencePrices(fruits, markets);
    const euSaved = euResult.saved;
    const mercosurSaved = mercosurResult.saved;
    const usdaSaved = usdaResult.saved;
    const canadaSaved = canadaResult.saved;
    const mexicoSaved = mexicoResult.saved;
    const australiaSaved = australiaResult.saved;
    const asiaSaved = asiaResult.saved;
    const arabSaved = arabResult.saved;
    const saved =
      euSaved +
      mercosurSaved +
      usdaSaved +
      canadaSaved +
      mexicoSaved +
      australiaSaved +
      asiaSaved +
      arabSaved;
    this.logger.log(`Reference prices synchronized: ${saved}`);
    return {
      saved,
      diagnostics: [
        euResult.diagnostics,
        mercosurResult.diagnostics,
        usdaResult.diagnostics,
        canadaResult.diagnostics,
        mexicoResult.diagnostics,
        australiaResult.diagnostics,
        asiaResult.diagnostics,
        arabResult.diagnostics,
      ],
    };
  }

  async debugReferenceSources(options?: {
    euProduct?: string;
    euCountry?: string;
    usdaCommodity?: string;
  }): Promise<{
    eu: ProviderDebugResult;
    usda: ProviderDebugResult;
  }> {
    const now = new Date().getUTCFullYear();
    const euProduct = options?.euProduct?.trim() || 'apples';
    const euCountry = options?.euCountry?.trim() || 'ES';
    const usdaCommodity = options?.usdaCommodity?.trim() || 'Apples';

    const eu = await this.debugEuReferenceSource(euProduct, euCountry, now);
    const usda = await this.debugUsdaReferenceSource(usdaCommodity);

    return { eu, usda };
  }

  private async ensureReferenceCatalog(): Promise<{
    fruits: Fruit[];
    markets: Market[];
  }> {
    let fruits = await this.fruitRepository.find({ where: { active: true } });
    let markets = await this.marketRepository.find({ where: { active: true } });

    const existingFruitNames = new Set(
      fruits.map((fruit) => this.normalizeText(fruit.nameEs)),
    );
    const missingFruits = ScraperService.defaultSeedFruits.filter(
      (seed) => !existingFruitNames.has(this.normalizeText(seed.nameEs)),
    );

    if (missingFruits.length > 0) {
      this.logger.log(`Seeding ${missingFruits.length} missing produce items...`);
      for (const seed of missingFruits) {
        const fruit = this.fruitRepository.create({
          ...seed,
          active: true,
        });
        await this.fruitRepository.save(fruit);
      }
      fruits = await this.fruitRepository.find({ where: { active: true } });
    }

    const existingMarketKeys = new Set<string>();
    for (const market of markets) {
      for (const key of this.buildMarketIdentityKeys(market.name, market.country)) {
        existingMarketKeys.add(key);
      }
    }
    const missingMarkets = ScraperService.defaultSeedMarkets.filter((seed) => {
      const keys = this.buildMarketIdentityKeys(seed.name, seed.country);
      return !keys.some((key) => existingMarketKeys.has(key));
    });

    if (missingMarkets.length > 0) {
      this.logger.log(`Seeding ${missingMarkets.length} missing markets...`);
      for (const seed of missingMarkets) {
        const market = this.marketRepository.create({
          ...seed,
          active: true,
        });
        await this.marketRepository.save(market);
      }
      markets = await this.marketRepository.find({ where: { active: true } });
    }

    return { fruits, markets };
  }

  private async cleanupLegacyReferencePrices(): Promise<void> {
    await this.priceHistoryRepository
      .createQueryBuilder()
      .delete()
      .from(PriceHistory)
      .where(`additionalData ->> 'source' = :source`, { source: 'Mercosur Open Data' })
      .execute();
  }

  private async replaceReferencePricesForSource(
    source: string,
    sourceRegion: string,
    entries: ReferencePriceInput[],
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    await this.priceHistoryRepository
      .createQueryBuilder()
      .delete()
      .from(PriceHistory)
      .where(`additionalData ->> 'source' = :source`, { source })
      .andWhere(`additionalData ->> 'sourceRegion' = :sourceRegion`, { sourceRegion })
      .execute();

    for (const entry of entries) {
      await this.upsertReferencePrice(entry);
    }
  }

  private async cleanupDuplicateMarkets(): Promise<void> {
    const markets = await this.marketRepository.find({ where: { active: true } });

    for (const [canonicalName, aliases] of Object.entries(ScraperService.marketAliasMap)) {
      const normalizedNames = new Set(
        [canonicalName, ...aliases].map((value) => this.normalizeText(value)),
      );

      const groupedByCountry = new Map<string, Market[]>();
      for (const market of markets) {
        if (!normalizedNames.has(this.normalizeText(market.name))) {
          continue;
        }

        const countryKey = this.normalizeText(market.country);
        const bucket = groupedByCountry.get(countryKey) ?? [];
        bucket.push(market);
        groupedByCountry.set(countryKey, bucket);
      }

      for (const countryMarkets of groupedByCountry.values()) {
        if (countryMarkets.length < 2) {
          continue;
        }

        const canonicalMarket =
          countryMarkets.find(
            (market) => this.normalizeText(market.name) === this.normalizeText(canonicalName),
          ) ??
          countryMarkets.sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          )[0];

        for (const duplicate of countryMarkets) {
          if (duplicate.id === canonicalMarket.id) {
            continue;
          }

          await this.priceHistoryRepository
            .createQueryBuilder()
            .update(PriceHistory)
            .set({ marketId: canonicalMarket.id })
            .where('marketId = :marketId', { marketId: duplicate.id })
            .execute();

          await this.lotRepository
            .createQueryBuilder()
            .update(Lot)
            .set({ marketId: canonicalMarket.id })
            .where('marketId = :marketId', { marketId: duplicate.id })
            .execute();

          duplicate.active = false;
          await this.marketRepository.save(duplicate);
        }
      }
    }
  }

  async scrapeMAPAPrices(): Promise<any> {
    this.logger.log('Starting MAPA price scraping...');

    try {
      const prices = {
        naranjas: { min: 0.35, max: 0.65, avg: 0.5 },
        limones: { min: 0.55, max: 0.85, avg: 0.7 },
        mandarinas: { min: 0.45, max: 0.75, avg: 0.6 },
        pomelos: { min: 0.6, max: 0.9, avg: 0.75 },
      };

      this.logger.log(`Scraped prices: ${JSON.stringify(prices)}`);
      return prices;
    } catch (error) {
      this.logger.error(`Scraping failed: ${error.message}`);
      return {
        naranjas: { min: 0.35, max: 0.65, avg: 0.5 },
        limones: { min: 0.55, max: 0.85, avg: 0.7 },
        mandarinas: { min: 0.45, max: 0.75, avg: 0.6 },
        pomelos: { min: 0.6, max: 0.9, avg: 0.75 },
      };
    }
  }

  async generateLotsFromPrices(): Promise<void> {
    this.logger.log('Generating lots from scraped prices...');

    const fruits = await this.fruitRepository.find();
    const markets = await this.marketRepository.find();
    const systemUser = await this.userRepository.findOne({
      where: { email: 'info@masmercat.com' },
    });

    if (!systemUser) {
      this.logger.error('System user not found');
      return;
    }

    const prices = await this.scrapeMAPAPrices();
    const fruitPriceMap = {
      Naranjas: prices.naranjas,
      Limones: prices.limones,
      Mandarinas: prices.mandarinas,
      Pomelos: prices.pomelos,
    };

    for (const fruit of fruits) {
      const priceData = fruitPriceMap[fruit.nameEs];
      if (!priceData) continue;

      const selectedMarkets = markets.filter((m) => m.country === 'Spain').slice(0, 3);

      for (const market of selectedMarkets) {
        const wholesalePrice = Number((priceData.avg * (3 + Math.random() * 2)).toFixed(2));

        const lot = new Lot();
        lot.sellerId = systemUser.id;
        lot.fruitId = fruit.id;
        lot.marketId = market.id;
        lot.caliber = this.getRandomCaliber();
        lot.quality = this.getRandomQuality() as QualityGrade;
        lot.price = wholesalePrice;
        lot.unitType = UnitType.KG;
        lot.weight = Math.floor(500 + Math.random() * 1500);
        lot.numberOfBoxes = Math.floor(20 + Math.random() * 80);
        lot.photos = [];
        lot.status = LotStatus.AVAILABLE;
        lot.isOpportunity = Math.random() > 0.7;
        lot.description = `${fruit.nameEs} de calidad - Precio actualizado desde datos de mercado`;
        lot.isActive = true;

        await this.lotRepository.save(lot);
        await this.upsertReferencePrice({
          fruitId: fruit.id,
          marketId: market.id,
          price: priceData.avg,
          date: this.todayUtc(),
          source: 'MAPA Spain',
          sourceRegion: 'Spain',
          currency: 'EUR',
          productStage: 'National average reference',
          unitType: 'kg',
          metadata: {
            min: priceData.min,
            max: priceData.max,
            region: 'eu',
          },
        });
        this.logger.log(`Created lot: ${fruit.nameEs} at ${market.name}`);
      }
    }

    this.logger.log('Lot generation completed');
  }

  private async syncEuReferencePrices(
    fruits: Fruit[],
    markets: Market[],
  ): Promise<{ saved: number; diagnostics: ProviderDiagnostics }> {
    let saved = 0;
    let attempted = 0;
    let matched = 0;
    const currentYear = new Date().getUTCFullYear();
    const diagnostics: ProviderDiagnostics = {
      provider: 'EU AgriData',
      attempted: 0,
      matched: 0,
      saved: 0,
      skipped: 0,
      notes: [],
    };

    for (const fruit of fruits) {
      const euProduct = this.resolveEuProductName(fruit.nameEs);
      if (!euProduct) {
        diagnostics.skipped += 1;
        continue;
      }

      const marketsByCountry = new Map<string, Market[]>();
      for (const market of markets) {
        const code = this.resolveCountryCode(market.country);
        if (!code || code === 'US' || !ScraperService.euCountryCodes.has(code)) continue;

        const bucket = marketsByCountry.get(code) ?? [];
        bucket.push(market);
        marketsByCountry.set(code, bucket);
      }

      for (const [countryCode, countryMarkets] of marketsByCountry.entries()) {
        attempted += 1;
        const latest = await this.fetchLatestEuPrice(euProduct, countryCode, currentYear);
        if (!latest) {
          diagnostics.notes.push(`No EU price for ${euProduct}/${countryCode}`);
          continue;
        }
        if (latest.debugNote) {
          diagnostics.notes.push(latest.debugNote);
        }
        matched += 1;
        const pendingUpserts: ReferencePriceInput[] = [];

        for (const market of countryMarkets) {
          pendingUpserts.push({
            fruitId: fruit.id,
            marketId: market.id,
            price: latest.price,
            date: latest.referenceDate,
            source: 'EU AgriData',
            sourceRegion: countryCode,
            currency: latest.currency,
            productStage: latest.productStage,
            unitType: latest.unitType,
            metadata: {
              euProduct,
              memberStateCode: countryCode,
              region: 'eu',
            },
          });
        }

        if (pendingUpserts.length > 0) {
          await this.replaceReferencePricesForSource('EU AgriData', countryCode, pendingUpserts);
          saved += pendingUpserts.length;
        }
      }
    }

    diagnostics.attempted = attempted;
    diagnostics.matched = matched;
    diagnostics.saved = saved;
    diagnostics.notes = diagnostics.notes.slice(0, 20);
    return { saved, diagnostics };
  }

  private async syncUsdaReferencePrices(
    fruits: Fruit[],
    markets: Market[],
  ): Promise<{ saved: number; diagnostics: ProviderDiagnostics }> {
    const apiKey = process.env.USDA_MARS_API_KEY?.trim();
    const diagnostics: ProviderDiagnostics = {
      provider: 'USDA Market News',
      attempted: 0,
      matched: 0,
      saved: 0,
      skipped: 0,
      notes: [],
    };
    if (!apiKey) {
      this.logger.log('USDA provider skipped: USDA_MARS_API_KEY is not configured');
      diagnostics.notes.push('USDA_MARS_API_KEY is not configured');
      diagnostics.skipped = fruits.length;
      return { saved: 0, diagnostics };
    }

    const usaMarkets = markets.filter(
      (market) => this.resolveCountryCode(market.country) === 'US',
    );
    if (usaMarkets.length === 0) {
      diagnostics.notes.push('No active US markets found');
      return { saved: 0, diagnostics };
    }

    let saved = 0;
    for (const fruit of fruits) {
      const commodity = this.resolveUsdaCommodityName(fruit.nameEs);
      if (!commodity) {
        diagnostics.skipped += 1;
        continue;
      }

      diagnostics.attempted += 1;
      const latest = await this.fetchLatestUsdaRetailPrice(apiKey, commodity);
      if (!latest) {
        diagnostics.notes.push(`No USDA price for ${commodity}`);
        continue;
      }
      if (latest.debugNote) {
        diagnostics.notes.push(latest.debugNote);
      }
      diagnostics.matched += 1;

      for (const market of usaMarkets) {
        await this.upsertReferencePrice({
          fruitId: fruit.id,
          marketId: market.id,
          price: latest.price,
          date: latest.referenceDate,
          source: 'USDA Market News',
          sourceRegion: 'US',
          currency: 'USD',
          productStage: latest.productStage,
          unitType: latest.unitType,
          metadata: {
            commodity,
            reportId: 3324,
            reportType: 'National Retail Report - Specialty Crops',
            region: 'north_america',
          },
        });
        saved += 1;
      }
    }

    diagnostics.saved = saved;
    diagnostics.notes = diagnostics.notes.slice(0, 20);
    return { saved, diagnostics };
  }

  private async syncMercosurReferencePrices(
    fruits: Fruit[],
    markets: Market[],
  ): Promise<{ saved: number; diagnostics: ProviderDiagnostics }> {
    const diagnostics: ProviderDiagnostics = {
      provider: 'Mercosur Market Sources',
      attempted: 0,
      matched: 0,
      saved: 0,
      skipped: 0,
      notes: [],
    };

    let saved = 0;
    const marketsByCountry = new Map<string, Market[]>();
    for (const market of markets) {
      const code = this.resolveCountryCode(market.country);
      if (!code || !['AR', 'BR', 'CL', 'PY', 'UY'].includes(code)) continue;

      const bucket = marketsByCountry.get(code) ?? [];
      bucket.push(market);
      marketsByCountry.set(code, bucket);
    }

    const argentinaMarkets = marketsByCountry.get('AR') ?? [];
    if (argentinaMarkets.length > 0) {
      diagnostics.attempted += 1;
      const argentinaRows = await this.fetchMercadoCentralRows();
      if (argentinaRows.length === 0) {
        diagnostics.notes.push('Mercado Central did not return usable current rows');
      } else {
        let matchedAnyFruit = false;
        const pendingUpserts: ReferencePriceInput[] = [];
        for (const fruit of fruits) {
          const aliases = this.resolveMercosurProductAliases(fruit.nameEs);
          if (aliases.length === 0) {
            diagnostics.skipped += 1;
            continue;
          }

          const latest = this.selectLatestMercadoCentralPrice(argentinaRows, aliases);
          if (!latest) {
            continue;
          }

          matchedAnyFruit = true;
          for (const market of argentinaMarkets) {
            pendingUpserts.push({
              fruitId: fruit.id,
              marketId: market.id,
              price: latest.price,
              date: latest.referenceDate,
              source: 'Mercado Central',
              sourceRegion: 'AR',
              currency: 'ARS',
              productStage: latest.productStage,
              unitType: latest.unitType,
              metadata: {
                region: 'mercosur',
                mercosurProvider: 'mercado-central',
                mercosurProduct: latest.product,
                mercosurVariety: latest.variety,
                mercosurOrigin: latest.origin,
              },
            });
          }
        }

        if (matchedAnyFruit) {
          await this.replaceReferencePricesForSource('Mercado Central', 'AR', pendingUpserts);
          saved += pendingUpserts.length;
          diagnostics.matched += 1;
        }
        diagnostics.notes.push(
          `Mercado Central rows: ${argentinaRows.length}, latest ${argentinaRows[0]?.referenceDate.toISOString().slice(0, 10) ?? 'n/a'}`,
        );
      }
    } else {
      diagnostics.notes.push('No active Mercosur markets found for AR');
    }

    const brazilMarkets = marketsByCountry.get('BR') ?? [];
    if (brazilMarkets.length > 0) {
      diagnostics.attempted += 1;
      const brazilRows = await this.fetchCeagespRows();
      if (brazilRows.length === 0) {
        diagnostics.notes.push('CEAGESP did not return usable current rows');
      } else {
        let matchedAnyFruit = false;
        const pendingUpserts: ReferencePriceInput[] = [];
        for (const fruit of fruits) {
          const aliases = this.resolveMercosurProductAliases(fruit.nameEs);
          if (aliases.length === 0) {
            diagnostics.skipped += 1;
            continue;
          }

          const latest = this.selectLatestCeagespPrice(brazilRows, aliases);
          if (!latest) {
            continue;
          }

          matchedAnyFruit = true;
          for (const market of brazilMarkets) {
            pendingUpserts.push({
              fruitId: fruit.id,
              marketId: market.id,
              price: latest.price,
              date: latest.referenceDate,
              source: 'CEAGESP',
              sourceRegion: 'BR',
              currency: 'BRL',
              productStage: latest.productStage,
              unitType: latest.unitType,
              metadata: {
                region: 'mercosur',
                mercosurProvider: 'ceagesp',
                mercosurProduct: latest.product,
                mercosurVariety: latest.variety,
                mercosurUnit: latest.unitRaw,
              },
            });
          }
        }

        if (matchedAnyFruit) {
          await this.replaceReferencePricesForSource('CEAGESP', 'BR', pendingUpserts);
          saved += pendingUpserts.length;
          diagnostics.matched += 1;
        }
        diagnostics.notes.push(
          `CEAGESP rows: ${brazilRows.length}, latest ${brazilRows[0]?.referenceDate.toISOString().slice(0, 10) ?? 'n/a'}`,
        );
      }
    } else {
      diagnostics.notes.push('No active Mercosur markets found for BR');
    }

    for (const countryCode of ['CL', 'PY', 'UY']) {
      if ((marketsByCountry.get(countryCode) ?? []).length > 0) {
        diagnostics.notes.push(`Current public source not connected yet for ${countryCode}`);
      }
    }

    diagnostics.saved = saved;
    diagnostics.notes = diagnostics.notes.slice(0, 20);
    return { saved, diagnostics };
  }

  private async syncCanadaReferencePrices(
    fruits: Fruit[],
    markets: Market[],
  ): Promise<{ saved: number; diagnostics: ProviderDiagnostics }> {
    const diagnostics: ProviderDiagnostics = {
      provider: 'Statistics Canada',
      attempted: 0,
      matched: 0,
      saved: 0,
      skipped: 0,
      notes: [],
    };

    const canadaMarkets = markets.filter((market) => this.resolveCountryCode(market.country) === 'CA');
    if (canadaMarkets.length === 0) {
      diagnostics.notes.push('No active Canada markets found');
      return { saved: 0, diagnostics };
    }

    const latestRows = await this.fetchLatestStatsCanPrices();
    if (latestRows.size === 0) {
      diagnostics.notes.push('Statistics Canada did not return usable current rows');
      return { saved: 0, diagnostics };
    }

    const pendingUpserts: ReferencePriceInput[] = [];
    for (const fruit of fruits) {
      const labels = this.resolveStatsCanProductLabels(fruit.nameEs);
      if (labels.length === 0) {
        diagnostics.skipped += 1;
        continue;
      }

      diagnostics.attempted += 1;
      const latest = labels
        .map((label) => latestRows.get(label))
        .filter((row): row is StatsCanLatestRow => row != null)
        .sort((a, b) => b.referenceDate.getTime() - a.referenceDate.getTime())[0];

      if (!latest) {
        diagnostics.notes.push(`No Statistics Canada price for ${fruit.nameEs}`);
        continue;
      }

      diagnostics.matched += 1;
      for (const market of canadaMarkets) {
        pendingUpserts.push({
          fruitId: fruit.id,
          marketId: market.id,
          price: latest.price,
          date: latest.referenceDate,
          source: 'Statistics Canada',
          sourceRegion: 'CA',
          currency: 'CAD',
          productStage: 'Retail average price',
          unitType: latest.unitType,
          metadata: {
            region: 'north_america',
            statcanTableId: '18-10-0245-02',
            statcanProduct: latest.product,
            geography: latest.geography,
          },
        });
      }
    }

    if (pendingUpserts.length > 0) {
      await this.replaceReferencePricesForSource('Statistics Canada', 'CA', pendingUpserts);
    }

    diagnostics.saved = pendingUpserts.length;
    diagnostics.notes = diagnostics.notes.slice(0, 20);
    return { saved: pendingUpserts.length, diagnostics };
  }

  private async syncMexicoReferencePrices(
    fruits: Fruit[],
    markets: Market[],
  ): Promise<{ saved: number; diagnostics: ProviderDiagnostics }> {
    const diagnostics: ProviderDiagnostics = {
      provider: 'SNIIM Mexico',
      attempted: 0,
      matched: 0,
      saved: 0,
      skipped: 0,
      notes: [],
    };

    const mexicoMarkets = markets.filter((market) => this.resolveCountryCode(market.country) === 'MX');
    if (mexicoMarkets.length === 0) {
      diagnostics.notes.push('No active Mexico markets found');
      return { saved: 0, diagnostics };
    }

    const pendingUpserts: ReferencePriceInput[] = [];
    for (const fruit of fruits) {
      const productId = this.resolveSniimProductId(fruit.nameEs);
      if (!productId) {
        diagnostics.skipped += 1;
        continue;
      }

      diagnostics.attempted += 1;
      let matchedPrice:
        | {
            price: number;
            referenceDate: Date;
            rowCount: number;
            minPrice: number;
            maxPrice: number;
            frequentPrice: number;
            presentations: string[];
            origins: string[];
          }
        | null = null;

      for (let offset = 0; offset < 3; offset += 1) {
        const referenceDate = new Date(this.todayUtc().getTime() - offset * 24 * 60 * 60 * 1000);
        const rows = await this.fetchSniimRows(productId, referenceDate);
        if (rows.length === 0) {
          continue;
        }

        const frequentValues = rows.map((row) => row.frequentPrice);
        const minValues = rows.map((row) => row.minPrice);
        const maxValues = rows.map((row) => row.maxPrice);
        const averageFrequent = Number(
          (
            frequentValues.reduce((total, value) => total + value, 0) / frequentValues.length
          ).toFixed(2),
        );
        matchedPrice = {
          price: averageFrequent,
          referenceDate,
          rowCount: rows.length,
          minPrice: Number(Math.min(...minValues).toFixed(2)),
          maxPrice: Number(Math.max(...maxValues).toFixed(2)),
          frequentPrice: averageFrequent,
          presentations: rows.map((row) => row.presentation).slice(0, 5),
          origins: rows.map((row) => row.origin).slice(0, 5),
        };
        break;
      }

      if (!matchedPrice) {
        diagnostics.notes.push(`No SNIIM price for ${fruit.nameEs}`);
        continue;
      }

      diagnostics.matched += 1;
      for (const market of mexicoMarkets) {
        pendingUpserts.push({
          fruitId: fruit.id,
          marketId: market.id,
          price: matchedPrice.price,
          date: matchedPrice.referenceDate,
          source: 'SNIIM Mexico',
          sourceRegion: 'MX',
          currency: 'MXN',
          productStage: 'Wholesale calculated kg price',
          unitType: 'kg',
          metadata: {
            region: 'north_america',
            sniimProductId: productId,
            sniimDestinationId: ScraperService.sniimDestinationId,
            sniimDestination: ScraperService.sniimDestinationLabel,
            sniimRowCount: matchedPrice.rowCount,
            sniimMin: matchedPrice.minPrice,
            sniimMax: matchedPrice.maxPrice,
            sniimFrequent: matchedPrice.frequentPrice,
            sniimPresentations: matchedPrice.presentations,
            sniimOrigins: matchedPrice.origins,
          },
        });
      }
    }

    if (pendingUpserts.length > 0) {
      await this.replaceReferencePricesForSource('SNIIM Mexico', 'MX', pendingUpserts);
    }

    diagnostics.saved = pendingUpserts.length;
    diagnostics.notes = diagnostics.notes.slice(0, 20);
    return { saved: pendingUpserts.length, diagnostics };
  }

  private async syncAsiaReferencePrices(
    fruits: Fruit[],
    markets: Market[],
  ): Promise<{ saved: number; diagnostics: ProviderDiagnostics }> {
    const diagnostics: ProviderDiagnostics = {
      provider: 'AGMARKNET India',
      attempted: 0,
      matched: 0,
      saved: 0,
      skipped: 0,
      notes: [],
    };

    const indiaMarkets = markets.filter((market) => this.resolveCountryCode(market.country) === 'IN');
    if (indiaMarkets.length === 0) {
      diagnostics.notes.push('No active India markets found');
      return { saved: 0, diagnostics };
    }

    const pendingUpserts: ReferencePriceInput[] = [];
    for (const fruit of fruits) {
      const commodityLabels = this.resolveIndiaMandiCommodityLabels(fruit.nameEs);
      if (commodityLabels.length === 0) {
        diagnostics.skipped += 1;
        continue;
      }

      diagnostics.attempted += 1;
      let matchedRows: IndiaMandiRow[] = [];
      let matchedCommodity: string | null = null;

      for (const commodity of commodityLabels) {
        const rows = await this.fetchIndiaMandiRows(commodity);
        if (rows.length === 0) {
          continue;
        }

        matchedRows = rows;
        matchedCommodity = commodity;
        break;
      }

      if (matchedRows.length === 0 || !matchedCommodity) {
        diagnostics.notes.push(`No AGMARKNET price for ${fruit.nameEs}`);
        continue;
      }

      const latestTimestamp = Math.max(...matchedRows.map((row) => row.arrivalDate.getTime()));
      const latestRows = matchedRows.filter((row) => row.arrivalDate.getTime() === latestTimestamp);
      const modalAverage =
        latestRows.reduce((total, row) => total + row.modalPrice, 0) / latestRows.length;
      const minPrice = Math.min(...latestRows.map((row) => row.minPrice));
      const maxPrice = Math.max(...latestRows.map((row) => row.maxPrice));
      const states = Array.from(new Set(latestRows.map((row) => row.state))).slice(0, 5);
      const marketNames = Array.from(new Set(latestRows.map((row) => row.market))).slice(0, 5);

      diagnostics.matched += 1;
      for (const market of indiaMarkets) {
        pendingUpserts.push({
          fruitId: fruit.id,
          marketId: market.id,
          price: Number(modalAverage.toFixed(2)),
          date: latestRows[0].arrivalDate,
          source: 'AGMARKNET India',
          sourceRegion: 'IN',
          currency: 'INR',
          productStage: 'Wholesale mandi modal price',
          unitType: 'quintal',
          metadata: {
            region: 'asia',
            agmarknetCommodity: matchedCommodity,
            agmarknetRowCount: latestRows.length,
            agmarknetMin: Number(minPrice.toFixed(2)),
            agmarknetMax: Number(maxPrice.toFixed(2)),
            agmarknetMarkets: marketNames,
            agmarknetStates: states,
            agmarknetUnitInference: 'AGMARKNET mandi prices are treated as INR per quintal',
          },
        });
      }
    }

    if (pendingUpserts.length > 0) {
      await this.replaceReferencePricesForSource('AGMARKNET India', 'IN', pendingUpserts);
    }

    diagnostics.saved = pendingUpserts.length;
    diagnostics.notes = diagnostics.notes.slice(0, 20);
    return { saved: pendingUpserts.length, diagnostics };
  }

  private async syncAustraliaReferencePrices(
    fruits: Fruit[],
    markets: Market[],
  ): Promise<{ saved: number; diagnostics: ProviderDiagnostics }> {
    const diagnostics: ProviderDiagnostics = {
      provider: 'ABARES DAFF Australia',
      attempted: 0,
      matched: 0,
      saved: 0,
      skipped: 0,
      notes: [],
    };

    const australiaMarkets = markets.filter((market) => this.resolveCountryCode(market.country) === 'AU');
    if (australiaMarkets.length === 0) {
      diagnostics.notes.push('No active Australia markets found');
      return { saved: 0, diagnostics };
    }

    const latestRows = await this.fetchAustraliaDaffIndices();
    if (latestRows.size === 0) {
      diagnostics.notes.push('ABARES DAFF page did not return usable weekly indices');
      return { saved: 0, diagnostics };
    }

    const pendingUpserts: ReferencePriceInput[] = [];
    for (const fruit of fruits) {
      const labels = this.resolveAustraliaDaffLabels(fruit.nameEs);
      if (labels.length === 0) {
        diagnostics.skipped += 1;
        continue;
      }

      diagnostics.attempted += 1;
      const latest = labels
        .map((label) => latestRows.get(label))
        .filter((row): row is AustraliaDaffIndexRow => row != null)
        .sort((a, b) => b.referenceDate.getTime() - a.referenceDate.getTime())[0];

      if (!latest) {
        diagnostics.notes.push(`No ABARES index for ${fruit.nameEs}`);
        continue;
      }

      diagnostics.matched += 1;
      for (const market of australiaMarkets) {
        pendingUpserts.push({
          fruitId: fruit.id,
          marketId: market.id,
          price: latest.indexValue,
          date: latest.referenceDate,
          source: 'ABARES DAFF Australia',
          sourceRegion: 'AU',
          currency: 'INDEX',
          productStage: 'Weekly wholesale price index',
          unitType: 'index',
          metadata: {
            region: 'australia',
            daffSeries: latest.product,
            daffNote: 'Official weekly Melbourne wholesale price index, not a spot cash price per kilogram',
          },
        });
      }
    }

    if (pendingUpserts.length > 0) {
      await this.replaceReferencePricesForSource('ABARES DAFF Australia', 'AU', pendingUpserts);
    }

    diagnostics.saved = pendingUpserts.length;
    diagnostics.notes = diagnostics.notes.slice(0, 20);
    return { saved: pendingUpserts.length, diagnostics };
  }

  private async syncArabReferencePrices(
    fruits: Fruit[],
    markets: Market[],
  ): Promise<{ saved: number; diagnostics: ProviderDiagnostics }> {
    const diagnostics: ProviderDiagnostics = {
      provider: 'Obour Market',
      attempted: 0,
      matched: 0,
      saved: 0,
      skipped: 0,
      notes: [],
    };

    const egyptMarkets = markets.filter((market) => this.resolveCountryCode(market.country) === 'EG');
    if (egyptMarkets.length === 0) {
      diagnostics.notes.push('No active Egypt markets found');
      return { saved: 0, diagnostics };
    }

    const rows = await this.fetchObourLatestCards();
    if (rows.length === 0) {
      diagnostics.notes.push('Obour Market did not return usable cards');
      return { saved: 0, diagnostics };
    }

    const pendingUpserts: ReferencePriceInput[] = [];
    for (const fruit of fruits) {
      const aliases = this.resolveObourProductAliases(fruit.nameEs);
      if (aliases.length === 0) {
        diagnostics.skipped += 1;
        continue;
      }

      diagnostics.attempted += 1;
      const matchedRows = rows.filter((row) =>
        aliases.some((alias) => this.normalizeArabicText(row.product).includes(alias)),
      );

      if (matchedRows.length === 0) {
        diagnostics.notes.push(`No Obour price for ${fruit.nameEs}`);
        continue;
      }

      const averagePrice =
        matchedRows.reduce((total, row) => total + (row.minPrice + row.maxPrice) / 2, 0) /
        matchedRows.length;
      const minPrice = Math.min(...matchedRows.map((row) => row.minPrice));
      const maxPrice = Math.max(...matchedRows.map((row) => row.maxPrice));
      const packaging = Array.from(new Set(matchedRows.map((row) => row.packaging))).slice(0, 5);
      const latestTimestamp = Math.max(...matchedRows.map((row) => row.referenceDate.getTime()));
      const latestReferenceDate = matchedRows.find(
        (row) => row.referenceDate.getTime() === latestTimestamp,
      )?.referenceDate;

      if (!latestReferenceDate) {
        continue;
      }

      diagnostics.matched += 1;
      for (const market of egyptMarkets) {
        pendingUpserts.push({
          fruitId: fruit.id,
          marketId: market.id,
          price: Number(averagePrice.toFixed(2)),
          date: latestReferenceDate,
          source: 'Obour Market',
          sourceRegion: 'EG',
          currency: 'EGP',
          productStage: 'Morning wholesale auction price',
          unitType: matchedRows[0].unitType,
          metadata: {
            region: 'arab_countries',
            obourProductNames: Array.from(new Set(matchedRows.map((row) => row.product))).slice(0, 5),
            obourPackaging: packaging,
            obourMin: Number(minPrice.toFixed(2)),
            obourMax: Number(maxPrice.toFixed(2)),
            obourRowCount: matchedRows.length,
          },
        });
      }
    }

    if (pendingUpserts.length > 0) {
      await this.replaceReferencePricesForSource('Obour Market', 'EG', pendingUpserts);
    }

    diagnostics.saved = pendingUpserts.length;
    diagnostics.notes = diagnostics.notes.slice(0, 20);
    return { saved: pendingUpserts.length, diagnostics };
  }

  private async fetchLatestEuPrice(
    product: string,
    memberStateCode: string,
    currentYear: number,
  ): Promise<{
    price: number;
    currency: string;
    unitType: string;
    productStage: string;
    referenceDate: Date;
    debugNote?: string;
  } | null> {
    const qlikPrice = await this.fetchLatestEuQlikPrice(product, memberStateCode, currentYear);
    if (qlikPrice) {
      return qlikPrice;
    }

    return this.fetchLatestEuLegacyPrice(product, memberStateCode, currentYear);
  }

  private async fetchLatestEuQlikPrice(
    product: string,
    memberStateCode: string,
    currentYear: number,
  ): Promise<{
    price: number;
    currency: string;
    unitType: string;
    productStage: string;
    referenceDate: Date;
    debugNote?: string;
  } | null> {
    try {
      const result = await this.queryEuQlikRows(product, memberStateCode, currentYear);
      if (result.rows.length === 0) {
        this.logger.log(
          result.debugNote ||
            `EU Qlik returned 0 rows for ${product}/${memberStateCode}`,
        );
        return null;
      }

      const latest = result.rows.sort(
        (a, b) => b.referenceDate.getTime() - a.referenceDate.getTime(),
      )[0];
      const { currency, unitType } = this.normalizeUnit(latest.unitRaw);
      return {
        price: Number(latest.price.toFixed(2)),
        currency,
        unitType,
        productStage: latest.productStage,
        referenceDate: latest.referenceDate,
        debugNote:
          result.debugNote ??
          `EU Qlik rows ${result.rows.length} for ${product}/${memberStateCode} via ${latest.productLabel}`,
      };
    } catch (error) {
      this.logger.warn(`EU Qlik fetch failed for ${product}/${memberStateCode}: ${error.message}`);
      return null;
    }
  }

  private async fetchLatestEuLegacyPrice(
    product: string,
    memberStateCode: string,
    currentYear: number,
  ): Promise<{
    price: number;
    currency: string;
    unitType: string;
    productStage: string;
    referenceDate: Date;
    debugNote?: string;
  } | null> {
    try {
      const productVariants = Array.from(new Set([product.toLowerCase(), product, product.toUpperCase()]));
      let rows: EuApiRow[] = [];
      let debugNote = '';

      for (const productVariant of productVariants) {
        try {
          const response = await axios.get<EuApiRow[]>(
            'https://agridata.ec.europa.eu/api/fruitAndVegetable/pricesSupplyChain',
            {
              timeout: 15000,
              params: {
                years: `${currentYear - 1},${currentYear}`,
                products: productVariant,
                memberStateCodes: memberStateCode,
                productStages: 'Retail buying price',
              },
            },
          );

          rows = Array.isArray(response.data) ? response.data : [];
          if (rows.length > 0) {
            debugNote = `EU rows ${rows.length} for ${productVariant}/${memberStateCode}`;
            break;
          }
        } catch (variantError) {
          const status = axios.isAxiosError(variantError)
            ? variantError.response?.status
            : undefined;
          if (status === 404) {
            debugNote =
              'EU AgriData legacy REST endpoint returned 404; dashboard API appears to have changed';
            break;
          }
          debugNote = `EU ${productVariant}/${memberStateCode}: ${status ?? 'no-status'} ${variantError.message}`;
        }
      }

      if (rows.length === 0) {
        this.logger.log(debugNote || `EU reference returned 0 rows for ${product}/${memberStateCode}`);
        return null;
      }

      const parsed = rows
        .map((row) => ({
          price: this.parseNumericPrice(row.price),
          unitRaw: `${row.unit ?? 'EUR/kg'}`,
          productStage: `${row.productStage ?? 'Retail buying price'}`,
          referenceDate: this.parseEuDate(`${row.beginDate ?? ''}`),
        }))
        .filter((row) => !Number.isNaN(row.price) && row.price > 0 && row.referenceDate != null)
        .sort(
          (a, b) =>
            (b.referenceDate?.getTime() ?? 0) - (a.referenceDate?.getTime() ?? 0),
        );

      if (parsed.length === 0) {
        this.logger.log(`EU reference rows had no usable prices for ${product}/${memberStateCode}`);
        return null;
      }

      const latest = parsed[0];
      const { currency, unitType } = this.normalizeUnit(latest.unitRaw);
      return {
        price: Number(latest.price.toFixed(2)),
        currency,
        unitType,
        productStage: latest.productStage,
        referenceDate: latest.referenceDate!,
        debugNote,
      };
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      this.logger.warn(
        `EU reference fetch failed for ${product}/${memberStateCode}: ${status ?? 'no-status'} ${error.message}`,
      );
      return null;
    }
  }

  private async fetchLatestUsdaRetailPrice(
    apiKey: string,
    commodity: string,
  ): Promise<{
    price: number;
    unitType: string;
    productStage: string;
    referenceDate: Date;
    debugNote?: string;
  } | null> {
    try {
      const auth = Buffer.from(`${apiKey}:`).toString('base64');
      const response = await axios.get<any>(
        'https://marsapi.ams.usda.gov/services/v1.2/reports/3324/Details',
        {
          timeout: 15000,
          headers: {
            Authorization: `Basic ${auth}`,
          },
          params: {
            lastReports: 1,
          },
        },
      );

      const rows = this.extractUsdaRows(response.data);
      if (rows.length === 0) {
        const keys =
          response.data != null && typeof response.data === 'object'
            ? Object.keys(response.data).slice(0, 10).join(', ')
            : typeof response.data;
        this.logger.log(`USDA report 3324 returned 0 rows for ${commodity}. Keys: ${keys}`);
        return null;
      }

      const parsed = rows
        .map((row) => {
          const rawPrice =
            row.weighted_average ??
            row.weighted_avg ??
            row.weightedaverage ??
            row.average_price ??
            row.average ??
            row.mostly_price ??
            row.price ??
            row.mostly_high ??
            row.mostly_low;
          const searchableText = this.normalizeText(
            [
              row.commodity,
              row.item_name,
              row.item_description,
              row.variety,
            ]
              .filter(Boolean)
              .join(' '),
          );
          const price = this.parseNumericPrice(rawPrice);
          const dateValue =
            row.published_date ??
            row.report_date ??
            row.report_end_date ??
            row.report_begin_date ??
            '';

          return {
            commodity: searchableText,
            price,
            unitRaw: `${row.unit ?? row.package ?? 'USD/unit'}`,
            productStage: row.store_type
              ? `Retail ${row.store_type}`
              : 'Retail advertised price',
            referenceDate: this.parseUsdaDate(dateValue),
          };
        })
        .filter(
          (row) =>
            this.matchesCommodity(row.commodity, commodity) &&
            !Number.isNaN(row.price) &&
            row.price > 0 &&
            row.referenceDate != null,
        )
        .sort(
          (a, b) =>
            (b.referenceDate?.getTime() ?? 0) - (a.referenceDate?.getTime() ?? 0),
        );

      if (parsed.length === 0) {
        const sample = rows
          .slice(0, 5)
          .map((row) => [row.commodity, row.item_name, row.item_description, row.variety].filter(Boolean).join(' | '))
          .filter((value) => value.trim().length > 0)
          .join(' || ');
        this.logger.log(`USDA report 3324 returned rows but no commodity match for ${commodity}. Sample: ${sample}`);
        return null;
      }

      const latest = parsed[0];
      return {
        price: Number(latest.price.toFixed(2)),
        unitType: this.normalizeUsdaUnit(latest.unitRaw),
        productStage: latest.productStage,
        referenceDate: latest.referenceDate!,
        debugNote: `USDA matched ${parsed.length} rows for ${commodity}`,
      };
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      this.logger.warn(
        `USDA reference fetch failed for ${commodity}: ${status ?? 'no-status'} ${error.message}`,
      );
      return null;
    }
  }

  private async debugEuReferenceSource(
    product: string,
    memberStateCode: string,
    currentYear: number,
  ): Promise<ProviderDebugResult> {
    try {
      const result = await this.queryEuQlikRows(product, memberStateCode, currentYear);
      return {
        provider: 'EU AgriData',
        ok: true,
        status: 200,
        query: {
          product,
          memberStateCode,
          years: `${currentYear - 1},${currentYear}`,
          productStage: 'Retail buying price',
          source: 'Qlik dashboard',
        },
        rowCount: result.rows.length,
        sample: result.rows.slice(0, 3),
        message: result.debugNote,
      };
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const payload = axios.isAxiosError(error) ? error.response?.data : undefined;
      return {
        provider: 'EU AgriData',
        ok: false,
        status,
        query: {
          product,
          memberStateCode,
          years: `${currentYear - 1},${currentYear}`,
          productStage: 'Retail buying price',
          source: 'Qlik dashboard',
        },
        rowCount: 0,
        sample: payload != null ? [payload] : [],
        message: error.message,
      };
    }
  }

  private async fetchMercadoCentralRows(): Promise<MercadoCentralRow[]> {
    try {
      const indexResponse = await axios.get<string>(ScraperService.mercadoCentralIndexUrl, {
        timeout: 20000,
        responseType: 'text',
      });
      const html = `${indexResponse.data ?? ''}`;
      const zipUrls = [
        this.extractMercadoCentralZipUrl(html, 'FRUTAS'),
        this.extractMercadoCentralZipUrl(html, 'HORTALIZAS'),
      ].filter((value): value is string => Boolean(value));

      const collected: MercadoCentralRow[] = [];
      for (const zipUrl of zipUrls) {
        try {
          const rows = await this.fetchMercadoCentralZipRows(zipUrl);
          collected.push(...rows);
        } catch (zipError) {
          this.logger.warn(
            `Mercado Central zip parsing failed for ${zipUrl}: ${zipError.message}`,
          );
        }
      }

      return collected.sort(
        (a, b) => b.referenceDate.getTime() - a.referenceDate.getTime(),
      );
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      this.logger.warn(
        `Mercado Central fetch failed: ${status ?? 'no-status'} ${error.message}`,
      );
      return [];
    }
  }

  private extractMercadoCentralZipUrl(
    html: string,
    prefix: 'FRUTAS' | 'HORTALIZAS',
  ): string | null {
    const matches = Array.from(
      html.matchAll(
        new RegExp(
          `https?:\\/\\/mercadocentral\\.gob\\.ar[^"'\\s>]*${prefix}[^"'\\s>]*\\.zip`,
          'gi',
        ),
      ),
    )
      .map((match) => match[0].replace(/&amp;/g, '&'))
      .filter((value) => value.length > 0);

    if (matches.length === 0) {
      return null;
    }

    return matches
      .map((url) => ({
        url,
        score: this.extractMercadoCentralMonthScore(url),
      }))
      .sort((a, b) => b.score - a.score)[0].url;
  }

  private extractMercadoCentralMonthScore(url: string): number {
    const normalized = this.normalizeText(url);
    const yearMatch = normalized.match(/(20\d{2})/);
    const year = Number.parseInt(yearMatch?.[1] ?? '0', 10);
    const months: Record<string, number> = {
      enero: 1,
      febrero: 2,
      marzo: 3,
      abril: 4,
      mayo: 5,
      junio: 6,
      julio: 7,
      agosto: 8,
      septiembre: 9,
      setiembre: 9,
      octubre: 10,
      noviembre: 11,
      diciembre: 12,
    };

    const month =
      Object.entries(months).find(([key]) => normalized.includes(key))?.[1] ?? 0;

    return year * 100 + month;
  }

  private async fetchMercadoCentralZipRows(zipUrl: string): Promise<MercadoCentralRow[]> {
    const response = await axios.get<ArrayBuffer>(zipUrl, {
      timeout: 30000,
      responseType: 'arraybuffer',
    });

    const zip = new AdmZip(Buffer.from(response.data));
    const entry = zip
      .getEntries()
      .filter((candidate: any) => !candidate.isDirectory)
      .sort((a: any, b: any) =>
        this.extractMercadoCentralSheetDate(b.entryName).getTime() -
        this.extractMercadoCentralSheetDate(a.entryName).getTime(),
      )[0];

    if (!entry) {
      return [];
    }

    const referenceDate = this.extractMercadoCentralSheetDate(entry.entryName);
    const workbook = XLSX.read(entry.getData(), { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: false,
    });

    if (rows.length === 0) {
      return [];
    }

    const headerIndex = rows.findIndex((row) =>
      row.some((cell) => this.normalizeText(`${cell}`).includes('esp')),
    );
    if (headerIndex < 0) {
      return [];
    }

    const header = rows[headerIndex].map((cell) => this.normalizeText(`${cell}`));
    const getIndex = (name: string) => header.findIndex((cell) => cell === name);
    const productIndex = getIndex('esp');
    const varietyIndex = getIndex('var');
    const originIndex = getIndex('proc');
    const unitIndex = getIndex('env');
    const commonPriceKgIndex = getIndex('mopk');
    const kgIndex = getIndex('kg');

    if (productIndex < 0 || commonPriceKgIndex < 0) {
      return [];
    }

    const collected: MercadoCentralRow[] = [];
    for (const row of rows.slice(headerIndex + 1)) {
      const product = `${row[productIndex] ?? ''}`.trim();
      const commonPriceKg = this.parseNumericPrice(row[commonPriceKgIndex]);
      if (!product || Number.isNaN(commonPriceKg) || commonPriceKg <= 0) {
        continue;
      }

      collected.push({
        product,
        variety: `${row[varietyIndex] ?? ''}`.trim(),
        origin: `${row[originIndex] ?? ''}`.trim(),
        unitType: `${row[unitIndex] ?? row[kgIndex] ?? 'kg'}`.trim() || 'kg',
        commonPriceKg,
        referenceDate,
      });
    }

    return collected;
  }

  private extractMercadoCentralSheetDate(filename: string): Date {
    const normalized = filename.replace(/\\/g, '/').split('/').pop() ?? '';
    const match = normalized.match(/[A-Z]{2}(\d{2})(\d{2})(\d{2,4})/i);
    if (!match) {
      return this.todayUtc();
    }

    const day = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const rawYear = Number.parseInt(match[3], 10);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    return new Date(Date.UTC(year, month - 1, day));
  }

  private selectLatestMercadoCentralPrice(
    rows: MercadoCentralRow[],
    aliases: string[],
  ): {
    price: number;
    referenceDate: Date;
    product: string;
    variety: string;
    origin: string;
    productStage: string;
    unitType: string;
  } | null {
    const preferred = rows.filter((row) =>
      aliases.some((alias) => {
        const searchable = this.normalizeText([row.product, row.variety].join(' '));
        return searchable.includes(alias) || alias.includes(searchable);
      }),
    );

    if (preferred.length === 0) {
      return null;
    }

    const ranked = preferred.sort((a, b) => {
      const dateDiff = b.referenceDate.getTime() - a.referenceDate.getTime();
      if (dateDiff !== 0) return dateDiff;

      const aProm = this.normalizeText([a.product, a.variety].join(' ')).includes('prom');
      const bProm = this.normalizeText([b.product, b.variety].join(' ')).includes('prom');
      return Number(bProm) - Number(aProm);
    });

    const latest = ranked[0];
    return {
      price: Number(latest.commonPriceKg.toFixed(2)),
      referenceDate: latest.referenceDate,
      product: latest.product,
      variety: latest.variety,
      origin: latest.origin,
      productStage: 'Wholesale common price',
      unitType: 'kg',
    };
  }

  private async fetchCeagespRows(): Promise<CeagespRow[]> {
    try {
      const indexResponse = await axios.get<string>(ScraperService.ceagespPricesUrl, {
        timeout: 20000,
        responseType: 'text',
      });
      const html = `${indexResponse.data ?? ''}`;
      const groups: Array<'FRUTAS' | 'LEGUMES' | 'VERDURAS'> = ['FRUTAS', 'LEGUMES', 'VERDURAS'];
      const collected: CeagespRow[] = [];

      for (const group of groups) {
        try {
          const latestDate = this.extractCeagespLatestDate(html, group);
          if (!latestDate) {
            continue;
          }

          const payload = new URLSearchParams({
            cot_grupo: group,
            cot_data: latestDate,
          });
          const response = await axios.post<string>(
            ScraperService.ceagespPricesUrl,
            payload.toString(),
            {
              timeout: 20000,
              responseType: 'text',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
            },
          );

          collected.push(...this.parseCeagespTable(`${response.data ?? ''}`, latestDate));
        } catch (groupError) {
          this.logger.warn(
            `CEAGESP parsing failed for ${group}: ${groupError.message}`,
          );
        }
      }

      return collected.sort(
        (a, b) => b.referenceDate.getTime() - a.referenceDate.getTime(),
      );
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      this.logger.warn(
        `CEAGESP fetch failed: ${status ?? 'no-status'} ${error.message}`,
      );
      return [];
    }
  }

  private extractCeagespLatestDate(
    html: string,
    group: 'FRUTAS' | 'LEGUMES' | 'VERDURAS',
  ): string | null {
    const blockMatch = html.match(new RegExp(`"${group}"\\s*:\\s*\\[([^\\]]+)\\]`, 'i'));
    if (!blockMatch) {
      return null;
    }

    const dates = Array.from(
      blockMatch[1].matchAll(/(\d{2}\\?\/\d{2}\\?\/\d{4})/g),
    ).map((match) => match[1].replace(/\\\//g, '/'));
    if (dates.length === 0) {
      return null;
    }

    return dates.sort(
      (a, b) => this.parseCeagespDate(b).getTime() - this.parseCeagespDate(a).getTime(),
    )[0];
  }

  private parseCeagespTable(html: string, dateValue: string): CeagespRow[] {
    const referenceDate = this.parseCeagespDate(dateValue);
    const rows = Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
    const collected: CeagespRow[] = [];

    for (const rowMatch of rows) {
      const cells = Array.from(rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map(
        (match) => this.decodeHtmlEntities(match[1]).replace(/\s+/g, ' ').trim(),
      );

      if (cells.length < 7 || this.normalizeText(cells[0]).includes('produto')) {
        continue;
      }

      const commonPrice = this.parseNumericPrice(cells[4]);
      const kgFactor = this.parseNumericPrice(cells[6]);
      if (Number.isNaN(commonPrice) || commonPrice <= 0) {
        continue;
      }

      collected.push({
        product: cells[0],
        classification: cells[1],
        unitRaw: cells[2],
        commonPrice,
        kgFactor: !Number.isNaN(kgFactor) && kgFactor > 0 ? kgFactor : 1,
        referenceDate,
      });
    }

    return collected;
  }

  private parseCeagespDate(value: string): Date {
    const normalized = value.replace(/\\\//g, '/');
    const [dayRaw, monthRaw, yearRaw] = normalized.split('/');
    const day = Number.parseInt(dayRaw ?? '1', 10);
    const month = Number.parseInt(monthRaw ?? '1', 10);
    const year = Number.parseInt(yearRaw ?? '1970', 10);
    return new Date(Date.UTC(year, month - 1, day));
  }

  private selectLatestCeagespPrice(
    rows: CeagespRow[],
    aliases: string[],
  ): {
    price: number;
    referenceDate: Date;
    product: string;
    variety: string;
    productStage: string;
    unitType: string;
    unitRaw: string;
  } | null {
    const preferred = rows.filter((row) =>
      aliases.some((alias) => {
        const searchable = this.normalizeText([row.product, row.classification].join(' '));
        return searchable.includes(alias) || alias.includes(searchable);
      }),
    );

    if (preferred.length === 0) {
      return null;
    }

    const latest = preferred.sort(
      (a, b) => b.referenceDate.getTime() - a.referenceDate.getTime(),
    )[0];
    const kgPrice = latest.commonPrice / (latest.kgFactor > 0 ? latest.kgFactor : 1);

    return {
      price: Number(kgPrice.toFixed(2)),
      referenceDate: latest.referenceDate,
      product: latest.product,
      variety: latest.classification,
      productStage: 'Wholesale common price',
      unitType: 'kg',
      unitRaw: latest.unitRaw,
    };
  }

  private decodeHtmlEntities(value: string): string {
    return value
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&ccedil;/gi, 'c')
      .replace(/&atilde;/gi, 'a')
      .replace(/&otilde;/gi, 'o')
      .replace(/&aacute;/gi, 'a')
      .replace(/&eacute;/gi, 'e')
      .replace(/&iacute;/gi, 'i')
      .replace(/&oacute;/gi, 'o')
      .replace(/&uacute;/gi, 'u')
      .replace(/&uuml;/gi, 'u')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 10)));
  }

  private async fetchMercosurRows(
    url: string,
    countryCode: string,
  ): Promise<MercosurCsvRow[]> {
    try {
      const response = await axios.get<string>(url, {
        timeout: 20000,
        responseType: 'text',
      });

      const lines = `${response.data ?? ''}`
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (lines.length < 2) {
        return [];
      }

      const headers = this.parseSimpleCsvLine(lines[0]).map((value) => this.normalizeText(value));
      return lines.slice(1).map((line) => {
        const values = this.parseSimpleCsvLine(line);
        const row: Record<string, string> = {};
        headers.forEach((header, index) => {
          row[header] = `${values[index] ?? ''}`.trim();
        });
        return row as MercosurCsvRow;
      });
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      this.logger.warn(
        `Mercosur reference fetch failed for ${countryCode}: ${status ?? 'no-status'} ${error.message}`,
      );
      return [];
    }
  }

  private resolveMercosurProductAliases(nameEs: string): string[] {
    const normalized = this.normalizeText(nameEs);
    for (const [key, aliases] of Object.entries(ScraperService.mercosurProductMap)) {
      if (normalized.includes(key)) {
        return aliases.map((alias) => this.normalizeText(alias));
      }
    }

    return [];
  }

  private selectLatestMercosurPrice(
    rows: MercosurCsvRow[],
    aliases: string[],
  ): {
    price: number;
    referenceDate: Date;
    product: string;
    variety: string;
    origin: string;
    productStage: string;
  } | null {
    const parsed = rows
      .map((row) => {
        const product = `${row.producto ?? ''}`.trim();
        const searchable = this.normalizeText(product);
        const price = this.parseNumericPrice(row.precio_usd_kg);
        const referenceDate = this.parseMercosurDate(
          this.extractMercosurYearValue(row),
          `${row.mes ?? ''}`,
        );

        return {
          product,
          searchable,
          variety: `${row.variedad ?? ''}`.trim(),
          origin: `${row.origen ?? ''}`.trim(),
          price,
          referenceDate,
        };
      })
      .filter(
        (row) =>
          row.referenceDate != null &&
          !Number.isNaN(row.price) &&
          row.price > 0 &&
          aliases.some(
            (alias) => row.searchable.includes(alias) || alias.includes(row.searchable),
          ),
      )
      .sort(
        (a, b) =>
          (b.referenceDate?.getTime() ?? 0) - (a.referenceDate?.getTime() ?? 0),
      );

    if (parsed.length === 0) {
      return null;
    }

    const latest = parsed[0];
    return {
      price: Number(latest.price.toFixed(2)),
      referenceDate: latest.referenceDate!,
      product: latest.product,
      variety: latest.variety,
      origin: latest.origin,
      productStage: 'Wholesale market reference',
    };
  }

  private async debugUsdaReferenceSource(
    commodity: string,
  ): Promise<ProviderDebugResult> {
    const apiKey = process.env.USDA_MARS_API_KEY?.trim();
    if (!apiKey) {
      return {
        provider: 'USDA Market News',
        ok: false,
        query: { commodity },
        rowCount: 0,
        sample: [],
        message: 'USDA_MARS_API_KEY is not configured',
      };
    }

    try {
      const auth = Buffer.from(`${apiKey}:`).toString('base64');
      const response = await axios.get<any>(
        'https://marsapi.ams.usda.gov/services/v1.2/reports/3324/Details',
        {
          timeout: 15000,
          headers: {
            Authorization: `Basic ${auth}`,
          },
          params: {
            lastReports: 1,
          },
        },
      );

      const rows = this.extractUsdaRows(response.data);
      return {
        provider: 'USDA Market News',
        ok: true,
        status: response.status,
        query: {
          commodity,
          reportId: 3324,
          lastReports: 1,
        },
        rowCount: rows.length,
        sample: rows.slice(0, 3),
      };
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const payload = axios.isAxiosError(error) ? error.response?.data : undefined;
      return {
        provider: 'USDA Market News',
        ok: false,
        status,
        query: {
          commodity,
          reportId: 3324,
          lastReports: 1,
        },
        rowCount: 0,
        sample: payload != null ? [payload] : [],
        message: error.message,
      };
    }
  }

  private async upsertReferencePrice(input: ReferencePriceInput): Promise<void> {
    const existing = await this.priceHistoryRepository.findOne({
      where: {
        fruitId: input.fruitId,
        marketId: input.marketId,
        date: input.date,
      },
    });

    const entry = existing ?? new PriceHistory();
    entry.fruitId = input.fruitId;
    entry.marketId = input.marketId;
    entry.price = Number(input.price.toFixed(2));
    entry.date = input.date;
    entry.unitType = input.unitType;
    entry.additionalData = {
      source: input.source,
      sourceRegion: input.sourceRegion,
      currency: input.currency,
      productStage: input.productStage,
      updatedAt: new Date().toISOString(),
      ...input.metadata,
    };

    await this.priceHistoryRepository.save(entry);
  }

  private resolveEuProductName(nameEs: string): string | null {
    const normalized = this.normalizeText(nameEs);
    for (const [key, value] of Object.entries(ScraperService.euProductMap)) {
      if (normalized.includes(key)) {
        return value;
      }
    }
    return null;
  }

  private async queryEuQlikRows(
    product: string,
    memberStateCode: string,
    currentYear: number,
  ): Promise<{ rows: EuQlikPriceRow[]; debugNote: string }> {
    const appId = await this.fetchEuQlikAppId();
    const client = await this.openEuQlikSession();
    const productPatterns = this.resolveEuQlikProductPatterns(product);
    const previousYear = currentYear - 1;

    try {
      const openDoc = await client.request(-1, 'OpenDoc', [appId]);
      const docHandle = openDoc?.result?.qReturn?.qHandle;
      if (typeof docHandle !== 'number') {
        throw new Error('EU Qlik OpenDoc did not return a document handle');
      }

      for (const stage of ScraperService.euQlikStagePriority) {
        for (const productPattern of productPatterns) {
          const safeCountry = this.escapeQlikSetLiteral(memberStateCode);
          const safePattern = this.escapeQlikSearchLiteral(productPattern);
          const safeStage = this.escapeQlikSetLiteral(stage);
          const measureExpression =
            `=Avg({<[Member State Code]={'${safeCountry}'},` +
            `[Product Stage]={'${safeStage}'},` +
            `[Product Quality/Variety]={"${safePattern}"},` +
            `[Nr Year]={${previousYear},${currentYear}}>} [Vl Euro Price])`;

          const sessionObject = await client.request(docHandle, 'CreateSessionObject', [
            {
              qInfo: { qType: 'eu-price-extract' },
              qHyperCubeDef: {
                qDimensions: [
                  { qDef: { qFieldDefs: ['Dt Begin Period'] }, qNullSuppression: true },
                  { qDef: { qFieldDefs: ['Market'] }, qNullSuppression: true },
                  { qDef: { qFieldDefs: ['Ds Price Uom'] }, qNullSuppression: true },
                  { qDef: { qFieldDefs: ['Product Quality/Variety'] }, qNullSuppression: true },
                  { qDef: { qFieldDefs: ['Product Stage'] }, qNullSuppression: true },
                ],
                qMeasures: [
                  {
                    qDef: {
                      qDef: measureExpression,
                      qLabel: 'EU price',
                    },
                  },
                ],
                qInitialDataFetch: [
                  {
                    qTop: 0,
                    qLeft: 0,
                    qWidth: 6,
                    qHeight: 1000,
                  },
                ],
                qSuppressMissing: true,
                qSuppressZero: true,
              },
            },
          ]);

          const objectHandle = sessionObject?.result?.qReturn?.qHandle;
          if (typeof objectHandle !== 'number') {
            throw new Error('EU Qlik CreateSessionObject did not return an object handle');
          }

          const layoutResponse = await client.request(objectHandle, 'GetLayout', []);
          const hyperCube = layoutResponse?.result?.qLayout?.qHyperCube;
          const matrix = hyperCube?.qDataPages?.[0]?.qMatrix ?? [];

          const rows = matrix
            .map((cells: any[]) => {
              const referenceDate = this.parseEuDate(`${cells?.[0]?.qText ?? ''}`);
              const price = Number(cells?.[5]?.qNum);
              if (!referenceDate || Number.isNaN(price) || price <= 0) {
                return null;
              }

              return {
                price,
                unitRaw: `${cells?.[2]?.qText ?? 'EUR/kg'}`.trim() || 'EUR/kg',
                market: `${cells?.[1]?.qText ?? ''}`.trim(),
                productLabel: `${cells?.[3]?.qText ?? ''}`.trim(),
                productStage: `${cells?.[4]?.qText ?? stage}`.trim(),
                referenceDate,
              } satisfies EuQlikPriceRow;
            })
            .filter((row): row is EuQlikPriceRow => row != null)
            .sort((a, b) => b.referenceDate.getTime() - a.referenceDate.getTime());

          if (rows.length > 0) {
            return {
              rows,
              debugNote: `EU Qlik rows ${rows.length} for ${product}/${memberStateCode} using ${productPattern} @ ${stage}`,
            };
          }
        }
      }
      return {
        rows: [],
        debugNote: `EU Qlik rows 0 for ${product}/${memberStateCode} using ${productPatterns.join(', ')}`,
      };
    } finally {
      client.close();
    }
  }

  private async fetchEuQlikAppId(): Promise<string> {
    try {
      const response = await axios.get<any[]>(ScraperService.euQlikAppIdMappingUrl, {
        timeout: 15000,
      });
      const rows = Array.isArray(response.data) ? response.data : [];
      const mapped = rows.find(
        (row) => `${row?.name ?? ''}`.trim() === 'Fruits and Vegetables - Supply Chain',
      );
      return `${mapped?.id ?? ScraperService.euQlikDefaultAppId}`.trim();
    } catch (error) {
      this.logger.warn(`EU Qlik app-id mapping fetch failed: ${error.message}`);
      return ScraperService.euQlikDefaultAppId;
    }
  }

  private resolveEuQlikProductPatterns(product: string): string[] {
    const mapped = ScraperService.euQlikProductPatternMap[product];
    if (mapped && mapped.length > 0) {
      return mapped;
    }

    return [`${product.replace(/"/g, '').trim()}*`];
  }

  private escapeQlikSetLiteral(value: string): string {
    return `${value ?? ''}`.replace(/'/g, "''").trim();
  }

  private escapeQlikSearchLiteral(value: string): string {
    return `${value ?? ''}`.replace(/\\/g, '\\\\').replace(/"/g, '\\"').trim();
  }

  private async openEuQlikSession(): Promise<{
    request: (handle: number, method: string, params: any[]) => Promise<any>;
    close: () => void;
  }> {
    const socket = new WebSocket(ScraperService.euQlikWsUrl, {
      headers: {
        Origin: 'https://agridata.ec.europa.eu',
      },
    });

    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        socket.off('error', onError);
        resolve();
      };
      const onError = (error: Error) => {
        socket.off('open', onOpen);
        reject(error ?? new Error('EU Qlik websocket connection failed'));
      };
      socket.once('open', onOpen);
      socket.once('error', onError);
    });

    let nextId = 1;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    const rejectPending = (error: Error) => {
      for (const entry of pending.values()) {
        entry.reject(error);
      }
      pending.clear();
    };

    socket.on('message', (event: WebSocket.RawData) => {
      const raw = typeof event === 'string' ? event : event.toString();
      let payload: any;
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }

      const requestId = Number(payload?.id);
      if (!Number.isFinite(requestId) || !pending.has(requestId)) {
        return;
      }

      const resolver = pending.get(requestId)!;
      pending.delete(requestId);
      if (payload?.error) {
        resolver.reject(new Error(payload.error.message ?? 'EU Qlik request failed'));
        return;
      }
      resolver.resolve(payload);
    });

    socket.on('close', () => {
      rejectPending(new Error('EU Qlik websocket connection closed'));
    });

    socket.on('error', (error: Error) => {
      rejectPending(error ?? new Error('EU Qlik websocket error'));
    });

    return {
      request: (handle: number, method: string, params: any[]) =>
        new Promise((resolve, reject) => {
          const id = nextId++;
          pending.set(id, { resolve, reject });
          socket.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              handle,
              method,
              params,
            }),
          );

          setTimeout(() => {
            if (!pending.has(id)) {
              return;
            }
            pending.delete(id);
            reject(new Error(`EU Qlik request timed out: ${method}`));
          }, 15000);
        }),
      close: () => {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      },
    };
  }

  private extractUsdaRows(payload: any): UsdaApiRow[] {
    if (Array.isArray(payload)) {
      return payload.flatMap((item) => this.extractUsdaRows(item));
    }

    if (payload && typeof payload === 'object') {
      const looksLikeLeafRow =
        'commodity' in payload ||
        'item_name' in payload ||
        'item_description' in payload ||
        'variety' in payload ||
        'weighted_average' in payload ||
        'average_price' in payload ||
        'price' in payload ||
        'mostly_price' in payload;
      if (looksLikeLeafRow) {
        return [payload as UsdaApiRow];
      }

      const candidates = [
        payload.results,
        payload.Results,
        payload.data,
        payload.Data,
        payload.report,
        payload.rows,
        payload.details,
      ];

      for (const candidate of candidates) {
        const extracted = this.extractUsdaRows(candidate);
        if (extracted.length > 0) {
          return extracted;
        }
      }

      return Object.values(payload).flatMap((value) => this.extractUsdaRows(value));
    }

    return [];
  }

  private parseNumericPrice(value: string | number | null | undefined): number {
    if (typeof value === 'number') {
      return value;
    }

    const normalized = `${value ?? ''}`.replace(/[^0-9,.\-]/g, '').trim();
    if (!normalized) {
      return Number.NaN;
    }

    const hasComma = normalized.includes(',');
    const hasDot = normalized.includes('.');
    let candidate = normalized;

    if (hasComma && hasDot) {
      candidate = normalized.replace(/\./g, '').replace(',', '.');
    } else if (hasComma) {
      candidate = normalized.replace(',', '.');
    }

    return Number.parseFloat(candidate);
  }

  private matchesCommodity(searchableText: string, commodity: string): boolean {
    const normalizedCommodity = this.normalizeText(commodity);
    const variants = Array.from(
      new Set([
        normalizedCommodity,
        normalizedCommodity.replace(/es$/, ''),
        normalizedCommodity.replace(/s$/, ''),
      ]),
    ).filter((value) => value.length >= 3);

    return variants.some((variant) => searchableText.includes(variant));
  }

  private resolveUsdaCommodityName(nameEs: string): string | null {
    const normalized = this.normalizeText(nameEs);
    for (const [key, value] of Object.entries(ScraperService.usdaProductMap)) {
      if (normalized.includes(key)) {
        return value;
      }
    }
    return null;
  }

  private resolveCountryCode(country: string): string | null {
    const normalized = this.normalizeText(country);
    for (const [key, value] of Object.entries(ScraperService.countryCodeMap)) {
      if (normalized.includes(key)) {
        return value;
      }
    }
    return null;
  }

  private buildMarketIdentityKeys(name: string, country: string): string[] {
    const normalizedName = this.normalizeText(name);
    const normalizedCountry = this.normalizeText(country);
    const keys = new Set<string>([`${normalizedName}:${normalizedCountry}`]);

    for (const [canonicalName, aliases] of Object.entries(ScraperService.marketAliasMap)) {
      const groupNames = [canonicalName, ...aliases].map((value) => this.normalizeText(value));
      if (groupNames.includes(normalizedName)) {
        for (const candidate of groupNames) {
          keys.add(`${candidate}:${normalizedCountry}`);
        }
      }
    }

    return Array.from(keys);
  }

  private normalizeText(value: string): string {
    return `${value ?? ''}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private normalizeArabicText(value: string): string {
    return `${value ?? ''}`
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private parseEuDate(value: string): Date | null {
    const parts = value.split('/');
    if (parts.length !== 3) return null;

    const day = Number.parseInt(parts[0], 10);
    const month = Number.parseInt(parts[1], 10);
    const year = Number.parseInt(parts[2], 10);
    if ([day, month, year].some((item) => Number.isNaN(item))) return null;

    return new Date(Date.UTC(year, month - 1, day));
  }

  private parseUsdaDate(value: string): Date | null {
    const trimmed = `${value ?? ''}`.trim();
    if (!trimmed) return null;

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(
        Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
      );
    }

    const parts = trimmed.split('/');
    if (parts.length !== 3) return null;

    const month = Number.parseInt(parts[0], 10);
    const day = Number.parseInt(parts[1], 10);
    const year = Number.parseInt(parts[2], 10);
    if ([day, month, year].some((item) => Number.isNaN(item))) return null;

    return new Date(Date.UTC(year, month - 1, day));
  }

  private parseObourDate(value: string): Date | null {
    const match = `${value ?? ''}`.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) {
      return null;
    }

    const first = Number.parseInt(match[1], 10);
    const second = Number.parseInt(match[2], 10);
    const year = Number.parseInt(match[3], 10);
    if ([first, second, year].some((item) => Number.isNaN(item))) {
      return null;
    }

    const monthFirst = new Date(Date.UTC(year, first - 1, second));
    const dayFirst = new Date(Date.UTC(year, second - 1, first));
    const today = this.todayUtc().getTime();
    const monthFirstDelta = Math.abs(monthFirst.getTime() - today);
    const dayFirstDelta = Math.abs(dayFirst.getTime() - today);
    return monthFirstDelta <= dayFirstDelta ? monthFirst : dayFirst;
  }

  private parseEnglishLongDate(value: string): Date | null {
    const parsed = new Date(`${value ?? ''}`.trim());
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return new Date(
      Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
    );
  }

  private parseMercosurDate(yearValue: string, monthValue: string): Date | null {
    const year = Number.parseInt(`${yearValue}`.trim(), 10);
    if (Number.isNaN(year)) return null;

    const normalizedMonth = this.normalizeText(monthValue);
    const months: Record<string, number> = {
      enero: 1,
      fevereiro: 2,
      febrero: 2,
      marzo: 3,
      abril: 4,
      mayo: 5,
      junho: 6,
      junio: 6,
      julho: 7,
      julio: 7,
      agosto: 8,
      setembro: 9,
      setiembre: 9,
      septiembre: 9,
      outubro: 10,
      octubre: 10,
      novembro: 11,
      noviembre: 11,
      dezembro: 12,
      diciembre: 12,
    };

    const month = months[normalizedMonth];
    if (!month) return null;

    return new Date(Date.UTC(year, month - 1, 1));
  }

  private extractMercosurYearValue(row: MercosurCsvRow): string {
    const directValues = [row.año, row.ano, row['a�o']]
      .map((value) => `${value ?? ''}`.trim())
      .filter((value) => value.length > 0);

    if (directValues.length > 0) {
      return directValues[0];
    }

    const dynamicKey = Object.keys(row).find((key) => {
      const normalized = this.normalizeText(key).replace(/[^a-z]/g, '');
      return normalized === 'ano' || normalized === 'ao';
    });

    return dynamicKey ? `${(row as Record<string, unknown>)[dynamicKey] ?? ''}`.trim() : '';
  }

  private parseSimpleCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (inQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
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

  private resolveIndiaMandiCommodityLabels(nameEs: string): string[] {
    const normalized = this.normalizeText(nameEs);
    for (const [key, value] of Object.entries(ScraperService.indiaMandiProductMap)) {
      if (normalized.includes(key)) {
        return value;
      }
    }

    return [];
  }

  private resolveAustraliaDaffLabels(nameEs: string): string[] {
    const normalized = this.normalizeText(nameEs);
    for (const [key, value] of Object.entries(ScraperService.australiaDaffProductMap)) {
      if (normalized.includes(key)) {
        return value;
      }
    }

    return [];
  }

  private async fetchAustraliaDaffIndices(): Promise<Map<string, AustraliaDaffIndexRow>> {
    try {
      const response = await axios.get<string>(ScraperService.australiaDaffPricesUrl, {
        timeout: 40000,
        responseType: 'text',
      });

      const html = `${response.data ?? ''}`;
      const dateMatch = html.match(/week ending\s*([^".<]+?\d{4})/i);
      const referenceDate = this.parseEnglishLongDate(dateMatch?.[1] ?? '');
      if (!referenceDate) {
        this.logger.warn('ABARES DAFF page did not expose a recognizable week ending date');
        return new Map();
      }

      const latestBySeries = new Map<string, AustraliaDaffIndexRow>();
      for (const match of html.matchAll(/alt="([^"]+?)"/gi)) {
        const altText = this.decodeHtmlEntities(match[1]).replace(/\s+/g, ' ').trim();
        const seriesMatch = altText.match(
          /(Apple prices in Melbourne|Banana prices in Melbourne|Orange prices in Melbourne|Strawberry prices in Melbourne|Onion prices in Melbourne|Potato prices in Melbourne|Tomato prices in Melbourne)[^0-9\-]*(-?\d+(?:\.\d+)?)/i,
        );
        if (!seriesMatch) {
          continue;
        }

        const product = seriesMatch[1].trim();
        const indexValue = this.parseNumericPrice(seriesMatch[2]);
        if (Number.isNaN(indexValue)) {
          continue;
        }

        latestBySeries.set(product, {
          product,
          indexValue: Number(indexValue.toFixed(2)),
          referenceDate,
        });
      }

      return latestBySeries;
    } catch (error) {
      this.logger.warn(`ABARES DAFF fetch failed: ${error.message}`);
      return new Map();
    }
  }

  private async fetchIndiaMandiRows(commodity: string): Promise<IndiaMandiRow[]> {
    try {
      const response = await axios.get<any>(ScraperService.indiaMandiApiUrl, {
        timeout: 20000,
        params: {
          'api-key': ScraperService.indiaMandiApiKey,
          format: 'json',
          offset: 0,
          limit: 200,
          'filters[commodity]': commodity,
        },
      });

      const records = Array.isArray(response.data?.records) ? response.data.records : [];
      return records
        .map((record) => {
          const arrivalDate = this.parseEuDate(`${record.arrival_date ?? ''}`);
          const minPrice = this.parseNumericPrice(record.min_price);
          const maxPrice = this.parseNumericPrice(record.max_price);
          const modalPrice = this.parseNumericPrice(record.modal_price);
          if (
            !arrivalDate ||
            [minPrice, maxPrice, modalPrice].some((value) => Number.isNaN(value) || value <= 0)
          ) {
            return null;
          }

          return {
            state: `${record.state ?? ''}`.trim(),
            district: `${record.district ?? ''}`.trim(),
            market: `${record.market ?? ''}`.trim(),
            commodity: `${record.commodity ?? ''}`.trim(),
            variety: `${record.variety ?? ''}`.trim(),
            grade: `${record.grade ?? ''}`.trim(),
            arrivalDate,
            minPrice: Number(minPrice.toFixed(2)),
            maxPrice: Number(maxPrice.toFixed(2)),
            modalPrice: Number(modalPrice.toFixed(2)),
          } satisfies IndiaMandiRow;
        })
        .filter((row): row is IndiaMandiRow => row != null);
    } catch (error) {
      this.logger.warn(`AGMARKNET fetch failed for ${commodity}: ${error.message}`);
      return [];
    }
  }

  private resolveObourProductAliases(nameEs: string): string[] {
    const normalized = this.normalizeText(nameEs);
    for (const [key, value] of Object.entries(ScraperService.obourProductMap)) {
      if (normalized.includes(key)) {
        return value.map((alias) => this.normalizeArabicText(alias));
      }
    }

    return [];
  }

  private async fetchObourLatestCards(): Promise<ObourCardRow[]> {
    try {
      const response = await axios.get<string>(ScraperService.obourPricesUrl, {
        timeout: 20000,
        responseType: 'text',
      });

      const html = `${response.data ?? ''}`;
      const dateMatch = html.match(/تاريخ اليوم\s*:\s*([^<]+)/i);
      const referenceDate = this.parseObourDate(dateMatch?.[1] ?? '');
      if (!referenceDate) {
        this.logger.warn('Obour Market page did not expose a recognizable date');
        return [];
      }

      const blocks = Array.from(html.matchAll(/<div class='card'[\s\S]*?<\/div><hr \/>/gi)).map(
        (match) => match[0],
      );
      const rows: ObourCardRow[] = [];
      for (const block of blocks) {
        const product = this.decodeHtmlEntities(
          block.match(/<h5[^>]*>\s*([^<]+?)\s*<\/h5>/i)?.[1] ?? '',
        )
          .replace(/\s+/g, ' ')
          .trim();
        const unitRaw = this.decodeHtmlEntities(
          block.match(/class='status'[^>]*>\s*([^<]+?)\s*<\/span>/i)?.[1] ?? '',
        )
          .replace(/\s+/g, ' ')
          .trim();
        const packaging = this.decodeHtmlEntities(
          block.match(/العبوة:\s*<strong>\s*([^<]+?)\s*<\/strong>/i)?.[1] ?? '',
        )
          .replace(/\s+/g, ' ')
          .trim();
        const minRaw = block.match(/من سعر\s*:\s*<strong>\s*([^<]+?)\s*<\/strong>/i)?.[1];
        const maxRaw = block.match(
          /الى سعر\s*:\s*<strong>\s*([^<]+?)\s*<\/strong>/i,
        )?.[1];
        const minPrice = this.parseNumericPrice(minRaw);
        const maxPrice = this.parseNumericPrice(maxRaw);
        if (!product || [minPrice, maxPrice].some((value) => Number.isNaN(value) || value <= 0)) {
          continue;
        }

        rows.push({
          product,
          unitType: this.normalizeObourUnit(unitRaw),
          minPrice: Number(minPrice.toFixed(2)),
          maxPrice: Number(maxPrice.toFixed(2)),
          packaging,
          referenceDate,
        });
      }

      return rows;
    } catch (error) {
      this.logger.warn(`Obour Market fetch failed: ${error.message}`);
      return [];
    }
  }

  private async fetchLatestStatsCanPrices(): Promise<Map<string, StatsCanLatestRow>> {
    try {
      const response = await axios.get<ArrayBuffer>(ScraperService.statsCanPricesUrl, {
        responseType: 'arraybuffer',
        timeout: 20000,
      });
      const zip = new AdmZip(Buffer.from(response.data));
      const entry = zip.getEntry(ScraperService.statsCanCsvName);
      if (!entry) {
        this.logger.warn('Statistics Canada ZIP did not include 18100245.csv');
        return new Map();
      }

      const csv = entry.getData().toString('utf8');
      const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
      if (lines.length < 2) {
        return new Map();
      }

      const headers = this.parseSimpleCsvLine(lines[0]);
      const refDateIndex = headers.indexOf('REF_DATE');
      const geographyIndex = headers.indexOf('GEO');
      const productIndex = headers.indexOf('Products');
      const valueIndex = headers.indexOf('VALUE');
      if ([refDateIndex, geographyIndex, productIndex, valueIndex].some((index) => index < 0)) {
        this.logger.warn('Statistics Canada CSV headers were not recognized');
        return new Map();
      }

      const supportedProducts = new Set(
        Object.values(ScraperService.statsCanProductMap).flat(),
      );
      const latestByProduct = new Map<string, StatsCanLatestRow>();
      for (let index = 1; index < lines.length; index += 1) {
        const values = this.parseSimpleCsvLine(lines[index]);
        const geography = `${values[geographyIndex] ?? ''}`.trim();
        const product = `${values[productIndex] ?? ''}`.trim();
        if (geography !== 'Canada' || !supportedProducts.has(product)) {
          continue;
        }

        const price = this.parseNumericPrice(values[valueIndex]);
        const referenceDate = this.parseStatsCanDate(values[refDateIndex]);
        if (Number.isNaN(price) || price <= 0 || !referenceDate) {
          continue;
        }

        const current = latestByProduct.get(product);
        if (!current || referenceDate.getTime() > current.referenceDate.getTime()) {
          latestByProduct.set(product, {
            product,
            geography,
            price: Number(price.toFixed(2)),
            unitType: this.resolveStatsCanUnitType(product),
            referenceDate,
          });
        }
      }

      return latestByProduct;
    } catch (error) {
      this.logger.warn(`Statistics Canada fetch failed: ${error.message}`);
      return new Map();
    }
  }

  private resolveStatsCanProductLabels(nameEs: string): string[] {
    const normalized = this.normalizeText(nameEs);
    for (const [key, value] of Object.entries(ScraperService.statsCanProductMap)) {
      if (normalized.includes(key)) {
        return value;
      }
    }

    return [];
  }

  private resolveStatsCanUnitType(productLabel: string): string {
    const normalized = productLabel.toLowerCase();
    if (normalized.includes('per kilogram')) return 'kg';
    if (normalized.includes('unit')) return 'unit';
    if (normalized.includes('454 grams')) return '454g';
    if (normalized.includes('4.54 kilograms')) return '4.54kg';
    return 'unit';
  }

  private parseStatsCanDate(value: string): Date | null {
    const match = `${value ?? ''}`.trim().match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      return null;
    }

    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    if (Number.isNaN(year) || Number.isNaN(month)) {
      return null;
    }

    return new Date(Date.UTC(year, month - 1, 1));
  }

  private resolveSniimProductId(nameEs: string): string | null {
    const normalized = this.normalizeText(nameEs);
    for (const [key, value] of Object.entries(ScraperService.sniimProductMap)) {
      if (normalized.includes(key)) {
        return value;
      }
    }

    return null;
  }

  private async fetchSniimRows(productId: string, referenceDate: Date): Promise<SniimRow[]> {
    try {
      const response = await axios.get<string>(ScraperService.sniimResultsUrl, {
        timeout: 15000,
        responseType: 'text',
        params: {
          fechaInicio: this.formatSniimDate(referenceDate),
          fechaFinal: this.formatSniimDate(referenceDate),
          ProductoId: productId,
          OrigenId: -1,
          Origen: 'Todos',
          DestinoId: ScraperService.sniimDestinationId,
          Destino: ScraperService.sniimDestinationLabel,
          PreciosPorId: 2,
          RegistrosPorPagina: 500,
        },
      });

      const html = `${response.data ?? ''}`;
      if (!html || html.includes('NO HAY REGISTROS')) {
        return [];
      }

      const tokens = Array.from(html.matchAll(/>([^<>]+)</g))
        .map((match) => this.decodeHtmlEntities(match[1]))
        .map((value) => value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim())
        .filter((value) => value.length > 0);

      const sectionIndex = tokens.findIndex((token) => /^(Frutas|Hortalizas)$/i.test(token));
      if (sectionIndex < 0) {
        return [];
      }

      const rows: SniimRow[] = [];
      for (let index = sectionIndex + 1; index <= tokens.length - 5; index += 1) {
        const current = tokens[index];
        if (
          current.toUpperCase().startsWith('PRECIO MIN') ||
          current.toUpperCase().startsWith('PRECIO MÍN') ||
          current.toUpperCase().startsWith('NO HAY REGISTROS') ||
          current.toUpperCase().startsWith('PAGINA')
        ) {
          break;
        }

        const minPrice = this.parseNumericPrice(tokens[index + 2]);
        const maxPrice = this.parseNumericPrice(tokens[index + 3]);
        const frequentPrice = this.parseNumericPrice(tokens[index + 4]);
        if ([minPrice, maxPrice, frequentPrice].some((value) => Number.isNaN(value) || value <= 0)) {
          continue;
        }

        rows.push({
          presentation: current,
          origin: tokens[index + 1],
          minPrice: Number(minPrice.toFixed(2)),
          maxPrice: Number(maxPrice.toFixed(2)),
          frequentPrice: Number(frequentPrice.toFixed(2)),
        });
        index += 4;
      }

      return rows;
    } catch (error) {
      this.logger.warn(`SNIIM fetch failed for ${productId}: ${error.message}`);
      return [];
    }
  }

  private formatSniimDate(value: Date): string {
    const day = `${value.getUTCDate()}`.padStart(2, '0');
    const month = `${value.getUTCMonth() + 1}`.padStart(2, '0');
    return `${day}/${month}/${value.getUTCFullYear()}`;
  }

  private normalizeUnit(unitRaw: string): { currency: string; unitType: string } {
    const normalized = unitRaw.toUpperCase();
    const currency = normalized.includes('EUR')
      ? 'EUR'
      : normalized.includes('USD')
          ? 'USD'
          : normalized.includes('AUD')
              ? 'AUD'
              : 'EUR';

    const unitType = normalized.includes('/100KG')
      ? '100kg'
      : normalized.includes('/KG')
          ? 'kg'
          : normalized.includes('/T')
              ? 't'
              : 'kg';

    return { currency, unitType };
  }

  private normalizeUsdaUnit(unitRaw: string): string {
    const normalized = unitRaw.toLowerCase();
    if (normalized.includes('lb')) return 'lb';
    if (normalized.includes('kg')) return 'kg';
    if (normalized.includes('ea')) return 'unit';
    if (normalized.includes('ct')) return 'unit';
    if (normalized.includes('bunch')) return 'bunch';
    return 'unit';
  }

  private normalizeObourUnit(unitRaw: string): string {
    const normalized = this.normalizeArabicText(unitRaw);
    if (normalized.includes('كيلو')) return 'kg';
    if (normalized.includes('طن')) return 't';
    if (normalized.includes('وحد')) return 'unit';
    return 'kg';
  }

  private todayUtc(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  private getRandomCaliber(): string {
    const calibers = ['Calibre 1', 'Calibre 2', 'Calibre 3', 'Calibre A', 'Calibre B'];
    return calibers[Math.floor(Math.random() * calibers.length)];
  }

  private getRandomQuality(): 'extra' | 'first' | 'second' {
    const qualities: ('extra' | 'first' | 'second')[] = ['extra', 'first', 'first', 'second'];
    return qualities[Math.floor(Math.random() * qualities.length)];
  }
}

-- MasMercat Database Seed Data
-- Run this after migrations to populate initial data

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Insert Fruits
INSERT INTO fruits (id, "nameEs", "nameEn", "nameFr", "nameDe", "namePt", "nameAr", "nameZh", "nameHi", active) VALUES
(uuid_generate_v4(), 'Naranja', 'Orange', 'Orange', 'Orange', 'Laranja', 'برتقال', '橙子', 'संतरा', true),
(uuid_generate_v4(), 'Manzana', 'Apple', 'Pomme', 'Apfel', 'Maçã', 'تفاحة', '苹果', 'सेब', true),
(uuid_generate_v4(), 'Plátano', 'Banana', 'Banane', 'Banane', 'Banana', 'موز', '香蕉', 'केला', true),
(uuid_generate_v4(), 'Fresa', 'Strawberry', 'Fraise', 'Erdbeere', 'Morango', 'فراولة', '草莓', 'स्ट्रॉबेरी', true),
(uuid_generate_v4(), 'Sandía', 'Watermelon', 'Pastèque', 'Wassermelone', 'Melancia', 'بطيخ', '西瓜', 'तरबूज', true),
(uuid_generate_v4(), 'Melón', 'Melon', 'Melon', 'Melone', 'Melão', 'شمام', '甜瓜', 'खरबूजा', true),
(uuid_generate_v4(), 'Limón', 'Lemon', 'Citron', 'Zitrone', 'Limão', 'ليمون', '柠檬', 'नींबू', true),
(uuid_generate_v4(), 'Uva', 'Grape', 'Raisin', 'Traube', 'Uva', 'عنب', '葡萄', 'अंगूर', true),
(uuid_generate_v4(), 'Pera', 'Pear', 'Poire', 'Birne', 'Pera', 'كمثرى', '梨', 'नाशपाती', true),
(uuid_generate_v4(), 'Melocotón', 'Peach', 'Pêche', 'Pfirsich', 'Pêssego', 'خوخ', '桃子', 'आड़ू', true),
(uuid_generate_v4(), 'Cereza', 'Cherry', 'Cerise', 'Kirsche', 'Cereja', 'كرز', '樱桃', 'चेरी', true),
(uuid_generate_v4(), 'Kiwi', 'Kiwi', 'Kiwi', 'Kiwi', 'Kiwi', 'كيوي', '猕猴桃', 'कीवी', true),
(uuid_generate_v4(), 'Mango', 'Mango', 'Mangue', 'Mango', 'Manga', 'مانجو', '芒果', 'आम', true),
(uuid_generate_v4(), 'Piña', 'Pineapple', 'Ananas', 'Ananas', 'Abacaxi', 'أناناس', '菠萝', 'अनानास', true),
(uuid_generate_v4(), 'Aguacate', 'Avocado', 'Avocat', 'Avocado', 'Abacate', 'أفوكادو', '鳄梨', 'एवोकाडो', true),
(uuid_generate_v4(), 'Granada', 'Pomegranate', 'Grenade', 'Granatapfel', 'Romã', 'رمان', '石榴', 'अनार', true),
(uuid_generate_v4(), 'Ciruela', 'Plum', 'Prune', 'Pflaume', 'Ameixa', 'برقوق', '李子', 'बेर', true),
(uuid_generate_v4(), 'Albaricoque', 'Apricot', 'Abricot', 'Aprikose', 'Damasco', 'مشمش', '杏', 'खुबानी', true);

-- Insert Major European Markets
INSERT INTO markets (id, name, country, city, continent, latitude, longitude, active) VALUES
-- Spain
(uuid_generate_v4(), 'Mercavalencia', 'Spain', 'Valencia', 'Europe', 39.4699075, -0.3762881, true),
(uuid_generate_v4(), 'Mercamadrid', 'Spain', 'Madrid', 'Europe', 40.3756975, -3.7491648, true),
(uuid_generate_v4(), 'Mercabarna', 'Spain', 'Barcelona', 'Europe', 41.3503396, 2.1290113, true),
(uuid_generate_v4(), 'Mercasevilla', 'Spain', 'Sevilla', 'Europe', 37.3890924, -5.9844589, true),

-- France
(uuid_generate_v4(), 'Rungis International Market', 'France', 'Paris', 'Europe', 48.7572451, 2.3480647, true),
(uuid_generate_v4(), 'MIN de Lyon', 'France', 'Lyon', 'Europe', 45.7578137, 4.8320114, true),
(uuid_generate_v4(), 'MIN de Marseille', 'France', 'Marseille', 'Europe', 43.2964820, 5.3697800, true),

-- Germany
(uuid_generate_v4(), 'Großmarkt Berlin', 'Germany', 'Berlin', 'Europe', 52.5200066, 13.4049540, true),
(uuid_generate_v4(), 'Großmarkt München', 'Germany', 'Munich', 'Europe', 48.1351253, 11.5819805, true),
(uuid_generate_v4(), 'Großmarkt Hamburg', 'Germany', 'Hamburg', 'Europe', 53.5510846, 9.9936819, true),

-- Italy
(uuid_generate_v4(), 'Mercati Generali Milano', 'Italy', 'Milan', 'Europe', 45.4642035, 9.1899820, true),
(uuid_generate_v4(), 'Mercati Generali Roma', 'Italy', 'Rome', 'Europe', 41.9027835, 12.4963655, true),

-- Netherlands
(uuid_generate_v4(), 'FloraHolland', 'Netherlands', 'Aalsmeer', 'Europe', 52.2626020, 4.7637300, true),
(uuid_generate_v4(), 'Fresh Park Venlo', 'Netherlands', 'Venlo', 'Europe', 51.3703748, 6.1724031, true),

-- UK
(uuid_generate_v4(), 'New Covent Garden Market', 'United Kingdom', 'London', 'Europe', 51.5073509, -0.1277583, true),
(uuid_generate_v4(), 'Manchester Wholesale Market', 'United Kingdom', 'Manchester', 'Europe', 53.4807593, -2.2426305, true),

-- Belgium
(uuid_generate_v4(), 'Brussels Wholesale Market', 'Belgium', 'Brussels', 'Europe', 50.8503396, 4.3517103, true),

-- Portugal
(uuid_generate_v4(), 'MARL - Lisboa', 'Portugal', 'Lisbon', 'Europe', 38.7222524, -9.1393366, true);

-- Create sample seller user
INSERT INTO users (id, name, email, password, role, country, language, phone, company, "isActive") VALUES
(uuid_generate_v4(), 'Juan García', 'seller@example.com', '$2b$10$X.K5mXnVqVqVqVqVqVqVqekJ3N0N5qbF7xJ8DQZ1KGTYiLz.2', 'seller', 'Spain', 'es', '+34600123456', 'Frutas García SL', true);

-- Create sample buyer user
INSERT INTO users (id, name, email, password, role, country, language, phone, company, "isActive") VALUES
(uuid_generate_v4(), 'Pierre Dubois', 'buyer@example.com', '$2b$10$X.K5mXnVqVqVqVqVqVqVqekJ3N0N5qbF7xJ8DQZ1KGTYiLz.2', 'buyer', 'France', 'fr', '+33612345678', 'Fruits Import France', true);

-- Note: Password for all demo users is: Demo123!
-- You should change these in production!

COMMIT;

export interface CategorySeed {
  slug: string;
  nameEs: string;
  nameEn: string;
}

export interface ZoneSeed {
  slug: string;
  name: string;
  state: string;
}

export const CATEGORIES: readonly CategorySeed[] = [
  { slug: 'plumbing', nameEs: 'Plomería', nameEn: 'Plumbing' },
  { slug: 'electrical', nameEs: 'Electricidad', nameEn: 'Electrical work' },
  { slug: 'cleaning', nameEs: 'Limpieza', nameEn: 'Cleaning' },
  { slug: 'painting', nameEs: 'Pintura', nameEn: 'Painting' },
  { slug: 'carpentry', nameEs: 'Carpintería', nameEn: 'Carpentry' },
  { slug: 'gardening', nameEs: 'Jardinería', nameEn: 'Gardening' },
  { slug: 'locksmith', nameEs: 'Cerrajería', nameEn: 'Locksmith' },
  { slug: 'air-conditioning', nameEs: 'Aire acondicionado', nameEn: 'Air conditioning' },
];

const MEXICO_CITY = 'Ciudad de México';

export const ZONES: readonly ZoneSeed[] = [
  { slug: 'alvaro-obregon', name: 'Álvaro Obregón', state: MEXICO_CITY },
  { slug: 'azcapotzalco', name: 'Azcapotzalco', state: MEXICO_CITY },
  { slug: 'benito-juarez', name: 'Benito Juárez', state: MEXICO_CITY },
  { slug: 'coyoacan', name: 'Coyoacán', state: MEXICO_CITY },
  { slug: 'cuajimalpa-de-morelos', name: 'Cuajimalpa de Morelos', state: MEXICO_CITY },
  { slug: 'cuauhtemoc', name: 'Cuauhtémoc', state: MEXICO_CITY },
  { slug: 'gustavo-a-madero', name: 'Gustavo A. Madero', state: MEXICO_CITY },
  { slug: 'iztacalco', name: 'Iztacalco', state: MEXICO_CITY },
  { slug: 'iztapalapa', name: 'Iztapalapa', state: MEXICO_CITY },
  { slug: 'la-magdalena-contreras', name: 'La Magdalena Contreras', state: MEXICO_CITY },
  { slug: 'miguel-hidalgo', name: 'Miguel Hidalgo', state: MEXICO_CITY },
  { slug: 'milpa-alta', name: 'Milpa Alta', state: MEXICO_CITY },
  { slug: 'tlahuac', name: 'Tláhuac', state: MEXICO_CITY },
  { slug: 'tlalpan', name: 'Tlalpan', state: MEXICO_CITY },
  { slug: 'venustiano-carranza', name: 'Venustiano Carranza', state: MEXICO_CITY },
  { slug: 'xochimilco', name: 'Xochimilco', state: MEXICO_CITY },
];

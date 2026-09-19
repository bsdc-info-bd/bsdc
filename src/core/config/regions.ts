/**
 * BSDC — src/core/config/regions.ts
 * Purpose : Bangladesh administrative reference data used by geo affinity, marketplace
 *           delivery areas, ads district targeting and the local feed (PART 12.02, PART 20, PART 21.4).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Coordinates are district centroid approximations for map centring and distance
 *           maths (Turf.js). They are intentionally not survey-grade: precise geometry is always
 *           taken from the user-selected OSM pin, never from this table (ADR-026).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** The eight administrative divisions. */
export const DIVISIONS = [
  { id: 'dhaka', bn: 'ঢাকা', en: 'Dhaka' },
  { id: 'chattogram', bn: 'চট্টগ্রাম', en: 'Chattogram' },
  { id: 'rajshahi', bn: 'রাজশাহী', en: 'Rajshahi' },
  { id: 'khulna', bn: 'খুলনা', en: 'Khulna' },
  { id: 'barishal', bn: 'বরিশাল', en: 'Barishal' },
  { id: 'sylhet', bn: 'সিলেট', en: 'Sylhet' },
  { id: 'rangpur', bn: 'রংপুর', en: 'Rangpur' },
  { id: 'mymensingh', bn: 'ময়মনসিংহ', en: 'Mymensingh' },
] as const;

export type DivisionId = (typeof DIVISIONS)[number]['id'];

/** A Bangladesh district (zila) with centroid approximation. */
export interface District {
  readonly id: string;
  readonly bn: string;
  readonly en: string;
  readonly division: DivisionId;
  readonly lat: number;
  readonly lng: number;
}

const d = (
  id: string,
  bn: string,
  en: string,
  division: DivisionId,
  lat: number,
  lng: number,
): District => ({ id, bn, en, division, lat, lng });

/** All sixty-four districts. */
export const DISTRICTS: readonly District[] = [
  // Dhaka division
  d('dhaka', 'ঢাকা', 'Dhaka', 'dhaka', 23.8103, 90.4125),
  d('faridpur', 'ফরিদপুর', 'Faridpur', 'dhaka', 23.607, 89.8429),
  d('gazipur', 'গাজীপুর', 'Gazipur', 'dhaka', 23.9999, 90.4203),
  d('gopalganj', 'গোপালগঞ্জ', 'Gopalganj', 'dhaka', 23.0051, 89.8266),
  d('kishoreganj', 'কিশোরগঞ্জ', 'Kishoreganj', 'dhaka', 24.4449, 90.7764),
  d('madaripur', 'মাদারীপুর', 'Madaripur', 'dhaka', 23.1641, 90.1892),
  d('manikganj', 'মানিকগঞ্জ', 'Manikganj', 'dhaka', 23.8644, 90.0047),
  d('munshiganj', 'মুন্সিগঞ্জ', 'Munshiganj', 'dhaka', 23.5422, 90.5305),
  d('narayanganj', 'নারায়ণগঞ্জ', 'Narayanganj', 'dhaka', 23.6238, 90.5),
  d('narsingdi', 'নরসিংদী', 'Narsingdi', 'dhaka', 23.9167, 90.7333),
  d('rajbari', 'রাজবাড়ী', 'Rajbari', 'dhaka', 23.7574, 89.6446),
  d('shariatpur', 'শরীয়তপুর', 'Shariatpur', 'dhaka', 23.2423, 90.3517),
  d('tangail', 'টাঙ্গাইল', 'Tangail', 'dhaka', 24.2513, 89.9167),
  // Chattogram division
  d('bandarban', 'বান্দরবান', 'Bandarban', 'chattogram', 22.1953, 92.2184),
  d('brahmanbaria', 'ব্রাহ্মণবাড়ীয়া', 'Brahmanbaria', 'chattogram', 23.9572, 91.1119),
  d('chandpur', 'চাঁদপুর', 'Chandpur', 'chattogram', 23.2167, 90.65),
  d('chattogram', 'চট্টগ্রাম', 'Chattogram', 'chattogram', 22.3569, 91.7832),
  d('cumilla', 'কুমিল্লা', 'Cumilla', 'chattogram', 23.4682, 91.1789),
  d('coxs-bazar', 'কক্সবাজার', "Cox's Bazar", 'chattogram', 21.4272, 92.0058),
  d('feni', 'ফেনী', 'Feni', 'chattogram', 23.0159, 91.3976),
  d('khagrachhari', 'খাগড়াছড়ি', 'Khagrachhari', 'chattogram', 23.1193, 91.9847),
  d('lakshmipur', 'লক্ষ্মীপুর', 'Lakshmipur', 'chattogram', 22.9425, 90.8272),
  d('noakhali', 'নোয়াখালী', 'Noakhali', 'chattogram', 22.8696, 91.0996),
  d('rangamati', 'রাঙ্গামাটি', 'Rangamati', 'chattogram', 22.7324, 92.2985),
  // Rajshahi division
  d('bogura', 'বগুড়া', 'Bogura', 'rajshahi', 24.8465, 89.3778),
  d('joypurhat', 'জয়পুরহাট', 'Joypurhat', 'rajshahi', 25.0986, 89.0233),
  d('naogaon', 'নওগাঁ', 'Naogaon', 'rajshahi', 24.7936, 88.9318),
  d('natore', 'নাটোর', 'Natore', 'rajshahi', 24.4207, 89.0005),
  d('chapainawabganj', 'চাঁপাইনবাবগঞ্জ', 'Chapai Nawabganj', 'rajshahi', 24.5965, 88.2629),
  d('pabna', 'পাবনা', 'Pabna', 'rajshahi', 24.0064, 89.2372),
  d('rajshahi', 'রাজশাহী', 'Rajshahi', 'rajshahi', 24.3636, 88.6241),
  d('sirajganj', 'সিরাজগঞ্জ', 'Sirajganj', 'rajshahi', 24.4534, 89.7007),
  // Khulna division
  d('bagerhat', 'বাগেরহাট', 'Bagerhat', 'khulna', 22.6516, 89.7851),
  d('chuadanga', 'চুয়াডাঙ্গা', 'Chuadanga', 'khulna', 23.6402, 88.8418),
  d('jashore', 'যশোর', 'Jashore', 'khulna', 23.1664, 89.2082),
  d('jhenaidah', 'ঝিনাইদহ', 'Jhenaidah', 'khulna', 23.5448, 89.1737),
  d('khulna', 'খুলনা', 'Khulna', 'khulna', 22.8096, 89.5645),
  d('kushtia', 'কুষ্টিয়া', 'Kushtia', 'khulna', 23.9013, 89.1205),
  d('magura', 'মাগুরা', 'Magura', 'khulna', 23.4871, 89.4196),
  d('meherpur', 'মেহেরপুর', 'Meherpur', 'khulna', 23.7622, 88.6318),
  d('narail', 'নড়াইল', 'Narail', 'khulna', 23.1725, 89.4942),
  d('satkhira', 'সাতক্ষীরা', 'Satkhira', 'khulna', 22.7185, 89.0707),
  // Barishal division
  d('barguna', 'বরগুনা', 'Barguna', 'barishal', 22.0953, 90.1123),
  d('barishal', 'বরিশাল', 'Barishal', 'barishal', 22.701, 90.3535),
  d('bhola', 'ভোলা', 'Bhola', 'barishal', 22.6859, 90.6482),
  d('jhalokati', 'ঝালকাঠি', 'Jhalokati', 'barishal', 22.6406, 90.1987),
  d('patuakhali', 'পটুয়াখালী', 'Patuakhali', 'barishal', 22.3596, 90.3294),
  d('pirojpur', 'পিরোজপুর', 'Pirojpur', 'barishal', 22.5841, 89.9721),
  // Sylhet division
  d('habiganj', 'হবিগঞ্জ', 'Habiganj', 'sylhet', 24.3749, 91.4155),
  d('moulvibazar', 'মৌলভীবাজার', 'Moulvibazar', 'sylhet', 24.4829, 91.7774),
  d('sunamganj', 'সুনামগঞ্জ', 'Sunamganj', 'sylhet', 25.0658, 91.3951),
  d('sylhet', 'সিলেট', 'Sylhet', 'sylhet', 24.8949, 91.8687),
  // Rangpur division
  d('dinajpur', 'দিনাজপুর', 'Dinajpur', 'rangpur', 25.6279, 88.6332),
  d('gaibandha', 'গাইবান্ধা', 'Gaibandha', 'rangpur', 25.3288, 89.5285),
  d('kurigram', 'কুড়িগ্রাম', 'Kurigram', 'rangpur', 25.8071, 89.6292),
  d('lalmonirhat', 'লালমনিরহাট', 'Lalmonirhat', 'rangpur', 25.9923, 89.2847),
  d('nilphamari', 'নীলফামারী', 'Nilphamari', 'rangpur', 25.9318, 88.856),
  d('panchagarh', 'পঞ্চগড়', 'Panchagarh', 'rangpur', 26.3411, 88.5545),
  d('rangpur', 'রংপুর', 'Rangpur', 'rangpur', 25.7439, 89.2752),
  d('thakurgaon', 'ঠাকুরগাঁও', 'Thakurgaon', 'rangpur', 26.0333, 88.4667),
  // Mymensingh division
  d('jamalpur', 'জামালপুর', 'Jamalpur', 'mymensingh', 24.9375, 89.9378),
  d('mymensingh', 'ময়মনসিংহ', 'Mymensingh', 'mymensingh', 24.7471, 90.4203),
  d('netrokona', 'নেত্রকোণা', 'Netrokona', 'mymensingh', 24.8709, 90.7273),
  d('sherpur', 'শেরপুর', 'Sherpur', 'mymensingh', 25.0205, 90.0151),
];

export type DistrictId = string;

/** Index for O(1) lookup by id. */
export const DISTRICT_MAP: ReadonlyMap<string, District> = new Map(
  DISTRICTS.map((district) => [district.id, district]),
);

/**
 * Resolves a district by id.
 * @param id district id (slug form, e.g. `coxs-bazar`)
 * @returns the district or undefined
 */
export function findDistrict(id: string): District | undefined {
  return DISTRICT_MAP.get(id);
}

/**
 * Districts of a division.
 * @param division division id
 * @returns districts belonging to that division
 */
export function districtsOf(division: DivisionId): readonly District[] {
  return DISTRICTS.filter((district) => district.division === division);
}

/**
 * Great-circle distance in kilometres between two coordinates (haversine).
 * Kept dependency-free so geo maths works before @turf/turf is lazy-loaded on map routes.
 * @param a first point
 * @param b second point
 * @returns distance in kilometres
 */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const earthRadiusKm = 6371;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

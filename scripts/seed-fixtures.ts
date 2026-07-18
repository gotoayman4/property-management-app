/**
 * @file seed-fixtures — data arrays for the demo seed (extracted to keep seed-demo-data.ts
 *        under the 500-line file-size limit; NFR-MAIN-02).
 *
 * INTENT: Hold the property, tenant, and expense row fixtures with realistic Arabic content so
 *         the main seed script stays focused on insertion orchestration.
 *
 * CONSTRAINT: every field here mirrors the column shapes defined in the SQL migrations — no
 *             field is invented that doesn't exist on the target table.
 */

export interface PropertyFixture {
  key: string
  code: string
  name: string
  type: 'apartment' | 'shop'
  country: string
  currency: string
  address: string
  area_sqm: number
  status: 'vacant' | 'rented' | 'maintenance'
  monthly_rent_default: number
  notes: string
}

export interface TenantFixture {
  key: string
  code: string
  fullname: string
  phone: string
  email: string
  type: 'individual' | 'company'
  preferred_language: 'ar' | 'tr' | 'en'
  emergency_contact_name: string
  emergency_contact_phone: string
  address: string
  notes: string
}

export interface ExpenseFixture {
  days: number
  categoryIdKey: string
  vendor: string
  amount: number
  notes: string
}

/** Two rented properties in JO/JOD + one vacant in TR/TRY. */
export const PROPERTY_FIXTURES: PropertyFixture[] = [
  {
    key: 'apt_amman',
    code: 'JO-APT-001',
    name: 'شقة عمّان - خلدا',
    type: 'apartment',
    country: 'JO',
    currency: 'JOD',
    address: 'عمّان - خلدا - شارع عبد الله غوشة',
    area_sqm: 120,
    status: 'rented',
    monthly_rent_default: 450,
    notes: 'شقة بواجهتين، الطابق الثاني'
  },
  {
    key: 'shop_amman',
    code: 'JO-SHOP-001',
    name: 'محل تجاري - جبل الحسين',
    type: 'shop',
    country: 'JO',
    currency: 'JOD',
    address: 'عمّان - جبل الحسين - شارع الملكة رانيا',
    area_sqm: 65,
    status: 'rented',
    monthly_rent_default: 600,
    notes: 'محل على الشارع الرئيسي'
  },
  {
    key: 'apt_istanbul',
    code: 'TR-APT-001',
    name: 'شقة إسطنبول - بقسك',
    type: 'apartment',
    country: 'TR',
    currency: 'TRY',
    address: 'إسطنبول - بقسك - شارع الاستقلال',
    area_sqm: 90,
    status: 'vacant',
    monthly_rent_default: 18000,
    notes: 'شقة فارغة بانتظار تأجيرها'
  }
]

/** Two individuals + one company — all Arabic-speaking, exercising the language field. */
export const TENANT_FIXTURES: TenantFixture[] = [
  {
    key: 'khaled',
    code: 'T-001',
    fullname: 'خالد محمد العلي',
    phone: '+962790123456',
    email: 'khaled.ali@example.com',
    type: 'individual',
    preferred_language: 'ar',
    emergency_contact_name: 'محمد العلي',
    emergency_contact_phone: '+962791234567',
    address: 'عمّان - خلدا',
    notes: 'مستأجر ملتزم منذ ثلاث سنوات'
  },
  {
    key: 'salem',
    code: 'T-002',
    fullname: 'سالم عبد الله الحرب',
    phone: '+962771234567',
    email: 'salem.harb@example.com',
    type: 'individual',
    preferred_language: 'ar',
    emergency_contact_name: 'عبد الله الحرب',
    emergency_contact_phone: '+962772345678',
    address: 'عمّان - جبل الحسين',
    notes: 'يملك نشاطاً تجارياً'
  },
  {
    key: 'company_nile',
    code: 'T-003',
    fullname: 'شركة النيل للتجارة',
    phone: '+96265555555',
    email: 'info@nile-trade.com',
    type: 'company',
    preferred_language: 'ar',
    emergency_contact_name: 'المدير العام',
    emergency_contact_phone: '+96265050505',
    address: 'عمّان - وسط البلد',
    notes: 'شركة مساهمة خاصة'
  }
]

/**
 * Apartment expenses. `categoryIdKey` is the short suffix of the expense_categories.name_key
 * (e.g. 'maintenance' resolves the row whose name_key = 'expense.category.maintenance').
 */
export const APARTMENT_EXPENSE_FIXTURES: ExpenseFixture[] = [
  {
    days: 160,
    categoryIdKey: 'maintenance',
    vendor: 'شركة الإعمار للصيانة',
    amount: 75,
    notes: 'إصلاح تسريب مياه'
  },
  {
    days: 140,
    categoryIdKey: 'electricity',
    vendor: 'شركة الكهرباء',
    amount: 35,
    notes: 'فاتورة الكهرباء'
  },
  { days: 120, categoryIdKey: 'water', vendor: 'مياه الأردن', amount: 12, notes: 'فاتورة المياه' },
  {
    days: 90,
    categoryIdKey: 'cleaning',
    vendor: 'مكتب النظافة المصرية',
    amount: 25,
    notes: 'تنظيف شهري'
  },
  {
    days: 45,
    categoryIdKey: 'maintenance',
    vendor: 'كهربائي العمارة',
    amount: 20,
    notes: 'إصلاح إنارة'
  },
  {
    days: 20,
    categoryIdKey: 'electricity',
    vendor: 'شركة الكهرباء',
    amount: 42,
    notes: 'فاتورة الكهرباء'
  }
]

/** Shop expenses (municipality + cleaning). */
export const SHOP_EXPENSE_FIXTURES: ExpenseFixture[] = [
  {
    days: 85,
    categoryIdKey: 'municipality',
    vendor: 'أمانة عمّان الكبرى',
    amount: 50,
    notes: 'رسوم ترخيص'
  },
  { days: 30, categoryIdKey: 'cleaning', vendor: 'مكتب النظافة', amount: 30, notes: 'تنظيف المحل' }
]

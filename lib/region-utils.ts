export type Region = 'US' | 'EU' | 'NG' | 'KE' | 'ZA' | 'GB' | 'CA' | 'AU' | 'GLOBAL';
export type Currency = 'USD' | 'EUR' | 'NGN' | 'KES' | 'ZAR' | 'GBP' | 'CAD' | 'AUD';

export const REGION_CONFIG: Record<Region, { name: string; currency: Currency }> = {
  US: { name: 'United States', currency: 'USD' },
  EU: { name: 'European Union', currency: 'EUR' },
  NG: { name: 'Nigeria', currency: 'NGN' },
  KE: { name: 'Kenya', currency: 'KES' },
  ZA: { name: 'South Africa', currency: 'ZAR' },
  GB: { name: 'United Kingdom', currency: 'GBP' },
  CA: { name: 'Canada', currency: 'CAD' },
  AU: { name: 'Australia', currency: 'AUD' },
  GLOBAL: { name: 'Global', currency: 'USD' },
};

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: '$',
  EUR: '€',
  NGN: '₦',
  KES: 'KSh',
  ZAR: 'R',
  GBP: '£',
  CAD: 'C$',
  AUD: 'A$',
};

/**
 * Detect user region based on IP geolocation
 * In production, use a proper geolocation service like MaxMind or IP2Location
 */
export async function detectUserRegion(): Promise<Region> {
  try {
    // For now, default to GLOBAL. In production, call geolocation API
    // Example: const response = await fetch('https://ipapi.co/json/');
    // const data = await response.json();
    // return mapCountryCodeToRegion(data.country_code);
    
    return 'GLOBAL';
  } catch (error) {
    console.error('Error detecting region:', error);
    return 'GLOBAL';
  }
}

/**
 * Get available payment methods for a region
 */
export function getPaymentMethodsForRegion(region: Region): string[] {
  const regionPaymentMethods: Record<Region, string[]> = {
    US: ['stripe', 'paypal', 'crypto'],
    EU: ['stripe', 'paypal', 'crypto'],
    NG: ['korapay', 'paypal', 'crypto'],
    KE: ['korapay', 'paypal', 'crypto'],
    ZA: ['korapay', 'paypal', 'crypto'],
    GB: ['stripe', 'paypal', 'crypto'],
    CA: ['stripe', 'paypal', 'crypto'],
    AU: ['stripe', 'paypal', 'crypto'],
    GLOBAL: ['stripe', 'paypal', 'crypto'],
  };

  return regionPaymentMethods[region] || ['stripe', 'paypal', 'crypto'];
}

/**
 * Convert amount between currencies
 * In production, use a real exchange rate API
 */
export async function convertCurrency(
  amount: number,
  fromCurrency: Currency,
  toCurrency: Currency
): Promise<number> {
  if (fromCurrency === toCurrency) return amount;

  // Mock exchange rates - in production, call a real API
  const exchangeRates: Record<Currency, number> = {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    CAD: 1.36,
    AUD: 1.53,
    NGN: 766,
    KES: 130,
    ZAR: 18,
  };

  const usdAmount = amount / exchangeRates[fromCurrency];
  return usdAmount * exchangeRates[toCurrency];
}

/**
 * Format currency value with symbol
 */
export function formatCurrency(amount: number, currency: Currency): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
}

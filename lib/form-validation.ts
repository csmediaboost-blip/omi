/**
 * Form validation utilities for client-side validation
 * All functions handle mobile input quirks and return user-friendly errors
 */

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * Trim and normalize input for mobile keyboards
 */
function normalizeInput(value: string): string {
  return String(value || '').trim();
}

/**
 * Email validation - RFC 5322 simplified with mobile quirks
 */
export function validateEmail(email: string): boolean {
  const normalized = normalizeInput(email);
  if (!normalized) return false;
  // Allow dots, dashes, underscores before @
  const emailRegex = /^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(normalized) && normalized.length <= 254;
}

/**
 * Wallet address validation (Ethereum format)
 */
export function validateWalletAddress(address: string): boolean {
  if (!address) return true; // Optional field
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * PIN validation (4-6 digits)
 */
export function validatePIN(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

/**
 * Password validation - 8+ chars, simpler requirements for better UX
 */
export function validatePassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const pwd = normalizeInput(password);

  if (pwd.length < 8) {
    errors.push("Password must be at least 8 characters");
  }
  if (pwd.length > 128) {
    errors.push("Password is too long");
  }
  // Removed uppercase/lowercase/number requirements for better mobile UX
  // Enforce only minimum length for security

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Full name validation
 */
export function validateFullName(name: string): boolean {
  return name && name.trim().length >= 2 && name.trim().length <= 100;
}

/**
 * Amount validation - handles currency formatting
 */
export function validateAmount(amount: any, min = 0, max = 1000000): boolean {
  const normalized = normalizeInput(String(amount || ''));
  const num = parseFloat(normalized);
  return !isNaN(num) && num > 0 && num >= min && num <= max && num % 0.01 === 0;
}

/**
 * Phone number validation (basic - allows various formats)
 */
export function validatePhoneNumber(phone: string): boolean {
  if (!phone) return true; // Optional
  return /^\d{7,15}$/.test(phone.replace(/\D/g, ""));
}

/**
 * Validate form data
 */
export function validateFormData(
  data: Record<string, any>,
  schema: Record<string, any>
): ValidationResult {
  const errors: Record<string, string> = {};

  Object.entries(schema).forEach(([field, rules]: [string, any]) => {
    const value = data[field];

    // Required validation
    if (rules.required && !value) {
      errors[field] = rules.errorMessage || `${field} is required`;
      return;
    }

    if (!value) return; // Skip other validations if empty and not required

    // Email validation
    if (rules.type === "email" && !validateEmail(value)) {
      errors[field] = "Please enter a valid email address";
    }

    // PIN validation
    if (rules.type === "pin" && !validatePIN(value)) {
      errors[field] = "PIN must be 4-6 digits";
    }

    // Password validation
    if (rules.type === "password") {
      const passwordValidation = validatePassword(value);
      if (!passwordValidation.valid) {
        errors[field] = passwordValidation.errors[0];
      }
    }

    // Wallet validation
    if (rules.type === "wallet" && !validateWalletAddress(value)) {
      errors[field] = "Invalid wallet address format";
    }

    // Name validation
    if (rules.type === "name" && !validateFullName(value)) {
      errors[field] = "Please enter a valid name (2-100 characters)";
    }

    // Amount validation
    if (rules.type === "amount") {
      if (!validateAmount(value, rules.min, rules.max)) {
        errors[field] = `Amount must be between ${rules.min} and ${rules.max}`;
      }
    }

    // Min length
    if (rules.minLength && value.length < rules.minLength) {
      errors[field] = `${field} must be at least ${rules.minLength} characters`;
    }

    // Max length
    if (rules.maxLength && value.length > rules.maxLength) {
      errors[field] = `${field} must be no more than ${rules.maxLength} characters`;
    }

    // Pattern
    if (rules.pattern && !rules.pattern.test(value)) {
      errors[field] = rules.errorMessage || `${field} format is invalid`;
    }

    // Custom validator
    if (rules.validator) {
      const customError = rules.validator(value);
      if (customError) {
        errors[field] = customError;
      }
    }
  });

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Form validation utilities for client-side validation
 */

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * Email validation
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
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
 * Password validation
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 */
export function validatePassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  if (!/\d/.test(password)) {
    errors.push("Password must contain at least one number");
  }

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
 * Amount validation
 */
export function validateAmount(amount: any, min = 0, max = Infinity): boolean {
  const num = parseFloat(amount);
  return !isNaN(num) && num >= min && num <= max;
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

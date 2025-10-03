// Validation utilities for client-side form validation

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface PasswordStrength {
  score: number; // 0-4 (weak to very strong)
  requirements: {
    length: boolean;
    lowercase: boolean;
    uppercase: boolean;
    numbers: boolean;
    symbols: boolean;
  };
  feedback: string[];
}

/**
 * Validates email format
 */
export function validateEmail(email: string): ValidationResult {
  if (!email.trim()) {
    return { isValid: false, error: "Email is required" };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, error: "Please enter a valid email address" };
  }

  // Check for common email format issues
  if (email.includes('..')) {
    return { isValid: false, error: "Email cannot contain consecutive dots" };
  }

  if (email.startsWith('.') || email.endsWith('.')) {
    return { isValid: false, error: "Email cannot start or end with a dot" };
  }

  return { isValid: true };
}

/**
 * Validates password and returns strength analysis
 */
export function validatePassword(password: string, isRegistration = false): ValidationResult & { strength?: PasswordStrength } {
  if (!password) {
    return { isValid: false, error: "Password is required" };
  }

  const requirements = {
    length: password.length >= 8,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    numbers: /\d/.test(password),
    symbols: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };

  const strength: PasswordStrength = {
    score: 0,
    requirements,
    feedback: [],
  };

  // Calculate strength score
  if (requirements.length) strength.score++;
  if (requirements.lowercase) strength.score++;
  if (requirements.uppercase) strength.score++;
  if (requirements.numbers) strength.score++;
  if (requirements.symbols) strength.score++;

  // Generate feedback
  if (!requirements.length) {
    strength.feedback.push("At least 8 characters");
  }
  if (!requirements.lowercase) {
    strength.feedback.push("One lowercase letter");
  }
  if (!requirements.uppercase) {
    strength.feedback.push("One uppercase letter");
  }
  if (!requirements.numbers) {
    strength.feedback.push("One number");
  }
  if (!requirements.symbols) {
    strength.feedback.push("One special character");
  }

  // For login, we're more lenient
  if (!isRegistration) {
    if (password.length < 6) {
      return { isValid: false, error: "Password is too short" };
    }
    return { isValid: true, strength };
  }

  // For registration, enforce stronger requirements
  if (!requirements.length) {
    return { 
      isValid: false, 
      error: "Password must be at least 8 characters long",
      strength 
    };
  }

  if (strength.score < 3) {
    return { 
      isValid: false, 
      error: "Password is too weak. Please include " + strength.feedback.slice(0, 2).join(" and "),
      strength 
    };
  }

  // Check for common weak patterns
  const commonPasswords = ['password', '12345678', 'qwerty123', 'admin123'];
  if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
    return { 
      isValid: false, 
      error: "Please avoid common password patterns",
      strength 
    };
  }

  return { isValid: true, strength };
}

/**
 * Validates merchant/business name
 */
export function validateMerchantName(name: string): ValidationResult {
  if (!name.trim()) {
    return { isValid: false, error: "Business name is required" };
  }

  if (name.trim().length < 2) {
    return { isValid: false, error: "Business name must be at least 2 characters" };
  }

  if (name.trim().length > 100) {
    return { isValid: false, error: "Business name must be less than 100 characters" };
  }

  // Check for valid characters (letters, numbers, spaces, common business symbols)
  const validChars = /^[a-zA-Z0-9\s\-_&.,()]+$/;
  if (!validChars.test(name)) {
    return { isValid: false, error: "Business name contains invalid characters" };
  }

  return { isValid: true };
}

/**
 * Validates required text field
 */
export function validateRequired(value: string, fieldName: string): ValidationResult {
  if (!value || !value.trim()) {
    return { isValid: false, error: `${fieldName} is required` };
  }
  return { isValid: true };
}

/**
 * Validates minimum length
 */
export function validateMinLength(value: string, minLength: number, fieldName: string): ValidationResult {
  if (!value || value.length < minLength) {
    return { 
      isValid: false, 
      error: `${fieldName} must be at least ${minLength} characters` 
    };
  }
  return { isValid: true };
}

/**
 * Validates maximum length
 */
export function validateMaxLength(value: string, maxLength: number, fieldName: string): ValidationResult {
  if (value && value.length > maxLength) {
    return { 
      isValid: false, 
      error: `${fieldName} must be less than ${maxLength} characters` 
    };
  }
  return { isValid: true };
}

/**
 * Gets password strength label and color
 */
export function getPasswordStrengthDisplay(strength: PasswordStrength) {
  const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['text-red-500', 'text-orange-500', 'text-yellow-500', 'text-blue-500', 'text-green-500'];
  const bgColors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'];

  // Calculate percentage and clamp to 100%
  const rawPercentage = (strength.score / 4) * 100;
  const percentage = rawPercentage >= 100 ? 100 : rawPercentage;

  // If percentage is out of 100, always show 'Strong' label
  let label = labels[strength.score] || 'Very Weak';
  let textColor = colors[strength.score] || 'text-red-500';
  let bgColor = bgColors[strength.score] || 'bg-red-500';
  if (rawPercentage >= 100) {
    label = 'Strong';
    textColor = 'text-green-500';
    bgColor = 'bg-green-500';
  }

  return {
    label,
    textColor,
    bgColor,
    percentage,
  };
}

/**
 * Debounce function for real-time validation
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}
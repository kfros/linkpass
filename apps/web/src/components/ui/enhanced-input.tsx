import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { ValidationResult, PasswordStrength, getPasswordStrengthDisplay } from "@/lib/validation";

export interface InputProps extends React.ComponentProps<"input"> {
  error?: string;
  validation?: ValidationResult;
  showPasswordToggle?: boolean;
  passwordStrength?: PasswordStrength;
  label?: string;
  helperText?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ 
    className, 
    type, 
    error, 
    validation, 
    showPasswordToggle = false, 
    passwordStrength,
    label,
    helperText,
    ...props 
  }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);
    const [isFocused, setIsFocused] = React.useState(false);
    
    const isPassword = type === "password";
    const displayType = isPassword && showPasswordToggle && showPassword ? "text" : type;
    const hasError = error || (validation && !validation.isValid);
    const errorMessage = error || validation?.error;
    
    // Show password strength only when focused or has content
    const showStrength = isPassword && passwordStrength && (isFocused || props.value);
    const strengthDisplay = passwordStrength ? getPasswordStrengthDisplay(passwordStrength) : null;

    return (
      <div className="space-y-2">
        {label && (
          <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {label}
          </label>
        )}
        
        <div className="relative">
          <input
            type={displayType}
            ref={ref}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
            }}
            className={cn(
              "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-10 w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
              "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
              hasError && "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/20",
              !hasError && validation?.isValid && "border-green-500 focus-visible:border-green-500 focus-visible:ring-green-500/20",
              (isPassword && showPasswordToggle) && "pr-10",
              className
            )}
            {...props}
          />
          
          {/* Password Toggle Button */}
          {isPassword && showPasswordToggle && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        {/* Password Strength Indicator */}
        {showStrength && strengthDisplay && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">Password strength:</span>
              <span className={strengthDisplay.textColor}>
                {strengthDisplay.label}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className={cn("h-1.5 rounded-full transition-all duration-300", strengthDisplay.bgColor)}
                style={{ width: `${strengthDisplay.percentage}%` }}
              />
            </div>
            {passwordStrength.feedback.length > 0 && (
              <div className="text-xs text-gray-600">
                <span>Missing: </span>
                <span>{passwordStrength.feedback.join(", ")}</span>
              </div>
            )}
          </div>
        )}

        {/* Error Message */}
        {errorMessage && (
          <p className="text-red-500 text-sm flex items-center gap-1">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            {errorMessage}
          </p>
        )}

        {/* Success Message */}
        {!hasError && validation?.isValid && props.value && (
          <p className="text-green-500 text-sm flex items-center gap-1">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            Valid
          </p>
        )}

        {/* Helper Text */}
        {helperText && !errorMessage && (
          <p className="text-gray-500 text-sm">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
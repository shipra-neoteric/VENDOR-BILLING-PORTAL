import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from "react";

interface BaseFieldProps {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
}

interface FieldProps extends BaseFieldProps, InputHTMLAttributes<HTMLInputElement> {
  textarea?: false;
}

interface TextareaFieldProps extends BaseFieldProps, TextareaHTMLAttributes<HTMLTextAreaElement> {
  textarea: true;
}

const baseInputClass =
  "w-full h-10 px-3 rounded-lg border text-sm bg-white dark:bg-[#0F172A] text-[#1A1A2E] dark:text-[#F1F5F9] " +
  "placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors " +
  "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50 disabled:bg-gray-50 dark:disabled:bg-gray-800";

export default function Field(props: FieldProps | TextareaFieldProps) {
  const { label, required, error, hint, className = "", textarea, ...rest } = props;
  return (
    <label className="block">
      {label && (
        <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </span>
      )}
      {textarea ? (
        <textarea
          className={[baseInputClass, "h-auto min-h-[90px] py-2 resize-y", error ? "border-red-400" : "border-gray-200 dark:border-gray-700", className].join(" ")}
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <input
          className={[baseInputClass, error ? "border-red-400" : "border-gray-200 dark:border-gray-700", className].join(" ")}
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
        />
      )}
      {error ? (
        <span className="block text-xs text-red-500 mt-1">{error}</span>
      ) : (
        hint && <span className="block text-xs text-gray-400 dark:text-gray-500 mt-1">{hint}</span>
      )}
    </label>
  );
}

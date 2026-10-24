export type SanitizerResult = {
  isValid: boolean;
  sanitized: string;
  flaggedReason?: "PROMPT_INJECTION" | "EXCESSIVE_LENGTH" | "MEDICAL_ADVICE_REQUEST";
  deflectionMessage?: string;
};

const MAX_INPUT_LENGTH = 1000;

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+|any\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(all\s+|any\s+)?(previous|prior|above)\s+(instructions|guidelines)/i,
  /forget\s+(all\s+|any\s+)?(previous|prior|your)\s+instructions/i,
  /you\s+are\s+now\s+(in\s+developer\s+mode|a\s+dan|dan)/i,
  /(print|reveal|show|display|leak)\s+(your\s+)?(system\s+prompt|initial\s+instructions)/i,
  /system\s+prompt\s+verbatim/i,
];

const MEDICAL_ADVICE_PATTERNS = [
  /\b(diagnose|diagnosis|prescription|prescribe|prescriptions|antibiotics|medication|dosage|cancer|tumor)\b/i,
  /\b(what\s+medication\s+should\s+i\s+take)\b/i,
  /\b(is\s+it\s+cancer|am\s+i\s+dying)\b/i,
  /\b(diagnose\s+my)\b/i,
];

export function sanitizeUserInput(input: string): SanitizerResult {
  const trimmed = (input || "").trim();

  if (trimmed.length > MAX_INPUT_LENGTH) {
    return {
      isValid: false,
      sanitized: trimmed.slice(0, MAX_INPUT_LENGTH),
      flaggedReason: "EXCESSIVE_LENGTH",
      deflectionMessage: `Message exceeds maximum allowed length of ${MAX_INPUT_LENGTH.toLocaleString()} characters. Please shorten your inquiry.`,
    };
  }

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        isValid: false,
        sanitized: trimmed,
        flaggedReason: "PROMPT_INJECTION",
        deflectionMessage:
          "I can only assist with dental clinic appointments, services, scheduling, and clinic operating hours. How can I assist you with your booking today?",
      };
    }
  }

  for (const pattern of MEDICAL_ADVICE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        isValid: false,
        sanitized: trimmed,
        flaggedReason: "MEDICAL_ADVICE_REQUEST",
        deflectionMessage:
          "I cannot provide medical diagnoses, treatment advice, or prescriptions. For urgent symptoms, severe pain, or dental emergencies, please visit an emergency care facility immediately or book an in-person consultation with our qualified dentists.",
      };
    }
  }

  return {
    isValid: true,
    sanitized: trimmed,
  };
}

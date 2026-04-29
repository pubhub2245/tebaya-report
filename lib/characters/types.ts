export type Character = {
  id: string;
  name: string;
  emoji: string;
  month: number;

  displaySignature: string;

  endings: string[];
  greetings: string[];
  exclamations: string[];

  emergencyMode: "full" | "soft" | "off";
  emergencyPrefix: string;
  emergencyEndings: string[];

  // 日報遅れなど「プンプン」モード（任意。未設定なら通常モードにフォールバック）
  scoldingSignature?: string;
  scoldingEndings?: string[];

  fallbackMonthIntro: string;
  fallbackMonthOutro: string;
};

export type TransformContext = {
  isEmergency?: boolean;
  isScolding?: boolean;
  context?: "weather" | "task" | "report" | "cancel" | "generic";
};

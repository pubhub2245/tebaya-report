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

  fallbackMonthIntro: string;
  fallbackMonthOutro: string;
};

export type TransformContext = {
  isEmergency?: boolean;
  context?: "weather" | "task" | "report" | "cancel" | "generic";
};

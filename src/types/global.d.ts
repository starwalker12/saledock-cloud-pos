interface ReCaptchaInstance {
  render: (container: HTMLElement, params: Record<string, unknown>) => number;
  reset: (widgetId: number) => void;
  getResponse: (widgetId: number) => string;
}

interface Window {
  grecaptcha?: ReCaptchaInstance;
}

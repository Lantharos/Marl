declare global {
  namespace App {
    interface Platform {
      env: {
        MARL_API: {
          fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
        };
      };
    }
  }
}

export {};

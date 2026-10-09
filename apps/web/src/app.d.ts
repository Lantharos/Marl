declare module 'cloudflare:workers' {
  export const env: {
    MARL_API: {
      fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    };
  };
}

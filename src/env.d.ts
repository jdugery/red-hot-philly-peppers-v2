interface CloudflareEnv {
  SQUARE_ACCESS_TOKEN?: string;
  SQUARE_ENV?: "sandbox" | "production";
}

declare module "cloudflare:workers" {
  export const env: CloudflareEnv;
}

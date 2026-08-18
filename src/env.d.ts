interface CloudflareEnv {
  SQUARE_ACCESS_TOKEN?: string;
}

declare module "cloudflare:workers" {
  export const env: CloudflareEnv;
}

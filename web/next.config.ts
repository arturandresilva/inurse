import type { NextConfig } from "next";

const config: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  // fotos do armazenamento da loja: o backoffice usa o otimizador para desenhar os posts das redes sociais
  images: { remotePatterns: [{ protocol: "https", hostname: "ssmckeparvmrahsnoypt.supabase.co", pathname: "/storage/v1/object/public/**" }] },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
      ],
    }];
  },
};
export default config;

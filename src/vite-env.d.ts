/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROUTING_PROVIDER?: "mock" | "brouter";
  readonly VITE_GEOCODING_PROVIDER?: "mock" | "nominatim";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

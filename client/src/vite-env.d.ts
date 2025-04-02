/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL: string
  // Add more env variables here
}

interface ImportMeta {
  readonly env: ImportMetaEnv
} 
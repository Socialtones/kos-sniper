declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT: number
      USERNAME: string
      PASSWORD: string
    }
  }
}

export {}

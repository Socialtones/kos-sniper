export enum LogLevel {
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  SUCCESS = "SUCCESS",
}

export class Logger {
  private static _getCurrentFormattedTime() {
    const now = new Date()

    const day = String(now.getDate()).padStart(2, "0")
    const month = String(now.getMonth() + 1).padStart(2, "0") // Měsíce jsou 0-indexované
    const year = now.getFullYear()

    const hours = String(now.getHours()).padStart(2, "0")
    const minutes = String(now.getMinutes()).padStart(2, "0")
    const seconds = String(now.getSeconds()).padStart(2, "0")

    return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`
  }

  static log(message: string, level: LogLevel = LogLevel.INFO) {
    switch (level) {
      case LogLevel.INFO:
        console.log(
          `\x1b[34m[${
            LogLevel.INFO
          }][${this._getCurrentFormattedTime()}]\x1b[0m ${message}`
        )
        break
      case LogLevel.WARN:
        console.log(
          `\x1b[33m[${
            LogLevel.WARN
          }][${this._getCurrentFormattedTime()}]\x1b[0m ${message}`
        )
        break
      case LogLevel.ERROR:
        console.log(
          `\x1b[31m[${
            LogLevel.ERROR
          }][${this._getCurrentFormattedTime()}]\x1b[0m ${message}`
        )
        break
      case LogLevel.SUCCESS:
        console.log(
          `\x1b[32m[${
            LogLevel.SUCCESS
          }][${this._getCurrentFormattedTime()}]\x1b[0m ${message}`
        )
        break
    }
  }
}

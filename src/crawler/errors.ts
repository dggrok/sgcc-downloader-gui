export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ValidationError"
  }
}

export class CancelledError extends Error {
  constructor(message = "任务已取消。") {
    super(message)
    this.name = "CancelledError"
  }
}

export class RequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RequestError"
  }
}

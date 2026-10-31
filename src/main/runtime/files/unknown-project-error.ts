export class UnknownProjectError extends Error {
  constructor(projectId: string) {
    super(`unknown project: ${projectId}`)
    this.name = 'UnknownProjectError'
  }
}

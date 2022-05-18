export default function shouldNotBeExecuted(): void {
  throw new Error('test failure enforced: this code should never be executed')
}

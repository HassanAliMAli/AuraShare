/** Coalesce network chunks so retained object count depends on bytes, not frames. */
const BLOCK_BYTES = 1024 * 1024;

export class ReceiveBuffer {
  private blocks: ArrayBuffer[] = [];
  private length = 0;
  private readonly size: number;
  constructor(size: number) { this.size = size; }

  append(payload: ArrayBuffer): void {
    if (this.length + payload.byteLength > this.size) throw new Error('Receive buffer overflow');
    const source = new Uint8Array(payload);
    let offset = 0;
    while (offset < source.length) {
      const index = Math.floor(this.length / BLOCK_BYTES);
      const position = this.length % BLOCK_BYTES;
      let block = this.blocks[index];
      if (!block) {
        block = new ArrayBuffer(Math.min(BLOCK_BYTES, this.size - this.length));
        this.blocks.push(block);
      }
      const count = Math.min(source.length - offset, block.byteLength - position);
      new Uint8Array(block).set(source.subarray(offset, offset + count), position);
      offset += count;
      this.length += count;
    }
  }

  parts(): ArrayBuffer[] {
    if (this.length !== this.size) throw new Error('Incomplete receive buffer');
    return this.blocks;
  }

  clear(): void { this.blocks = []; this.length = 0; }
}

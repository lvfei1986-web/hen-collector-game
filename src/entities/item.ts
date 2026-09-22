export type ItemType = 'speedBoost' | 'shield' | 'freeze' | 'book';

export const ITEM_COLORS: Record<ItemType, string> = {
  speedBoost: '#3498db',
  shield: '#ecf0f1',
  freeze: '#00bcd4',
  book: '#8e44ad',
};

export const ITEM_LABELS: Record<ItemType, string> = {
  speedBoost: '⚡',
  shield: '🛡',
  freeze: '❄',
  book: '📖',
};

export class Inventory {
  private items: ItemType[] = [];
  readonly maxSize = 3;

  get size(): number {
    return this.items.length;
  }

  canAdd(): boolean {
    return this.items.length < this.maxSize;
  }

  add(item: ItemType): boolean {
    if (!this.canAdd()) return false;
    this.items.push(item);
    return true;
  }

  shift(): ItemType | undefined {
    return this.items.shift();
  }

  peek(i: number): ItemType | undefined {
    return this.items[i];
  }

  all(): readonly ItemType[] {
    return this.items;
  }
}

export interface WorldItem {
  x: number;
  y: number;
  width: number;
  height: number;
  type: ItemType;
  bob: number;
  age: number;
}

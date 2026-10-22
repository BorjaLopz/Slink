/** Binary min-heap keyed by a numeric priority. */
export class MinHeap<T> {
	private items: { value: T; priority: number }[] = [];

	get size(): number {
		return this.items.length;
	}

	push(value: T, priority: number): void {
		const items = this.items;
		items.push({ value, priority });
		let i = items.length - 1;
		while (i > 0) {
			const parent = (i - 1) >> 1;
			if (items[parent].priority <= items[i].priority) {
				break;
			}
			[items[parent], items[i]] = [items[i], items[parent]];
			i = parent;
		}
	}

	pop(): T | undefined {
		const items = this.items;
		if (items.length === 0) {
			return undefined;
		}
		const top = items[0];
		const last = items.pop() as { value: T; priority: number };
		if (items.length > 0) {
			items[0] = last;
			let i = 0;
			for (;;) {
				const left = i * 2 + 1;
				const right = left + 1;
				let smallest = i;
				if (left < items.length && items[left].priority < items[smallest].priority) {
					smallest = left;
				}
				if (right < items.length && items[right].priority < items[smallest].priority) {
					smallest = right;
				}
				if (smallest === i) {
					break;
				}
				[items[smallest], items[i]] = [items[i], items[smallest]];
				i = smallest;
			}
		}
		return top.value;
	}
}

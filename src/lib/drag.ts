/**
 * The item being dragged. HTML drag data can't be read during dragover (only
 * on drop), so the Day view reads the size of its drop preview from here.
 */
export const DRAG_TYPE = 'application/x-tally-item';

export interface DragPayload {
  noteId: string;
  itemId: string;
  minutes: number;
  /** Minutes between the block's start and where it was grabbed, so moves don't jump. */
  grab: number;
}

let current: DragPayload | null = null;

export function beginDrag(e: React.DragEvent, payload: DragPayload) {
  current = payload;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
}

export const activeDrag = () => current;
export const endDrag = () => { current = null; };
export const isTallyDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE);

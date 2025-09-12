import { Cell } from "@ton/core";

/** Standard "text comment": 32-bit op == 0, then UTF-8 string tail */
export function tryDecodeTextCommentFromCell(cell: Cell | undefined): string | null {
  if (!cell) return null;
  try {
    const s = cell.beginParse();
    if (s.remainingBits < 32) return null;
    const op = s.loadUint(32);
    if (op !== 0) return null;
    const txt = s.loadStringTail();
    const t = (txt ?? "").trim();
    return t.length ? t : null;
  } catch {
    return null;
  }
}
